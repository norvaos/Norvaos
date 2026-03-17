"""
NorvaOS Form Generation Sidecar — Sprint 6

Lightweight FastAPI service that handles form generation jobs dispatched
from the Next.js generate-form route.

Endpoints:
  GET  /health          — Health check
  POST /generate-form   — Accept a form generation job, produce PDF, callback

Auth:
  POST endpoints require X-Worker-Key header matching WORKER_SECRET env var.

Form generation (dev mode):
  Creates a minimal valid PDF using only the stdlib (no external PDF lib required
  for dev proof). In production this would use pikepdf/ReportLab to fill IRCC XFA
  templates. The output is stored at FORM_OUTPUT_DIR/<job_id>.pdf.

Callback:
  After generation, POSTs to callback_url with job result.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
logger = logging.getLogger('sidecar')

# ── Config ────────────────────────────────────────────────────────────────────

WORKER_SECRET = os.environ.get('WORKER_SECRET', '')
FORM_OUTPUT_DIR = Path(os.environ.get('FORM_OUTPUT_DIR', '/tmp/norvaos-forms'))
FORM_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Security requirement (Blocker B2): WORKER_SECRET must be set at startup.
# A missing or empty value means the sidecar cannot authenticate inbound or
# outbound requests, so we refuse to start rather than fall back to any default.
if not WORKER_SECRET:
    raise RuntimeError(
        'WORKER_SECRET environment variable is not set or is empty. '
        'The sidecar will not start without a secret.'
    )

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title='NorvaOS Form Generation Sidecar',
    version='1.0.0',
)


@app.middleware('http')
async def auth_middleware(request: Request, call_next):
    if request.url.path in ('/health', '/docs', '/openapi.json'):
        return await call_next(request)

    if request.method == 'POST':
        worker_key = request.headers.get('X-Worker-Key', '')
        # X-Job-ID is a job tracking header only — it does not grant authentication.
        # When WORKER_SECRET is set, every POST must supply a correct X-Worker-Key.
        # A missing or wrong key is rejected with 401; there is no bypass path.
        if WORKER_SECRET and worker_key != WORKER_SECRET:
            return JSONResponse(status_code=401, content={'error': 'Invalid X-Worker-Key'})

    return await call_next(request)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get('/health')
async def health():
    return {
        'status': 'ok',
        'service': 'norvaos-form-sidecar',
        'output_dir': str(FORM_OUTPUT_DIR),
    }


# ── Job model ─────────────────────────────────────────────────────────────────

class FormGenerationJob(BaseModel):
    job_id: str
    tenant_id: str
    matter_id: str
    form_template_id: str
    generation_key: str
    field_overrides: dict = {}
    callback_url: str


# ── PDF generation (dev) ──────────────────────────────────────────────────────

def generate_pdf_dev(job: FormGenerationJob, output_path: Path) -> int:
    """
    Generate a minimal valid PDF for dev/proof purposes.
    Returns page count.

    In production this would:
      1. Fetch the XFA template from Supabase storage
      2. Fill fields with matter data + field_overrides
      3. Use pikepdf/xfa_filler to produce the filled PDF
    """
    # Minimal single-page PDF (binary-safe, spec-compliant)
    now = datetime.utcnow().strftime("D:%Y%m%d%H%M%S")
    title = f"NorvaOS Form - {job.form_template_id}"
    content_stream = (
        f"BT\n"
        f"/F1 14 Tf\n"
        f"50 750 Td\n"
        f"({title}) Tj\n"
        f"0 -25 Td\n"
        f"(Matter: {job.matter_id}) Tj\n"
        f"0 -25 Td\n"
        f"(Template: {job.form_template_id}) Tj\n"
        f"0 -25 Td\n"
        f"(Job ID: {job.job_id}) Tj\n"
        f"0 -25 Td\n"
        f"(Generated: {datetime.utcnow().isoformat()}Z) Tj\n"
        f"ET\n"
    )
    stream_bytes = content_stream.encode('latin-1')
    stream_len = len(stream_bytes)

    pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
        b"   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        + f"4 0 obj\n<< /Length {stream_len} >>\nstream\n".encode()
        + stream_bytes
        + b"\nendstream\nendobj\n"
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"xref\n0 6\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000266 00000 n \n"
        b"0000000400 00000 n \n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n450\n%%EOF\n"
    )

    output_path.write_bytes(pdf)
    return 1  # single page


# ── POST /generate-form ───────────────────────────────────────────────────────

@app.post('/generate-form')
async def generate_form(job: FormGenerationJob, request: Request):
    """
    Accept a form generation job dispatched by the Next.js route.
    Generates a PDF and calls back to callback_url with the result.
    """
    logger.info('Received job %s for template %s', job.job_id, job.form_template_id)

    output_path = FORM_OUTPUT_DIR / f"{job.job_id}.pdf"

    # Run generation in thread pool (non-blocking)
    loop = asyncio.get_event_loop()
    try:
        page_count = await loop.run_in_executor(
            None, generate_pdf_dev, job, output_path
        )
        logger.info('Job %s completed — %s (%d pages)', job.job_id, output_path, page_count)

        callback_payload = {
            'job_id': job.job_id,
            'status': 'completed',
            'output_path': str(output_path),
            'page_count': page_count,
            'error': None,
        }

    except Exception as exc:
        logger.exception('Job %s failed: %s', job.job_id, exc)
        callback_payload = {
            'job_id': job.job_id,
            'status': 'failed',
            'output_path': None,
            'page_count': None,
            'error': str(exc),
        }

    # Callback to Next.js (fire-and-forget in background)
    asyncio.create_task(_send_callback(job.callback_url, callback_payload, job.job_id))

    return {'accepted': True, 'job_id': job.job_id}


async def _send_callback(callback_url: str, payload: dict, job_id: str):
    """POST result back to the Next.js callback endpoint."""
    # WORKER_SECRET is guaranteed non-empty by the startup assertion above.
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                callback_url,
                json=payload,
                headers={'X-Worker-Key': WORKER_SECRET, 'Content-Type': 'application/json'},
            )
        logger.info('Callback for job %s → HTTP %d', job_id, resp.status_code)
    except Exception as exc:
        logger.error('Callback failed for job %s: %s', job_id, exc)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import uvicorn
    port = int(os.environ.get('SIDECAR_PORT', '8001'))
    logger.info('Starting form generation sidecar on port %d', port)
    uvicorn.run(app, host='0.0.0.0', port=port, log_level='info')
