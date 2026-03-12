import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { firmName, firstName, lastName, email, firmSize } = await req.json()

    if (!firmName || !firstName || !lastName || !email || !firmSize) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
    }

    // Check for duplicate email
    const { data: existing } = await supabase
      .from('waitlist')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'This email is already registered. We\'ll be in touch.' }, { status: 409 })
    }

    const { error } = await supabase.from('waitlist').insert({
      firm_name: firmName.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.toLowerCase().trim(),
      firm_size: firmSize,
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Waitlist error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
