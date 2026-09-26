#!/usr/bin/env python3
"""Run the bundled workspace inventory task, then check its result and evidence."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from validate_workspace import validate
from validate_okf_nodes import parse_metadata

RESULT = 'proyectos/primer-uso/inventario.json'
REPORT = 'reports/primer-uso.json'
INPUTS = ('manifest.yaml', 'AGENTS.md', 'WORKSPACE-SPEC.md', 'context/index.md',
          'skills/index.md', 'skills/primer-uso.md', 'contracts/primer-uso.md',
          'memoria/preferencias_consolidadas.md', 'scripts/first_run.py',
          'scripts/check_first_run.py', 'scripts/validate_workspace.py', 'scripts/validate_okf_nodes.py')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    started = time.perf_counter()
    root = Path(__file__).resolve().parent.parent
    errors = validate(root)
    if errors:
        print('\n'.join(errors))
        return 1
    manifest = parse_metadata((root / 'manifest.yaml').read_text(encoding='utf-8'))
    sources = sorted(p.relative_to(root).as_posix() for p in (root / 'context').rglob('*')
                     if p.is_file() and p != root / 'context/index.md')
    skills = sorted(p.relative_to(root).as_posix() for p in (root / 'skills').glob('*.md') if p.name != 'index.md')
    result = {'workspace': manifest['name'], 'spec_version': manifest['spec_version'],
              'sources': sources, 'skills': skills,
              'next_step': 'Solicitar la primera tarea y sus fuentes; no inferir políticas de dominio.'}
    target = root / RESULT
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    report = {'contract': 'contracts/primer-uso.md', 'contract_version': '1.0.0',
              'command': 'python scripts/first_run.py',
              'test_command': 'python scripts/check_first_run.py',
              'created_at': datetime.now(timezone.utc).isoformat(),
              'python': sys.version.split()[0],
              'elapsed_seconds': round(time.perf_counter() - started, 6),
              'inputs_sha256': {p: digest(root / p) for p in INPUTS},
              'sources_sha256': {p: digest(root / p) for p in sources},
              'output': RESULT, 'output_sha256': digest(target)}
    (root / REPORT).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    check = subprocess.run([sys.executable, str(root / 'scripts/check_first_run.py'), '--record'], cwd=root,
                           capture_output=True, text=True, encoding='utf-8')
    print(check.stdout, end='')
    if check.stderr:
        print(check.stderr, file=sys.stderr, end='')
    if check.returncode:
        return check.returncode
    print(f'Primer uso completado: {RESULT}; evidencia: {REPORT}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
