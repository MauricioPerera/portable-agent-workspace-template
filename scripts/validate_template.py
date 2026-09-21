#!/usr/bin/env python3
"""Deterministically verify that this repository remains a clean template."""

import sys
from pathlib import Path


REQUIRED = {
    "AGENTS.md",
    "WORKSPACE-SPEC.md",
    "README.md",
    "PUBLISHING.md",
    "LICENSE",
    ".gitignore",
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
    "tests/test_init_workspace.py",
    ".github/workflows/validate.yml",
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
        if not (root / relative).exists():
            errors.append(f"Falta artefacto requerido: {relative}")
    for relative in sorted(FORBIDDEN_PATHS):
        if (root / relative).exists():
            errors.append(f"Artefacto de dominio prohibido en plantilla: {relative}")

    manifest = (root / "manifest.yaml").read_text(encoding="utf-8") if (root / "manifest.yaml").exists() else ""
    for key in ("methodology:", "spec_version:", "entrypoint: AGENTS.md"):
        if key not in manifest:
            errors.append(f"manifest.yaml carece de '{key}'")

    if errors:
        print("FALLO: plantilla no publicable")
        for error in errors:
            print(f"- {error}")
        return 1

    print("OK: plantilla limpia, estructuralmente completa y lista para publicar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
