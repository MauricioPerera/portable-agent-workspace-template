#!/usr/bin/env python3
"""Verify template structure and core paths, not semantic cleanliness or secrets."""

import sys
from pathlib import Path
from validate_okf_nodes import parse_metadata


REQUIRED = {
    "AGENTS.md",
    "WORKSPACE-SPEC.md",
    "README.md",
    "PUBLISHING.md",
    "LICENSE",
    ".gitignore",
    ".gitattributes",
    "manifest.yaml",
    "context/index.md",
    "skills/index.md",
    "contracts/index.md",
    "contracts/init-workspace.md",
    "memoria/log_sesiones.md",
    "memoria/preferencias_consolidadas.md",
    "proyectos/.gitkeep",
    "reports/index.md",
    "scripts/init_workspace.py",
    "scripts/validate_okf_nodes.py",
    "scripts/validate_template.py",
    "scripts/validate_workspace.py",
    "scripts/first_run.py",
    "scripts/check_first_run.py",
    "tests/test_init_workspace.py",
    "tests/test_workspace_acceptance.py",
    ".github/workflows/validate.yml",
    ".github/workflows/pages.yml",
    "docs/index.html",
    "docs/prompt.md",
    "docs/styles.css",
    "docs/script.js",
}

FORBIDDEN_PATHS = {
    "context/catalogo_servicios.md",
    "context/politicas_comerciales.md",
    "skills/generar-presupuesto.md",
    "contracts/generar-presupuesto.md",
    "scripts/oracle_presupuesto.py",
    "scripts/run_demo.py",
    "proyectos/caso-cliente-alpha",
}


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    errors = []

    for relative in sorted(REQUIRED):
        if not (root / relative).is_file():
            errors.append(f"Falta artefacto requerido: {relative}")
    for relative in sorted(FORBIDDEN_PATHS):
        if (root / relative).exists():
            errors.append(f"Artefacto de dominio prohibido en plantilla: {relative}")

    try:
        manifest = parse_metadata((root / 'manifest.yaml').read_text(encoding='utf-8'))
        for key, value in {'profile': 'template', 'methodology': 'file-based-kdd',
                           'spec_version': '0.2.0', 'entrypoint': 'AGENTS.md',
                           'version': '0.4.0'}.items():
            if manifest.get(key) != value:
                errors.append(f'manifest.yaml: se requiere {key}: {value}')
    except (OSError, ValueError) as exc:
        errors.append(f'manifest.yaml: {exc}')
    allowed = {'context': {'index.md'}, 'skills': {'index.md'},
               'memoria': {'log_sesiones.md', 'preferencias_consolidadas.md'},
               'proyectos': {'.gitkeep'}}
    for directory, names in allowed.items():
        for path in (root / directory).rglob('*'):
            if path.is_file() and path.relative_to(root / directory).as_posix() not in names:
                errors.append(f'Archivo no permitido en núcleo de plantilla: {path.relative_to(root)}')

    if errors:
        print("FALLO: estructura de plantilla inválida")
        for error in errors:
            print(f"- {error}")
        return 1

    print("OK: estructura, manifiesto y rutas del núcleo válidos. No verifica secretos ni veracidad del contenido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
