import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Img,
  Hr,
  Preview,
  Link,
} from '@react-email/components'
import { render } from '@react-email/components'
import {
  type EmailLocale,
  resolveEmailLocale,
  getPaymentReceiptStrings,
} from './email-locale'

interface PaymentReceiptEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  invoiceNumber: string
  amountPaid: string
  paymentDate: string
  paymentMethod?: string
  trustAccountName?: string
  balanceRemaining?: string
  language?: EmailLocale
}

export function PaymentReceiptEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  clientFirstName,
  invoiceNumber,
  amountPaid,
  paymentDate,
  paymentMethod,
  trustAccountName,
  balanceRemaining,
  language = 'en',
}: PaymentReceiptEmailProps) {
  const locale = resolveEmailLocale(language)
  const tr = getPaymentReceiptStrings(locale)

  const greeting = tr.greeting(clientFirstName)

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{tr.subject(amountPaid, invoiceNumber)}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            {firmLogoUrl && (
              <Img
                src={firmLogoUrl}
                width="120"
                height="40"
                alt={firmName}
                style={{ margin: '0 auto 8px', display: 'block', objectFit: 'contain' }}
              />
            )}
            <Text style={{ ...firmNameStyle, color: primaryColor }}>
              {firmName}
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Body */}
          <Section style={contentStyle}>
            <Text style={greetingStyle}>{greeting},</Text>

            <Text
              style={paragraphStyle}
              dangerouslySetInnerHTML={{
                __html: tr.intro(amountPaid, invoiceNumber),
              }}
            />

            {/* Receipt details card */}
            <Section style={receiptCardStyle}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                <tbody>
                  <tr>
                    <td style={labelCellStyle}>{tr.invoice_number_label}</td>
                    <td style={valueCellStyle}>{invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style={labelCellStyle}>{tr.amount_paid_label}</td>
                    <td style={{ ...valueCellStyle, fontWeight: '700', color: primaryColor }}>{amountPaid}</td>
                  </tr>
                  <tr>
                    <td style={labelCellStyle}>{tr.payment_date_label}</td>
                    <td style={valueCellStyle}>{paymentDate}</td>
                  </tr>
                  {paymentMethod && (
                    <tr>
                      <td style={labelCellStyle}>{tr.payment_method_label}</td>
                      <td style={valueCellStyle}>{paymentMethod}</td>
                    </tr>
                  )}
                  {trustAccountName && (
                    <tr>
                      <td style={labelCellStyle}>{tr.trust_account_label}</td>
                      <td style={valueCellStyle}>{trustAccountName}</td>
                    </tr>
                  )}
                  {balanceRemaining && (
                    <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                      <td style={{ ...labelCellStyle, paddingTop: '12px', fontWeight: '600' as const }}>{tr.balance_remaining_label}</td>
                      <td style={{ ...valueCellStyle, paddingTop: '12px', fontWeight: '600' as const }}>{balanceRemaining}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>

            <Text style={paragraphStyle}>
              {tr.receipt_attached}
            </Text>

            <Text style={paragraphStyle}>
              {tr.questions}
            </Text>

            <Text style={signoffStyle}>
              {tr.signoff}
              <br />
              {firmName}
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              {tr.footer(firmName)}
            </Text>
            <Text style={footerTextStyle}>
              {tr.powered_by}
              <Link href="https://norvaos.com" style={{ color: '#6b7280' }}>
                NorvaOS
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderPaymentReceiptEmail(
  props: PaymentReceiptEmailProps
): Promise<{ html: string; text: string; subject: string }> {
  const locale = resolveEmailLocale(props.language)
  const tr = getPaymentReceiptStrings(locale)

  const html = await render(<PaymentReceiptEmail {...props} />)
  const subject = tr.subject(props.amountPaid, props.invoiceNumber)

  const text = [
    tr.greeting(props.clientFirstName) + ',',
    '',
    tr.intro(props.amountPaid, props.invoiceNumber).replace(/<[^>]*>/g, ''),
    '',
    `${tr.invoice_number_label}: ${props.invoiceNumber}`,
    `${tr.amount_paid_label}: ${props.amountPaid}`,
    `${tr.payment_date_label}: ${props.paymentDate}`,
    props.paymentMethod ? `${tr.payment_method_label}: ${props.paymentMethod}` : '',
    props.trustAccountName ? `${tr.trust_account_label}: ${props.trustAccountName}` : '',
    props.balanceRemaining ? `${tr.balance_remaining_label}: ${props.balanceRemaining}` : '',
    '',
    tr.receipt_attached,
    '',
    tr.questions,
    '',
    tr.signoff,
    props.firmName,
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text, subject }
}

// ── Inline Styles ──

const bodyStyle = {
  backgroundColor: '#f8fafc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: '0' as const,
  padding: '0' as const,
}

const containerStyle = {
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  overflow: 'hidden' as const,
  marginTop: '40px',
  marginBottom: '40px',
  border: '1px solid #e2e8f0',
}

const headerStyle = {
  textAlign: 'center' as const,
  padding: '32px 24px 16px',
}

const firmNameStyle = {
  fontSize: '18px',
  fontWeight: '600' as const,
  margin: '0',
}

const dividerStyle = {
  borderColor: '#e2e8f0',
  margin: '0',
}

const contentStyle = {
  padding: '24px 32px',
}

const greetingStyle = {
  fontSize: '16px',
  color: '#1e293b',
  margin: '0 0 16px',
}

const paragraphStyle = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#475569',
  margin: '0 0 16px',
}

const receiptCardStyle = {
  backgroundColor: '#f8fafc',
  borderLeft: '4px solid #22c55e',
  borderRadius: '4px',
  padding: '16px 20px',
  margin: '20px 0',
}

const labelCellStyle = {
  padding: '6px 0',
  color: '#6b7280',
  fontSize: '14px',
}

const valueCellStyle = {
  padding: '6px 0',
  textAlign: 'right' as const,
  fontSize: '14px',
  color: '#1e293b',
}

const signoffStyle = {
  fontSize: '14px',
  color: '#475569',
  margin: '24px 0 0',
  lineHeight: '1.6',
}

const footerStyle = {
  padding: '16px 32px 24px',
}

const footerTextStyle = {
  fontSize: '12px',
  color: '#94a3b8',
  textAlign: 'center' as const,
  margin: '0 0 4px',
}
