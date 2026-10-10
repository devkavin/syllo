"""Exercise the size hook in disposable Git indexes, without making commits."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HOOK = Path(os.environ.get("SYLLO_TEST_HOOK", ROOT / "scripts" / "pre-commit"))
BASH = "C:/Program Files/Git/bin/bash.exe" if os.name == "nt" else shutil.which("bash")
LIMIT = 90 * 1024 * 1024


class StagedSizeHookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="syllo-hook-")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.git("init", "--quiet")
        self.hook_path = self.repo / ".git" / "hooks" / "test-size-hook"
        self.hook_path.write_text(HOOK.read_text(), encoding="utf-8", newline="\n")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True, capture_output=True).stdout

    def file(self, name, size, stage=True):
        path = self.repo / name
        with path.open("wb") as stream:
            stream.truncate(size)
        if stage:
            self.git("add", "--", name)
        return path

    def hook(self):
        before = self.git("ls-files", "--stage", "-z")
        result = subprocess.run([BASH, self.hook_path.as_posix()], cwd=self.repo, capture_output=True, text=True)
        self.assertEqual(self.git("ls-files", "--stage", "-z"), before, "Hook changed the index")
        self.assertFalse((self.repo / ".gitignore").exists(), "Hook changed .gitignore")
        return result

    def test_no_staged_files_ignores_large_untracked_file(self):
        self.file("untracked.bin", LIMIT + 1, stage=False)
        self.assertEqual(self.hook().returncode, 0)

    def test_small_staged_file_passes(self):
        self.file("small.txt", 10)
        self.assertEqual(self.hook().returncode, 0)

    def test_exact_limit_passes(self):
        self.file("limit.bin", LIMIT)
        self.assertEqual(self.hook().returncode, 0)

    def test_oversized_staged_blob_rejected_even_when_worktree_is_small(self):
        path = self.file("large file.bin", LIMIT + 1)
        path.write_bytes(b"small unstaged replacement")
        result = self.hook()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("large", result.stderr)
        self.assertIn("90 MiB", result.stderr)

    def test_small_staged_blob_passes_even_when_worktree_is_large(self):
        path = self.file("small.txt", 10)
        with path.open("wb") as stream:
            stream.truncate(LIMIT + 1)
        self.assertEqual(self.hook().returncode, 0)

    def test_unicode_filename_rejected(self):
        self.file("science notes α.bin", LIMIT + 1)
        self.assertNotEqual(self.hook().returncode, 0)


if __name__ == "__main__":
    unittest.main()
