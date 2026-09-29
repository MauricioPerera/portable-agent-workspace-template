import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { insist } from './schema.mjs';

const WORKER = fileURLToPath(new URL('./worker.cjs', import.meta.url));
const LOCK_HOLDER = fileURLToPath(new URL('./lock-holder.cjs', import.meta.url));
const environment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH'].includes(key)));
async function stopUnit(unit) {
    await new Promise(resolve => {
        const child = spawn('/usr/bin/systemctl', ['stop', unit], { env: environment(), stdio: 'ignore' });
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 4000);
        child.on('error', () => { clearTimeout(timer); resolve(); });
        child.on('close', () => { clearTimeout(timer); resolve(); });
    });
}
export async function withLock(path, work) {
    insist(process.platform === 'linux', 'Execution and verification require Linux; no unsafe fallback');
    const child = spawn('/usr/bin/flock', ['--nonblock', path, process.execPath, LOCK_HOLDER], { env: environment(), stdio: ['pipe', 'pipe', 'pipe'] });
    try {
        await new Promise((resolve, reject) => {
            let data = '';
            const timer = setTimeout(() => reject(new Error('Lock handshake timeout')), 3000);
            child.on('error', error => { clearTimeout(timer); reject(error); });
            child.on('exit', () => { clearTimeout(timer); reject(new Error('Another execution holds the state lock')); });
            child.stdout.on('data', chunk => { data += chunk; if (data.includes('LOCKED\n')) { clearTimeout(timer); resolve(); } });
        });
        return await work();
    } finally {
        child.stdin.end();
        if (child.exitCode === null) await new Promise(resolve => { child.on('exit', resolve); const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1000); timer.unref(); });
    }
}
export async function sandboxTask(task, input) {
    insist(process.platform === 'linux', 'Sandbox requires Linux');
    const unit = 'workspace-sdk-task-' + randomUUID();
    const node = await realpath(process.execPath);
    const args = ['--quiet', '--pipe', '--wait', '--collect', '--unit=' + unit,
        '--property=Type=exec', '--property=KillMode=control-group', '--property=TimeoutStopSec=2s',
        '--property=RuntimeMaxSec=' + (Math.ceil(task.limits.timeoutMs / 1000) + 1) + 's',
        '--property=MemoryMax=' + task.limits.memoryMb + 'M', '--property=MemorySwapMax=0',
        '--property=CPUQuota=100%', '--property=TasksMax=32', '--property=NoNewPrivileges=yes',
        '/usr/bin/bwrap', '--unshare-all', '--die-with-parent', '--new-session',
        '--clearenv', '--setenv', 'PATH', '/usr/bin', '--setenv', 'LANG', 'C.UTF-8',
        '--dir', '/usr', '--dir', '/usr/bin', '--ro-bind', node, '/usr/bin/node',
        '--ro-bind', '/lib/x86_64-linux-gnu', '/lib/x86_64-linux-gnu', '--ro-bind', '/lib64', '/lib64',
        '--dir', '/runtime', '--ro-bind', WORKER, '/runtime/worker.cjs',
        '--proc', '/proc', '--dev', '/dev', '--perms', '1777', '--tmpfs', '/tmp',
        '--chdir', '/tmp', '--uid', '65534', '--gid', '65534', '--cap-drop', 'ALL',
        '/usr/bin/node', '--experimental-permission', '--allow-fs-read=/runtime/worker.cjs',
        '--no-addons', '--disable-proto=throw', '--max-old-space-size=' + Math.max(16, Math.floor(task.limits.memoryMb / 2)), '/runtime/worker.cjs'];
    const payload = JSON.stringify({ source: task.source, input });
    insist(Buffer.byteLength(payload) <= 1048576, 'Task payload exceeds 1 MiB');
    const started = performance.now();
    let reason;
    let bytes = 0;
    const output = [[], []];
    const child = spawn('/usr/bin/systemd-run', args, { env: environment(), stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    const terminate = () => { void stopUnit(unit); child.kill('SIGKILL'); };
    const timer = setTimeout(() => { reason = 'timeout'; terminate(); }, task.limits.timeoutMs);
    try {
        const code = await new Promise((resolve, reject) => {
            child.on('error', reject);
            child.on('close', resolve);
            for (const [index, stream] of [child.stdout, child.stderr].entries()) stream.on('data', chunk => {
                const remaining = Math.max(0, task.limits.outputBytes - bytes);
                output[index].push(chunk.subarray(0, remaining));
                bytes += Math.min(remaining, chunk.length);
                if (chunk.length > remaining && !reason) { reason = 'output_limit'; terminate(); }
            });
            child.stdin.end(payload);
        });
        const stderr = Buffer.concat(output[1]).toString();
        if (reason || code !== 0) {
            const error = new Error(`Task ${task.id} failed (${reason ?? 'process ' + code}): ${stderr.slice(0, 1024)}`);
            error.code = reason === 'timeout' ? 'TASK_TIMEOUT' : reason === 'output_limit' ? 'TASK_OUTPUT_LIMIT' : 'TASK_PROCESS_FAILED';
            throw error;
        }
        let response;
        try { response = JSON.parse(Buffer.concat(output[0]).toString()); }
        catch { const error = new Error('Invalid sandbox JSON response; return JSON and do not write to stdout'); error.code='PROTOCOL_INVALID_JSON'; throw error; }
        insist(Object.keys(response).length === 1 && Object.hasOwn(response, 'output'), 'Invalid sandbox response');
        return { output: response.output, elapsedMs: performance.now() - started, capturedBytes: bytes, isolation: 'bubblewrap+systemd', stderr };
    } finally {
        clearTimeout(timer);
        // Also stops a unit if its client died or the code left descendants behind.
        await stopUnit(unit);
    }
}
export async function sandboxIdentity() {
    const readVersion = async executable => {
        return new Promise((resolve, reject) => {
            let result = '';
            const child = spawn(executable, ['--version'], { env: environment(), stdio: ['ignore', 'pipe', 'ignore'] });
            child.stdout.on('data', data => { result += data; });
            child.on('error', reject);
            child.on('close', code => code === 0 ? resolve(result.split('\n')[0]) : reject(new Error('Runtime unavailable')));
        });
    };
    return { node: process.version, platform: process.platform, architecture: process.arch,
        bubblewrap: await readVersion('/usr/bin/bwrap'), systemd: await readVersion('/usr/bin/systemd-run') };
}
