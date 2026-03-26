import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { extractFacts } from '@/lib/services/norva-ear/fact-extractor'
import { translateTranscript, detectLanguage } from '@/lib/services/norva-ear/transcript-translator'
import type { NorvaEarLanguageCode } from '@/lib/i18n/config'

// ── POST  -  Start a new Norva Ear session ─────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId, userId, supabase } = await authenticateRequest()
    const { id: matterId } = await params

    const body = await request.json()
    const {
      title,
      participants,
      consentMethod,
    } = body as {
      title?: string
      participants?: string[]
      consentMethod?: 'verbal' | 'written' | 'digital' | 'pre_authorized'
    }

    // Consent Guard  -  refuse if consent not indicated
    if (!consentMethod) {
      return NextResponse.json(
        { error: 'Consent Guard: Recording consent must be obtained before starting a Norva Ear session.' },
        { status: 422 },
      )
    }

    const now = new Date().toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session, error } = await (supabase as any)
      .from('norva_ear_sessions')
      .insert({
        matter_id: matterId,
        tenant_id: tenantId,
        user_id: userId,
        title: title || `Consultation - ${new Date().toLocaleDateString('en-CA')}`,
        participants: participants || [],
        consent_granted: true,
        consent_granted_at: now,
        consent_method: consentMethod,
        status: 'recording',
        created_at: now,
      })
      .select()
      .single()

    if (error) {
      console.error('[Norva Ear] Failed to create session:', error)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[Norva Ear] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH  -  Submit transcript for processing ─────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId, supabase } = await authenticateRequest()
    const { id: matterId } = await params

    const body = await request.json()
    const { sessionId, transcript, durationSeconds, sourceLanguage } = body as {
      sessionId: string
      transcript: string
      durationSeconds?: number
      sourceLanguage?: NorvaEarLanguageCode
    }

    if (!sessionId || !transcript) {
      return NextResponse.json(
        { error: 'sessionId and transcript are required' },
        { status: 400 },
      )
    }

    // Mark session as processing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('norva_ear_sessions')
      .update({ status: 'processing' })
      .eq('id', sessionId)
      .eq('matter_id', matterId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('[Norva Ear] Failed to update session status:', updateError)
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    // ── Neural Translation Layer (Polyglot Bridge) ─────────────────────────
    // Detect language if not specified, then translate to English for extraction.
    // Both original and translation are stored for audit integrity.
    const detectedLang = sourceLanguage || await detectLanguage(transcript)
    const translation = await translateTranscript(transcript, detectedLang)

    // Extract facts from English version (translated or original)
    const extraction = await extractFacts(translation.englishTranslation)

    // Update session with results  -  store both original and translation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session, error: finalError } = await (supabase as any)
      .from('norva_ear_sessions')
      .update({
        transcript: translation.original,
        transcript_english: translation.wasTranslated ? translation.englishTranslation : null,
        source_language: detectedLang,
        extracted_facts: extraction,
        status: 'completed',
        duration_seconds: durationSeconds || null,
      })
      .eq('id', sessionId)
      .eq('matter_id', matterId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (finalError) {
      console.error('[Norva Ear] Failed to save extraction results:', finalError)
      return NextResponse.json({ error: 'Failed to save results' }, { status: 500 })
    }

    return NextResponse.json({
      session,
      extraction,
      translation: {
        sourceLanguage: translation.sourceLanguageLabel,
        wasTranslated: translation.wasTranslated,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[Norva Ear] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── GET  -  List sessions for this matter ──────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId, supabase } = await authenticateRequest()
    const { id: matterId } = await params

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessions, error } = await (supabase as any)
      .from('norva_ear_sessions')
      .select('id, title, status, participants, duration_seconds, created_at, consent_granted, consent_method')
      .eq('matter_id', matterId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Norva Ear] Failed to list sessions:', error)
      return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[Norva Ear] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
