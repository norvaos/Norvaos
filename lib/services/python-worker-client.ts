/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Python Worker Sidecar Client
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * HTTP client for calling the FastAPI Python sidecar worker.
 * Replaces direct execFile('python3', ...) calls with HTTP requests to the
 * containerised worker, enabling horizontal scaling and process isolation.
 *
 * Environment variables:
 *   PYTHON_WORKER_URL    — Base URL of the sidecar (e.g. http://localhost:8100)
 *   PYTHON_WORKER_SECRET — Shared secret for X-Worker-Key header auth
 *
 * Features:
 *   - Circuit breaker: 3 failures in 60s opens circuit for 30s
 *   - Configurable timeout (default 60s)
 *   - Multipart/form-data uploads for PDF processing
 *   - Typed return values matching existing interfaces
 */

import type { XfaScanResult } from '@/lib/types/ircc-forms'

// ── Configuration ────────────────────────────────────────────────────────────

const WORKER_URL = process.env.PYTHON_WORKER_URL || 'http://localhost:8100'
const WORKER_SECRET = process.env.PYTHON_WORKER_SECRET || ''
const DEFAULT_TIMEOUT_MS = 60_000

// ── Circuit Breaker ──────────────────────────────────────────────────────────

interface CircuitBreakerState {
  failures: number
  lastFailureAt: number
  openUntil: number
}

const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_FAILURE_WINDOW_MS = 60_000
const CIRCUIT_OPEN_DURATION_MS = 30_000

const circuitState: CircuitBreakerState = {
  failures: 0,
  lastFailureAt: 0,
  openUntil: 0,
}

function isCircuitOpen(): boolean {
  if (Date.now() < circuitState.openUntil) {
    return true
  }
  // Circuit has recovered — reset if window has expired
  if (
    circuitState.failures > 0 &&
    Date.now() - circuitState.lastFailureAt > CIRCUIT_FAILURE_WINDOW_MS
  ) {
    circuitState.failures = 0
  }
  return false
}

function recordSuccess(): void {
  circuitState.failures = 0
  circuitState.openUntil = 0
}

function recordFailure(): void {
  circuitState.failures++
  circuitState.lastFailureAt = Date.now()
  if (circuitState.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitState.openUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS
    console.error(
      `[python-worker] Circuit OPEN after ${circuitState.failures} failures. ` +
        `Will retry after ${CIRCUIT_OPEN_DURATION_MS / 1000}s.`,
    )
  }
}

// ── Error class ──────────────────────────────────────────────────────────────

export class PythonWorkerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(message)
    this.name = 'PythonWorkerError'
  }
}

// ── Generic caller ───────────────────────────────────────────────────────────

interface CallOptions {
  timeoutMs?: number
}

/**
 * Low-level caller for the Python worker sidecar.
 * Sends multipart/form-data requests with X-Worker-Key auth.
 */
export async function callPythonWorker(
  endpoint: string,
  formData: FormData,
  options?: CallOptions,
): Promise<Response> {
  if (isCircuitOpen()) {
    throw new PythonWorkerError(
      'Python worker circuit breaker is open — too many recent failures',
      503,
      endpoint,
    )
  }

  if (!WORKER_SECRET) {
    throw new PythonWorkerError(
      'PYTHON_WORKER_SECRET env var not set',
      500,
      endpoint,
    )
  }

  const url = `${WORKER_URL}${endpoint}`
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Worker-Key': WORKER_SECRET,
      },
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      recordFailure()
      let detail = ''
      try {
        const body = await response.json()
        detail = body.detail || body.error || JSON.stringify(body)
      } catch {
        detail = response.statusText
      }
      throw new PythonWorkerError(
        `Worker ${endpoint} returned ${response.status}: ${detail}`,
        response.status,
        endpoint,
      )
    }

    recordSuccess()
    return response
  } catch (error) {
    if (error instanceof PythonWorkerError) throw error

    recordFailure()

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new PythonWorkerError(
        `Worker ${endpoint} timed out after ${timeoutMs}ms`,
        504,
        endpoint,
      )
    }

    throw new PythonWorkerError(
      `Worker ${endpoint} connection failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
      endpoint,
    )
  } finally {
    clearTimeout(timer)
  }
}

// ── Typed API methods ────────────────────────────────────────────────────────

/**
 * Scan a PDF for XFA form fields.
 * Replaces: execFile('python3', ['scripts/xfa-scanner.py', tmpPdfPath])
 */
export async function scanXfa(
  pdfBuffer: Buffer | Uint8Array,
  options?: CallOptions,
): Promise<XfaScanResult> {
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
  formData.append('file', blob, 'template.pdf')

  const response = await callPythonWorker('/scan-xfa', formData, options)
  const result = await response.json()
  return result as XfaScanResult
}

/**
 * Fill XFA form fields in a PDF.
 * Replaces: execFile('python3', ['scripts/xfa-filler.py', dataPath])
 *
 * @returns Filled PDF bytes
 */
export async function fillXfa(
  pdfBuffer: Buffer | Uint8Array,
  fieldData: {
    rootElement: string
    scalarFields: Record<string, string>
    arrayData: Array<{
      basePath: string
      entryName: string
      entries: Array<Record<string, string>>
    }>
    barcodeData?: {
      code: string
      applicant: string
      generated: string
      version: string
      hash: string
    }
  },
  options?: CallOptions,
): Promise<Uint8Array> {
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
  formData.append('file', blob, 'template.pdf')
  formData.append('field_data', JSON.stringify(fieldData))

  const response = await callPythonWorker('/fill-xfa', formData, options)
  const arrayBuffer = await response.arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

/**
 * Render a PDF page to a PNG preview image.
 * Replaces: execFile('python3', ['scripts/pdf-preview.py', inputPath])
 */
export async function renderPreview(
  pdfBuffer: Buffer | Uint8Array,
  page: number = 0,
  options?: CallOptions & { dpi?: number },
): Promise<{
  images: Array<{
    page: number
    base64_png?: string
    width?: number
    height?: number
    error?: string
  }>
  page_count: number
}> {
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
  formData.append('file', blob, 'preview.pdf')
  formData.append('page', String(page))
  formData.append('dpi', String(options?.dpi ?? 150))

  const response = await callPythonWorker('/render-preview', formData, {
    timeoutMs: options?.timeoutMs,
  })
  return response.json()
}

/**
 * Check if the Python worker is healthy and reachable.
 */
export async function checkWorkerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${WORKER_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}
