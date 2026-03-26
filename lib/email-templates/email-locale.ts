// ============================================================================
// Email Template Locale Helper
// ============================================================================
// Centralised locale resolution for all client-facing email templates.
// Reads the contact's preferred_language and returns the appropriate locale.
//
// Usage:
//   import { resolveEmailLocale, type EmailLocale } from './email-locale'
//   const locale = resolveEmailLocale(contact.preferred_language)
// ============================================================================

export type EmailLocale = 'en' | 'fr'

/**
 * Resolve a contact's preferred_language value to a supported EmailLocale.
 * Falls back to 'en' for null, undefined, or unsupported values.
 */
export function resolveEmailLocale(preferredLanguage?: string | null): EmailLocale {
  if (preferredLanguage === 'fr') return 'fr'
  return 'en'
}

// ─── Retainer Agreement Translations ─────────────────────────────────────────

export interface RetainerAgreementStrings {
  subject: string
  greeting: (name: string | null) => string
  intro: string
  review_instruction: string
  cta_button: string
  expiry_notice: (date: string) => string
  questions: string
  signoff: string
  footer: (firmName: string) => string
  powered_by: string
  amount_label: string
}

const retainerAgreementEn: RetainerAgreementStrings = {
  subject: 'Retainer Agreement',
  greeting: (name) => name ? `Dear ${name}` : 'Dear Client',
  intro: 'Please review and sign your retainer agreement.',
  review_instruction: 'Click the button below to review the agreement, understand the terms, and provide your electronic signature.',
  cta_button: 'Review & Sign Agreement',
  expiry_notice: (date) => `This link expires on ${date}. Please complete your review and signature before that date.`,
  questions: 'If you have any questions about this agreement, please do not hesitate to contact our office.',
  signoff: 'Best regards,',
  footer: (firmName) => `You are receiving this email because you are a client of ${firmName}.`,
  powered_by: 'Powered by ',
  amount_label: 'Total Amount',
}

const retainerAgreementFr: RetainerAgreementStrings = {
  subject: 'Mandat de repr\u00e9sentation',
  greeting: (name) => name ? `Cher/Ch\u00e8re ${name}` : 'Cher/Ch\u00e8re client(e)',
  intro: 'Veuillez examiner et signer votre mandat de repr\u00e9sentation.',
  review_instruction: 'Cliquez sur le bouton ci-dessous pour examiner le mandat, comprendre les conditions et apposer votre signature \u00e9lectronique.',
  cta_button: 'Examiner et signer le mandat',
  expiry_notice: (date) => `Ce lien expire le ${date}. Veuillez compl\u00e9ter votre examen et signature avant cette date.`,
  questions: "Si vous avez des questions concernant ce mandat, n'h\u00e9sitez pas \u00e0 communiquer avec notre bureau.",
  signoff: 'Cordialement,',
  footer: (firmName) => `Vous recevez ce courriel parce que vous \u00eates un(e) client(e) de ${firmName}.`,
  powered_by: 'Propuls\u00e9 par ',
  amount_label: 'Montant total',
}

export function getRetainerAgreementStrings(locale: EmailLocale): RetainerAgreementStrings {
  return locale === 'fr' ? retainerAgreementFr : retainerAgreementEn
}

// ─── Portal Invite Translations ──────────────────────────────────────────────

export interface PortalInviteStrings {
  subject: string
  greeting: (name: string | null) => string
  intro: string
  features_intro: string
  feature_upload: string
  feature_intake: string
  feature_status: string
  feature_messages: string
  cta_button: string
  security_note: string
  questions: string
  signoff: string
  footer: (firmName: string) => string
  powered_by: string
}

const portalInviteEn: PortalInviteStrings = {
  subject: 'Your Secure Client Portal',
  greeting: (name) => name ? `Dear ${name}` : 'Dear Client',
  intro: "You've been invited to access your secure client portal.",
  features_intro: 'Through your portal you can:',
  feature_upload: 'Upload required documents securely',
  feature_intake: 'Complete your intake forms',
  feature_status: 'Track the status of your case',
  feature_messages: 'Communicate with your legal team',
  cta_button: 'Access Your Portal',
  security_note: 'This link is unique to you. Please do not share it with anyone.',
  questions: 'If you have any questions or need assistance, please contact our office.',
  signoff: 'Best regards,',
  footer: (firmName) => `You are receiving this email because you are a client of ${firmName}.`,
  powered_by: 'Powered by ',
}

