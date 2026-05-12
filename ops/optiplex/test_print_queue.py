"""
Layout / byte-sequence tests for ops/optiplex/print-queue.py.

Run from the repo root:
    python3 -m unittest ops.optiplex.test_print_queue

or directly:
    python3 ops/optiplex/test_print_queue.py

The deployed script is named with a hyphen (`print-queue.py`) which isn't a
valid Python module name, so we load it with importlib.util. Tests
disable PRINT_RMQR and ROTATE so we don't need the rmqrcode/PIL stack just
to assert layout.
"""
from __future__ import annotations

import importlib.util
import re
import unittest
from pathlib import Path

HERE = Path(__file__).parent
SCRIPT = HERE / "print-queue.py"

_spec = importlib.util.spec_from_file_location("print_queue", SCRIPT)
pq = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pq)

# Force deterministic test conditions: no rMQR raster (no rmqrcode dep
# needed), no 180° rotation (cleaner byte stream to assert against). Arrows
# default ON — individual tests can flip them off as needed.
pq.PRINT_RMQR = False
pq.ROTATE = False
pq.PRINT_ARROWS = True


SAMPLE_BODY = (
    "Today the bus was twelve minutes late and I made it anyway. "
    "The bagel cart on Sixth saved me. I keep thinking about the man "
    "who let me in front of him in line."
)
SAMPLE_JOB = "DAY-20260511-0001"


# ── helpers ──────────────────────────────────────────────────────────────


def render(body: str = SAMPLE_BODY, job: str = SAMPLE_JOB) -> bytes:
    return pq.build_receipt(body, job)


def find_all(haystack: bytes, needle: bytes) -> list[int]:
    """Return all start indices of `needle` in `haystack`."""
    out, i = [], 0
    while True:
        j = haystack.find(needle, i)
        if j == -1:
            return out
        out.append(j)
        i = j + 1


# ── tests ────────────────────────────────────────────────────────────────


class TitleSection(unittest.TestCase):
    def test_title_text_present(self):
        self.assertIn(b"Tell me about your day\n", render())

    def test_title_is_bold_and_double_height(self):
        b = render()
        title_at = b.find(b"Tell me about your day")
        self.assertGreater(title_at, 0)
        # Bold-on (ESC E 1) and double-height (GS ! 0x01) must precede the
        # title bytes. Within reason — the most recent set/clear before the
        # title text is what matters.
        bold_on = b.rfind(b"\x1b\x45\x01", 0, title_at)
        bold_off = b.find(b"\x1b\x45\x00", title_at)
        size_on = b.rfind(b"\x1d\x21\x01", 0, title_at)
        size_off = b.find(b"\x1d\x21\x00", title_at)
        self.assertGreater(bold_on, -1, "bold-on missing before title")
        self.assertGreater(bold_off, -1, "bold-off missing after title")
        self.assertGreater(size_on, -1, "double-height-on missing before title")
        self.assertGreater(size_off, -1, "size-cancel missing after title")

    def test_heavy_rules_bracket_title(self):
        b = render()
        title_at = b.find(b"Tell me about your day")
        rule = b"=" * pq.WIDTH + b"\n"
        rules = find_all(b, rule)
        # One heavy rule above the title and one below it.
        self.assertGreaterEqual(
            len(rules), 2, "expected heavy rules above and below title"
        )
        self.assertTrue(any(r < title_at for r in rules))
        self.assertTrue(any(r > title_at for r in rules))


