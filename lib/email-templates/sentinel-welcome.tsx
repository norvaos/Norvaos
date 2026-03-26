import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Img,
  Hr,
  Preview,
  Link,
} from '@react-email/components'
import { render } from '@react-email/components'

/**
 * Directive 26.2  -  Sentinel-Handshake Welcome Email
 *
 * Global 15 localised welcome email sent when a client contact is first
 * linked to a matter. Contains a Safe-Link that initiates the Biometric
 * Handshake (identity verification + intake portal).
 *
 * The email body is rendered in the client's preferred language with an
 * English fallback below for lawyer reference.
 */

interface SentinelWelcomeEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  /** Localised greeting in the client's language */
  localGreeting: string
  /** Localised body paragraph in the client's language */
  localBody: string
  /** Localised CTA button label */
  localCta: string
  /** English body paragraph (always included for lawyer reference) */
  englishBody: string
  /** The Safe-Link URL (portal link with biometric handshake) */
  safeLink: string
  /** Client's preferred language label (e.g. "اردو  -  Urdu") */
  languageLabel: string
  /** Text direction for localised content */
  dir: 'ltr' | 'rtl'
}

export function SentinelWelcomeEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  clientFirstName,
  localGreeting,
  localBody,
  localCta,
  englishBody,
  safeLink,
  languageLabel,
  dir,
}: SentinelWelcomeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>
        {clientFirstName
          ? `${clientFirstName}, welcome to ${firmName}`
          : `Welcome to ${firmName}`}
      </Preview>
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

          {/* Localised body (client's language) */}
          <Section style={{ ...contentStyle, direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <Text style={{ ...langBadgeStyle, backgroundColor: `${primaryColor}15`, color: primaryColor }}>
              {languageLabel}
            </Text>

            <Text style={greetingStyle}>{localGreeting}</Text>

            <Text style={paragraphStyle}>
              {localBody}
            </Text>

            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button
                href={safeLink}
                style={{ ...btnStyle, backgroundColor: primaryColor }}
              >
                {localCta}
              </Button>
            </Section>
          </Section>

          <Hr style={dividerStyle} />

          {/* English reference (always LTR) */}
          <Section style={contentStyle}>
            <Text style={engLabelStyle}>English reference:</Text>
            <Text style={engBodyStyle}>
              {englishBody}
            </Text>
            <Text style={engBodyStyle}>
              <Link href={safeLink} style={{ color: primaryColor }}>
                Access your secure portal
              </Link>
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              This is a secure communication from {firmName}.
              Do not share this link with anyone.
            </Text>
            <Text style={footerTextStyle}>
              Powered by <Link href="https://norvaos.com" style={{ color: '#6b7280' }}>NorvaOS</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderSentinelWelcomeEmail(props: SentinelWelcomeEmailProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(<SentinelWelcomeEmail {...props} />)
  const text = [
    props.localGreeting,
    '',
    props.localBody,
    '',
    `${props.localCta}: ${props.safeLink}`,
    '',
    '---',
    'English reference:',
    props.englishBody,
    `Access your secure portal: ${props.safeLink}`,
    '',
    `This is a secure communication from ${props.firmName}. Do not share this link.`,
  ].join('\n')

  const subject = props.clientFirstName
    ? `${props.clientFirstName}, welcome to ${props.firmName}`
    : `Welcome to ${props.firmName}`

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

const langBadgeStyle = {
  display: 'inline-block' as const,
  fontSize: '11px',
  fontWeight: '500' as const,
  padding: '4px 10px',
  borderRadius: '12px',
  margin: '0 0 16px',
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
  whiteSpace: 'pre-line' as const,
}

const btnStyle = {
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '14px 36px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block' as const,
}

const engLabelStyle = {
  fontSize: '11px',
  fontWeight: '500' as const,
  color: '#94a3b8',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 8px',
}

const engBodyStyle = {
  fontSize: '13px',
  lineHeight: '1.5',
  color: '#94a3b8',
  margin: '0 0 8px',
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