const portalInviteFr: PortalInviteStrings = {
  subject: 'Votre portail client s\u00e9curis\u00e9',
  greeting: (name) => name ? `Cher/Ch\u00e8re ${name}` : 'Cher/Ch\u00e8re client(e)',
  intro: "Vous \u00eates invit\u00e9(e) \u00e0 acc\u00e9der \u00e0 votre portail client s\u00e9curis\u00e9.",
  features_intro: '\u00c0 partir de votre portail, vous pouvez :',
  feature_upload: 'T\u00e9l\u00e9verser les documents requis en toute s\u00e9curit\u00e9',
  feature_intake: "Compl\u00e9tez vos formulaires d'admission",
  feature_status: "Suivre l'\u00e9tat d'avancement de votre dossier",
  feature_messages: 'Communiquer avec votre \u00e9quipe juridique',
  cta_button: 'Acc\u00e9der \u00e0 votre portail',
  security_note: 'Ce lien vous est personnel. Veuillez ne pas le partager.',
  questions: "Si vous avez des questions ou besoin d'aide, veuillez communiquer avec notre bureau.",
  signoff: 'Cordialement,',
  footer: (firmName) => `Vous recevez ce courriel parce que vous \u00eates un(e) client(e) de ${firmName}.`,
  powered_by: 'Propuls\u00e9 par ',
}

export function getPortalInviteStrings(locale: EmailLocale): PortalInviteStrings {
  return locale === 'fr' ? portalInviteFr : portalInviteEn
}

// ─── Payment Receipt Translations ────────────────────────────────────────────

export interface PaymentReceiptStrings {
  subject: (amount: string, invoiceNumber: string) => string
  greeting: (name: string | null) => string
  intro: (amount: string, invoiceNumber: string) => string
  receipt_attached: string
  invoice_number_label: string
  amount_paid_label: string
  payment_date_label: string
  payment_method_label: string
  trust_account_label: string
  balance_remaining_label: string
  questions: string
  signoff: string
  footer: (firmName: string) => string
  powered_by: string
}

const paymentReceiptEn: PaymentReceiptStrings = {
  subject: (amount, invoiceNumber) => `Payment Receipt \u2014 ${amount} for Invoice ${invoiceNumber}`,
  greeting: (name) => name ? `Dear ${name}` : 'Dear Client',
  intro: (amount, invoiceNumber) => `Thank you for your payment of <strong>${amount}</strong> towards Invoice ${invoiceNumber}.`,
  receipt_attached: 'Please find the receipt attached for your records.',
  invoice_number_label: 'Invoice Number',
  amount_paid_label: 'Amount Paid',
  payment_date_label: 'Payment Date',
  payment_method_label: 'Payment Method',
  trust_account_label: 'Trust Account',
  balance_remaining_label: 'Balance Remaining',
  questions: 'If you have any questions about this payment, please contact our office.',
  signoff: 'Thank you,',
  footer: (firmName) => `You are receiving this email because you are a client of ${firmName}.`,
  powered_by: 'Powered by ',
}

const paymentReceiptFr: PaymentReceiptStrings = {
  subject: (amount, invoiceNumber) => `Re\u00e7u de paiement \u2014 ${amount} pour la facture ${invoiceNumber}`,
  greeting: (name) => name ? `Cher/Ch\u00e8re ${name}` : 'Cher/Ch\u00e8re client(e)',
  intro: (amount, invoiceNumber) => `Merci pour votre paiement de <strong>${amount}</strong> pour la facture ${invoiceNumber}.`,
  receipt_attached: 'Veuillez trouver le re\u00e7u ci-joint pour vos dossiers.',
  invoice_number_label: 'Num\u00e9ro de facture',
  amount_paid_label: 'Montant pay\u00e9',
  payment_date_label: 'Date de paiement',
  payment_method_label: 'Mode de paiement',
  trust_account_label: 'Compte en fid\u00e9icommis',
  balance_remaining_label: 'Solde restant',
  questions: 'Si vous avez des questions concernant ce paiement, veuillez communiquer avec notre bureau.',
  signoff: 'Merci,',
  footer: (firmName) => `Vous recevez ce courriel parce que vous \u00eates un(e) client(e) de ${firmName}.`,
  powered_by: 'Propuls\u00e9 par ',
}

export function getPaymentReceiptStrings(locale: EmailLocale): PaymentReceiptStrings {
  return locale === 'fr' ? paymentReceiptFr : paymentReceiptEn
}
