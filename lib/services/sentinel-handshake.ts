/**
 * Directive 26.2 — Sentinel-Handshake Broadcast Service
 *
 * Sends a Global 15 localised welcome email with a Safe-Link that
 * initiates the Biometric Handshake (identity verification + intake portal).
 *
 * Trigger: Called when a client contact is first linked to a matter,
 * or when a portal link is generated for a new client.
 *
 * SMS is intentionally stubbed — no SMS provider exists yet. When one is
 * added, implement sendSentinelSms() in this file.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { Resend } from 'resend'
import { renderSentinelWelcomeEmail } from '@/lib/email-templates/sentinel-welcome'
import { log } from '@/lib/utils/logger'
import type { LocaleCode } from '@/lib/i18n/config'
import { CLIENT_LOCALES } from '@/lib/i18n/config'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SentinelHandshakeParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  contactId: string
  matterId: string
  /** Client's preferred locale (from contact.preferred_language or matter intake) */
  locale: LocaleCode
  /** Pre-generated portal link token — the Safe-Link */
  portalToken: string
}

// ── Global 15 Welcome Content ──────────────────────────────────────────────
// Each locale provides: greeting, body, and CTA button text.
// These are static templates — not pulled from dictionaries — because
// email content must be self-contained (no JS runtime).

interface WelcomeContent {
  greeting: (name: string | null) => string
  body: (firmName: string) => string
  cta: string
}

