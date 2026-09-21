#!/usr/bin/env python3
"""Validate an operational instance, independently of the template distribution."""
from pathlib import Path
import sys
from validate_okf_nodes import audit, parse_metadata

DIRECTORIES = {
    'knowledge_dir': 'context', 'skills_dir': 'skills', 'contracts_dir': 'contracts',
    'memory_dir': 'memoria', 'projects_dir': 'proyectos', 'scripts_dir': 'scripts',
    'reports_dir': 'reports',
}
REQUIRED = (
    'AGENTS.md', 'WORKSPACE-SPEC.md', 'README.md', 'manifest.yaml', 'LICENSE', '.gitignore', '.gitattributes',
    'context/index.md', 'skills/index.md', 'contracts/index.md', 'reports/index.md',
    'memoria/log_sesiones.md', 'memoria/preferencias_consolidadas.md',
    'proyectos/entradas/.gitkeep', 'skills/primer-uso.md', 'contracts/primer-uso.md',
    'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md',
    'scripts/validate_workspace.py', 'scripts/validate_okf_nodes.py',
    'scripts/first_run.py', 'scripts/check_first_run.py',
)

def validate(root: Path) -> list[str]:
    errors, _ = audit(root)
    for relative in REQUIRED:
        path = root / relative
        if not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
            errors.append(f'Missing or external file: {relative}')
    try:
        manifest = parse_metadata((root / 'manifest.yaml').read_text(encoding='utf-8'))
        expected = {'profile': 'workspace', 'methodology': 'file-based-kdd',
                    'spec_version': '0.2.0', 'entrypoint': 'AGENTS.md', **DIRECTORIES}
        for key, value in expected.items():
            if manifest.get(key) != value:
                errors.append(f'manifest: expected {key}: {value}')
        for key in ('name', 'version', 'language', 'template_version', 'template_digest'):
            if not manifest.get(key):
                errors.append(f'manifest: missing {key}')
        for relative in DIRECTORIES.values():
            path = root / relative
            if not path.is_dir() or not path.resolve().is_relative_to(root.resolve()):
                errors.append(f'Missing or external directory: {relative}')
    except (OSError, ValueError) as exc:
        errors.append(f'manifest: {exc}')
    return errors

def main():
    root = Path(__file__).resolve().parent.parent
    errors = validate(root)
    for error in errors:
        print(f'ERROR: {error}')
    print('FAIL' if errors else 'OK: operational workspace structure and contracts')
    return 1 if errors else 0

if __name__ == '__main__':
    sys.exit(main())
