#!/usr/bin/env python3
"""Build a versioned distribution ZIP and SHA-256 sidecar from approved files."""
import argparse
import hashlib
from pathlib import Path
import sys
import zipfile

from validate_okf_nodes import audit
from validate_template import ALLOWED_EXTRA, REQUIRED, WORKFLOW_SDK_FILES, TEMPLATE_VERSION, main as validate_template


def package(root: Path, output_dir: Path) -> tuple[Path, Path]:
    root = root.resolve()
    output_dir = output_dir.resolve()
    if output_dir.is_relative_to(root):
        raise ValueError('El directorio de salida debe quedar fuera de la distribución.')
    if validate_template():
        raise ValueError('La distribución no pasó validate_template.py.')
    node_errors, _ = audit(root)
    if node_errors:
        raise ValueError('La distribución no pasó validate_okf_nodes.py: ' + '; '.join(node_errors))
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f'portable-agent-workspace-template-v{TEMPLATE_VERSION}'
    archive = output_dir / f'{stem}.zip'
    checksum = output_dir / f'{stem}.sha256'
    if archive.exists() or checksum.exists():
        raise FileExistsError('La release ya existe en el directorio de salida.')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for relative in sorted(REQUIRED | ALLOWED_EXTRA | {'extensions/workflow-sdk/' + path for path in WORKFLOW_SDK_FILES}):
            source = root / relative
            if not source.is_file() or source.is_symlink():
                raise ValueError(f'Archivo de distribución ausente o simbólico: {relative}')
            info = zipfile.ZipInfo(f'{stem}/{relative}', date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            bundle.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksum.write_text(f'{digest}  {archive.name}\n', encoding='ascii', newline='\n')
    return archive, checksum


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    try:
        archive, checksum = package(Path(__file__).resolve().parent.parent, args.output_dir)
    except (OSError, ValueError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 2
    print(f'ZIP: {archive}\nSHA-256: {checksum}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
