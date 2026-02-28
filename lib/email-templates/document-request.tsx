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

interface DocumentRequestEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  matterReference: string
  documentNames: string[]
  portalUrl?: string
  message?: string
}

export function DocumentRequestEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  clientFirstName,
  matterReference,
  documentNames,
  portalUrl,
  message,
}: DocumentRequestEmailProps) {
  const greeting = clientFirstName ? `Dear ${clientFirstName}` : 'Dear Client'

  return (
    <Html>
      <Head />
      <Preview>
        Documents needed for your case {matterReference}
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

            <Text style={paragraphStyle}>
              We need the following document{documentNames.length > 1 ? 's' : ''} for your
              case <strong>{matterReference}</strong>:
            </Text>

            {/* Document list */}
            <Section style={listCardStyle}>
              {documentNames.map((name, i) => (
                <Text key={i} style={listItemStyle}>
                  {'• '}{name}
                </Text>
              ))}
            </Section>

            {message && (
              <Text style={paragraphStyle}>{message}</Text>
            )}

            {portalUrl && (
              <>
                <Text style={paragraphStyle}>
                  Please upload the requested documents through your secure client portal:
                </Text>
                <Section style={{ textAlign: 'center', margin: '24px 0' }}>
                  <Button
                    href={portalUrl}
                    style={{ ...buttonStyle, backgroundColor: primaryColor }}
                  >
                    Upload Documents
                  </Button>
                </Section>
              </>
            )}

            <Text style={paragraphStyle}>
              If you have any questions or need assistance, please contact our office.
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

export async function renderDocumentRequestEmail(props: DocumentRequestEmailProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(<DocumentRequestEmail {...props} />)
  const subject = `Documents Needed: ${props.matterReference}`
  const text = [
    props.clientFirstName ? `Dear ${props.clientFirstName},` : 'Dear Client,',
    '',
    `We need the following documents for your case ${props.matterReference}:`,
    ...props.documentNames.map((n) => `  - ${n}`),
    '',
    props.message ?? '',
    props.portalUrl ? `Upload documents: ${props.portalUrl}` : '',
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

const listCardStyle = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '16px 0',
}

const listItemStyle = {
  fontSize: '14px',
  color: '#1e293b',
  margin: '0 0 6px',
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
