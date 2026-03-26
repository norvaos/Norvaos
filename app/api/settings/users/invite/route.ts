import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { sendInternalEmail } from '@/lib/services/email-service'
import { renderSentinelWelcomeEmail } from '@/lib/email-templates/sentinel-welcome'
import { CLIENT_LOCALES } from '@/lib/i18n/config'
import { log } from '@/lib/utils/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSeatLimit, seatLimitResponse, logSeatLimitDenial } from '@/lib/services/seat-limit'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

// ── Global 15 Invite Content (Directive 40.0 §3) ──────────────────────────
// Localised invite messages  -  same pattern as WELCOME_CONTENT in sentinel-handshake
// but tailored for staff/team invitations rather than client portal handshakes.

interface InviteContent {
  greeting: (name: string) => string
  body: (firmName: string, roleName: string) => string
  cta: string
}

const INVITE_CONTENT: Record<string, InviteContent> = {
  en: {
    greeting: (n) => `Dear ${n}`,
    body: (f, r) => `You have been invited to join ${f} as ${r}. Click the button below to set up your account. This invitation expires in 7 days.`,
    cta: 'Accept Invitation',
  },
  fr: {
    greeting: (n) => `Cher(e) ${n}`,
    body: (f, r) => `Vous avez été invité(e) à rejoindre ${f} en tant que ${r}. Cliquez sur le bouton ci-dessous pour configurer votre compte. Cette invitation expire dans 7 jours.`,
    cta: 'Accepter l\'invitation',
  },
  es: {
    greeting: (n) => `Estimado/a ${n}`,
    body: (f, r) => `Ha sido invitado/a a unirse a ${f} como ${r}. Haga clic en el botón a continuación para configurar su cuenta. Esta invitación caduca en 7 días.`,
    cta: 'Aceptar invitación',
  },
  pa: {
    greeting: (n) => `ਪਿਆਰੇ ${n}`,
    body: (f, r) => `ਤੁਹਾਨੂੰ ${f} ਵਿੱਚ ${r} ਵਜੋਂ ਸ਼ਾਮਲ ਹੋਣ ਲਈ ਸੱਦਾ ਦਿੱਤਾ ਗਿਆ ਹੈ। ਆਪਣਾ ਖਾਤਾ ਸੈੱਟ ਅੱਪ ਕਰਨ ਲਈ ਹੇਠਾਂ ਦਿੱਤੇ ਬਟਨ 'ਤੇ ਕਲਿੱਕ ਕਰੋ। ਇਹ ਸੱਦਾ 7 ਦਿਨਾਂ ਵਿੱਚ ਖਤਮ ਹੋ ਜਾਵੇਗਾ।`,
    cta: 'ਸੱਦਾ ਸਵੀਕਾਰ ਕਰੋ',
  },
  zh: {
    greeting: (n) => `尊敬的 ${n}`,
    body: (f, r) => `您已被邀请加入 ${f}，担任 ${r}。请点击下方按钮设置您的账户。此邀请将在7天后过期。`,
    cta: '接受邀请',
  },
  ar: {
    greeting: (n) => `عزيزي/عزيزتي ${n}`,
    body: (f, r) => `لقد تمت دعوتكم للانضمام إلى ${f} بصفة ${r}. يرجى النقر على الزر أدناه لإعداد حسابكم. تنتهي صلاحية هذه الدعوة خلال 7 أيام.`,
    cta: 'قبول الدعوة',
  },
  ur: {
    greeting: (n) => `محترم ${n}`,
    body: (f, r) => `آپ کو ${f} میں ${r} کے طور پر شامل ہونے کی دعوت دی گئی ہے۔ اپنا اکاؤنٹ سیٹ اپ کرنے کے لیے نیچے دیے گئے بٹن پر کلک کریں۔ یہ دعوت 7 دنوں میں ختم ہو جائے گی۔`,
    cta: 'دعوت قبول کریں',
  },
  hi: {
    greeting: (n) => `प्रिय ${n}`,
    body: (f, r) => `आपको ${f} में ${r} के रूप में शामिल होने के लिए आमंत्रित किया गया है। अपना खाता सेट अप करने के लिए नीचे दिए गए बटन पर क्लिक करें। यह आमंत्रण 7 दिनों में समाप्त हो जाएगा।`,
    cta: 'आमंत्रण स्वीकार करें',
  },
  pt: {
    greeting: (n) => `Caro/a ${n}`,
    body: (f, r) => `Foi convidado/a para se juntar a ${f} como ${r}. Clique no botão abaixo para configurar a sua conta. Este convite expira em 7 dias.`,
    cta: 'Aceitar convite',
  },
  tl: {
    greeting: (n) => `Mahal na ${n}`,
    body: (f, r) => `Ikaw ay inimbitahan na sumali sa ${f} bilang ${r}. I-click ang button sa ibaba upang i-setup ang iyong account. Ang imbitasyong ito ay mag-eexpire sa loob ng 7 araw.`,
    cta: 'Tanggapin ang imbitasyon',
  },
  fa: {
    greeting: (n) => `${n} عزیز`,
    body: (f, r) => `شما به عنوان ${r} به ${f} دعوت شده‌اید. لطفاً روی دکمه زیر کلیک کنید تا حساب خود را تنظیم کنید. این دعوت در عرض 7 روز منقضی می‌شود.`,
    cta: 'پذیرش دعوت',
  },
  vi: {
    greeting: (n) => `Kính gửi ${n}`,
    body: (f, r) => `Bạn đã được mời tham gia ${f} với vai trò ${r}. Vui lòng nhấp vào nút bên dưới để thiết lập tài khoản. Lời mời này hết hạn sau 7 ngày.`,
    cta: 'Chấp nhận lời mời',
  },
  ko: {
    greeting: (n) => `${n} 님께`,
    body: (f, r) => `${f}에 ${r}(으)로 참여하도록 초대받으셨습니다. 아래 버튼을 클릭하여 계정을 설정해 주세요. 이 초대는 7일 후에 만료됩니다.`,
    cta: '초대 수락',
  },
  uk: {
    greeting: (n) => `Шановний/Шановна ${n}`,
    body: (f, r) => `Вас запрошено приєднатися до ${f} як ${r}. Натисніть кнопку нижче, щоб налаштувати свій обліковий запис. Це запрошення дійсне протягом 7 днів.`,
    cta: 'Прийняти запрошення',
  },
  bn: {
    greeting: (n) => `প্রিয় ${n}`,
    body: (f, r) => `আপনাকে ${f}-এ ${r} হিসেবে যোগদানের জন্য আমন্ত্রণ জানানো হয়েছে। আপনার অ্যাকাউন্ট সেট আপ করতে নীচের বোতামে ক্লিক করুন। এই আমন্ত্রণ 7 দিনের মধ্যে মেয়াদ উত্তীর্ণ হবে।`,
    cta: 'আমন্ত্রণ গ্রহণ করুন',
  },
}

