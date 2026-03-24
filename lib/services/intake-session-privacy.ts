/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Intake Session Privacy Policy — Audio Retention Rules
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * LEGAL PRIVILEGE PROTECTION:
 *
 * Raw audio files from intake sessions must NEVER be persisted in any storage
 * system (Supabase Storage, OneDrive, local disk, or any other medium).
 *
 * The privacy-first architecture ensures:
 *
 *   1. CLIENT-SIDE ONLY: Audio capture uses the Web Speech API for real-time
 *      transcription directly in the browser. Raw audio buffers are processed
 *      in-memory and never uploaded to a server.
 *
 *   2. IMMEDIATE DISPOSAL: When a recording session ends, all MediaRecorder
 *      tracks are stopped and the stream is released. No audio data leaves
 *      the browser.
 *
 *   3. TEXT ONLY: The database stores ONLY:
 *      - `transcript` — The finalised text transcription
 *      - `summary` — An AI-generated summary of the session
 *      - `extracted_entities` — Structured data extracted from the transcript
 *
 *   4. NO SERVER-SIDE AUDIO: If a Whisper/OpenAI endpoint is used for enhanced
 *      transcription, the audio chunk must be sent via a streaming endpoint
 *      and discarded immediately after the text response is received. The API
 *      endpoint MUST NOT log, cache, or store the audio payload.
 *
 *   5. AUDIT TRAIL: The `intake_sessions` table records session metadata
 *      (start time, end time, user, status) but never audio content.
 *
 * This policy exists to protect solicitor-client privilege. Audio recordings
 * of client consultations create discovery risks. Text summaries and extracted
 * data fields are sufficient for the legal workflow and carry lower risk.
 *
 * ─── Enforcement Points ───────────────────────────────────────────────────────
 *
 * 1. LiveIntakeSidebar (component): Calls `track.stop()` on all media streams
 *    when recording ends. No blob URLs are created for audio data.
 *
 * 2. Whisper API endpoint (if deployed): Must use streaming mode, process
 *    chunks in memory, return text, and discard audio. No S3/Supabase upload.
 *
 * 3. Database schema: `intake_sessions` table has NO audio_url or audio_blob
 *    column. This is by design, not an oversight.
 *
 * 4. Storage policies: Supabase Storage bucket policies should block uploads
 *    to any `intake-audio/` path as a defence-in-depth measure.
 */

/**
 * Validate that an intake session record does not contain audio references.
 * Run this as a guard before inserting/updating intake_sessions rows.
 */
export function validateNoAudioData(data: Record<string, unknown>): void {
  const forbiddenKeys = ['audio_url', 'audio_blob', 'audio_path', 'audio_data', 'recording_url']
  for (const key of forbiddenKeys) {
    if (key in data && data[key] != null) {
      throw new Error(
        `Privacy violation: Attempted to store audio data in intake_sessions.${key}. ` +
        'Raw audio must never be persisted. Only text transcripts and extracted entities are allowed.'
      )
    }
  }
}

/**
 * Strip any accidental audio references from an intake session update payload.
 * Use as a safety net before database writes.
 */
export function sanitiseIntakeSessionData<T extends Record<string, unknown>>(data: T): T {
  const sanitised = { ...data }
  const forbiddenKeys = ['audio_url', 'audio_blob', 'audio_path', 'audio_data', 'recording_url']
  for (const key of forbiddenKeys) {
    if (key in sanitised) {
      delete sanitised[key]
    }
  }
  return sanitised
}
