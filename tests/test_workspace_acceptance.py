"""Acceptance tests for published routes and negative audit regressions."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from validate_okf_nodes import audit, extract_frontmatter, parse_metadata


def command(args, cwd):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')


class AcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def create(self, name='Mi Workspace'):
        target = self.base / 'instance'
        result = command([sys.executable, str(ROOT / 'scripts/init_workspace.py'), '--name', name, '--destination', str(target)], ROOT)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return target

    def copy_distribution(self, target):
        shutil.copytree(ROOT, target, ignore=shutil.ignore_patterns('.git', '__pycache__'))
        return target

    def test_prompt_zip_route_and_scaffold_are_equivalent(self):
        # The prompt route starts from an archive with no Git metadata.
        archive = self.base / 'distribution.zip'
        with zipfile.ZipFile(archive, 'w') as bundle:
            for path in ROOT.rglob('*'):
                if path.is_file() and not any(p in {'.git', '__pycache__'} for p in path.relative_to(ROOT).parts):
                    bundle.write(path, 'distribution/' + path.relative_to(ROOT).as_posix())
        prompt_area = self.base / 'prompt'
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(prompt_area)
        distribution = prompt_area / 'distribution'
        prompt = (distribution / 'docs/prompt.md').read_text(encoding='utf-8')
        block = re.search(r'<!-- command:init:start -->\s*```sh\n(.*?)\n```', prompt, re.S)[1]
        args = shlex.split(block)
        self.assertEqual(args[0], 'python')
        start = time.perf_counter()
        run = command([sys.executable, *args[1:]], distribution)
        prompt_seconds = time.perf_counter() - start
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        instance = prompt_area / 'mi-workspace'
        verification = re.search(r'<!-- command:verify:start -->\s*```sh\n(.*?)\n```', prompt, re.S)[1]
        for line in verification.splitlines():
            args = shlex.split(line)
            result = command([sys.executable, *args[1:]], instance)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        scaffold_area = self.base / 'scaffold'
        other_distribution = self.copy_distribution(scaffold_area / 'distribution')
        start = time.perf_counter()
        run = command([sys.executable, 'scripts/init_workspace.py'], other_distribution)
        scaffold_seconds = time.perf_counter() - start
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        other = scaffold_area / 'mi-workspace'
        def stable_files(root):
            return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*')
                    if p.is_file() and '__pycache__' not in p.parts and p.name not in {'inicializacion.json', 'primer-uso.json'}}
        self.assertEqual(stable_files(instance), stable_files(other))
        for candidate, route in ((instance, 'prompt'), (other, 'scaffold')):
            report = json.loads((candidate / 'reports/inicializacion.json').read_text(encoding='utf-8'))
            self.assertEqual(report['route'], route)
            self.assertEqual(report['commands'][0]['exit_code'], 0)
            self.assertGreater(report['elapsed_seconds'], 0)
            self.assertFalse((candidate / 'docs').exists())
            self.assertFalse((candidate / '.github/workflows').exists())
            self.assertFalse((candidate / 'scripts/validate_template.py').exists())
        evidence = {'prompt_seconds': prompt_seconds, 'scaffold_seconds': scaffold_seconds,
                    'prompt_commands': 3, 'scaffold_commands': 1,
                    'interactive_requests_during_commands': 0,
                    'scope': 'Measured generation commands only; excludes archive preparation, download and AI reasoning. No interactive subprocess requests; not an evaluation of arbitrary models.'}
        if os.environ.get('PAW_EVIDENCE_PATH'):
            Path(os.environ['PAW_EVIDENCE_PATH']).write_text(json.dumps(evidence, indent=2), encoding='utf-8')

    def test_names_are_valid_metadata(self):
        target = self.create("Equipo O'Brien – México [archivo](ausente)")
        metadata = extract_frontmatter((target / 'AGENTS.md').read_text(encoding='utf-8'))
        self.assertEqual(metadata['title'], "Equipo O'Brien – México [archivo](ausente)")
        self.assertEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)

    def test_invalid_names_leave_no_output(self):
        for name in ('', ' ', 'bad\nname', 'x' * 161):
            with self.subTest(name=name):
                target = self.base / 'bad'
                result = command([sys.executable, str(ROOT / 'scripts/init_workspace.py'), '--name', name, '--destination', str(target)], ROOT)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(target.exists())

    def test_missing_resource_fails_before_writing(self):
        copy = self.copy_distribution(self.base / 'distribution')
        (copy / 'scripts/validate_okf_nodes.py').unlink()
        target = self.base / 'missing'
        result = command([sys.executable, 'scripts/init_workspace.py', '--destination', str(target)], copy)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(target.exists())

    def test_existing_file_is_preserved(self):
        target = self.base / 'file'
        target.write_bytes(b'original')
        result = command([sys.executable, str(ROOT / 'scripts/init_workspace.py'), '--destination', str(target)], ROOT)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(target.read_bytes(), b'original')

    def test_bad_runtime_does_not_deliver_partial_workspace(self):
        copy = self.copy_distribution(self.base / 'distribution')
        (copy / 'scripts/check_first_run.py').write_text('raise SystemExit(7)\n', encoding='utf-8')
        target = self.base / 'partial'
        result = command([sys.executable, 'scripts/init_workspace.py', '--destination', str(target)], copy)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(target.exists())

    def test_git_roundtrip_preserves_structure_and_evidence(self):
        if not shutil.which('git'):
            self.skipTest('Git needed only for transport acceptance test')
        target = self.create()
        raw = b'# Input\r\nOriginal bytes\r\n'
        (target / 'proyectos/entradas/raw.md').write_bytes(raw)
        commands = [['git', 'init', '-q'], ['git', 'add', '.'],
                    ['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']]
        for args in commands:
            result = command(args, target)
            self.assertEqual(result.returncode, 0, result.stderr)
        restored = self.base / 'restored'
        result = command(['git', '-c', 'core.autocrlf=true', 'clone', '-q', str(target), str(restored)], self.base)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((restored / 'proyectos/entradas').is_dir())
        self.assertEqual((restored / 'proyectos/entradas/raw.md').read_bytes(), raw)
        result = command([sys.executable, 'scripts/check_first_run.py'], restored)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_raw_inputs_remain_unchanged(self):
        target = self.create()
        original = b'# Documento externo\r\n[un enlace](missing.md)\r\n'
        source = target / 'proyectos/entradas/original.md'
        source.write_bytes(original)
        result = command([sys.executable, 'scripts/first_run.py'], target)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(source.read_bytes(), original)

    def test_tampered_result_and_evidence_fail(self):
        target = self.create()
        output = target / 'proyectos/primer-uso/inventario.json'
        original = output.read_bytes()
        data = json.loads(original)
        data['sources'] = ['invented-source.md']
        output.write_text(json.dumps(data), encoding='utf-8')
        result = command([sys.executable, 'scripts/check_first_run.py'], target)
        self.assertNotEqual(result.returncode, 0)
        output.write_bytes(original)
        report = target / 'reports/primer-uso.json'
        data = json.loads(report.read_text(encoding='utf-8'))
        data['verification']['exit_code'] = 1
        report.write_text(json.dumps(data), encoding='utf-8')
        self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)
        report.unlink()
        self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)

    def test_changed_input_invalidates_record_and_rerun_repairs(self):
        target = self.create()
        path = target / 'memoria/preferencias_consolidadas.md'
        path.write_text(path.read_text(encoding='utf-8') + '\nPreferencia explícita de prueba.\n', encoding='utf-8')
        self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)
        self.assertEqual(command([sys.executable, 'scripts/first_run.py'], target).returncode, 0)
        self.assertEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)

    def test_changed_source_content_invalidates_record(self):
        target = self.create()
        source = target / 'context/fuente.md'
        source.write_text('---\ntype: Knowledge\n---\n\nValor A\n', encoding='utf-8')
        self.assertEqual(command([sys.executable, 'scripts/first_run.py'], target).returncode, 0)
        source.write_text('---\ntype: Knowledge\n---\n\nValor B\n', encoding='utf-8')
        result = command([sys.executable, 'scripts/check_first_run.py'], target)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Source content changed', result.stdout)
        self.assertEqual(command([sys.executable, 'scripts/first_run.py'], target).returncode, 0)
        self.assertEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)

    def test_nested_index_source_content_is_tracked(self):
        target = self.create()
        source = target / 'context/proveedor/index.md'
        source.parent.mkdir()
        source.write_text('---\ntype: Knowledge\n---\n\nValor A\n', encoding='utf-8')
        self.assertEqual(command([sys.executable, 'scripts/first_run.py'], target).returncode, 0)
        source.write_text('---\ntype: Knowledge\n---\n\nValor B\n', encoding='utf-8')
        self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)

    def test_real_publishing_guide_roundtrip(self):
        target = self.create('Publicación real')
        original = (ROOT / 'PUBLISHING.md').read_bytes()
        preserved = target / 'proyectos/entradas/PUBLISHING.md'
        source = target / 'context/guia-publicacion.md'
        preserved.write_bytes(original)
        source.write_bytes(original)
        self.assertEqual(command([sys.executable, 'scripts/first_run.py'], target).returncode, 0)
        inventory = json.loads((target / 'proyectos/primer-uso/inventario.json').read_text(encoding='utf-8'))
        report = json.loads((target / 'reports/primer-uso.json').read_text(encoding='utf-8'))
        self.assertIn('context/guia-publicacion.md', inventory['sources'])
        self.assertEqual(report['sources_sha256']['context/guia-publicacion.md'], hashlib.sha256(original).hexdigest())
        self.assertEqual(preserved.read_bytes(), original)
        updated = original.replace(b'Antes de publicar', b'Antes de publicar esta revision', 1)
        self.assertNotEqual(updated, original)
        source.write_bytes(updated)
        self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)
        self.assertEqual(command([sys.executable, 'scripts/first_run.py'], target).returncode, 0)
        self.assertEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)
        self.assertEqual(preserved.read_bytes(), original)

    def test_missing_outputs_can_be_regenerated(self):
        target = self.create()
        (target / 'reports/primer-uso.json').unlink()
        (target / 'proyectos/primer-uso/inventario.json').unlink()
        self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)
        result = command([sys.executable, 'scripts/first_run.py'], target)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)

    def test_initialization_evidence_is_required(self):
        target = self.create()
        path = target / 'reports/inicializacion.json'
        report = json.loads(path.read_text(encoding='utf-8'))
        report['commands'][0]['exit_code'] = 1
        path.write_text(json.dumps(report), encoding='utf-8')
        self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)
        path.unlink()
        self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)

    def test_initialization_evidence_requires_duration_output_and_scope(self):
        target = self.create()
        path = target / 'reports/inicializacion.json'
        original = json.loads(path.read_text(encoding='utf-8'))
        for field in ('elapsed_seconds', 'scope'):
            with self.subTest(field=field):
                changed = json.loads(json.dumps(original))
                changed.pop(field)
                path.write_text(json.dumps(changed), encoding='utf-8')
                self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)
        for field in ('stdout', 'stderr'):
            with self.subTest(field=field):
                changed = json.loads(json.dumps(original))
                changed['commands'][0].pop(field)
                path.write_text(json.dumps(changed), encoding='utf-8')
                self.assertNotEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)
        path.write_text(json.dumps(original), encoding='utf-8')
        self.assertEqual(command([sys.executable, 'scripts/check_first_run.py'], target).returncode, 0)

    def test_template_rejects_domain_files_and_comment_manifest(self):
        copy = self.copy_distribution(self.base / 'distribution')
        (copy / 'context/unapproved.md').write_text('---\ntype: Knowledge\n---\nSynthetic domain\n', encoding='utf-8')
        self.assertNotEqual(command([sys.executable, 'scripts/validate_template.py'], copy).returncode, 0)
        (copy / 'context/unapproved.md').unlink()
        (copy / 'manifest.yaml').write_text('# methodology:\n# spec_version:\n# entrypoint: AGENTS.md\n', encoding='utf-8')
        self.assertNotEqual(command([sys.executable, 'scripts/validate_template.py'], copy).returncode, 0)

    def test_template_rejects_unapproved_domain_files_outside_core(self):
        copy = self.copy_distribution(self.base / 'distribution')
        for relative in ('contracts/cliente-real.md', 'reports/cliente-real.json',
                         'docs/casos/cliente-real.md', '.venv/cliente-real.txt',
                         '__pycache__/cliente-real.txt'):
            with self.subTest(path=relative):
                path = copy / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('---\ntype: Knowledge\n---\n\nDatos de cliente\n', encoding='utf-8')
                result = command([sys.executable, 'scripts/validate_template.py'], copy)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Archivo no autorizado', result.stdout)
                path.unlink()


class NodeRegressionTests(unittest.TestCase):
    def validate(self, body):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            root = base / 'workspace'
            root.mkdir()
            (base / 'outside.txt').write_text('outside', encoding='utf-8')
            (root / 'present.txt').write_text('inside', encoding='utf-8')
            if body is not None:
                (root / 'node.md').write_text(body, encoding='utf-8')
            return audit(root)[0]

    def test_negative_audit_cases(self):
        cases = [None, '---\ntype:\n---\n', '---\ntype: [\n---\n',
                 '---\ntype: Node\ntype: Other\n---\n',
                 '---\ntype: Node\n---\n[x](../outside.txt)',
                 '---\ntype: Node\n---\n[x][ref]\n\n[ref]: absent.txt',
                 '---\ntype: Node\n---\n[x][undefined]',
                 '---\ntype: Task Contract\n---\n']
        for body in cases:
            with self.subTest(body=body):
                self.assertTrue(self.validate(body))

    def test_code_samples_and_valid_references(self):
        body = '''---
type: Node
---
```markdown
[example](missing.md)
```
`[another](absent.md)`
[valid][ref]
[ref][]
[ref]
[inline](present.txt "title")
[ref]: present.txt
'''
        self.assertEqual(self.validate(body), [])

    def test_strict_metadata(self):
        for raw in ('type: true', 'type: 4', 'type: {}', "type: 'O'Brien'", 'type: x # comment', ' type: x'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_metadata(raw)
        self.assertEqual(parse_metadata("type: 'O''Brien'"), {'type': "O'Brien"})


if __name__ == '__main__':
    unittest.main()