const WELCOME_CONTENT: Record<string, WelcomeContent> = {
  en: {
    greeting: (n) => n ? `Dear ${n}` : 'Dear Client',
    body: (f) => `Welcome to ${f}. We have created a secure portal for your case. Please click the button below to verify your identity and begin your intake process. Your information is encrypted and protected.`,
    cta: 'Verify Identity & Start',
  },
  fr: {
    greeting: (n) => n ? `Cher(e) ${n}` : 'Cher(e) client(e)',
    body: (f) => `Bienvenue chez ${f}. Nous avons créé un portail sécurisé pour votre dossier. Veuillez cliquer sur le bouton ci-dessous pour vérifier votre identité et commencer votre processus d'admission. Vos informations sont chiffrées et protégées.`,
    cta: 'Vérifier mon identité',
  },
  es: {
    greeting: (n) => n ? `Estimado/a ${n}` : 'Estimado/a cliente',
    body: (f) => `Bienvenido/a a ${f}. Hemos creado un portal seguro para su caso. Haga clic en el botón a continuación para verificar su identidad y comenzar su proceso de admisión. Su información está cifrada y protegida.`,
    cta: 'Verificar identidad',
  },
  pa: {
    greeting: (n) => n ? `ਪਿਆਰੇ ${n}` : 'ਪਿਆਰੇ ਗਾਹਕ',
    body: (f) => `${f} ਵਿੱਚ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ। ਅਸੀਂ ਤੁਹਾਡੇ ਕੇਸ ਲਈ ਇੱਕ ਸੁਰੱਖਿਅਤ ਪੋਰਟਲ ਬਣਾਇਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਪਛਾਣ ਦੀ ਪੁਸ਼ਟੀ ਕਰਨ ਅਤੇ ਦਾਖਲਾ ਪ੍ਰਕਿਰਿਆ ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਹੇਠਾਂ ਦਿੱਤੇ ਬਟਨ 'ਤੇ ਕਲਿੱਕ ਕਰੋ। ਤੁਹਾਡੀ ਜਾਣਕਾਰੀ ਐਨਕ੍ਰਿਪਟ ਅਤੇ ਸੁਰੱਖਿਅਤ ਹੈ।`,
    cta: 'ਪਛਾਣ ਪੁਸ਼ਟੀ ਕਰੋ',
  },
  zh: {
    greeting: (n) => n ? `尊敬的 ${n}` : '尊敬的客户',
    body: (f) => `欢迎来到 ${f}。我们已为您的案件创建了安全门户。请点击下方按钮验证您的身份并开始您的入职流程。您的信息已加密并受到保护。`,
    cta: '验证身份并开始',
  },
  ar: {
    greeting: (n) => n ? `عزيزي/عزيزتي ${n}` : 'عزيزي/عزيزتي العميل',
    body: (f) => `مرحبًا بكم في ${f}. لقد أنشأنا بوابة آمنة لقضيتكم. يرجى النقر على الزر أدناه للتحقق من هويتكم وبدء عملية القبول. معلوماتكم مشفرة ومحمية.`,
    cta: 'تحقق من الهوية',
  },
  ur: {
    greeting: (n) => n ? `محترم ${n}` : 'محترم مؤکل',
    body: (f) => `${f} میں خوش آمدید۔ ہم نے آپ کے کیس کے لیے ایک محفوظ پورٹل بنایا ہے۔ براہ کرم اپنی شناخت کی تصدیق کرنے اور داخلے کا عمل شروع کرنے کے لیے نیچے دیے گئے بٹن پر کلک کریں۔ آپ کی معلومات انکرپٹ اور محفوظ ہیں۔`,
    cta: 'شناخت کی تصدیق کریں',
  },
  hi: {
    greeting: (n) => n ? `प्रिय ${n}` : 'प्रिय ग्राहक',
    body: (f) => `${f} में आपका स्वागत है। हमने आपके मामले के लिए एक सुरक्षित पोर्टल बनाया है। कृपया अपनी पहचान सत्यापित करने और प्रवेश प्रक्रिया शुरू करने के लिए नीचे दिए गए बटन पर क्लिक करें। आपकी जानकारी एन्क्रिप्टेड और सुरक्षित है।`,
    cta: 'पहचान सत्यापित करें',
  },
  pt: {
    greeting: (n) => n ? `Caro/a ${n}` : 'Caro/a cliente',
    body: (f) => `Bem-vindo/a ao ${f}. Criámos um portal seguro para o seu caso. Por favor, clique no botão abaixo para verificar a sua identidade e iniciar o processo de admissão. As suas informações estão encriptadas e protegidas.`,
    cta: 'Verificar identidade',
  },
  tl: {
    greeting: (n) => n ? `Mahal na ${n}` : 'Mahal na kliyente',
    body: (f) => `Maligayang pagdating sa ${f}. Gumawa kami ng secure na portal para sa iyong kaso. Mangyaring i-click ang button sa ibaba upang ma-verify ang iyong pagkakakilanlan at simulan ang proseso ng intake. Ang iyong impormasyon ay naka-encrypt at protektado.`,
    cta: 'I-verify ang pagkakakilanlan',
  },
  fa: {
    greeting: (n) => n ? `${n} عزیز` : 'موکل عزیز',
    body: (f) => `به ${f} خوش آمدید. ما یک پورتال امن برای پرونده شما ایجاد کرده‌ایم. لطفاً روی دکمه زیر کلیک کنید تا هویت خود را تأیید کنید و فرآیند پذیرش را آغاز کنید. اطلاعات شما رمزگذاری و محافظت شده است.`,
    cta: 'تأیید هویت',
  },
  vi: {
    greeting: (n) => n ? `Kính gửi ${n}` : 'Kính gửi quý khách',
    body: (f) => `Chào mừng bạn đến với ${f}. Chúng tôi đã tạo một cổng thông tin bảo mật cho hồ sơ của bạn. Vui lòng nhấp vào nút bên dưới để xác minh danh tính và bắt đầu quy trình tiếp nhận. Thông tin của bạn được mã hóa và bảo vệ.`,
    cta: 'Xác minh danh tính',
  },
  ko: {
    greeting: (n) => n ? `${n} 님께` : '고객님께',
    body: (f) => `${f}에 오신 것을 환영합니다. 귀하의 사건을 위한 보안 포털을 생성했습니다. 아래 버튼을 클릭하여 신원을 확인하고 접수 절차를 시작해 주세요. 귀하의 정보는 암호화되어 보호됩니다.`,
    cta: '신원 확인',
  },
  uk: {
    greeting: (n) => n ? `Шановний/Шановна ${n}` : 'Шановний клієнте',
    body: (f) => `Ласкаво просимо до ${f}. Ми створили захищений портал для вашої справи. Будь ласка, натисніть кнопку нижче, щоб підтвердити свою особу та розпочати процес прийому. Ваша інформація зашифрована та захищена.`,
    cta: 'Підтвердити особу',
  },
  bn: {
    greeting: (n) => n ? `প্রিয় ${n}` : 'প্রিয় মক্কেল',
    body: (f) => `${f}-এ স্বাগতম। আমরা আপনার মামলার জন্য একটি সুরক্ষিত পোর্টাল তৈরি করেছি। আপনার পরিচয় যাচাই করতে এবং গ্রহণ প্রক্রিয়া শুরু করতে দয়া করে নীচের বোতামে ক্লিক করুন। আপনার তথ্য এনক্রিপ্ট করা এবং সুরক্ষিত।`,
    cta: 'পরিচয় যাচাই করুন',
  },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    log.warn('[sentinel-handshake] RESEND_API_KEY not configured — emails will be skipped')
    return null
  }
  return new Resend(apiKey)
}

