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

interface InternalNotificationEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  recipientName: string
  title: string
  message: string
  actionUrl?: string
  actionLabel?: string
}

export function InternalNotificationEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  recipientName,
  title,
  message,
  actionUrl,
  actionLabel,
}: InternalNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
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
            <Text style={greetingStyle}>Hi {recipientName},</Text>

            <Text style={titleStyle}>{title}</Text>

            <Text style={paragraphStyle}>{message}</Text>

            {actionUrl && (
              <Section style={{ textAlign: 'center', margin: '24px 0' }}>
                <Button
                  href={actionUrl}
                  style={{ ...btnStyle, backgroundColor: primaryColor }}
                >
                  {actionLabel || 'View Details'}
                </Button>
              </Section>
            )}
          </Section>

          <Hr style={dividerStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              This is an internal notification from {firmName}.
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

export async function renderInternalNotificationEmail(props: InternalNotificationEmailProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(<InternalNotificationEmail {...props} />)
  const text = [
    `Hi ${props.recipientName},`,
    '',
    props.title,
    '',
    props.message,
    '',
    props.actionUrl ? `View details: ${props.actionUrl}` : '',
    '',
    `— ${props.firmName}`,
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text, subject: props.title }
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

const titleStyle = {
  fontSize: '15px',
  fontWeight: '600' as const,
  color: '#1e293b',
  margin: '0 0 12px',
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

const footerStyle = {
  padding: '16px 32px 24px',
}

const footerTextStyle = {
  fontSize: '12px',
  color: '#94a3b8',
  textAlign: 'center' as const,
  margin: '0 0 4px',
}
