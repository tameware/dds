"""Unit tests for web/dds_mvp_voice.js deal speech parser."""
from __future__ import annotations

import shutil
import subprocess
import unittest
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parents[1]
NODE_TEST = WEB_ROOT / "tests" / "dds_mvp_voice_parser_node.mjs"
VOICE_JS = WEB_ROOT / "dds_mvp_voice.js"


@unittest.skipIf(shutil.which("node") is None, "node not found")
class VoiceParserNodeTest(unittest.TestCase):
    def test_voice_parser_node_suite(self) -> None:
        proc = subprocess.run(
            ["node", str(NODE_TEST), str(VOICE_JS)],
            capture_output=True,
            text=True,
            check=False,
            cwd=str(WEB_ROOT),
        )
        self.assertEqual(
            proc.returncode,
            0,
            msg=proc.stderr or proc.stdout,
        )
        self.assertIn("passed", proc.stdout)


if __name__ == "__main__":
    unittest.main()