const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN || 'notifications.norvaos.com'

function getFromAddress(firmName: string): string {
  if (FROM_DOMAIN === 'resend.dev') return 'onboarding@resend.dev'
  return `${firmName} <welcome@${FROM_DOMAIN}>`
}

function getSafeLink(portalToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return `${baseUrl}/portal/${portalToken}`
}

function getLocaleInfo(code: string) {
  return CLIENT_LOCALES.find((l) => l.code === code) ?? CLIENT_LOCALES[0]
}

// ── Core: Send Sentinel-Handshake Welcome ──────────────────────────────────

/**
 * Send the Global 15 localised Sentinel-Handshake welcome email.
 *
 * Non-blocking: all errors caught internally — never throws.
 */
export async function sendSentinelHandshake(params: SentinelHandshakeParams): Promise<void> {
  const { supabase, tenantId, contactId, matterId, locale, portalToken } = params

  try {
    // Fetch contact + tenant in parallel
    const [contactResult, tenantResult] = await Promise.all([
      (supabase as any)
        .from('contacts')
        .select('first_name, email_primary, email_notifications_enabled, preferred_language')
        .eq('id', contactId)
        .single(),
      (supabase as any)
        .from('tenants')
        .select('name, logo_url, primary_color')
        .eq('id', tenantId)
        .single(),
    ])

    const contact = contactResult.data
    const tenant = tenantResult.data ?? { name: 'Your Law Firm', logo_url: null, primary_color: '#3b82f6' }

    if (!contact?.email_primary) {
      log.warn('[sentinel-handshake] Contact has no email — skipping', { contactId })
      return
    }

    if (contact.email_notifications_enabled === false) {
      log.info('[sentinel-handshake] Email notifications disabled — skipping', { contactId })
      return
    }

    // Resolve locale content (fall back to en)
    const effectiveLocale = locale || contact.preferred_language || 'en'
    const content = WELCOME_CONTENT[effectiveLocale] ?? WELCOME_CONTENT.en
    const enContent = WELCOME_CONTENT.en
    const localeInfo = getLocaleInfo(effectiveLocale)
    const safeLink = getSafeLink(portalToken)

    const emailData = await renderSentinelWelcomeEmail({
      firmName: tenant.name,
      firmLogoUrl: tenant.logo_url,
      primaryColor: tenant.primary_color ?? '#3b82f6',
      clientFirstName: contact.first_name,
      localGreeting: content.greeting(contact.first_name),
      localBody: content.body(tenant.name),
      localCta: content.cta,
      englishBody: enContent.body(tenant.name),
      safeLink,
      languageLabel: `${localeInfo.nativeLabel} — ${localeInfo.label}`,
      dir: localeInfo.dir as 'ltr' | 'rtl',
    })

    // Send via Resend
    const resend = getResend()
    if (!resend) {
      log.info('[sentinel-handshake] Email skipped (no Resend key)', { contactId, locale: effectiveLocale })
      return
    }

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(tenant.name),
      to: contact.email_primary,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      tags: [
        { name: 'type', value: 'sentinel-handshake' },
        { name: 'tenant', value: tenantId },
        { name: 'locale', value: effectiveLocale },
      ],
    })

    if (sendError) {
      log.error('[sentinel-handshake] Resend error', { error: sendError, contactId })
      return
    }

    // Log the notification
    await (supabase as any)
      .from('notification_log')
      .insert({
        tenant_id: tenantId,
        matter_id: matterId,
        contact_id: contactId,
        notification_type: 'sentinel_handshake',
        channel: 'email',
        recipient_email: contact.email_primary,
        subject: emailData.subject,
        status: 'sent',
        metadata: { locale: effectiveLocale, portal_token: portalToken },
      })
      .then(() => {})
      .catch(() => {})

    log.info('[sentinel-handshake] Welcome email sent', {
      contactId,
      locale: effectiveLocale,
      tenantId,
    })
  } catch (err: any) {
    log.error('[sentinel-handshake] Failed', { error: err?.message, contactId, tenantId })
  }
}

// ── SMS Stub ───────────────────────────────────────────────────────────────

/**
 * SMS stub — no SMS provider is configured yet.
 * When an SMS service is added (e.g. Twilio), implement this function.
 */
export async function sendSentinelSms(_params: SentinelHandshakeParams): Promise<void> {
  log.info('[sentinel-handshake] SMS not yet implemented — skipping')
}
