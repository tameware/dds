"""CI coverage: dtest must exit non-zero on the first expected-result mismatch."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


def _runfiles_root() -> Path | None:
    for key in ("RUNFILES_DIR", "TEST_SRCDIR"):
        if key in os.environ:
            return Path(os.environ[key])
    return None


def _rlocation_from_manifest(relpath: str) -> Path | None:
    manifest = os.environ.get("RUNFILES_MANIFEST_FILE")
    if not manifest:
        return None
    keys = {relpath, f"_main/{relpath}"}
    try:
        with open(manifest, encoding="utf-8") as fh:
            for line in fh:
                line = line.rstrip("\n")
                if not line or line.startswith("[") or line.startswith(" "):
                    continue
                space = line.find(" ")
                if space < 0:
                    continue
                key, value = line[:space], line[space + 1 :]
                if key in keys and value:
                    path = Path(value)
                    if path.exists():
                        return path
    except OSError:
        return None
    return None


def rlocation(relpath: str) -> Path:
    root = _runfiles_root()
    if root is not None:
        for candidate in (root / relpath, root / "_main" / relpath):
            if candidate.exists():
                return candidate

    from_manifest = _rlocation_from_manifest(relpath)
    if from_manifest is not None:
        return from_manifest

    raise FileNotFoundError(relpath)


def _dtest_binary() -> Path:
    for name in ("library/tests/dtest", "library/tests/dtest.exe"):
        try:
            return rlocation(name)
        except FileNotFoundError:
            continue
    raise FileNotFoundError("library/tests/dtest[.exe]")


# Same deal twice; intentional wrong PAR goldens so both would mismatch if
# dtest kept going past the first difference.
_MISMATCH_HANDS = """\
NUMBER 2 
PBN 0 0 0 0 "N:QJ6.K652.J85.T98 873.J97.AT764.Q4 K5.T83.KQ9.A7652 AT942.AQ4.32.KJ3" 
FUT 0 
TABLE 5 8 5 8 6 6 6 6 5 7 5 7 7 5 7 5 6 6 6 6 
PAR "NS -999" "EW 999" "NS:EW 7N" "EW:EW 7N" 
PAR2 "-999" "7N-EW" 
PLAY 0 "" 
TRACE 1 0 
PBN 0 0 0 0 "N:QJ6.K652.J85.T98 873.J97.AT764.Q4 K5.T83.KQ9.A7652 AT942.AQ4.32.KJ3" 
FUT 0 
TABLE 5 8 5 8 6 6 6 6 5 7 5 7 7 5 7 5 6 6 6 6 
PAR "NS -888" "EW 888" "NS:EW 6N" "EW:EW 6N" 
PAR2 "-888" "6N-EW" 
PLAY 0 "" 
TRACE 1 0 
"""


class DtestMismatchExitTest(unittest.TestCase):
    def test_dtest_exits_nonzero_on_first_par_mismatch(self) -> None:
        dtest = _dtest_binary()
        with tempfile.TemporaryDirectory() as tmp:
            hands = Path(tmp) / "mismatch.txt"
            hands.write_text(_MISMATCH_HANDS, encoding="utf-8")
            proc = subprocess.run(
                [str(dtest), "-f", str(hands), "-s", "par", "-n", "1"],
                capture_output=True,
                text=True,
                check=False,
                timeout=60,
            )

        self.assertNotEqual(
            proc.returncode,
            0,
            msg=f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}",
        )
        self.assertIn("loop_par i 0: Difference", proc.stdout)
        self.assertNotIn("loop_par i 1:", proc.stdout)


if __name__ == "__main__":
    unittest.main()
