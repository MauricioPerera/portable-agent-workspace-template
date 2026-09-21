#!/usr/bin/env python3
"""Create a minimal, model-agnostic portable agent workspace."""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import unicodedata
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug or "workspace"


def frontmatter(kind: str, title: str, description: str) -> str:
    return (
        "---\n"
        f"type: '{kind}'\n"
        f"title: '{title}'\n"
        f"description: '{description}'\n"
        "---\n\n"
    )


def files_for(name: str, slug: str) -> dict[str, str]:
    return {
        "AGENTS.md": frontmatter(
            "Workspace Constitution",
            name,
            "Constitución de un workspace portable basado en archivos, skills y contratos.",
        )
        + f"""# {name}

Este directorio es un workspace portable. El agente que lo abra es un ejecutor temporal; las reglas, el conocimiento, las skills, la memoria y la evidencia viven aquí.

## Protocolo de primera lectura

1. Leer este `AGENTS.md` antes de actuar.
2. Leer `manifest.yaml`.
3. Consultar `skills/index.md` y `context/index.md`.
4. Leer el contrato aplicable en `contracts/` antes de modificar archivos.
5. Ejecutar el `test_command` del contrato y conservar su evidencia.

## Reglas

- No inventar datos, políticas ni valores faltantes; detenerse y pedir confirmación.
- El razonamiento del agente no sustituye un oráculo determinista.
- Preservar los insumos del usuario y registrar correcciones en `memoria/`.
- Mantener las convenciones de cada agente como punteros a este archivo.

## Capas

- `context/`: conocimiento y fuentes de verdad.
- `skills/`: procedimientos reutilizables.
- `contracts/`: perímetro y aceptación de tareas.
- `memoria/`: aprendizajes y preferencias.
- `proyectos/`: insumos y resultados.
- `scripts/`: validadores y oráculos.
- `reports/`: evidencia de ejecución.
""",
        "README.md": frontmatter(
            "Workspace Guide",
            name,
            "Guía de uso del workspace portable.",
        )
        + f"""# {name}

Workspace generado por la metodología `file-based-kdd`.

Lee primero [AGENTS.md](AGENTS.md), luego [manifest.yaml](manifest.yaml), los índices y el contrato de la tarea.

Este workspace comienza vacío deliberadamente: agrega conocimiento en `context/`, capacidades en `skills/` y contratos en `contracts/`.
""",
        "manifest.yaml": f"""name: {slug}
version: 0.1.0
methodology: file-based-kdd
spec_version: 0.1.0
language: es
entrypoint: AGENTS.md
knowledge_dir: context
skills_dir: skills
contracts_dir: contracts
memory_dir: memoria
projects_dir: proyectos
scripts_dir: scripts
reports_dir: reports
""",
        "context/index.md": frontmatter(
            "Knowledge Index",
            "Índice de Conocimiento",
            "Punto de entrada a las fuentes de verdad del workspace.",
        )
        + "# Conocimiento\n\nAñade aquí enlaces a fuentes de verdad y mantenlos actualizados.\n",
        "skills/index.md": frontmatter(
            "Skill Index",
            "Índice de Skills",
            "Punto de entrada a las capacidades operativas del workspace.",
        )
        + "# Skills\n\nAñade una skill por procedimiento y declara su `test_command`.\n",
        "contracts/index.md": frontmatter(
            "Contract Index",
            "Índice de Contratos",
            "Punto de entrada a los contratos de tareas del workspace.",
        )
        + "# Contratos\n\nCada tarea debe declarar entradas, salidas, perímetro y aceptación determinista.\n",
        "memoria/log_sesiones.md": frontmatter(
            "Memory Log",
            "Bitácora de Sesiones",
            "Registro cronológico de correcciones y decisiones.",
        )
        + "# Bitácora\n\nRegistra aquí las correcciones expresadas por el usuario.\n",
        "memoria/preferencias_consolidadas.md": frontmatter(
            "Core Preferences",
            "Preferencias Consolidadas",
            "Directivas generales validadas por el usuario.",
        )
        + "# Preferencias\n\nPromueve aquí los aprendizajes repetidos o explícitamente consolidados.\n",
        "reports/index.md": frontmatter(
            "Evidence Index",
            "Índice de Evidencia",
            "Reportes verificables de ejecuciones.",
        )
        + "# Evidencia\n\nConserva comandos, códigos de salida, archivos y decisiones humanas.\n",
        ".clinerules": "# Cline Workspace Pointer\nSee: AGENTS.md\n",
        ".cursorrules": "# Cursor Workspace Pointer\n@AGENTS.md\n",
        "CLAUDE.md": frontmatter("Agent Adapter", "claude", "Puntero de compatibilidad para Claude.")
        + "# Claude Workspace Pointer\n\nLee primero [AGENTS.md](AGENTS.md).\n",
        ".windsurfrules": "# Windsurf Workspace Pointer\n\nLee primero AGENTS.md.\n",
        ".github/copilot-instructions.md": frontmatter(
            "Agent Adapter", "github-copilot", "Puntero de compatibilidad para GitHub Copilot."
        )
        + "# Copilot Workspace Pointer\n\nLee primero [AGENTS.md](../AGENTS.md).\n",
    }


def create_workspace(name: str, destination: Path) -> list[Path]:
    if destination.exists() and any(destination.iterdir()):
        raise FileExistsError(f"El destino no está vacío: {destination}")
    destination.mkdir(parents=True, exist_ok=True)
    for directory in ("context", "skills", "contracts", "memoria", "proyectos", "reports", "scripts"):
        (destination / directory).mkdir(exist_ok=True)

    generated = []
    for relative, content in files_for(name, slugify(name)).items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8", newline="\n")
        generated.append(target)

    validator = Path(__file__).with_name("validate_okf_nodes.py")
    if validator.exists():
        target = destination / "scripts" / validator.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(validator, target)
        generated.append(target)
    return generated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="Nombre visible del workspace")
    parser.add_argument(
        "--destination",
        type=Path,
        help="Ruta de destino; por defecto, ./<slug-del-nombre>",
    )
    args = parser.parse_args()
    destination = (args.destination or Path.cwd() / slugify(args.name)).resolve()

    try:
        generated = create_workspace(args.name, destination)
    except FileExistsError as exc:
        print(f"ERROR: {exc}. No se sobrescribieron archivos.", file=sys.stderr)
        return 2

    print(f"Workspace creado: {destination}")
    print(f"Archivos creados: {len(generated)}")
    print(f"Primera lectura: {destination / 'AGENTS.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
