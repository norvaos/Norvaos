'use client'

import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, Loader2, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getKioskTranslations } from '@/lib/utils/kiosk-translations'
import type { PortalLocale } from '@/lib/utils/portal-translations'

interface KioskIdScannerProps {
  token: string
  sessionId: string
  locale: PortalLocale
  onComplete: (scanPath: string) => void
  onSkip: () => void
}

/**
 * ID scan capture component for the kiosk.
 *
 * Rule #9: ID scans are highly sensitive. Uploaded to private
 * storage bucket (service-role only).
 *
 * Supports camera capture (preferred on tablet) and file upload fallback.
 */
export function KioskIdScanner({
  token,
  sessionId,
  locale,
  onComplete,
  onSkip,
}: KioskIdScannerProps) {
  const [mode, setMode] = useState<'choose' | 'camera' | 'uploading' | 'done'>('choose')
  const [preview, setPreview] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<Blob | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const t = getKioskTranslations(locale)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setMode('camera')
    } catch {
      setError('Camera access denied. Please use the upload option instead.')
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setPreview(dataUrl)
    stopCamera()

    // Store canvas blob directly (avoids data-URL fetch issues on mobile)
    canvas.toBlob(
      (blob) => { if (blob) setPendingFile(blob) },
      'image/jpeg',
      0.85,
    )
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10MB.')
      return
    }

    // Store the original file for upload (avoids data-URL round-trip)
    setPendingFile(file)

    const reader = new FileReader()
    reader.onload = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function uploadScan() {
    if (!pendingFile) return

    setIsUploading(true)
    setError(null)

    try {
      const ext = pendingFile.type === 'image/png' ? 'png'
        : pendingFile.type === 'image/webp' ? 'webp'
        : 'jpg'

      const formData = new FormData()
      formData.append('file', pendingFile, `id-scan.${ext}`)
      formData.append('sessionId', sessionId)

      const res = await fetch(`/api/kiosk/${token}/id-scan`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Upload failed. Please try again.')
        return
      }

      const data = await res.json()
      setMode('done')
      onComplete(data.scanPath)
    } catch (err) {
      console.error('[kiosk-id-scan] Upload error:', err)
      setError('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  function retake() {
    setPreview(null)
    setPendingFile(null)
    setError(null)
    setMode('choose')
  }

  // Done state
  if (mode === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <p className="text-lg font-medium text-slate-900">ID scan uploaded successfully</p>
      </div>
    )
  }

  // Preview state — show captured/uploaded image with confirm/retake
  if (preview) {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto px-4">
        <h2 className="text-2xl font-semibold text-slate-900 text-center">
          {t.id_scan_title}
        </h2>

        <div className="w-full aspect-video rounded-xl overflow-hidden border-2 border-slate-200">
          <img
            src={preview}
            alt="ID scan preview"
            className="w-full h-full object-contain bg-slate-100"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            size="lg"
            onClick={retake}
            disabled={isUploading}
            className="flex-1 h-14"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            {t.id_scan_retake}
          </Button>
          <Button
            size="lg"
            onClick={uploadScan}
            disabled={isUploading || !pendingFile}
            className="flex-1 h-14"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {t.id_scan_confirm}
              </>
            ) : (
              t.id_scan_confirm
            )}
          </Button>
        </div>
      </div>
    )
  }

  // Camera mode
  if (mode === 'camera') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto px-4">
        <h2 className="text-2xl font-semibold text-slate-900 text-center">
          {t.id_scan_title}
        </h2>

        <div className="w-full aspect-video rounded-xl overflow-hidden border-2 border-slate-300 bg-black relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {/* Scan overlay guide */}
          <div className="absolute inset-4 border-2 border-dashed border-white/50 rounded-lg" />
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            size="lg"
            onClick={() => { stopCamera(); setMode('choose') }}
            className="flex-1 h-14"
          >
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={capturePhoto}
            className="flex-1 h-14"
          >
            <Camera className="w-5 h-5 mr-2" />
            Capture
          </Button>
        </div>
      </div>
    )
  }

  // Choose mode — camera or upload
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto px-4">
      <h2 className="text-2xl font-semibold text-slate-900 text-center">
        {t.id_scan_title}
      </h2>

      {error && (
        <p className="text-sm text-red-600 text-center">{error}</p>
      )}

      <div className="flex flex-col gap-4 w-full">
        <button
          type="button"
          onClick={startCamera}
          className="w-full p-6 bg-white border-2 border-slate-200 rounded-xl flex items-center gap-4 hover:border-slate-400 transition-colors"
        >
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Camera className="w-7 h-7 text-slate-600" />
          </div>
          <div className="text-left">
            <p className="text-lg font-medium text-slate-900">{t.id_scan_camera}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-6 bg-white border-2 border-slate-200 rounded-xl flex items-center gap-4 hover:border-slate-400 transition-colors"
        >
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Upload className="w-7 h-7 text-slate-600" />
          </div>
          <div className="text-left">
            <p className="text-lg font-medium text-slate-900">{t.id_scan_upload}</p>
          </div>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Button
        variant="ghost"
        onClick={onSkip}
        className="text-slate-500 hover:text-slate-700"
      >
        {t.id_scan_skip}
      </Button>
    </div>
  )
}
