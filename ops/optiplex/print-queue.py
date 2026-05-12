#!/usr/bin/env python3
"""
TMAYD thermal receipt renderer.

Triggered by the systemd path watcher on /var/lib/tmayd/queue/. Each input
file is named DAY-YYYYMMDD-NNNN.txt and contains the accepted submission
body as plain UTF-8 text. We emit ESC/POS bytes to the printer at
TCP 9100 and move the file into printed/ on success or failed/ on error.

Receipt hierarchy, top to bottom:
  A. Title           — 2x-height bold wordmark inside heavy rules
  B. Minimal QR      — rMQR centered + the same URL it encodes, no frame
  C. Identifier      — FORM, RECORD, STATUS, UTC field lines
  D. Submission      — literary-quotation ceremony (main attraction)
  E. Footer/measure  — LENGTH/LINES/STATE/OUTPUT + LOCAL PRINT RECORD
  F. Frame end       — dotted-rule boundary marker (no cut, continuous roll)
"""
import socket
import textwrap
import shutil
from pathlib import Path
from datetime import datetime, timezone

ENV_FILE = Path("/etc/tmayd/printer.env")

ROOT = Path("/var/lib/tmayd")
QUEUE = ROOT / "queue"
PROCESSING = ROOT / "processing"
PRINTED = ROOT / "printed"
FAILED = ROOT / "failed"

WIDTH = 42
INNER_WIDTH = WIDTH - 4
MAX_MESSAGE_CHARS = 1200

# Ceremony block (literary quotation) wraps body 4 chars narrower than the
# main INNER_WIDTH so the inset is visible at a glance.
SUBMISSION_INDENT = 4
SUBMISSION_WIDTH = INNER_WIDTH - SUBMISSION_INDENT * 2 + 2  # = 34

# Side-margin arrow geometry. Arrows alternate left/right margins and are
# auto-inserted whenever cumulative vertical dots since the last arrow
# exceeds ARROW_INTERVAL_DOTS — so spacing is roughly fixed regardless of
# body length, not stretched to receipt size.
TYPICAL_LINE_DOTS = 30           # default ESC/POS line spacing ≈ 3.75mm
ARROW_INTERVAL_DOTS = 480        # ~6cm at 203 dpi (each side ≈ 12cm apart)

FORM_CODE = "FORM TMAYD-01"
TITLE = "Tell me about your day"
SUBTITLE = "PUBLIC RECEIPT / LOCAL PRINT"

def load_env(path):
    values = {}
    if path.exists():
        for raw in path.read_text(encoding="utf-8").splitlines():
            raw = raw.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            k, v = raw.split("=", 1)
            values[k.strip()] = v.strip().strip('"')
    return values

cfg = load_env(ENV_FILE)

HOST = cfg.get("TMAYD_PRINTER_HOST", "192.168.50.2")
PORT = int(cfg.get("TMAYD_PRINTER_PORT", "9100"))
CUT = cfg.get("TMAYD_PRINTER_CUT", "0") == "1"
ROTATE = cfg.get("TMAYD_PRINT_ROTATION_DEGREES", "0") == "180"
PRINT_RMQR = cfg.get("TMAYD_PRINT_RMQR", "1") == "1"
PUBLIC_BASE = cfg.get("TMAYD_PUBLIC_BASE", "https://cbassuarez.com/d").rstrip("/")
RMQR_PRE_ROTATE = cfg.get("TMAYD_RMQR_PRE_ROTATE", "0") == "1"
# Orientation marginalia: side-margin "this side up" arrows distributed
# down the strip on alternating left/right margins, ~6cm apart, pointing
# UP toward the title. Image-rendered (not ASCII) so they survive the
# 180° text rotation as actual graphic marks.
PRINT_ARROWS = cfg.get("TMAYD_PRINT_ARROWS", "1") == "1"

# ── primitives ───────────────────────────────────────────────────────────

def line(s=""):
    # Encode in cp1252 to match the WPC1252 code page selected at receipt
    # init (ESC t 16 — see build_receipt). The printer's factory default
    # is PC437, which renders our § ¶ • UTF-8 byte sequences as mojibake
    # (`T°`, `┬¦`, `Γçó`). WPC1252 puts § ¶ • at single bytes 0xA7 0xB6
    # 0x95 and also covers smart quotes, em-dashes, and ellipses; glyphs
    # outside the code page fall back to '?' via errors="replace".
    return (s + "\n").encode("cp1252", errors="replace")

