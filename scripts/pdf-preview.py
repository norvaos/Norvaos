#!/usr/bin/env python3
"""
Render PDF page(s) to PNG images using PyMuPDF (fitz).

Input via stdin (JSON):
  {
    "pdf_path": "/absolute/path/to/filled.pdf",
    "pages": [0, 1],   -- optional, defaults to [0]
    "dpi": 150          -- optional, defaults to 150
  }

Output to stdout (JSON):
  {
    "images": [
      { "page": 0, "base64_png": "<base64-encoded PNG>" }
    ],
    "page_count": 4
  }

Exit codes:
  0  -  success
  1  -  import error (PyMuPDF not installed)
  2  -  file not found
  3  -  rendering error
  4  -  invalid input
"""

import sys
import json
import base64

def main() -> None:
    # 1. Import PyMuPDF
    try:
        import fitz  # type: ignore[import]
    except ImportError:
        sys.stdout.write(json.dumps({
            "error": "PyMuPDF not installed. Run: pip install pymupdf",
            "code": 1,
        }))
        sys.exit(1)

    # 2. Parse input  -  from file argument (preferred) or stdin fallback
    try:
        if len(sys.argv) >= 2:
            with open(sys.argv[1], 'r', encoding='utf-8') as fh:
                data = json.load(fh)
        else:
            raw = sys.stdin.read()
            data = json.loads(raw)
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        sys.stdout.write(json.dumps({"error": f"Invalid JSON input: {exc}", "code": 4}))
        sys.exit(4)

    pdf_path: str = data.get("pdf_path", "")
    pages: list[int] = data.get("pages", [0])
    dpi: int = int(data.get("dpi", 150))

    if not pdf_path:
        sys.stdout.write(json.dumps({"error": "pdf_path is required", "code": 4}))
        sys.exit(4)

    # 3. Open PDF
    try:
        doc = fitz.open(pdf_path)
    except FileNotFoundError:
        sys.stdout.write(json.dumps({"error": f"File not found: {pdf_path}", "code": 2}))
        sys.exit(2)
    except Exception as exc:
        sys.stdout.write(json.dumps({"error": f"Cannot open PDF: {exc}", "code": 3}))
        sys.exit(3)

    page_count: int = len(doc)

    # 4. Render each requested page
    images: list[dict] = []
    matrix = fitz.Matrix(dpi / 72, dpi / 72)  # 72 dpi is the PDF default

    for page_num in pages:
        if page_num < 0 or page_num >= page_count:
            continue  # Skip out-of-range pages silently

        try:
            page = doc[page_num]
            pix = page.get_pixmap(matrix=matrix)
            png_bytes = pix.tobytes("png")
            images.append({
                "page": page_num,
                "base64_png": base64.b64encode(png_bytes).decode("utf-8"),
                "width": pix.width,
                "height": pix.height,
            })
        except Exception as exc:
            images.append({
                "page": page_num,
                "error": str(exc),
            })

    doc.close()

    # 5. Output result
    sys.stdout.write(json.dumps({
        "images": images,
        "page_count": page_count,
    }))


if __name__ == "__main__":
    main()
