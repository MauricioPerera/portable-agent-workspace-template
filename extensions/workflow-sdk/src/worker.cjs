'use strict';
// This is a protocol runner, not a JavaScript security boundary. Linux isolates it.
const Module = require('node:module');
let text = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { text += chunk; if (text.length > 1048576) process.exit(2); });
process.stdin.on('end', async () => {
    try {
        const { source, input } = JSON.parse(text);
        const task = new Module('/runtime/task.cjs', module);
        task.filename = '/runtime/task.cjs';
        task.paths = [];
        task._compile(source, task.filename);
        if (typeof task.exports !== 'function') throw new Error('Task must export a function');
        const output = await task.exports(input);
        const serialized = JSON.stringify({ output });
        if (output === undefined || serialized === undefined) throw new Error('Task output must be JSON');
        process.stdout.write(serialized + '\n');
    } catch (error) {
        process.stderr.write(String(error?.message ?? error) + '\n');
        process.exitCode = 1;
    }
});
