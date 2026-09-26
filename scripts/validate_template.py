#!/usr/bin/env python3
"""Verify the distributor's approved file inventory, not file contents or secrets."""

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

ALLOWED_EXTRA = {
    ".clinerules", ".cursorrules", ".windsurfrules", "CLAUDE.md",
    ".github/copilot-instructions.md", "docs/.nojekyll",
    "docs/casos/negocio-glm-evidencia.json", "docs/casos/negocio-glm.md",
    "reports/acceptance-0.4.0.md", "reports/acceptance-metrics.json",
    "reports/business-use-case.md", "reports/page-spacing.md",
    "reports/validation-0.4.0.json", "reports/audit-fixes-2026-09-25.md",
}


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    errors = []

    for relative in sorted(REQUIRED):
        if not (root / relative).is_file():
            errors.append(f"Falta artefacto requerido: {relative}")
    allowed_files = REQUIRED | ALLOWED_EXTRA
    for path in root.rglob('*'):
        relative = path.relative_to(root)
        if '.git' in relative.parts or (relative.suffix == '.pyc' and '__pycache__' in relative.parts):
            continue
        if path.is_symlink():
            errors.append(f"Enlace simbólico no autorizado en plantilla: {relative.as_posix()}")
            continue
        if path.is_file() and relative.as_posix() not in allowed_files:
            errors.append(f"Archivo no autorizado en plantilla: {relative.as_posix()}")

    try:
        manifest = parse_metadata((root / 'manifest.yaml').read_text(encoding='utf-8'))
        for key, value in {'profile': 'template', 'methodology': 'file-based-kdd',
                           'spec_version': '0.2.0', 'entrypoint': 'AGENTS.md',
                           'version': '0.4.1'}.items():
            if manifest.get(key) != value:
                errors.append(f'manifest.yaml: se requiere {key}: {value}')
    except (OSError, ValueError) as exc:
        errors.append(f'manifest.yaml: {exc}')
    if errors:
        print("FALLO: estructura de plantilla inválida")
        for error in errors:
            print(f"- {error}")
        return 1

    print("OK: estructura, manifiesto e inventario de archivos válidos. No verifica secretos ni veracidad del contenido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
