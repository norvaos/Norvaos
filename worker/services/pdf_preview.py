"""
PDF Preview Renderer  -  renders PDF page(s) to PNG images using PyMuPDF (fitz).

Ported from scripts/pdf-preview.py for the FastAPI sidecar worker.
Accepts PDF bytes + rendering options, returns base64-encoded PNG image data.
"""

from __future__ import annotations

import base64
import io
import logging

logger = logging.getLogger(__name__)


def render_preview(
    pdf_bytes: bytes,
    pages: list[int] | None = None,
    dpi: int = 150,
) -> dict:
    """Render requested pages of a PDF to PNG images.

    Args:
        pdf_bytes: Raw PDF file bytes.
        pages: List of 0-based page indices to render. Defaults to [0].
        dpi: Resolution for rendering. Defaults to 150.

    Returns:
        {
          "images": [
            { "page": 0, "base64_png": "<base64>", "width": 1275, "height": 1650 }
          ],
          "page_count": 4
        }
    """
    try:
        import fitz  # type: ignore[import]
    except ImportError:
        return {
            'error': 'PyMuPDF not installed in the worker container',
            'code': 1,
        }

    if pages is None:
        pages = [0]

    # Open PDF from bytes
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    except Exception as exc:
        return {
            'error': f'Cannot open PDF: {exc}',
            'code': 3,
        }

    page_count: int = len(doc)
    images: list[dict] = []
    matrix = fitz.Matrix(dpi / 72, dpi / 72)

    for page_num in pages:
        if page_num < 0 or page_num >= page_count:
            continue  # Skip out-of-range pages silently

        try:
            page = doc[page_num]
            pix = page.get_pixmap(matrix=matrix)
            png_bytes = pix.tobytes('png')
            images.append({
                'page': page_num,
                'base64_png': base64.b64encode(png_bytes).decode('utf-8'),
                'width': pix.width,
                'height': pix.height,
            })
        except Exception as exc:
            images.append({
                'page': page_num,
                'error': str(exc),
            })

    doc.close()

    return {
        'images': images,
        'page_count': page_count,
    }