def blank():
    return line("")

def heavy_rule():
    return line("=" * WIDTH)

def fine_rule():
    return line("-" * WIDTH)

def dotted_rule():
    return line("." * WIDTH)

def center_line(s=""):
    return line(str(s)[:WIDTH].center(WIDTH))

def field_line(label, value):
    label = str(label).upper()
    value = str(value)
    return line(f"  {label:<10}  {value}"[:WIDTH])

def two_pair_row(label_a, value_a, label_b, value_b):
    left = f"{label_a:<7} {value_a}"
    right = f"{label_b:<6} {value_b}"
    space = WIDTH - 4 - len(left) - len(right)
    if space < 1:
        return line("  " + (left + " " + right)[:WIDTH - 2])
    return line("  " + left + (" " * space) + right)

def normalize_message(raw):
    # Preserve deliberate line breaks; collapse repeated blank lines to one.
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out = []
    previous_blank = False
    for ln in lines:
        stripped = ln.rstrip()
        is_blank = not stripped.strip()
        if is_blank:
            if not previous_blank:
                out.append("")
            previous_blank = True
        else:
            out.append(stripped)
            previous_blank = False
    return "\n".join(out).strip()

def wrap_message(text, width=INNER_WIDTH):
    wrapped_lines = []
    for para in text.split("\n"):
        if not para.strip():
            wrapped_lines.append("")
        else:
            wrapped_lines.extend(textwrap.wrap(para, width=width) or [""])
    return wrapped_lines

def now_iso_short():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def qr_caption(url):
    """Return a printable form of `url` that fits in WIDTH columns.

    Tries the URL as-is first, then strips the scheme, then truncates with a
    trailing `*` (avoid `…` U+2026 — not reliable across thermal code pages).
    """
    if len(url) <= WIDTH:
        return url
    if url.startswith("https://"):
        stripped = url[len("https://"):]
    elif url.startswith("http://"):
        stripped = url[len("http://"):]
    else:
        stripped = url
    if len(stripped) <= WIDTH:
        return stripped
    return stripped[:WIDTH - 1] + "*"

# ── imaging ──────────────────────────────────────────────────────────────

def escpos_raster_image(image):
    """Convert a 1-bit PIL image into ESC/POS GS v 0 raster bytes."""
    image = image.convert("1")
    width_px, height_px = image.size
    width_bytes = (width_px + 7) // 8

    payload = bytearray()
    payload += b"\x1d\x76\x30\x00"
    payload += bytes([width_bytes & 0xFF, (width_bytes >> 8) & 0xFF])
    payload += bytes([height_px & 0xFF, (height_px >> 8) & 0xFF])

    pixels = image.load()
    for y in range(height_px):
        for x_byte in range(width_bytes):
            value = 0
            for bit in range(8):
                x = x_byte * 8 + bit
                if x < width_px and pixels[x, y] == 0:
                    value |= 0x80 >> bit
            payload.append(value)

    return bytes(payload)

def arrow_image(width=30, height=78, thickness=3):
    """Generate a 1-bit 'this side up' arrow: vertical stem + open chevron head.

    Drawn in the reader's frame (arrowhead at top, stem below). When the
    printer is in 180° text rotation mode, raster blocks get flipped too
    (observed empirically on the installed unit), so we pre-rotate to
    compensate — the printed arrow then lands pointing UP toward the title.

    Defaults yield a narrow ~30×78 px mark, sized to sit in the side
    margin of an 80mm receipt (384 px printable) without crowding the
    text column.
    """
    from PIL import Image, ImageDraw

    img = Image.new("L", (width, height), color=255)
    draw = ImageDraw.Draw(img)
    mid_x = width // 2
    head_h = width // 2 + 2  # head depth — proportional to width

    # Stem: vertical line from below the head down to the bottom.
    draw.line([(mid_x, head_h), (mid_x, height - 1)], fill=0, width=thickness)
    # Open chevron head: two diagonals meeting at the tip (\\, /).
    draw.line([(0, head_h), (mid_x, 0)], fill=0, width=thickness)
    draw.line([(mid_x, 0), (width - 1, head_h)], fill=0, width=thickness)

    if ROTATE:
        img = img.rotate(180, expand=True)

    # Hard threshold to 1-bit for crisp thermal print.
    img = img.point(lambda p: 0 if p < 128 else 255, "1")
    return img


