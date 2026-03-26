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

// ── Types ────────────────────────────────────────────────────────────────────

interface RejectedItemNudgeProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  matterReference: string
  /** List of rejected items with their names and reasons */
  rejectedItems: Array<{
    name: string
    reason: string
  }>
  portalUrl?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function RejectedItemNudgeEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  clientFirstName,
  matterReference,
  rejectedItems,
  portalUrl,
}: RejectedItemNudgeProps) {
  const greeting = clientFirstName
    ? `Hi ${clientFirstName}`
    : 'Hello'

  const subject = `Action Required  -  Correction needed for ${matterReference}`
  const itemCount = rejectedItems.length
  const itemWord = itemCount === 1 ? 'item' : 'items'

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
            <Text style={greetingStyle}>{greeting},</Text>

            <Text style={paragraphStyle}>
              Your law firm has reviewed your submission for <strong>{matterReference}</strong> and
              found {itemCount} {itemWord} that {itemCount === 1 ? 'needs' : 'need'} correction.
              Please review the feedback below and update your submission at your earliest convenience.
            </Text>

            {/* Rejected items list */}
            {rejectedItems.map((item, i) => (
              <Section key={i} style={rejectedCardStyle}>
                <Text style={rejectedItemNameStyle}>
                  {item.name}
                </Text>
                <Text style={rejectedReasonStyle}>
                  {item.reason}
                </Text>
              </Section>
            ))}

            {portalUrl && (
              <>
                <Text style={paragraphStyle}>
                  Please log in to your portal to make the required corrections:
                </Text>
                <Section style={{ textAlign: 'center', margin: '24px 0' }}>
                  <Button
                    href={portalUrl}
                    style={{ ...buttonStyle, backgroundColor: primaryColor }}
                  >
                    Open My Portal
                  </Button>
                </Section>
              </>
            )}

            <Text style={paragraphStyle}>
              If you have any questions about these corrections, please contact your law firm directly.
            </Text>

            <Text style={signoffStyle}>
              Thank you,
              <br />
              {firmName}
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              This is an automated notification from {firmName}.
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

// ── Render helper ────────────────────────────────────────────────────────────

export async function renderRejectedItemNudgeEmail(props: RejectedItemNudgeProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(<RejectedItemNudgeEmail {...props} />)
  const subject = `Action Required  -  Correction needed for ${props.matterReference}`

  const greeting = props.clientFirstName
    ? `Hi ${props.clientFirstName},`
    : 'Hello,'

  const text = [
    greeting,
    '',
    `Your law firm has reviewed your submission for ${props.matterReference} and found items that need correction.`,
    '',
    ...props.rejectedItems.map((item) => `• ${item.name}: ${item.reason}`),
    '',
    props.portalUrl ? `Open your portal: ${props.portalUrl}` : '',
    '',
    'Thank you,',
    props.firmName,
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text, subject }
}

// ── Inline Styles ────────────────────────────────────────────────────────────

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

const rejectedCardStyle = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '8px 0',
}

const rejectedItemNameStyle = {
  fontSize: '14px',
  fontWeight: '600' as const,
  color: '#991b1b',
  margin: '0 0 4px',
}

const rejectedReasonStyle = {
  fontSize: '13px',
  color: '#7f1d1d',
  margin: '0',
  lineHeight: '1.5',
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
  color: '#64748b',
  margin: '24px 0 0',
  lineHeight: '1.6',
}

const footerStyle = {
  textAlign: 'center' as const,
  padding: '16px 24px',
}

const footerTextStyle = {
  fontSize: '12px',
  color: '#94a3b8',
  margin: '0 0 4px',
}
