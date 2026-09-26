#!/usr/bin/env python3
"""Validate the documented flat-scalar metadata and Markdown link subset."""
from __future__ import annotations
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
IGNORED = {'.git', '.venv', 'node_modules', '__pycache__'}
CONTRACT_FIELDS = ('name', 'version', 'inputs', 'outputs', 'scope', 'test_command')

def parse_metadata(text: str) -> dict[str, str]:
    """Flat YAML subset: unique unindented keys and nonempty string scalars."""
    data = {}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        match = re.fullmatch(r'([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*', line)
        if not match:
            raise ValueError('Expected unindented key: scalar')
        key, raw = match.groups()
        if key in data:
            raise ValueError(f'Duplicate key: {key}')
        if raw.startswith('"'):
            value = json.loads(raw)
        elif raw.startswith("'"):
            if not re.fullmatch(r"'(?:[^']|'')*'", raw):
                raise ValueError(f'Invalid quoted scalar: {key}')
            value = raw[1:-1].replace("''", "'")
        else:
            if (not raw or raw[0] in '[]{}&*!|>@`%#,-?:' or ': ' in raw
                    or ' #' in raw or raw.lower() in {'null', '~', 'true', 'false'}
                    or re.fullmatch(r'[-+]?\d+(?:\.\d+)?', raw)):
                raise ValueError(f'Quote this scalar: {key}')
            value = raw
        if not isinstance(value, str) or not value.strip() or any(ord(c) < 32 for c in value):
            raise ValueError(f'Expected nonempty single-line string: {key}')
        data[key] = value
    return data

def extract_frontmatter(content: str):
    match = re.match(r'\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)', content, re.S)
    if not match:
        raise ValueError('Missing metadata block')
    return parse_metadata(match[1])

def prose_only(text: str) -> str:
    text = re.sub(r'\A---\r?\n.*?\r?\n---(?:\r?\n|$)', '', text, count=1, flags=re.S)
    lines, fence = [], None
    for line in text.splitlines():
        marker = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$', line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip():
                fence = None
            continue
        if marker:
            fence = marker[1]
            continue
        if not line.startswith(('    ', '\t')):
            lines.append(line)
    text = re.sub(r'<!--.*?-->', '', '\n'.join(lines), flags=re.S)
    return re.sub(r'(`+)(.*?)\1', '', text, flags=re.S)

def find_markdown_links(content: str):
    text = prose_only(content)
    dest = r'(<[^>\n]+>|[^\s()]+)(?:\s+[\"\'][^\n]*?[\"\'])?'
    definitions = {' '.join(m[1].lower().split()): m[2].strip('<>') for m in
                   re.finditer(r'^ {0,3}\[([^\]]+)\]:\s*' + dest + r'\s*$', text, re.M)}
    text = re.sub(r'^ {0,3}\[[^\]]+\]:.*$', '', text, flags=re.M)
    inline = r'(?<!\\)!?\[([^\]\n]*)\]\(\s*' + dest + r'\s*\)'
    links = [m[2].strip('<>') for m in re.finditer(inline, text)]
    text = re.sub(inline, '', text)
    if re.search(r'(?<!\\)\]\(', text):
        raise ValueError('Unsupported inline link; encode parentheses/spaces or use <path>')
    refs = r'(?<!\\)!?\[([^\]\n]+)\]\[([^\]\n]*)\]'
    for match in re.finditer(refs, text):
        label = ' '.join((match[2] or match[1]).lower().split())
        if label not in definitions:
            raise ValueError(f'Undefined reference: {label}')
        links.append(definitions[label])
    for match in re.finditer(r'(?<!\\)\[([^\]\n]+)\]', re.sub(refs, '', text)):
        label = ' '.join(match[1].lower().split())
        if label in definitions:
            links.append(definitions[label])
    return links

def local_target(root: Path, document: Path, link: str):
    parsed = urlsplit(link)
    if parsed.scheme in {'http', 'https', 'mailto'}:
        return None
    if parsed.scheme or parsed.netloc:
        raise ValueError(f'Unsupported scheme: {link}')
    if not parsed.path:
        return None  # Anchor existence is explicitly out of scope.
    relative = Path(unquote(parsed.path))
    target = (document.parent / relative).resolve()
    if relative.is_absolute() or not target.is_relative_to(root.resolve()):
        raise ValueError(f'Link escapes workspace: {link}')
    if not target.exists():
        raise ValueError(f'Broken link: {link}')
    return target

