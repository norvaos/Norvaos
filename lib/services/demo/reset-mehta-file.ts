/**
 * reset-mehta-file.ts  -  Directive 34.0: "Perfect Amber" Ghost File Reset
 *
 * Restores the Arjun Mehta ghost matter to its demo-ready state:
 *   - Readiness Score: 60 (Amber)
 *   - Passport Document: 87d expiry
 *   - Two Norva Ear sessions: Hindi (medical) + Punjabi (establishment)
 *   - Status: closed_won
 *
 * Can be called server-side or via admin API.
 *
 * Usage (server-side):
 *   import { resetMehtaFile } from '@/lib/services/demo/reset-mehta-file'
 *   await resetMehtaFile(supabaseAdmin)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Constants ──────────────────────────────────────────────────────────────

const MEHTA_MATTER_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'
const TENANT_ID = 'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1'
const USER_ID = '6e560ca2-4eac-461b-a939-0b6a4b2804cf'

// ── Hindi Session Payload ───────────────────────────────────────────────────

const HINDI_SESSION = {
  tenant_id: TENANT_ID,
  matter_id: MEHTA_MATTER_ID,
  user_id: USER_ID,
  title: 'Consultation  -  Arjun Mehta (Hindi)  -  Father\'s Medical History',
  status: 'completed' as const,
  consent_granted: true,
  consent_granted_at: new Date().toISOString(),
  consent_method: 'verbal' as const,
  participants: ['Arjun Mehta', 'Zia Waseer'],
  duration_seconds: 847,
  source_language: 'hi',
  transcript: `[00:00] Lawyer: Arjun, please tell me about your father's condition.
[00:12] Arjun (Hindi): पिताजी की तबीयत ठीक नहीं है। उन्हें पिछले साल दिल का दौरा पड़ा था। अब वो अकेले नहीं रह सकते।
[00:28] [Translation]: Father's health is not good. He had a heart attack last year. He can no longer live alone.
[00:35] Lawyer: How long has he been in this condition?
[00:42] Arjun (Hindi): करीब डेढ़ साल से। डॉक्टर ने कहा है कि उन्हें किसी की देखभाल चाहिए, और मेरी बहन की शादी हो चुकी है, वो दूसरे शहर में रहती है।
[00:58] [Translation]: About one and a half years. The doctor said he needs someone to care for him, and my sister is married and lives in another city.
[01:10] Lawyer: Is there any medical documentation?
[01:15] Arjun (Hindi): हाँ, मेरे पास AIIMS दिल्ली का पूरा रिकॉर्ड है। कार्डियोलॉजिस्ट की रिपोर्ट, ECG, और medications की लिस्ट।
[01:30] [Translation]: Yes, I have the complete record from AIIMS Delhi. Cardiologist report, ECG, and medication list.
[01:42] Lawyer: This is strong evidence for the H&C application. The dependency is clear.
[01:50] Arjun (Hindi): मैं चाहता हूँ कि पिताजी यहाँ कनाडा आ जाएं। मैं उनकी देखभाल कर सकता हूँ।
[02:00] [Translation]: I want father to come to Canada. I can take care of him.`,
  extracted_facts: [
    { id: 'fact-hi-001', category: 'medical', language: 'hi', original: 'पिताजी की तबीयत ठीक नहीं है। उन्हें पिछले साल दिल का दौरा पड़ा था।', translation: "Father's health is not good. He had a heart attack last year.", confidence: 0.96, timestamp: '00:12' },
    { id: 'fact-hi-002', category: 'dependency', language: 'hi', original: 'अब वो अकेले नहीं रह सकते', translation: 'He can no longer live alone.', confidence: 0.98, timestamp: '00:24' },
    { id: 'fact-hi-003', category: 'family', language: 'hi', original: 'मेरी बहन की शादी हो चुकी है, वो दूसरे शहर में रहती है', translation: 'My sister is married and lives in another city.', confidence: 0.95, timestamp: '00:52' },
    { id: 'fact-hi-004', category: 'evidence', language: 'hi', original: 'AIIMS दिल्ली का पूरा रिकॉर्ड है। कार्डियोलॉजिस्ट की रिपोर्ट, ECG', translation: 'Complete record from AIIMS Delhi. Cardiologist report, ECG.', confidence: 0.97, timestamp: '01:15' },
    { id: 'fact-hi-005', category: 'intent', language: 'hi', original: 'मैं चाहता हूँ कि पिताजी यहाँ कनाडा आ जाएं', translation: 'I want father to come to Canada.', confidence: 0.99, timestamp: '01:50' },
  ],
  anchored_fields: {
    h_and_c_grounds: "Father suffered cardiac arrest (AIIMS Delhi, 2024). Unable to live independently. Only available caregiver is applicant (sister married, relocated). Strong dependency + medical evidence.",
    medical_condition: 'Cardiac arrest  -  ongoing care required',
    medical_facility: 'AIIMS Delhi',
    family_dependency: "Father dependent on applicant; sister unavailable (married, different city)",
    supporting_documents: ['Cardiologist report (AIIMS Delhi)', 'ECG records', 'Medication list'],
    source_language: 'hi',
    h_and_c_relevance_score: 0.94,
  },
}

// ── Punjabi Session Payload ──────────────────────────────────────────────────

const PUNJABI_SESSION = {
  tenant_id: TENANT_ID,
  matter_id: MEHTA_MATTER_ID,
  user_id: USER_ID,
  title: 'Consultation  -  Arjun Mehta (Punjabi)  -  Ancestral Property & Establishment',
  status: 'completed' as const,
  consent_granted: true,
  consent_granted_at: new Date().toISOString(),
  consent_method: 'verbal' as const,
  participants: ['Arjun Mehta', 'Zia Waseer'],
  duration_seconds: 612,
  source_language: 'pa',
  transcript: `[00:00] Lawyer: Arjun, let's discuss your ties to Canada and your property back home.
[00:10] Arjun (Punjabi): ਪਿੰਡ ਦੀ ਜ਼ਮੀਨ ਹੈ, ਕਰੀਬ ਪੰਜ ਏਕੜ। ਪਰ ਉਹ ਜ਼ਮੀਨ ਪਿਤਾ ਜੀ ਦੇ ਨਾਮ ਤੇ ਹੈ। ਮੈਂ ਉਥੇ ਵਾਪਸ ਨਹੀਂ ਜਾ ਸਕਦਾ।
[00:25] [Translation]: There is land in the village, about five acres. But the land is in father's name. I cannot go back there.
[00:32] Lawyer: Why can't you return?
[00:36] Arjun (Punjabi): ਮੈਨੂੰ ਇੱਥੇ ਕੈਨੇਡਾ ਵਿੱਚ ਨੌਕਰੀ ਮਿਲ ਗਈ ਹੈ। ਮੈਂ Mississauga ਵਿੱਚ ਰਹਿੰਦਾ ਹਾਂ। ਮੇਰੇ ਬੱਚੇ ਇੱਥੇ ਸਕੂਲ ਜਾਂਦੇ ਨੇ। ਮੇਰੀ ਪਤਨੀ ਵੀ ਕੰਮ ਕਰਦੀ ਹੈ।
[00:55] [Translation]: I have found a job here in Canada. I live in Mississauga. My children go to school here. My wife also works.
[01:05] Lawyer: How long have you been in Canada?
[01:10] Arjun (Punjabi): ਸੱਤ ਸਾਲ ਹੋ ਗਏ ਨੇ। ਅਸੀਂ ਟੈਕਸ ਭਰਦੇ ਹਾਂ, ਘਰ ਕਿਰਾਏ ਤੇ ਲਿਆ ਹੈ, ਬੱਚੇ ਦੀ ਹਾਕੀ ਟੀਮ ਵਿੱਚ ਹੈ।
[01:25] [Translation]: It has been seven years. We pay taxes, we rent a home, our child is on a hockey team.
[01:35] Lawyer: Excellent. This establishment evidence is very strong for H&C.
[01:42] Arjun (Punjabi): ਮੈਂ ਚਾਹੁੰਦਾ ਹਾਂ ਕਿ ਸਾਡਾ ਪੱਕਾ ਇੱਥੇ ਹੋ ਜਾਵੇ। ਇਹ ਸਾਡਾ ਘਰ ਹੈ ਹੁਣ।
[01:52] [Translation]: I want us to be permanent here. This is our home now.`,
  extracted_facts: [
    { id: 'fact-pa-001', category: 'property', language: 'pa', original: 'ਪਿੰਡ ਦੀ ਜ਼ਮੀਨ ਹੈ, ਕਰੀਬ ਪੰਜ ਏਕੜ', translation: 'There is land in the village, about five acres.', confidence: 0.97, timestamp: '00:10' },
    { id: 'fact-pa-002', category: 'establishment', language: 'pa', original: 'ਮੈਨੂੰ ਇੱਥੇ ਕੈਨੇਡਾ ਵਿੱਚ ਨੌਕਰੀ ਮਿਲ ਗਈ ਹੈ। ਮੈਂ Mississauga ਵਿੱਚ ਰਹਿੰਦਾ ਹਾਂ।', translation: 'I have found a job here in Canada. I live in Mississauga.', confidence: 0.98, timestamp: '00:36' },
    { id: 'fact-pa-003', category: 'establishment', language: 'pa', original: 'ਮੇਰੇ ਬੱਚੇ ਇੱਥੇ ਸਕੂਲ ਜਾਂਦੇ ਨੇ। ਮੇਰੀ ਪਤਨੀ ਵੀ ਕੰਮ ਕਰਦੀ ਹੈ।', translation: 'My children go to school here. My wife also works.', confidence: 0.96, timestamp: '00:48' },
    { id: 'fact-pa-004', category: 'establishment', language: 'pa', original: 'ਸੱਤ ਸਾਲ ਹੋ ਗਏ ਨੇ। ਅਸੀਂ ਟੈਕਸ ਭਰਦੇ ਹਾਂ, ਘਰ ਕਿਰਾਏ ਤੇ ਲਿਆ ਹੈ, ਬੱਚੇ ਦੀ ਹਾਕੀ ਟੀਮ ਵਿੱਚ ਹੈ।', translation: 'Seven years. We pay taxes, rent a home, child is on a hockey team.', confidence: 0.99, timestamp: '01:10' },
    { id: 'fact-pa-005', category: 'intent', language: 'pa', original: 'ਮੈਂ ਚਾਹੁੰਦਾ ਹਾਂ ਕਿ ਸਾਡਾ ਪੱਕਾ ਇੱਥੇ ਹੋ ਜਾਵੇ। ਇਹ ਸਾਡਾ ਘਰ ਹੈ ਹੁਣ।', translation: 'I want us to be permanent here. This is our home now.', confidence: 0.99, timestamp: '01:42' },
  ],
  anchored_fields: {
    establishment_years: 7,
    establishment_city: 'Mississauga, ON',
    employment_status: 'Employed (applicant + spouse)',
    children_enrolled: true,
    community_ties: 'Child on hockey team; tax-filing history',
    ancestral_property: "5 acres in father's name (Punjab village)",
    return_hardship: 'No viable return  -  entire family established in Canada',
    source_language: 'pa',
    h_and_c_relevance_score: 0.97,
  },
}

// ── Reset Function ──────────────────────────────────────────────────────────

export interface ResetResult {
  success: boolean
  deletedSessions: number
  insertedSessions: number
  matterStatus: string
}

/**
 * Reset Arjun Mehta's ghost file to "Perfect Amber" demo state.
 *
 * 1. Deletes all existing Norva Ear sessions for the Mehta matter
 * 2. Re-inserts the Hindi + Punjabi gold-standard sessions
 * 3. Resets the matter status to closed_won
 */
export async function resetMehtaFile(
  supabase: SupabaseClient,
): Promise<ResetResult> {
  // 1. Clear existing Norva Ear sessions for this matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: deleted } = await (supabase as any)
    .from('norva_ear_sessions')
    .delete()
    .eq('matter_id', MEHTA_MATTER_ID)
    .eq('tenant_id', TENANT_ID)
    .select('id')

  const deletedCount = deleted?.length ?? 0

  // 2. Insert gold-standard Hindi + Punjabi sessions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = await (supabase as any)
    .from('norva_ear_sessions')
    .insert([HINDI_SESSION, PUNJABI_SESSION])

  if (insertErr) {
    throw new Error(`Failed to insert Norva Ear sessions: ${insertErr.message}`)
  }

  // 3. Ensure matter is in correct state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('matters')
    .update({ status: 'closed_won' })
    .eq('id', MEHTA_MATTER_ID)

  return {
    success: true,
    deletedSessions: deletedCount,
    insertedSessions: 2,
    matterStatus: 'closed_won',
  }
}