class QRSection(unittest.TestCase):
    def test_qr_url_uses_full_public_code(self):
        # The redesign fixes the bug where the QR encoded only the 6-digit
        # record_no. The printed URL must contain the full publicCode.
        b = render()
        expected = f"{pq.PUBLIC_BASE}/{SAMPLE_JOB}".encode()
        self.assertIn(expected, b)

    def test_qr_url_does_not_contain_truncated_record_no_form(self):
        # Regression guard: the URL must NOT match the old buggy form
        # cbassuarez.com/d/010001 (6 trailing digits only).
        b = render()
        record_no = pq.derive_record_no(SAMPLE_JOB)
        buggy = f"{pq.PUBLIC_BASE}/{record_no}".encode()
        self.assertNotIn(buggy, b)

    def test_no_colon_frame_around_qr(self):
        # Old rmqr_banner wrapped the block in `:::::` rules; the redesign
        # removed them. Make sure no 42-colon line ever appears.
        b = render()
        self.assertNotIn(b":" * pq.WIDTH, b)

    def test_no_public_index_label(self):
        # The redesign drops the redundant "PUBLIC INDEX" caption.
        b = render()
        self.assertNotIn(b"PUBLIC INDEX", b)

    def test_no_wrap_text_nameerror_path_remains(self):
        # The old rmqr_banner referenced an undefined `wrap_text` in its
        # except branch. The redesign deletes rmqr_banner entirely; nothing
        # in the module should reference `wrap_text` anymore.
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("wrap_text(", source)


class IdentifierSection(unittest.TestCase):
    def test_field_lines_present(self):
        b = render()
        record_no = pq.derive_record_no(SAMPLE_JOB)
        self.assertIn(b"FORM        " + pq.FORM_CODE.encode(), b)
        self.assertIn(b"RECORD      " + record_no.encode(), b)
        self.assertIn(b"STATUS      ACCEPTED / PRINTED LOCAL", b)
        self.assertRegex(b, rb"UTC         \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")


class SubmissionSection(unittest.TestCase):
    def test_literary_marks_present(self):
        b = render()
        # § row above body, • row below body, ¶ open and ¶ close.
        self.assertIn("§   §   §".encode("utf-8"), b)
        self.assertIn("•   •   •".encode("utf-8"), b)
        # Two distinct pilcrows: one at left (opening), one at right (closing).
        pilcrows = find_all(b, "¶".encode("utf-8"))
        self.assertEqual(len(pilcrows), 2, f"expected exactly 2 ¶ marks, got {len(pilcrows)}")

    def test_opening_pilcrow_is_before_closing(self):
        b = render()
        pilcrows = find_all(b, "¶".encode("utf-8"))
        self.assertLess(pilcrows[0], pilcrows[1])

    def _render_no_arrows(self):
        """Render with arrows off so the byte stream is pure UTF-8 text.

        Arrow rasters interleave the body when PIL is installed and would
        break decode("utf-8") — but they're irrelevant to body-layout
        assertions, so we suppress them here.
        """
        old = pq.PRINT_ARROWS
        pq.PRINT_ARROWS = False
        try:
            return render()
        finally:
            pq.PRINT_ARROWS = old

    def test_body_is_indented_4_chars(self):
        # Every non-blank body line begins with exactly 4 spaces.
        # The § and • marker rows are centered (padded with spaces), so we
        # match them with surrounding whitespace tolerance.
        b = self._render_no_arrows().decode("utf-8")
        m = re.search(r"§\s+§\s+§\s*\n(.+?)\n[^\S\n]*•\s+•\s+•", b, flags=re.S)
        self.assertIsNotNone(m, "could not locate ceremony section")
        chunk = m.group(1)
        # First line is the bare opening pilcrow (2-space indent).
        # Last line is the closing pilcrow; skip those.
        body_lines = chunk.splitlines()[1:-1]
        text_lines = [ln for ln in body_lines if ln.strip() and "¶" not in ln]
        self.assertGreater(len(text_lines), 0)
        for ln in text_lines:
            self.assertTrue(
                ln.startswith("    "),
                f"body line not 4-indented: {ln!r}",
            )

    def test_body_wrap_width_respected(self):
        b = self._render_no_arrows().decode("utf-8")
        m = re.search(r"§\s+§\s+§\s*\n(.+?)\n[^\S\n]*•\s+•\s+•", b, flags=re.S)
        self.assertIsNotNone(m, "could not locate ceremony section")
        chunk = m.group(1)
        for ln in chunk.splitlines():
            if not ln.strip() or "¶" in ln:
                continue
            # 4-char indent + body wrapped to SUBMISSION_WIDTH; total line ≤ WIDTH.
            self.assertLessEqual(len(ln), pq.WIDTH)