const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  role_id: z.string().uuid().optional().nullable(),
  preferred_language: z.string().min(2).max(5).optional().nullable(),
})

/**
 * POST /api/settings/users/invite
 *
 * Invite a new user to the tenant.
 *
 * Requires: users:create permission.
 * Restriction: Only Admins can assign the Admin role to invitees.
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()

    // ── Permission check: users:create required (Phase 7 Fix 1) ──
    const inviterRole = requirePermission(auth, 'users', 'create')

    const body = await request.json()
    const parsed = inviteUserSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { email, first_name, last_name, role_id, preferred_language } = parsed.data

    const admin = createAdminClient()

    // Resolve role: use provided role_id or fall back to Admin role for the tenant
    let role: { id: string; name: string } | null = null

    if (role_id) {
      // Validate provided role belongs to this tenant
      const { data: roleData, error: roleErr } = await admin
        .from('roles')
        .select('id, name')
        .eq('id', role_id)
        .eq('tenant_id', auth.tenantId)
        .single()

      if (roleErr || !roleData) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      role = roleData
    } else {
      // Auto-assign the Admin role (created during signup)
      const { data: adminRole, error: adminRoleErr } = await admin
        .from('roles')
        .select('id, name')
        .eq('tenant_id', auth.tenantId)
        .eq('name', 'Admin')
        .single()

      if (adminRoleErr || !adminRole) {
        // Fall back to first available role for the tenant
        const { data: firstRole } = await admin
          .from('roles')
          .select('id, name')
          .eq('tenant_id', auth.tenantId)
          .order('created_at')
          .limit(1)
          .single()

        if (!firstRole) {
          return NextResponse.json(
            { error: 'No roles exist for this firm. Please create a role first.' },
            { status: 400 }
          )
        }
        role = firstRole
      } else {
        role = adminRole
      }
    }

    // ── Role assignment restriction: only Admins can assign Admin role ──
    if (role.name === 'Admin' && inviterRole.name !== 'Admin') {
      return NextResponse.json(
        { error: 'Only administrators can assign the Admin role.' },
        { status: 403 }
      )
    }

    // ── Seat-limit precheck (v1: active users only + pending invite cap) ──
    const seatCheck = await checkSeatLimit(auth.tenantId)

    if (!seatCheck.allowed) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? null
      const userAgent = request.headers.get('user-agent') ?? null

      logSeatLimitDenial({
        tenant_id: auth.tenantId,
        active_user_count: seatCheck.active_user_count,
        pending_invites: seatCheck.pending_invites,
        max_users: seatCheck.max_users,
        entry_point: 'invite',
        user_id: auth.userId,
        ip,
        user_agent: userAgent,
        reason: seatCheck.reason ?? null,
      })

      return seatLimitResponse(seatCheck)
    }

    // Check for duplicate email  -  parallel (existing user + pending invite)
    const [{ data: existingUser }, { data: existingInvite }] = await Promise.all([
      admin
        .from('users')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('email', email)
        .maybeSingle(),
      admin
        .from('user_invites')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('email', email)
        .eq('status', 'pending')
        .maybeSingle(),
    ])

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists in your firm.' },
        { status: 409 }
      )
    }

    if (existingInvite) {
      return NextResponse.json(
        { error: 'A pending invitation already exists for this email.' },
        { status: 409 }
      )
    }

    // Generate token (same pattern as portal_links)
    const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`

    // Create invite record
    const { data: invite, error: inviteErr } = await admin
      .from('user_invites')
      .insert({
        tenant_id: auth.tenantId,
        email,
        first_name,
        last_name,
        role_id: role.id,
        token,
        invited_by: auth.userId,
      })
      .select()
      .single()

    if (inviteErr) {
      log.error('[invite] Failed to create invite', { tenant_id: auth.tenantId, error_code: inviteErr.code })
      return NextResponse.json(
        { error: `Failed to create invitation: ${inviteErr.message}` },
        { status: 500 }
      )
    }

    // Fetch tenant info for email (name + branding for localised template)
    const { data: tenantData } = await admin
      .from('tenants')
      .select('name, logo_url, primary_color')
      .eq('id', auth.tenantId)
      .single()

    // ── Global-15 Dispatcher (Directive 40.0 §3) ────────────────────────────
    // If preferred_language is a Global 15 locale, render a localised invite
    // email using the Sentinel Welcome template. Otherwise, fall back to the
    // plain English internal email.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const acceptUrl = `${baseUrl}/invite/${token}`
    const firmName = tenantData?.name ?? 'Your Law Firm'

    const isGlobal15 = preferred_language && INVITE_CONTENT[preferred_language]
    const effectiveLocale = isGlobal15 ? preferred_language : 'en'

    if (isGlobal15) {
      // Localised invite via Sentinel Welcome template
      const content = INVITE_CONTENT[effectiveLocale]!
      const enContent = INVITE_CONTENT.en
      const localeInfo = CLIENT_LOCALES.find((l) => l.code === effectiveLocale) ?? CLIENT_LOCALES[0]

      renderSentinelWelcomeEmail({
        firmName,
        firmLogoUrl: (tenantData as any)?.logo_url ?? null,
        primaryColor: (tenantData as any)?.primary_color ?? '#3b82f6',
        clientFirstName: first_name,
        localGreeting: content.greeting(`${first_name} ${last_name}`),
        localBody: content.body(firmName, role.name),
        localCta: content.cta,
        englishBody: enContent.body(firmName, role.name),
        safeLink: acceptUrl,
        languageLabel: `${localeInfo.nativeLabel}  -  ${localeInfo.label}`,
        dir: localeInfo.dir as 'ltr' | 'rtl',
      })
        .then((emailData) => {
          // Dispatch via internal email service with pre-rendered localised HTML
          return sendInternalEmail({
            supabase: admin,
            tenantId: auth.tenantId,
            recipientEmail: email,
            recipientName: `${first_name} ${last_name}`,
            title: emailData.subject,
            message: emailData.text,
            entityType: 'invite' as any,
            entityId: acceptUrl,
            htmlOverride: emailData.html,
            textOverride: emailData.text,
          })
        })
        .catch((err) => {
          log.error('[invite] Failed to send localised invite email', {
            tenant_id: auth.tenantId,
            locale: effectiveLocale,
            error_code: String(err),
          })
        })
    } else {
      // English-only fallback  -  original sendInternalEmail path
      sendInternalEmail({
        supabase: admin,
        tenantId: auth.tenantId,
        recipientEmail: email,
        recipientName: `${first_name} ${last_name}`,
        title: `You've been invited to ${firmName}`,
        message: `You have been invited to join ${firmName} as ${role.name}. Click the link below to set up your account. This invitation expires in 7 days.`,
        entityType: 'invite' as any,
        entityId: acceptUrl,
      }).catch((err) => {
        log.error('[invite] Failed to send invite email', { tenant_id: auth.tenantId, error_code: String(err) })
      })
    }

    log.info('[invite] User invited', {
      tenant_id: auth.tenantId,
      user_id: auth.userId,
    })

    return NextResponse.json({ data: invite, error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/settings/users/invite')