def align_command(side):
    """ESC a command bytes for the requested reader-frame side.

    With 180° text rotation on, the printer's horizontal alignment flips
    in the reader's view — printer-left lands on reader-right and vice
    versa — so we invert the mapping when ROTATE is set.
    """
    if side == "center":
        return b"\x1b\x61\x01"
    if ROTATE:
        return b"\x1b\x61\x02" if side == "left" else b"\x1b\x61\x00"
    return b"\x1b\x61\x00" if side == "left" else b"\x1b\x61\x02"


class ReceiptAssembler:
    """Bytearray with cumulative pixel-height tracking.

    Every emit() appends to the buffer and increments the dot counter
    (newlines × TYPICAL_LINE_DOTS plus any raster_height the caller
    declares). When the counter crosses ARROW_INTERVAL_DOTS, an arrow is
    inserted on the next side (alternating left/right) and the counter
    resets. The result: arrows appear at roughly fixed vertical intervals
    regardless of receipt length, on the side margins where they don't
    crowd content.
    """

    def __init__(self):
        self.buf = bytearray()
        self.dots_since_arrow = 0
        self.next_side = 0       # 0 = left next, 1 = right next

    def emit(self, data, raster_height=0):
        self.buf.extend(data)
        self.dots_since_arrow += data.count(b"\n") * TYPICAL_LINE_DOTS + raster_height
        self._maybe_arrow()

    def extend_raw(self, data):
        """Append without tracking. For cleanup bytes at end of receipt."""
        self.buf.extend(data)

    def _maybe_arrow(self):
        if not PRINT_ARROWS:
            return
        if self.dots_since_arrow < ARROW_INTERVAL_DOTS:
            return
        try:
            side = "left" if self.next_side == 0 else "right"
            arrow_img = arrow_image()
            self.buf.extend(align_command(side))
            self.buf.extend(escpos_raster_image(arrow_img))
            self.buf.extend(b"\n")
            self.buf.extend(align_command("left"))   # reset to left after
            self.next_side = 1 - self.next_side
            self.dots_since_arrow = 0
        except Exception:
            # PIL missing or raster failure — skip silently rather than
            # fail the whole receipt. Live OptiPlex has PIL.
            pass

    def bytes(self):
        return bytes(self.buf)