class FooterSection(unittest.TestCase):
    def test_length_and_lines_present(self):
        b = render()
        self.assertRegex(b, rb"LENGTH  \d{4}\+? ?CHARS")
        self.assertRegex(b, rb"LINES +\d{4}")

    def test_state_and_output(self):
        b = render()
        self.assertIn(b"STATE   PRINTED", b)
        self.assertIn(b"OUTPUT RECEIPT", b)

    def test_local_print_record_centered(self):
        b = render()
        record_no = pq.derive_record_no(SAMPLE_JOB)
        marker = f"LOCAL PRINT RECORD / {record_no}".encode()
        self.assertIn(marker, b)
        marker_at = b.find(marker)
        # Most recent center-align directive before the marker.
        last_center = b.rfind(b"\x1b\x61\x01", 0, marker_at)
        last_left = b.rfind(b"\x1b\x61\x00", 0, marker_at)
        self.assertGreater(last_center, last_left,
                           "LOCAL PRINT RECORD line not under center alignment")


class FrameEnd(unittest.TestCase):
    def test_frame_end_marker(self):
        b = render()
        record_no = pq.derive_record_no(SAMPLE_JOB)
        self.assertIn(f"FRAME {record_no} END".encode(), b)

    def test_dotted_rules_bracket_frame_end(self):
        b = render()
        record_no = pq.derive_record_no(SAMPLE_JOB)
        marker_at = b.find(f"FRAME {record_no} END".encode())
        dot_rule = b"." * pq.WIDTH + b"\n"
        rules = find_all(b, dot_rule)
        # At least one dotted rule on each side of the FRAME marker.
        self.assertTrue(any(r < marker_at for r in rules))
        self.assertTrue(any(r > marker_at for r in rules))


class SectionOrder(unittest.TestCase):
    """End-to-end: all six sections appear in the expected top-down order."""

    def test_six_sections_in_order(self):
        b = render()
        record_no = pq.derive_record_no(SAMPLE_JOB)
        positions = {
            "title": b.find(b"Tell me about your day"),
            "qr_url": b.find(f"{pq.PUBLIC_BASE}/{SAMPLE_JOB}".encode()),
            "form": b.find(b"FORM        " + pq.FORM_CODE.encode()),
            "submission_open": b.find("§   §   §".encode("utf-8")),
            "footer": b.find(f"LOCAL PRINT RECORD / {record_no}".encode()),
            "frame_end": b.find(f"FRAME {record_no} END".encode()),
        }
        for name, pos in positions.items():
            self.assertGreater(pos, -1, f"section marker missing: {name}")
        ordered = [positions[k] for k in
                   ("title", "qr_url", "form", "submission_open", "footer", "frame_end")]
        self.assertEqual(ordered, sorted(ordered),
                         f"sections out of order: {positions}")


class Truncation(unittest.TestCase):
    def test_truncation_warning_when_oversize(self):
        oversize = "x" * (pq.MAX_MESSAGE_CHARS + 50)
        b = pq.build_receipt(oversize, SAMPLE_JOB)
        self.assertIn(b"PRINT LENGTH EXCEEDED", b)
        self.assertIn(b"SUBMITTED TEXT TRUNCATED", b)

    def test_no_truncation_warning_when_under_limit(self):
        small = "short message"
        b = pq.build_receipt(small, SAMPLE_JOB)
        self.assertNotIn(b"PRINT LENGTH EXCEEDED", b)


class QRCaption(unittest.TestCase):
    def test_short_url_unchanged(self):
        url = "https://cbassuarez.com/d/DAY-20260511-0001"
        self.assertLessEqual(len(url), pq.WIDTH)
        self.assertEqual(pq.qr_caption(url), url)

    def test_long_url_strips_scheme(self):
        # 6-digit sequence would exceed 42 cols.
        url = "https://cbassuarez.com/d/DAY-20260511-100001"
        self.assertGreater(len(url), pq.WIDTH)
        caption = pq.qr_caption(url)
        self.assertFalse(caption.startswith("https://"))
        self.assertLessEqual(len(caption), pq.WIDTH)

    def test_truncation_uses_asterisk_not_ellipsis(self):
        # Pathological case: even scheme-stripped form still too long.
        url = "https://cbassuarez.com/d/" + "X" * 100
        caption = pq.qr_caption(url)
        self.assertLessEqual(len(caption), pq.WIDTH)
        # No U+2026 ellipsis — unsafe across thermal code pages.
        self.assertNotIn("…", caption)
        if len(("cbassuarez.com/d/" + "X" * 100)) > pq.WIDTH:
            self.assertTrue(caption.endswith("*"))


