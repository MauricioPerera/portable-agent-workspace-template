"""Sealed regression cases for the exact-head critical-change gate."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GUARD = Path(__file__).resolve().parents[1] / 'scripts' / 'guard_pr_change.py'


def git(root, *args):
    run = subprocess.run(['git', *args], cwd=root, capture_output=True, text=True)
    if run.returncode:
        raise AssertionError(run.stdout + run.stderr)
    return run.stdout.strip()


class GuardPrChangeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        git(self.root, 'init', '-q')
        git(self.root, 'config', 'user.name', 'Fixture')
        git(self.root, 'config', 'user.email', 'fixture@example.invalid')
        (self.root / 'README.md').write_text('base\n', encoding='utf-8')
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/first_run.py').write_text('base\n', encoding='utf-8')
        git(self.root, 'add', '.')
        git(self.root, 'commit', '-qm', 'base')
        self.base = git(self.root, 'rev-parse', 'HEAD')

    def change(self, relative, content):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        git(self.root, 'add', '.')
        git(self.root, 'commit', '-qm', 'change')
        return git(self.root, 'rev-parse', 'HEAD')

    def guard(self, head, approved=''):
        return subprocess.run(
            [sys.executable, str(GUARD), '--base', self.base, '--head', head,
             '--approved', approved], cwd=self.root, capture_output=True,
            text=True, encoding='utf-8', errors='replace')

    def test_unprotected_change_needs_no_approval(self):
        head = self.change('README.md', 'new\n')
        result = self.guard(head)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_critical_change_requires_exact_head_approval(self):
        head = self.change('scripts/first_run.py', 'new\n')
        self.assertNotEqual(self.guard(head).returncode, 0)
        self.assertNotEqual(self.guard(head, self.base).returncode, 0)
        result = self.guard(head, head)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        newer = self.change('README.md', 'later\n')
        self.assertNotEqual(self.guard(newer, head).returncode, 0)

    def test_renamed_critical_file_remains_protected(self):
        (self.root / 'docs').mkdir()
        git(self.root, 'mv', 'scripts/first_run.py', 'docs/moved.txt')
        git(self.root, 'commit', '-qm', 'rename')
        head = git(self.root, 'rev-parse', 'HEAD')
        result = self.guard(head)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
