#!/usr/bin/env python3
"""Independently verify the inventory and its recorded inputs/output hashes."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from validate_okf_nodes import parse_metadata, extract_frontmatter
from validate_workspace import validate

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(root, require_execution=True):
    errors = validate(root)
    try:
        manifest = parse_metadata((root / 'manifest.yaml').read_text(encoding='utf-8'))
        inventory_path = root / 'proyectos/primer-uso/inventario.json'
        inventory = json.loads(inventory_path.read_text(encoding='utf-8'))
        report = json.loads((root / 'reports/primer-uso.json').read_text(encoding='utf-8'))
        if inventory.get('workspace') != manifest['name'] or inventory.get('spec_version') != '0.2.0':
            errors.append('Inventory identity mismatch')
        sources = sorted(p.relative_to(root).as_posix() for p in (root / 'context').rglob('*') if p.is_file() and p.name != 'index.md')
        skills = sorted(p.relative_to(root).as_posix() for p in (root / 'skills').glob('*.md') if p.name != 'index.md')
        if inventory.get('sources') != sources or inventory.get('skills') != skills:
            errors.append('Inventory does not match actual sources/skills')
        if inventory.get('next_step') != 'Solicitar la primera tarea y sus fuentes; no inferir políticas de dominio.':
            errors.append('Incorrect next step')
        contract = extract_frontmatter((root / 'contracts/primer-uso.md').read_text(encoding='utf-8'))
        if report.get('contract') != 'contracts/primer-uso.md' or report.get('contract_version') != contract['version']:
            errors.append('Evidence contract mismatch')
        if report.get('test_command') != contract['test_command'] or report.get('command') != 'python scripts/first_run.py':
            errors.append('Evidence command mismatch')
        expected_inputs = {'manifest.yaml', 'AGENTS.md', 'WORKSPACE-SPEC.md', 'context/index.md',
                           'skills/index.md', 'skills/primer-uso.md', 'contracts/primer-uso.md',
                           'memoria/preferencias_consolidadas.md', 'scripts/first_run.py',
                           'scripts/check_first_run.py', 'scripts/validate_workspace.py', 'scripts/validate_okf_nodes.py'}
        recorded = report.get('inputs_sha256', {})
        if set(recorded) != expected_inputs or any(recorded.get(p) != sha(root / p) for p in expected_inputs):
            errors.append('Evidence inputs changed; rerun first_run.py')
        if report.get('output') != 'proyectos/primer-uso/inventario.json' or report.get('output_sha256') != sha(inventory_path):
            errors.append('Evidence output mismatch')
        if not isinstance(report.get('elapsed_seconds'), (float, int)) or not math.isfinite(report['elapsed_seconds']) or report['elapsed_seconds'] < 0:
            errors.append('Missing measured duration')
        if not report.get('created_at') or not report.get('python'):
            errors.append('Missing execution metadata')
        if require_execution and report.get('verification') != {'command': 'python scripts/check_first_run.py --record', 'exit_code': 0}:
            errors.append('Missing successful oracle execution record')
        if require_execution:
            initial = json.loads((root / 'reports/inicializacion.json').read_text(encoding='utf-8'))
            if (initial.get('route') not in {'prompt', 'scaffold'}
                    or initial.get('template_version') != manifest['template_version']
                    or initial.get('template_digest') != manifest['template_digest']):
                errors.append('Initialization provenance mismatch')
            executions = initial.get('commands', [])
            if (len(executions) != 1 or executions[0].get('command') != 'python scripts/first_run.py'
                    or executions[0].get('exit_code') != 0):
                errors.append('Initialization did not record successful first use')
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        errors.append(f'Invalid or missing first-run evidence: {exc}')
    return errors

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record', action='store_true', help='Record the result after checking generated evidence.')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    errors = check(root, require_execution=not args.record)
    if args.record:
        path = root / 'reports/primer-uso.json'
        try:
            report = json.loads(path.read_text(encoding='utf-8'))
            report['verification'] = {'command': 'python scripts/check_first_run.py --record', 'exit_code': 1 if errors else 0}
            path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
        except (OSError, ValueError, TypeError):
            errors.append('Cannot record oracle execution')
    for error in errors:
        print(f'ERROR: {error}')
    print('FAIL' if errors else 'OK: first-run inventory and evidence match current workspace')
    sys.exit(1 if errors else 0)
