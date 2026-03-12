'use client'

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type MouseEvent,
  type TouchEvent,
} from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignaturePadProps {
  mode: 'draw' | 'type' | 'upload'
  signerName: string
  onSignatureChange: (
    data: { dataUrl: string; mode: 'drawn' | 'typed' | 'uploaded'; typedName?: string } | null
  ) => void
  disabled?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_HEIGHT = 150
const LINE_WIDTH = 2
const LINE_COLOR = '#000000'
const MIN_STROKE_LENGTH = 50
const SIGNATURE_FONT = "'Brush Script MT', 'Dancing Script', cursive"
const TYPED_FONT_SIZE = 32

// ─── Draw Mode Component ──────────────────────────────────────────────────────

function DrawMode({
  signerName,
  onSignatureChange,
  disabled,
}: Omit<SignaturePadProps, 'mode'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const totalStrokeLengthRef = useRef(0)

  // Setup canvas with proper DPR scaling
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    canvas.width = rect.width * dpr
    canvas.height = CANVAS_HEIGHT * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, CANVAS_HEIGHT)
    ctx.strokeStyle = LINE_COLOR
    ctx.lineWidth = LINE_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  useEffect(() => {
    setupCanvas()

    const handleResize = () => {
      // Only re-setup if not currently drawing
      if (!isDrawingRef.current) {
        totalStrokeLengthRef.current = 0
        setupCanvas()
        onSignatureChange(null)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setupCanvas, onSignatureChange])

  const getCoordinates = (
    e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const startDrawing = (
    e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>
  ) => {
    if (disabled) return
    e.preventDefault()

    isDrawingRef.current = true
    const point = getCoordinates(e)
    lastPointRef.current = point

    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  const draw = (
    e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingRef.current || disabled) return
    e.preventDefault()

    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    const point = getCoordinates(e)

    // Calculate stroke length
    if (lastPointRef.current) {
      const dx = point.x - lastPointRef.current.x
      const dy = point.y - lastPointRef.current.y
      totalStrokeLengthRef.current += Math.sqrt(dx * dx + dy * dy)
    }

    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)

    lastPointRef.current = point
  }

  const stopDrawing = (
    e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingRef.current) return
    e.preventDefault()

    isDrawingRef.current = false
    lastPointRef.current = null

    const canvas = canvasRef.current
    if (!canvas) return

    // Only report a valid signature if enough was drawn
    if (totalStrokeLengthRef.current >= MIN_STROKE_LENGTH) {
      const dataUrl = canvas.toDataURL('image/png')
      onSignatureChange({ dataUrl, mode: 'drawn' })
    } else {
      onSignatureChange(null)
    }
  }

  const handleClear = () => {
    totalStrokeLengthRef.current = 0
    setupCanvas()
    onSignatureChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="relative border border-slate-300 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${CANVAS_HEIGHT}px` }}
          className={`touch-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'}`}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          onTouchCancel={stopDrawing}
        />
        {/* Signature line */}
        <div className="absolute bottom-6 left-6 right-6 border-b border-dashed border-slate-300" />
        <span className="absolute bottom-2 left-6 text-[10px] text-slate-400">
          Sign above
        </span>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className="text-xs text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

// ─── Type Mode Component ──────────────────────────────────────────────────────

function TypeMode({
  signerName,
  onSignatureChange,
  disabled,
}: Omit<SignaturePadProps, 'mode'>) {
  const [typedValue, setTypedValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null)

  const normalise = (s: string) =>
    s.trim().replace(/\s+/g, ' ').toLowerCase()

  const isValidName = useCallback(
    (value: string): boolean => {
      if (value.trim().length < 2) return false
      return normalise(value) === normalise(signerName)
    },
    [signerName]
  )

  const renderToCanvas = useCallback(
    (text: string): string | null => {
      const canvas = hiddenCanvasRef.current
      if (!canvas) return null

      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      // Measure text to size the canvas appropriately
      ctx.font = `${TYPED_FONT_SIZE}px ${SIGNATURE_FONT}`
      const metrics = ctx.measureText(text)
      const textWidth = metrics.width + 40 // padding
      const textHeight = TYPED_FONT_SIZE + 30 // padding

      const dpr = window.devicePixelRatio || 1
      canvas.width = textWidth * dpr
      canvas.height = textHeight * dpr
      ctx.scale(dpr, dpr)

      // White background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, textWidth, textHeight)

      // Draw text
      ctx.font = `${TYPED_FONT_SIZE}px ${SIGNATURE_FONT}`
      ctx.fillStyle = '#1e293b'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 20, textHeight / 2)

      return canvas.toDataURL('image/png')
    },
    []
  )

  useEffect(() => {
    if (!typedValue.trim()) {
      setError(null)
      onSignatureChange(null)
      return
    }

    if (typedValue.trim().length < 2) {
      setError(null)
      onSignatureChange(null)
      return
    }

    if (!isValidName(typedValue)) {
      setError(
        `Please type your full name as it appears above: ${signerName}`
      )
      onSignatureChange(null)
      return
    }

    // Valid — render to canvas and emit
    setError(null)
    const dataUrl = renderToCanvas(typedValue.trim())
    if (dataUrl) {
      onSignatureChange({
        dataUrl,
        mode: 'typed',
        typedName: typedValue.trim(),
      })
    }
  }, [typedValue, signerName, isValidName, onSignatureChange, renderToCanvas])

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-slate-500 mb-2">
          Type your full name exactly as:{' '}
          <span className="font-semibold text-slate-700">{signerName}</span>
        </p>
        <input
          type="text"
          value={typedValue}
          onChange={(e) => setTypedValue(e.target.value)}
          disabled={disabled}
          placeholder={signerName}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder:text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            fontFamily: SIGNATURE_FONT,
            fontSize: `${TYPED_FONT_SIZE}px`,
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Preview of typed signature */}
      {typedValue.trim().length >= 2 && isValidName(typedValue) && (
        <div className="border border-slate-200 rounded-lg bg-white p-4">
          <p className="text-[10px] text-slate-400 mb-1">Preview</p>
          <p
            className="text-slate-800"
            style={{
              fontFamily: SIGNATURE_FONT,
              fontSize: `${TYPED_FONT_SIZE}px`,
            }}
          >
            {typedValue.trim()}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {/* Hidden canvas for rendering typed signature to PNG */}
      <canvas ref={hiddenCanvasRef} className="hidden" />
    </div>
  )
}

// ─── Upload Mode Component ───────────────────────────────────────────────────

function UploadMode({
  onSignatureChange,
  disabled,
}: Omit<SignaturePadProps, 'mode' | 'signerName'>) {
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (!file.type.startsWith('image/')) return
      if (file.size > 500_000) return

      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string

        // Convert to PNG via canvas for consistency
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxWidth = 400
          const maxHeight = 150
          let { width, height } = img

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)

          const pngDataUrl = canvas.toDataURL('image/png')
          setPreview(pngDataUrl)
          onSignatureChange({ dataUrl: pngDataUrl, mode: 'uploaded' })
        }
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
    },
    [onSignatureChange]
  )

  const handleClear = () => {
    setPreview(null)
    onSignatureChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      {preview ? (
        <div className="space-y-2">
          <div
            className="border border-slate-300 rounded-lg overflow-hidden bg-white p-4 flex items-center justify-center"
            style={{ minHeight: `${CANVAS_HEIGHT}px` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Uploaded signature" className="max-h-[120px] object-contain" />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg bg-white cursor-pointer hover:border-slate-400 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{ minHeight: `${CANVAS_HEIGHT}px` }}
        >
          <svg className="h-8 w-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-sm text-slate-500">Click to upload signature image</span>
          <span className="text-xs text-slate-400 mt-1">PNG, JPG up to 500KB</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
          />
        </label>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SignaturePad({
  mode,
  signerName,
  onSignatureChange,
  disabled,
}: SignaturePadProps) {
  if (mode === 'type') {
    return (
      <TypeMode
        signerName={signerName}
        onSignatureChange={onSignatureChange}
        disabled={disabled}
      />
    )
  }

  if (mode === 'upload') {
    return (
      <UploadMode
        onSignatureChange={onSignatureChange}
        disabled={disabled}
      />
    )
  }

  return (
    <DrawMode
      signerName={signerName}
      onSignatureChange={onSignatureChange}
      disabled={disabled}
    />
  )
}