def audit(root: Path) -> tuple[list[str], int]:
    root = root.resolve()
    errors, count = [], 0
    for path in sorted(root.rglob('*.md')):
        relative = path.relative_to(root)
        if any(part in IGNORED for part in relative.parts) or relative.parts[:2] == ('proyectos', 'entradas'):
            continue
        count += 1
        try:
            if not path.resolve().is_relative_to(root):
                raise ValueError('Document resolves outside workspace')
            content = path.read_text(encoding='utf-8')
            metadata = extract_frontmatter(content)
            if 'type' not in metadata:
                raise ValueError('Missing type')
            if 'contracts' in relative.parts and path.name != 'index.md' and metadata['type'] != 'Task Contract':
                raise ValueError('Contracts must have type Task Contract')
            if metadata['type'] == 'Task Contract':
                missing = [key for key in CONTRACT_FIELDS if key not in metadata]
                if missing:
                    raise ValueError(f'Missing contract fields: {missing}')
            if metadata['type'] == 'Skill':
                for field in ('name', 'version', 'contract', 'test_command'):
                    if field not in metadata:
                        raise ValueError(f'Missing skill field: {field}')
                target = local_target(root, path, metadata['contract'])
                if target is None or not target.is_file():
                    raise ValueError('Skill needs local contract')
                other = extract_frontmatter(target.read_text(encoding='utf-8'))
                if other.get('type') != 'Task Contract' or other.get('test_command') != metadata['test_command']:
                    raise ValueError('Skill and contract disagree')
            for link in find_markdown_links(content):
                local_target(root, path, link)
        except (OSError, ValueError) as exc:
            errors.append(f'{relative.as_posix()}: {exc}')
    if count == 0:
        errors.append('No managed Markdown nodes found')
    for folder, required_type in (('skills', 'Skill'), ('contracts', 'Task Contract')):
        index = root / folder / 'index.md'
        if not index.is_file():
            continue  # The template/workspace structure validator reports missing indexes.
        actual = {path.resolve() for path in (root / folder).glob('*.md') if path != index}
        for nested in (root / folder).rglob('*.md'):
            if nested.parent != index.parent:
                errors.append(f'Nested {folder} file is unsupported: {nested.relative_to(root).as_posix()}')
        indexed = []
        try:
            for link in find_markdown_links(index.read_text(encoding='utf-8')):
                target = local_target(root, index, link)
                if target is None:
                    errors.append(f'Unexpected {folder} index entry: {link}')
                else:
                    indexed.append(target)
        except (OSError, ValueError) as exc:
            errors.append(f'{folder}/index.md: {exc}')
            continue
        seen = set()
        for target in indexed:
            if target in seen:
                errors.append(f'Duplicate {folder} index entry: {target.relative_to(root).as_posix()}')
            seen.add(target)
            if target not in actual:
                errors.append(f'Unexpected {folder} index entry: {target.relative_to(root).as_posix()}')
        for target in sorted(actual - seen):
            errors.append(f'Unindexed {folder} file: {target.relative_to(root).as_posix()}')
        for target in sorted(actual):
            try:
                kind = extract_frontmatter(target.read_text(encoding='utf-8')).get('type')
                if kind != required_type:
                    errors.append(f'{target.relative_to(root).as_posix()}: expected type {required_type}')
            except (OSError, ValueError) as exc:
                errors.append(f'{target.relative_to(root).as_posix()}: {exc}')
    return errors, count

def validate_repository(root_dir: Path):
    errors, count = audit(root_dir)
    print(f'Markdown nodes: {count}')
    for error in errors:
        print(f'ERROR: {error}')
    print('FAIL' if errors else 'OK: metadata subset and local destinations; anchors/remote URLs not checked.')
    return not errors

if __name__ == '__main__':
    sys.exit(0 if validate_repository(Path(__file__).resolve().parent.parent) else 1)
