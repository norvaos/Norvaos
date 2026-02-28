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

interface GeneralNotificationEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  matterReference: string
  subject: string
  bodyText: string
  portalUrl?: string
  ctaLabel?: string
}

export function GeneralNotificationEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  clientFirstName,
  matterReference,
  bodyText,
  portalUrl,
  ctaLabel,
}: GeneralNotificationEmailProps) {
  const greeting = clientFirstName ? `Dear ${clientFirstName}` : 'Dear Client'

  return (
    <Html>
      <Head />
      <Preview>
        Update regarding your case {matterReference}
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

          {/* Body */}
          <Section style={contentStyle}>
            <Text style={greetingStyle}>{greeting},</Text>

            <Text style={refStyle}>
              Re: Case {matterReference}
            </Text>

            <Text style={paragraphStyle}>
              {bodyText}
            </Text>

            {portalUrl && (
              <Section style={{ textAlign: 'center', margin: '24px 0' }}>
                <Button
                  href={portalUrl}
                  style={{ ...btnStyle, backgroundColor: primaryColor }}
                >
                  {ctaLabel || 'View Your Case'}
                </Button>
              </Section>
            )}

            <Text style={signoffStyle}>
              Best regards,
              <br />
              {firmName}
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              You are receiving this email because you are a client of {firmName}.
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

export async function renderGeneralNotificationEmail(props: GeneralNotificationEmailProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(<GeneralNotificationEmail {...props} />)
  const text = [
    props.clientFirstName ? `Dear ${props.clientFirstName},` : 'Dear Client,',
    '',
    `Re: Case ${props.matterReference}`,
    '',
    props.bodyText,
    '',
    props.portalUrl ? `View your case: ${props.portalUrl}` : '',
    '',
    `Best regards,`,
    props.firmName,
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text, subject: props.subject }
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

const refStyle = {
  fontSize: '13px',
  color: '#64748b',
  fontWeight: '500' as const,
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
  padding: '12px 32px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block' as const,
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
