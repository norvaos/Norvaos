import {
  Html, Head, Body, Container, Section, Text, Img, Hr, Preview, Link,
} from '@react-email/components'
import { render } from '@react-email/components'

interface BookingReminderEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  lawyerName: string
  appointmentDate: string
  appointmentTime: string
  durationMinutes: number
}

export function BookingReminderEmail({
  firmName, firmLogoUrl, primaryColor, clientFirstName,
  lawyerName, appointmentDate, appointmentTime, durationMinutes,
}: BookingReminderEmailProps) {
  const greeting = clientFirstName ? `Dear ${clientFirstName}` : 'Dear Client'

  return (
    <Html>
      <Head />
      <Preview>Reminder: Appointment on {appointmentDate} at {appointmentTime}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            {firmLogoUrl && (
              <Img src={firmLogoUrl} width="120" height="40" alt={firmName}
                style={{ margin: '0 auto 8px', display: 'block', objectFit: 'contain' }} />
            )}
            <Text style={{ ...firmNameStyle, color: primaryColor }}>{firmName}</Text>
          </Section>
          <Hr style={dividerStyle} />
          <Section style={contentStyle}>
            <Text style={greetingStyle}>{greeting},</Text>
            <Text style={paragraphStyle}>
              This is a friendly reminder about your upcoming appointment:
            </Text>
            <Section style={detailsCardStyle}>
              <Text style={detailLabelStyle}>Date</Text>
              <Text style={detailValueStyle}>{appointmentDate}</Text>
              <Text style={detailLabelStyle}>Time</Text>
              <Text style={detailValueStyle}>{appointmentTime} ({durationMinutes} min)</Text>
              <Text style={detailLabelStyle}>With</Text>
              <Text style={detailValueStyle}>{lawyerName}</Text>
            </Section>
            <Text style={paragraphStyle}>
              If you need to reschedule or cancel, please contact us as soon as possible.
            </Text>
            <Text style={signoffStyle}>Best regards,<br />{firmName}</Text>
          </Section>
          <Hr style={dividerStyle} />
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              Powered by <Link href="https://norvaos.com" style={{ color: '#6b7280' }}>NorvaOS</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderBookingReminderEmail(props: BookingReminderEmailProps): Promise<{
  html: string; text: string; subject: string
}> {
  const html = await render(<BookingReminderEmail {...props} />)
  const text = [
    props.clientFirstName ? `Dear ${props.clientFirstName},` : 'Dear Client,',
    '', 'This is a friendly reminder about your upcoming appointment:', '',
    `Date: ${props.appointmentDate}`,
    `Time: ${props.appointmentTime} (${props.durationMinutes} min)`,
    `With: ${props.lawyerName}`,
    '', 'If you need to reschedule or cancel, please contact us.',
    '', 'Best regards,', props.firmName,
  ].join('\n')
  return { html, text, subject: `Reminder: Appointment on ${props.appointmentDate} at ${props.appointmentTime}` }
}

const bodyStyle = { backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', margin: '0' as const, padding: '0' as const }
const containerStyle = { maxWidth: '560px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden' as const, marginTop: '40px', marginBottom: '40px', border: '1px solid #e2e8f0' }
const headerStyle = { textAlign: 'center' as const, padding: '32px 24px 16px' }
const firmNameStyle = { fontSize: '18px', fontWeight: '600' as const, margin: '0' }
const dividerStyle = { borderColor: '#e2e8f0', margin: '0' }
const contentStyle = { padding: '24px 32px' }
const greetingStyle = { fontSize: '16px', color: '#1e293b', margin: '0 0 16px' }
const paragraphStyle = { fontSize: '14px', lineHeight: '1.6', color: '#475569', margin: '0 0 16px', whiteSpace: 'pre-line' as const }
const detailsCardStyle = { backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px 20px', margin: '0 0 16px', border: '1px solid #e2e8f0' }
const detailLabelStyle = { fontSize: '11px', fontWeight: '600' as const, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '8px 0 2px' }
const detailValueStyle = { fontSize: '14px', fontWeight: '500' as const, color: '#1e293b', margin: '0 0 4px' }
const signoffStyle = { fontSize: '14px', color: '#475569', margin: '24px 0 0', lineHeight: '1.6' }
const footerStyle = { padding: '16px 32px 24px' }
const footerTextStyle = { fontSize: '12px', color: '#94a3b8', textAlign: 'center' as const, margin: '0 0 4px' }
