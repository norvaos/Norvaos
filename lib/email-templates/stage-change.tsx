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

interface StageChangeEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  matterReference: string
  newStageName: string
  previousStageName?: string
  portalUrl?: string
}

export function StageChangeEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  clientFirstName,
  matterReference,
  newStageName,
  previousStageName,
  portalUrl,
}: StageChangeEmailProps) {
  const greeting = clientFirstName ? `Dear ${clientFirstName}` : 'Dear Client'

  return (
    <Html>
      <Head />
      <Preview>Your case {matterReference} has moved to {newStageName}</Preview>
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

            <Text style={paragraphStyle}>
              We are writing to inform you that your case has been updated.
            </Text>

            {/* Status update card */}
            <Section style={{ ...statusCardStyle, borderLeftColor: primaryColor }}>
              <Text style={statusLabelStyle}>Case Reference</Text>
              <Text style={statusValueStyle}>{matterReference}</Text>

              {previousStageName && (
                <>
                  <Text style={statusLabelStyle}>Previous Status</Text>
                  <Text style={{ ...statusValueStyle, color: '#6b7280' }}>
                    {previousStageName}
                  </Text>
                </>
              )}

              <Text style={statusLabelStyle}>Current Status</Text>
              <Text style={{ ...statusValueStyle, color: primaryColor, fontWeight: '700' }}>
                {newStageName}
              </Text>
            </Section>

            {portalUrl && (
              <>
                <Text style={paragraphStyle}>
                  You can view the full status of your case and upload any required documents
                  through your secure client portal:
                </Text>
                <Section style={{ textAlign: 'center', margin: '24px 0' }}>
                  <Button
                    href={portalUrl}
                    style={{ ...buttonStyle, backgroundColor: primaryColor }}
                  >
                    View Your Case
                  </Button>
                </Section>
              </>
            )}

            <Text style={paragraphStyle}>
              If you have any questions about this update, please don&apos;t hesitate to
              contact our office.
            </Text>

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

export async function renderStageChangeEmail(props: StageChangeEmailProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(<StageChangeEmail {...props} />)
  const subject = `Case Update: ${props.matterReference} — ${props.newStageName}`
  const text = [
    props.clientFirstName ? `Dear ${props.clientFirstName},` : 'Dear Client,',
    '',
    `Your case ${props.matterReference} has been updated to "${props.newStageName}".`,
    props.previousStageName ? `Previous status: ${props.previousStageName}` : '',
    '',
    props.portalUrl ? `View your case: ${props.portalUrl}` : '',
    '',
    `Best regards,`,
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

const statusCardStyle = {
  backgroundColor: '#f8fafc',
  borderLeft: '4px solid',
  borderRadius: '4px',
  padding: '16px 20px',
  margin: '20px 0',
}

const statusLabelStyle = {
  fontSize: '11px',
  fontWeight: '600' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  color: '#94a3b8',
  margin: '0 0 2px',
}

const statusValueStyle = {
  fontSize: '15px',
  fontWeight: '500' as const,
  color: '#1e293b',
  margin: '0 0 12px',
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
