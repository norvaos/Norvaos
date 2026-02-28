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

interface DeadlineAlertEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  matterReference: string
  deadlineTitle: string
  deadlineType: string
  dueDate: string
  daysRemaining: number
  riskLevel: string
  portalUrl?: string
}

function getRiskColor(level: string): string {
  switch (level) {
    case 'critical':
      return '#ef4444'
    case 'high':
      return '#f97316'
    case 'moderate':
      return '#f59e0b'
    default:
      return '#22c55e'
  }
}

function getRiskLabel(level: string): string {
  switch (level) {
    case 'critical':
      return 'Critical'
    case 'high':
      return 'High'
    case 'moderate':
      return 'Moderate'
    default:
      return 'Low'
  }
}

export function DeadlineAlertEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  clientFirstName,
  matterReference,
  deadlineTitle,
  deadlineType,
  dueDate,
  daysRemaining,
  riskLevel,
  portalUrl,
}: DeadlineAlertEmailProps) {
  const greeting = clientFirstName ? `Dear ${clientFirstName}` : 'Dear Client'
  const riskColor = getRiskColor(riskLevel)
  const riskLabel = getRiskLabel(riskLevel)

  const urgencyText =
    daysRemaining < 0
      ? `This deadline is ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''} overdue.`
      : daysRemaining === 0
        ? 'This deadline is due today.'
        : `This deadline is due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.`

  return (
    <Html>
      <Head />
      <Preview>
        Deadline alert: {deadlineTitle} - {matterReference}
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
              We are writing to remind you about an important upcoming deadline for your case.
            </Text>

            {/* Deadline details card */}
            <Section
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                padding: '20px',
                border: '1px solid #e2e8f0',
                margin: '16px 0',
              }}
            >
              <Text style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: '0 0 12px' }}>
                {deadlineTitle}
              </Text>
              <Text style={{ fontSize: '13px', color: '#64748b', margin: '0 0 6px' }}>
                Type: {deadlineType}
              </Text>
              <Text style={{ fontSize: '13px', color: '#64748b', margin: '0 0 6px' }}>
                Due Date: {dueDate}
              </Text>
              <Text style={{ fontSize: '14px', fontWeight: '600', color: riskColor, margin: '0 0 6px' }}>
                {urgencyText}
              </Text>
              <Text
                style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#ffffff',
                  backgroundColor: riskColor,
                  borderRadius: '4px',
                  padding: '4px 10px',
                  display: 'inline-block',
                  margin: '4px 0 0',
                }}
              >
                {riskLabel} Risk
              </Text>
            </Section>

            <Text style={paragraphStyle}>
              Please ensure any required documents or actions are completed before the due date. If you have
              any questions or need assistance, do not hesitate to contact us.
            </Text>

            {portalUrl && (
              <Section style={{ textAlign: 'center', margin: '24px 0' }}>
                <Button
                  href={portalUrl}
                  style={{ ...btnStyle, backgroundColor: primaryColor }}
                >
                  View Your Case
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

export async function renderDeadlineAlertEmail(props: DeadlineAlertEmailProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(<DeadlineAlertEmail {...props} />)

  const daysText =
    props.daysRemaining < 0
      ? `${Math.abs(props.daysRemaining)} day(s) overdue`
      : props.daysRemaining === 0
        ? 'due today'
        : `due in ${props.daysRemaining} day(s)`

  const text = [
    props.clientFirstName ? `Dear ${props.clientFirstName},` : 'Dear Client,',
    '',
    `Re: Case ${props.matterReference}`,
    '',
    'We are writing to remind you about an important upcoming deadline for your case.',
    '',
    `Deadline: ${props.deadlineTitle}`,
    `Type: ${props.deadlineType}`,
    `Due Date: ${props.dueDate} (${daysText})`,
    `Risk Level: ${getRiskLabel(props.riskLevel)}`,
    '',
    'Please ensure any required documents or actions are completed before the due date.',
    '',
    props.portalUrl ? `View your case: ${props.portalUrl}` : '',
    '',
    'Best regards,',
    props.firmName,
  ]
    .filter(Boolean)
    .join('\n')

  const subject = `Deadline Alert: ${props.deadlineTitle} - ${props.matterReference}`

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
