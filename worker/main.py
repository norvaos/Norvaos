"""
NorvaOS Python Worker — FastAPI sidecar for PDF processing.

Endpoints:
  GET  /health       — Health check
  POST /scan-xfa     — Extract XFA field data from a PDF
  POST /fill-xfa     — Fill XFA fields in a PDF and return the filled PDF
  POST /render-preview — Render PDF page(s) to PNG images

Authentication:
  All POST endpoints require X-Worker-Key header matching WORKER_SECRET env var.

Timeout:
  60 seconds per request (enforced by middleware).
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from services.xfa_scanner import scan_pdf
from services.xfa_filler import fill_pdf
from services.pdf_preview import render_preview

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
logger = logging.getLogger('worker')

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title='NorvaOS Python Worker',
    description='FastAPI sidecar for XFA PDF scanning, filling, and preview rendering.',
    version='1.0.0',
)

WORKER_SECRET = os.environ.get('WORKER_SECRET', '')
REQUEST_TIMEOUT_SECONDS = 60


# ── Middleware: Auth + Timeout ────────────────────────────────────────────────

@app.middleware('http')
async def auth_and_timeout_middleware(request: Request, call_next):
    """Validate X-Worker-Key header on all POST endpoints and enforce request timeout."""
    start = time.monotonic()

    # Skip auth for health check and docs
    if request.url.path in ('/health', '/docs', '/openapi.json'):
        response = await call_next(request)
        return response

    # Validate worker key
    if request.method == 'POST':
        worker_key = request.headers.get('X-Worker-Key', '')
        if not WORKER_SECRET:
            logger.error('WORKER_SECRET env var not set — rejecting all requests')
            return JSONResponse(
                status_code=500,
                content={'error': 'Worker misconfigured: WORKER_SECRET not set'},
            )
        if worker_key != WORKER_SECRET:
            return JSONResponse(
                status_code=401,
                content={'error': 'Invalid or missing X-Worker-Key'},
            )

    # Enforce request timeout
    try:
        response = await asyncio.wait_for(
            call_next(request),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        elapsed = time.monotonic() - start
        logger.error('Request to %s timed out after %.1fs', request.url.path, elapsed)
        return JSONResponse(
            status_code=504,
            content={'error': f'Request timed out after {REQUEST_TIMEOUT_SECONDS}s'},
        )

    elapsed_ms = (time.monotonic() - start) * 1000
    logger.info('%s %s — %d (%.0fms)', request.method, request.url.path, response.status_code, elapsed_ms)
    return response


# ── Health ────────────────────────────────────────────────────────────────────

@app.get('/health')
async def health():
    """Health check endpoint. Returns 200 if the worker is running."""
    return {'status': 'ok', 'service': 'norvaos-python-worker'}


# ── POST /scan-xfa ────────────────────────────────────────────────────────────

@app.post('/scan-xfa')
async def scan_xfa_endpoint(
    file: UploadFile = File(..., description='PDF file to scan for XFA fields'),
):
    """Scan a PDF for XFA form fields and return structured field data."""
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Only PDF files are accepted')

    try:
        pdf_bytes = await file.read()
        if len(pdf_bytes) == 0:
            raise HTTPException(status_code=400, detail='Empty file uploaded')

        # Run scan in a thread pool to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, scan_pdf, pdf_bytes)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception('XFA scan failed')
        raise HTTPException(status_code=500, detail=f'Scan failed: {str(e)}')


# ── POST /fill-xfa ───────────────────────────────────────────────────────────

@app.post('/fill-xfa')
async def fill_xfa_endpoint(
    file: UploadFile = File(..., description='PDF template file to fill'),
    field_data: str = Form(..., description='JSON string with field data'),
):
    """Fill XFA form fields in a PDF and return the filled PDF bytes."""
    import json

    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Only PDF files are accepted')

    try:
        parsed_data = json.loads(field_data)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f'Invalid field_data JSON: {e}')

    try:
        pdf_bytes = await file.read()
        if len(pdf_bytes) == 0:
            raise HTTPException(status_code=400, detail='Empty file uploaded')

        # Run fill in a thread pool
        loop = asyncio.get_event_loop()
        result_bytes = await loop.run_in_executor(None, fill_pdf, pdf_bytes, parsed_data)

        return Response(
            content=result_bytes,
            media_type='application/pdf',
            headers={
                'Content-Disposition': 'attachment; filename="filled.pdf"',
                'Content-Length': str(len(result_bytes)),
            },
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception('XFA fill failed')
        raise HTTPException(status_code=500, detail=f'Fill failed: {str(e)}')


# ── POST /render-preview ─────────────────────────────────────────────────────

@app.post('/render-preview')
async def render_preview_endpoint(
    file: UploadFile = File(..., description='PDF file to render'),
    page: int = Form(0, description='0-based page index to render'),
    dpi: int = Form(150, description='Rendering DPI'),
):
    """Render a PDF page to a PNG image and return base64-encoded image data."""
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Only PDF files are accepted')

    if dpi < 36 or dpi > 600:
        raise HTTPException(status_code=400, detail='DPI must be between 36 and 600')

    try:
        pdf_bytes = await file.read()
        if len(pdf_bytes) == 0:
            raise HTTPException(status_code=400, detail='Empty file uploaded')

        # Run render in a thread pool
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, render_preview, pdf_bytes, [page], dpi,
        )

        if 'error' in result:
            raise HTTPException(
                status_code=502,
                detail=result['error'],
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception('Preview render failed')
        raise HTTPException(status_code=500, detail=f'Render failed: {str(e)}')
