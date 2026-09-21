#!/usr/bin/env python3
"""
Validador determinista de Nodos OKF (Open Knowledge Format)
Comprueba:
1. Existencia de Frontmatter YAML válido (delimitado por ---).
2. Presencia del campo obligatorio 'type'.
3. Integridad referencial: ausencia de enlaces Markdown rotos.
"""

import sys
import re
from pathlib import Path

# Soporte UTF-8 en consolas Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

def extract_frontmatter(content: str):
    match = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n", content, re.DOTALL)
    if not match:
        return None
    raw_yaml = match.group(1)
    # Parseo básico de clave-valor sin dependencias externas
    data = {}
    for line in raw_yaml.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line:
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip().strip("'\"")
            data[key] = val
    return data

def find_markdown_links(content: str):
    # Detectar enlaces markdown estándar [texto](ruta)
    # Ignora enlaces web (http://, https://, mailto:)
    pattern = r"\[.*?\]\((?!https?://|mailto:)(.*?)\)"
    links = []
    for match in re.finditer(pattern, content):
        link_target = match.group(1).split("#")[0].strip() # quitar anclas
        if link_target:
            links.append(link_target)
    return links

def validate_repository(root_dir: Path):
    errors = []
    checked_files = 0
    checked_links = 0

    print("=" * 65)
    print("🔍 [GATE 1] AUDITORÍA DETERMINISTA DE NODOS OKF (No LLM judging)")
    print("=" * 65)

    md_files = list(root_dir.glob("**/*.md"))
    # Excluir carpetas ocultas o temporales
    md_files = [f for f in md_files if ".git" not in f.parts and "node_modules" not in f.parts]

    for file_path in sorted(md_files):
        rel_path = file_path.relative_to(root_dir)
        checked_files += 1

        try:
            content = file_path.read_text(encoding="utf-8")
        except Exception as e:
            errors.append(f"[{rel_path}] Error al leer archivo: {e}")
            continue

        frontmatter = extract_frontmatter(content)
        if frontmatter is None:
            errors.append(f"[{rel_path}] Falta bloque Frontmatter YAML inicial (---).")
        else:
            if "type" not in frontmatter:
                errors.append(f"[{rel_path}] Frontmatter carece del campo obligatorio 'type'.")

        links = find_markdown_links(content)
        for link in links:
            checked_links += 1
            # Resolver ruta relativa respecto al archivo actual
            target_path = (file_path.parent / link).resolve()
            if not target_path.exists():
                errors.append(f"[{rel_path}] Enlace roto detectado -> '{link}' (Ruta no existe: {target_path})")

    print(f"📊 Nodos Markdown auditados: {checked_files}")
    print(f"🔗 Enlaces cruzados verificados: {checked_links}")

    if errors:
        print("\n❌ FALLO EN AUDITORÍA OKF:")
        for err in errors:
            print(f"   • {err}")
        return False
    else:
        print("\n✅ TODOS LOS NODOS OKF Y ENLACES CRUZADOS SON 100% VÁLIDOS.")
        return True

if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent.parent
    success = validate_repository(base_dir)
    sys.exit(0 if success else 1)