def make_qr_image(data):
    """Generate a standard (square) QR image, 1-bit, ≤384px wide.

    Uses the `qrcode` library (square QR, ISO/IEC 18004) rather than the
    rectangular Micro QR — square QR scans more reliably on consumer phone
    cameras at gallery-light levels. Auto-sized for the payload, ECC level
    M (≈15% correction), 4-px module, 2-module quiet zone (expanded to
    16-px in software below for extra thermal-paper margin).
    """
    import qrcode
    from PIL import Image, ImageOps

    qr = qrcode.QRCode(
        version=None,                                # auto-size
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=4,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white").convert("L")

    # Extra quiet zone for thermal-paper scanability.
    image = ImageOps.expand(image, border=16, fill=255)

    max_width = 384
    if image.width > max_width:
        ratio = max_width / image.width
        new_size = (max_width, max(1, int(image.height * ratio)))
        image = image.resize(new_size, Image.Resampling.NEAREST)

    if RMQR_PRE_ROTATE:
        image = image.rotate(180, expand=True)

    image = image.point(lambda p: 0 if p < 160 else 255, "1")
    return image

# ── identifier derivation ────────────────────────────────────────────────

def derive_record_no(job_name):
    digits = "".join(ch for ch in job_name if ch.isdigit())[-6:]
    if digits:
        return digits.zfill(6)
    return job_name[-6:].upper().rjust(6, "0")

# ── ceremony block (the main attraction) ─────────────────────────────────

def submission_block(message, a):
    """Literary-quotation ceremony around the submission body.

    Opening pilcrow at upper-left, body inset 4 chars wrapped to
    SUBMISSION_WIDTH, closing pilcrow at lower-right, decorative § and •
    glyph rows top and bottom. The adjacent identifier and footer
    fine_rules frame the whole block. Emits through the assembler so
    side-margin arrows can land inside long bodies.
    """
    a.emit(blank())
    a.emit(blank())
    a.emit(center_line("§   §   §"))
    a.emit(blank())
    # Opening pilcrow, left side.
    a.emit(line("  ¶"))
    body_lines = wrap_message(message, width=SUBMISSION_WIDTH)
    for ln in body_lines:
        if not ln:
            a.emit(blank())
        else:
            a.emit(line(" " * SUBMISSION_INDENT + ln))
    # Closing pilcrow, right side. Position mirrors the inset body width:
    # ¶ sits at column 34 (one past the rightmost body column).
    a.emit(line(" " * (SUBMISSION_INDENT + SUBMISSION_WIDTH - 4) + "¶"))
    a.emit(blank())
    a.emit(center_line("•   •   •"))
    a.emit(blank())
    a.emit(blank())
    return len(body_lines)

# ── frame end ────────────────────────────────────────────────────────────

def roll_divider(record_no, a):
    # Visual finality affordance for the continuous roll. Not a cut mark.
    a.emit(blank())
    a.emit(blank())
    a.emit(blank())
    a.emit(dotted_rule())
    a.emit(blank())
    a.emit(center_line(f"FRAME {record_no} END"))
    a.emit(blank())
    a.emit(dotted_rule())
    a.emit(blank())
    a.emit(blank())
    a.emit(blank())
    a.emit(blank())

# ── top-level assembler ──────────────────────────────────────────────────

def build_receipt(message, job_name):
    """Assemble the full ESC/POS payload for one accepted submission.

    `job_name` is the queue file stem — the full publicCode like
    DAY-YYYYMMDD-NNNN. The QR encodes the full code. `record_no` is the
    6-digit short form used in human-facing RECORD / FRAME labels.
    """
    # Two distinct identifiers in flight:
    #   - public_code: full DAY-YYYYMMDD-NNNN → QR + URL caption
    #   - record_no:   6-digit suffix         → RECORD field, FRAME marker
    public_code = job_name
    record_no = derive_record_no(job_name)
    qr_url = f"{PUBLIC_BASE}/{public_code}"

    normalized = normalize_message(message)
    original_len = len(normalized)
    truncated = original_len > MAX_MESSAGE_CHARS

    if truncated:
        visible_message = normalized[:MAX_MESSAGE_CHARS].rstrip() + "\n..."
        length_label = f"{MAX_MESSAGE_CHARS}+ CHARS"
    else:
        visible_message = normalized
        length_label = f"{original_len:04d} CHARS"

    a = ReceiptAssembler()

    # Initialize printer + optional 180° rotation.
    a.emit(b"\x1b\x40")
    # Select WPC1252 code page (ESC t 16) so § ¶ • smart-quotes and dashes
    # render as single-byte cp1252 sequences rather than UTF-8 mojibake
    # under the factory-default PC437 table. TM-T30III index 16 = WPC1252.
    a.emit(b"\x1b\x74\x10")
    if ROTATE:
        a.emit(b"\x1b\x7b\x01")

    # Side-margin orientation arrows are inserted automatically by the
    # assembler every ARROW_INTERVAL_DOTS, alternating left/right — so
    # any torn fragment of the strip carries at least one "this side up"
    # mark in its margin. No explicit top/bottom blocks.

    # ── A. Title ─────────────────────────────────────────────────────────
    a.emit(b"\x1b\x61\x01")          # center
    a.emit(heavy_rule())
    a.emit(blank())
    a.emit(b"\x1b\x45\x01")          # bold on
    a.emit(b"\x1d\x21\x01")          # double-height (1x width, 2x height)
    a.emit(line(TITLE))
    a.emit(b"\x1d\x21\x00")          # cancel size
    a.emit(b"\x1b\x45\x00")          # bold off
    a.emit(blank())
    a.emit(line(SUBTITLE))
    a.emit(blank())
    a.emit(heavy_rule())
    a.emit(blank())

    # ── B. Minimal QR block ──────────────────────────────────────────────
    # Centered (square) QR image + URL underneath. No colon frame, no
    # PUBLIC INDEX label — the URL is self-documenting.
    if PRINT_RMQR:
        try:
            image = make_qr_image(qr_url)
            a.emit(escpos_raster_image(image) + b"\n", raster_height=image.height)
        except Exception as exc:
            a.emit(center_line("[ QR UNAVAILABLE ]"))
            for ln in wrap_message(f"qr error: {exc}", width=WIDTH):
                a.emit(center_line(ln))
    a.emit(blank())
    a.emit(line(qr_caption(qr_url).center(WIDTH)))
    a.emit(blank())
    a.emit(b"\x1b\x61\x00")          # left

    # ── C. Identifier block ──────────────────────────────────────────────
    a.emit(fine_rule())
    a.emit(blank())
    a.emit(field_line("FORM", FORM_CODE))
    a.emit(field_line("RECORD", record_no))
    a.emit(field_line("STATUS", "ACCEPTED / PRINTED LOCAL"))
    a.emit(field_line("UTC", now_iso_short()))
    a.emit(blank())
    a.emit(fine_rule())

    # ── D. Submission — main attraction ──────────────────────────────────
    visible_line_count = submission_block(visible_message, a)

    # ── E. Footer / measurement ──────────────────────────────────────────
    a.emit(fine_rule())
    a.emit(two_pair_row("LENGTH", length_label, "LINES", f"{visible_line_count:04d}"))
    a.emit(two_pair_row("STATE", "PRINTED", "OUTPUT", "RECEIPT"))
    if truncated:
        a.emit(fine_rule())
        a.emit(center_line("PRINT LENGTH EXCEEDED"))
        a.emit(center_line("SUBMITTED TEXT TRUNCATED"))
    a.emit(fine_rule())
    a.emit(blank())
    a.emit(b"\x1b\x61\x01")          # center
    a.emit(line(f"LOCAL PRINT RECORD / {record_no}"))
    a.emit(b"\x1b\x61\x00")          # left

    # ── F. Frame end ─────────────────────────────────────────────────────
    roll_divider(record_no, a)

    # Cleanup: rotation off, optional cut. Raw — no tracking needed.
    if ROTATE:
        a.extend_raw(b"\x1b\x7b\x00")
    if CUT:
        a.extend_raw(b"\x1d\x56\x00")

    return a.bytes()

# ── I/O ──────────────────────────────────────────────────────────────────

def send_to_printer(payload):
    with socket.create_connection((HOST, PORT), timeout=5) as s:
        s.sendall(payload)

def process_one(path):
    job_name = path.stem
    processing_path = PROCESSING / path.name

    shutil.move(str(path), str(processing_path))

    try:
        message = processing_path.read_text(encoding="utf-8").strip()
        if not message:
            raise ValueError("empty message")

        payload = build_receipt(message, job_name)
        send_to_printer(payload)

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        printed_path = PRINTED / f"{stamp}-{path.name}"
        shutil.move(str(processing_path), str(printed_path))

        print(f"printed {path.name} -> {printed_path.name}")

    except Exception as exc:
        failed_path = FAILED / path.name
        shutil.move(str(processing_path), str(failed_path))
        print(f"FAILED {path.name}: {exc}", flush=True)
        raise

def main():
    for folder in (QUEUE, PROCESSING, PRINTED, FAILED):
        folder.mkdir(parents=True, exist_ok=True)

    jobs = sorted(QUEUE.glob("*.txt"))
    if not jobs:
        print("queue empty")
        return

    for job in jobs:
        process_one(job)

if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="TMAYD print-queue worker.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Render to stdout (raw ESC/POS bytes), do not send to printer.",
    )
    parser.add_argument(
        "--job-name",
        default="DAY-20260511-0001",
        help="publicCode (path.stem) to render under in --dry-run.",
    )
    args, _ = parser.parse_known_args()

    if args.dry_run:
        msg = sys.stdin.read()
        sys.stdout.buffer.write(build_receipt(msg, args.job_name))
    else:
        main()
