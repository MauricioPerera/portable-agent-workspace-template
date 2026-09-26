#!/usr/bin/env python3
"""Require an independently approved exact PR head for critical files."""
from __future__ import annotations

import argparse
import re
import subprocess
import sys

CRITICAL_DIRS = ('contracts/', 'scripts/', 'tests/', '.github/workflows/')
CRITICAL_FILES = {
    'AGENTS.md', 'WORKSPACE-SPEC.md', 'PUBLISHING.md', 'manifest.yaml',
    'docs/prompt.md',
}


def git(*args: str) -> bytes:
    result = subprocess.run(['git', *args], capture_output=True)
    if result.returncode:
        raise ValueError(result.stderr.decode('utf-8', errors='replace').strip() or 'Git command failed')
    return result.stdout


def is_critical(path: str) -> bool:
    return path in CRITICAL_FILES or path.startswith(CRITICAL_DIRS)


def check(base: str, head: str, approved: str) -> tuple[list[str], list[str]]:
    for label, value in (('base', base), ('head', head)):
        if not re.fullmatch(r'[0-9a-fA-F]{40}', value):
            raise ValueError(f'{label} must be a 40-character commit SHA')
        if git('cat-file', '-t', value).strip() != b'commit':
            raise ValueError(f'{label} must identify a commit')
    changed = [path.decode('utf-8') for path in
               git('diff', '--no-renames', '--name-only', '-z', f'{base}...{head}').split(b'\0') if path]
    critical = [path for path in changed if is_critical(path)]
    if critical and approved.lower() != head.lower():
        raise ValueError('Critical changes require PAW_APPROVED_CHANGE_REF equal to the exact PR head SHA')
    return changed, critical


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    parser.add_argument('--head', required=True)
    parser.add_argument('--approved', default='')
    args = parser.parse_args()
    try:
        changed, critical = check(args.base, args.head, args.approved)
    except (OSError, ValueError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1
    print(f'Changed files: {len(changed)}; critical files: {len(critical)}')
    for path in critical:
        print(f'  {path}')
    print('OK: exact PR head approved' if critical else 'OK: no critical files changed')
    return 0


if __name__ == '__main__':
    sys.exit(main())

# Temporary negative gate smoke check; branch will not be merged.
