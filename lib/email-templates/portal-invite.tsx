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
import {
  type EmailLocale,
  resolveEmailLocale,
  getPortalInviteStrings,
} from './email-locale'

interface PortalInviteEmailProps {
  firmName: string
  firmLogoUrl: string | null
  primaryColor: string
  clientFirstName: string | null
  matterReference: string
  portalUrl: string
  lawyerName?: string
  language?: EmailLocale
}

export function PortalInviteEmail({
  firmName,
  firmLogoUrl,
  primaryColor,
  clientFirstName,
  matterReference,
  portalUrl,
  lawyerName,
  language = 'en',
}: PortalInviteEmailProps) {
  const locale = resolveEmailLocale(language)
  const tr = getPortalInviteStrings(locale)

  const greeting = tr.greeting(clientFirstName)

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{tr.subject}  -  {matterReference}</Preview>
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
              {tr.intro}
            </Text>

            {/* Features card */}
            <Section style={featuresCardStyle}>
              <Text style={{ fontSize: '14px', color: '#1e293b', margin: '0 0 8px', fontWeight: '600' as const }}>
                {tr.features_intro}
              </Text>
              <Text style={featureItemStyle}>
                {'• '}{tr.feature_upload}
              </Text>
              <Text style={featureItemStyle}>
                {'• '}{tr.feature_intake}
              </Text>
              <Text style={featureItemStyle}>
                {'• '}{tr.feature_status}
              </Text>
              <Text style={featureItemStyle}>
                {'• '}{tr.feature_messages}
              </Text>
            </Section>

            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button
                href={portalUrl}
                style={{ ...buttonStyle, backgroundColor: primaryColor }}
              >
                {tr.cta_button}
              </Button>
            </Section>

            <Text style={securityNoteStyle}>
              {tr.security_note}
            </Text>

            <Text style={paragraphStyle}>
              {tr.questions}
            </Text>

            <Text style={signoffStyle}>
              {tr.signoff}
              <br />
              {lawyerName || firmName}
            </Text>
          </Section>

          <Hr style={dividerStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              {tr.footer(firmName)}
            </Text>
            <Text style={footerTextStyle}>
              {tr.powered_by}
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

export async function renderPortalInviteEmail(
  props: PortalInviteEmailProps
): Promise<{ html: string; text: string; subject: string }> {
  const locale = resolveEmailLocale(props.language)
  const tr = getPortalInviteStrings(locale)

  const html = await render(<PortalInviteEmail {...props} />)
  const subject = `${tr.subject}  -  ${props.matterReference}`

  const text = [
    tr.greeting(props.clientFirstName) + ',',
    '',
    tr.intro,
    '',
    tr.features_intro,
    `  - ${tr.feature_upload}`,
    `  - ${tr.feature_intake}`,
    `  - ${tr.feature_status}`,
    `  - ${tr.feature_messages}`,
    '',
    `${tr.cta_button}: ${props.portalUrl}`,
    '',
    tr.security_note,
    '',
    tr.questions,
    '',
    tr.signoff,
    props.lawyerName || props.firmName,
  ]
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

const featuresCardStyle = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '16px 0',
}

const featureItemStyle = {
  fontSize: '14px',
  color: '#1e293b',
  margin: '0 0 6px',
  lineHeight: '1.5',
}

const securityNoteStyle = {
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#6b7280',
  margin: '0 0 16px',
  fontStyle: 'italic' as const,
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
