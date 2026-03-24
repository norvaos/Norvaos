import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
  Link,
} from '@react-email/components'
import { render } from '@react-email/components'

interface VerificationEmailProps {
  firmName: string
  firstName: string
  verificationUrl: string
}

const NORVA_INDIGO = '#4c2889'

export function VerificationEmail({
  firmName,
  firstName,
  verificationUrl,
}: VerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Verify your email address for NorvaOS
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Text style={logoTextStyle}>
              NorvaOS
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Body */}
          <Section style={contentStyle}>
            <Text style={headingStyle}>
              Verify your email address
            </Text>

            <Text style={paragraphStyle}>
              Hi {firstName},
            </Text>

            <Text style={paragraphStyle}>
              Welcome to NorvaOS. Please click the button below to verify your email address
              and activate your firm account.
            </Text>

            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button
                href={verificationUrl}
                style={btnStyle}
              >
                Verify Email Address
              </Button>
            </Section>

            <Text style={mutedStyle}>
              If you didn&apos;t create a NorvaOS account, you can safely ignore this email.
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              NorvaOS — A Complete Legal Operating System
            </Text>
            <Text style={footerTextStyle}>
              <Link href="https://norvaos.com" style={{ color: '#6b7280' }}>norvaos.com</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderVerificationEmail(props: VerificationEmailProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(<VerificationEmail {...props} />)
  const text = [
    `Hi ${props.firstName},`,
    '',
    'Welcome to NorvaOS. Please click the link below to verify your email address and activate your firm account.',
    '',
    props.verificationUrl,
    '',
    "If you didn't create a NorvaOS account, you can safely ignore this email.",
    '',
    'NorvaOS — A Complete Legal Operating System',
  ].join('\n')

  return { html, text, subject: 'Verify your email address — NorvaOS' }
}

// ── Inline Styles ──

const bodyStyle = {
  backgroundColor: '#f8fafc',
  fontFamily:
    '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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

const logoTextStyle = {
  fontSize: '22px',
  fontWeight: '700' as const,
  color: NORVA_INDIGO,
  margin: '0',
  letterSpacing: '-0.02em',
}

const dividerStyle = {
  borderColor: '#e2e8f0',
  margin: '0',
}

const contentStyle = {
  padding: '24px 32px',
}

const headingStyle = {
  fontSize: '20px',
  fontWeight: '600' as const,
  color: '#1e293b',
  margin: '0 0 20px',
}

const paragraphStyle = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#475569',
  margin: '0 0 16px',
}

const mutedStyle = {
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#94a3b8',
  margin: '16px 0 0',
}

const btnStyle = {
  backgroundColor: NORVA_INDIGO,
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
