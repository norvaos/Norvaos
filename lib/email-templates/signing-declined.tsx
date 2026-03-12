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

interface SigningDeclinedEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  signerName: string
  documentTitle: string
  matterReference: string
  declinedAt: string
  declineReason?: string
  matterUrl: string
}

export function SigningDeclinedEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  signerName,
  documentTitle,
  matterReference,
  declinedAt,
  declineReason,
  matterUrl,
}: SigningDeclinedEmailProps) {
  const formattedDeclinedAt = new Date(declinedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const subject = `Document Declined — ${documentTitle}`

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
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
            <Text style={greetingStyle}>Document Declined</Text>

            <Text style={paragraphStyle}>
              <strong>{signerName}</strong> declined to sign the following
              document for matter <strong>{matterReference}</strong>.
            </Text>

            {/* Document card */}
            <Section style={docCardStyle}>
              <Text style={{ fontSize: '14px', color: '#1e293b', margin: '0', fontWeight: '600' as const }}>
                {documentTitle}
              </Text>
              <Text style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>
                Declined on {formattedDeclinedAt}
              </Text>
            </Section>

            {declineReason && (
              <Section style={reasonCardStyle}>
                <Text style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 4px', fontWeight: '600' as const }}>
                  Reason provided:
                </Text>
                <Text style={{ fontSize: '14px', color: '#1e293b', margin: '0', lineHeight: '1.5' }}>
                  {declineReason}
                </Text>
              </Section>
            )}

            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button
                href={matterUrl}
                style={{ ...buttonStyle, backgroundColor: primaryColor }}
              >
                View Matter
              </Button>
            </Section>

            <Text style={signoffStyle}>
              — NorvaOS Notifications
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              This is an automated notification from {firmName}.
            </Text>
            <Text style={footerTextStyle}>
              Powered by{' '}
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

export async function renderSigningDeclinedEmail(
  props: SigningDeclinedEmailProps
): Promise<{ html: string; text: string; subject: string }> {
  const html = await render(<SigningDeclinedEmail {...props} />)
  const subject = `Document Declined — ${props.documentTitle}`

  const formattedDeclinedAt = new Date(props.declinedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const text = [
    'Document Declined',
    '',
    `${props.signerName} declined to sign the following document for matter ${props.matterReference}.`,
    '',
    `Document: ${props.documentTitle}`,
    `Declined on: ${formattedDeclinedAt}`,
    props.declineReason ? `Reason: ${props.declineReason}` : '',
    '',
    `View Matter: ${props.matterUrl}`,
    '',
    '— NorvaOS Notifications',
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

const docCardStyle = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '16px 0',
}

const reasonCardStyle = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '16px 0',
}

const buttonStyle = {
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
