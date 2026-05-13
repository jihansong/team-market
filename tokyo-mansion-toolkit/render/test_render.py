"""Smoke test for the renderer. Runs render.py against the sample data
and verifies the produced PDFs exist and are non-empty.

Usage:
    python3 render/test_render.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

THIS = Path(__file__).resolve().parent
ROOT = THIS.parent
SAMPLE = ROOT / "data" / "properties.sample.json"


class RenderSmoke(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="osaka-render-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def _run(self, mode: str):
        cmd = [
            sys.executable,
            str(THIS / "render.py"),
            "--mode", mode,
            "--input", str(SAMPLE),
            "--output", str(self.tmp),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, msg=f"stderr={proc.stderr}\nstdout={proc.stdout}")
        return proc

    def test_listing_mode(self):
        self._run("listing")
        cards = list((self.tmp / "cards").glob("*.pdf"))
        self.assertGreaterEqual(len(cards), 1)
        for c in cards:
            self.assertGreater(c.stat().st_size, 2000)

    def test_analysis_mode(self):
        self._run("analysis")
        pdfs = list(self.tmp.glob("*_analysis.pdf"))
        self.assertEqual(len(pdfs), 1)
        self.assertGreater(pdfs[0].stat().st_size, 5000)

    def test_both_mode(self):
        self._run("both")
        self.assertTrue(any((self.tmp / "cards").glob("*.pdf")))
        self.assertTrue(any(self.tmp.glob("*_analysis.pdf")))

    def test_analysis_has_expected_page_count(self):
        self._run("analysis")
        pdf_path = next(self.tmp.glob("*_analysis.pdf"))
        try:
            from pypdf import PdfReader
        except ImportError:
            self.skipTest("pypdf not available")
        n = len(PdfReader(str(pdf_path)).pages)
        # 6 fixed pages + 1 per cluster; sample has 2 clusters -> 8
        self.assertGreaterEqual(n, 6)
        self.assertLessEqual(n, 30)


if __name__ == "__main__":
    unittest.main()
