#!/usr/bin/env python3
"""Regression tests for the dependency-free workspace scaffold."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCAFFOLD = ROOT / "scripts" / "init_workspace.py"


class InitWorkspaceTests(unittest.TestCase):
    def test_creates_complete_and_valid_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = Path(temp_dir) / "workspace"
            result = subprocess.run(
                [sys.executable, str(SCAFFOLD), "--name", "Workspace Prueba", "--destination", str(destination)],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)

            expected = {
                "AGENTS.md",
                "README.md",
                "manifest.yaml",
                "context",
                "skills",
                "contracts",
                "memoria",
                "proyectos",
                "reports",
                "scripts",
            }
            self.assertTrue(all((destination / item).exists() for item in expected))

            validation = subprocess.run(
                [sys.executable, str(destination / "scripts" / "validate_okf_nodes.py")],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(validation.returncode, 0, validation.stdout + validation.stderr)

    def test_refuses_to_overwrite_nonempty_destination(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = Path(temp_dir) / "workspace"
            destination.mkdir()
            (destination / "existing.txt").write_text("keep", encoding="utf-8")

            result = subprocess.run(
                [sys.executable, str(SCAFFOLD), "--name", "Workspace Prueba", "--destination", str(destination)],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(result.returncode, 2)
            self.assertEqual((destination / "existing.txt").read_text(encoding="utf-8"), "keep")


if __name__ == "__main__":
    unittest.main()
