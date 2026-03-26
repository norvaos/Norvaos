import { render } from '@react-email/components'
import * as React from 'react'

export interface WelcomeEmailProps {
  firmName: string
  firstName: string
  dashboardUrl: string
}

function WelcomeEmail({ firstName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome to NorvaOS</title>
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif", backgroundColor: '#F8FAFC', margin: 0, padding: 0 }}>
        <div style={{ width: '100%', backgroundColor: '#F8FAFC', paddingBottom: '40px' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '8px', marginTop: '40px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '32px', textAlign: 'center', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ color: '#4C1D95', fontSize: '24px', fontWeight: 800, margin: 0 }}>NorvaOS</div>
              <div style={{ color: '#64748B', fontSize: '12px', letterSpacing: '0.1em' }}>ACCOUNT ACTIVATED</div>
            </div>

            {/* Content */}
            <div style={{ padding: '40px 48px', color: '#1E293B', lineHeight: 1.6 }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A' }}>
                Welcome to the future of your practice.
              </h1>
              <p>
                Your account is now verified. You are moments away from a more organised, compliant, and efficient firm. Here are your <strong>First 3 Steps</strong> to get the most out of NorvaOS:
              </p>

              {/* Step 1 */}
              <div style={{ backgroundColor: '#F1F5F9', padding: '16px', borderRadius: '6px', marginBottom: '12px', borderLeft: '4px solid #4C1D95' }}>
                <div style={{ fontWeight: 700, color: '#4C1D95', fontSize: '14px', textTransform: 'uppercase' as const }}>Step 1: Complete Your Profile</div>
                <div style={{ fontSize: '14px' }}>Add your Law Society credentials to enable auto-filling for IRCC forms.</div>
              </div>

              {/* Step 2 */}
              <div style={{ backgroundColor: '#F1F5F9', padding: '16px', borderRadius: '6px', marginBottom: '12px', borderLeft: '4px solid #4C1D95' }}>
                <div style={{ fontWeight: 700, color: '#4C1D95', fontSize: '14px', textTransform: 'uppercase' as const }}>Step 2: Configure Trust Accounts</div>
                <div style={{ fontSize: '14px' }}>Set up your bank ledgers to ensure 100% Law Society compliance from day one.</div>
              </div>

              {/* Step 3 */}
              <div style={{ backgroundColor: '#F1F5F9', padding: '16px', borderRadius: '6px', marginBottom: '12px', borderLeft: '4px solid #4C1D95' }}>
                <div style={{ fontWeight: 700, color: '#4C1D95', fontSize: '14px', textTransform: 'uppercase' as const }}>Step 3: Create Your First Matter</div>
                <div style={{ fontSize: '14px' }}>Import a client and see the Document Vault and Readiness Score in action.</div>
              </div>

              {/* CTA Button */}
              <div style={{ textAlign: 'center', margin: '32px 0' }}>
                <a
                  href={dashboardUrl}
                  style={{
                    backgroundColor: '#4C1D95',
                    color: '#ffffff',
                    padding: '14px 32px',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    display: 'inline-block',
                  }}
                >
                  Go to My Dashboard
                </a>
              </div>

              <p style={{ fontSize: '14px', color: '#64748B', textAlign: 'center' }}>
                Need help? Click the <strong>&quot;i-Buttons&quot;</strong> throughout the app for instant guidance on any field.
              </p>
            </div>

            {/* Footer */}
            <div style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: '#94A3B8' }}>
              &copy; 2026 NorvaOS. All rights reserved.<br />
              Built for Serious Professionals.
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

export async function renderWelcomeEmail(props: WelcomeEmailProps): Promise<{
  html: string
  text: string
  subject: string
}> {
  const html = await render(React.createElement(WelcomeEmail, props))
  return {
    html,
    text: `Welcome to NorvaOS! Your account is now verified. Go to your dashboard: ${props.dashboardUrl}`,
    subject: 'Welcome to NorvaOS  -  Your Account is Activated',
  }
}