class HeaderInit(unittest.TestCase):
    def test_starts_with_printer_init(self):
        b = render()
        self.assertTrue(b.startswith(b"\x1b\x40"), "missing ESC @ init at start")


def _pil_available() -> bool:
    try:
        from PIL import Image, ImageDraw  # noqa: F401
        return True
    except ImportError:
        return False


PIL_OK = _pil_available()


class Arrows(unittest.TestCase):
    """Orientation marginalia: side-margin arrows distributed down the strip."""

    RASTER_HDR = b"\x1d\x76\x30\x00"  # GS v 0
    ESC_A_LEFT = b"\x1b\x61\x00"
    ESC_A_CENTER = b"\x1b\x61\x01"
    ESC_A_RIGHT = b"\x1b\x61\x02"

    @unittest.skipUnless(PIL_OK, "PIL not installed in this test env")
    def test_multiple_raster_blocks_present_when_arrows_on(self):
        # Arrows are raster images, like the rMQR. PRINT_RMQR is False in
        # this test module, so any GS v 0 sequences must come from arrows.
        # Distribution-by-interval guarantees at least two for a typical body.
        old = pq.PRINT_ARROWS
        pq.PRINT_ARROWS = True
        try:
            b = render()
        finally:
            pq.PRINT_ARROWS = old
        rasters = find_all(b, self.RASTER_HDR)
        self.assertGreaterEqual(len(rasters), 2,
                                f"expected ≥2 arrow raster blocks, got {len(rasters)}")

    def test_no_raster_blocks_when_arrows_off(self):
        old = pq.PRINT_ARROWS
        pq.PRINT_ARROWS = False
        try:
            b = render()
        finally:
            pq.PRINT_ARROWS = old
        rasters = find_all(b, self.RASTER_HDR)
        self.assertEqual(len(rasters), 0,
                         "no raster blocks expected when arrows disabled")

    @unittest.skipUnless(PIL_OK, "PIL not installed in this test env")
    def test_arrows_alternate_left_and_right_alignment(self):
        # With ROTATE=False (test default), align_command maps reader-frame
        # 'left' → ESC a 0 and 'right' → ESC a 2 directly. Arrows must
        # alternate, starting with left.
        old = pq.PRINT_ARROWS
        pq.PRINT_ARROWS = True
        try:
            b = render()
        finally:
            pq.PRINT_ARROWS = old
        rasters = find_all(b, self.RASTER_HDR)
        self.assertGreaterEqual(len(rasters), 2)
        alignments = []
        for r in rasters:
            last_left = b.rfind(self.ESC_A_LEFT, 0, r)
            last_center = b.rfind(self.ESC_A_CENTER, 0, r)
            last_right = b.rfind(self.ESC_A_RIGHT, 0, r)
            ranked = max(
                ("left", last_left),
                ("center", last_center),
                ("right", last_right),
                key=lambda kv: kv[1],
            )
            alignments.append(ranked[0])
        for i, side in enumerate(alignments):
            expected = "left" if i % 2 == 0 else "right"
            self.assertEqual(
                side, expected,
                f"arrow #{i} expected {expected}, got {side}; full: {alignments}",
            )

    @unittest.skipUnless(PIL_OK, "PIL not installed in this test env")
    def test_arrow_image_is_tall_narrow_oriented_mark(self):
        img = pq.arrow_image()
        self.assertEqual(img.mode, "1")
        self.assertGreater(img.width, 0)
        self.assertGreater(img.height, 0)
        # Side-margin marker: taller than wide so it reads as a stem-and-head
        # arrow rather than a stacked chevron block.
        self.assertGreater(img.height, img.width)


if __name__ == "__main__":
    unittest.main()
