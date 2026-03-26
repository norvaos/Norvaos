import Link from 'next/link'
import { Scale } from 'lucide-react'
import { NorvaLogo } from '@/components/landing/norva-logo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | NorvaOS',
  description:
    'NorvaOS Terms of Service — the agreement governing your use of the NorvaOS legal operating system.',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <NorvaLogo size={28} id="terms-header" />
            <span className="text-lg font-bold text-gray-900">NorvaOS</span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            <Scale className="h-3.5 w-3.5 text-indigo-500" />
            Terms of Service
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: 26 March 2026</p>

        <div className="prose prose-gray mt-10 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-lg prose-p:leading-7 prose-li:leading-7">

          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) constitute a binding agreement between NorvaOS Inc.
            (&ldquo;NorvaOS,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;), a Canadian corporation,
            and the law firm, licensed immigration consultant, or legal professional (&ldquo;Subscriber,&rdquo;
            &ldquo;you,&rdquo; or &ldquo;your&rdquo;) who subscribes to the NorvaOS platform. By creating an
            account or using the platform, you agree to be bound by these Terms.
          </p>

          <h2>1. The Platform</h2>
          <p>
            NorvaOS is a cloud-based legal operating system that provides practice management, client intake,
            document management, trust accounting, billing, scheduling, and compliance tools for Canadian
            law firms and licensed immigration consultants. The platform is designed to support compliance
            with Law Society rules and PIPEDA requirements.
          </p>

          <h2>2. Subscription Model</h2>
          <h3>2.1 Plans and Pricing</h3>
          <p>
            NorvaOS is offered on a fixed-rate subscription basis. Pricing is published on our website and
            may be updated from time to time. Changes to pricing will be communicated at least 30 days
            before taking effect and will apply at the start of your next billing cycle.
          </p>

          <h3>2.2 Billing</h3>
          <ul>
            <li>Subscriptions are billed monthly or annually, as selected at the time of registration</li>
            <li>All fees are in Canadian dollars (CAD) and are exclusive of applicable taxes</li>
            <li>Payments are processed securely by Stripe. NorvaOS does not store credit card numbers</li>
            <li>Failed payments will result in a 7-day grace period, after which the account may be suspended</li>
          </ul>

          <h3>2.3 Free Trial</h3>
          <p>
            New Subscribers may be offered a free trial period. At the end of the trial, the subscription
            will automatically convert to a paid plan unless cancelled. No charges are applied during the
            trial period.
          </p>

          <h2>3. Ownership of Data</h2>
          <p>
            <strong>Your data belongs to you.</strong> NorvaOS acts as a Data Custodian on your behalf.
            The Subscriber and their clients retain full ownership of all data entered into, uploaded to,
            or generated within the platform, including but not limited to:
          </p>
          <ul>
            <li>Client records, contact information, and matter details</li>
            <li>Documents, files, and correspondence stored in the Norva Vault</li>
            <li>Financial records, invoices, and trust accounting ledgers</li>
            <li>Notes, templates, and custom configurations</li>
          </ul>
          <p>
            NorvaOS does not claim any intellectual property rights over Subscriber data. We do not use
            Subscriber data to train machine learning models, sell to third parties, or exploit for any
            purpose beyond providing the contracted service.
          </p>

          <h3>3.1 Data Portability</h3>
          <p>
            Upon request, NorvaOS will provide a complete export of your data in standard, machine-readable
            formats (CSV, JSON, or PDF as appropriate) within 30 business days. Data export requests should
            be directed to support@norvaos.com.
          </p>

          <h3>3.2 Data Deletion</h3>
          <p>
            Upon termination or cancellation, your data will be retained for 90 days to facilitate account
            recovery. After this period, all data will be permanently and irrecoverably deleted from our
            systems and backups, unless a longer retention period is required by law (e.g., trust accounting
            records under Law Society rules).
          </p>

          <h2>4. The Sovereign Guarantee</h2>
          <p>
            NorvaOS commits to the following service-level commitments:
          </p>
          <ul>
            <li><strong>Availability:</strong> We target 99.9% monthly uptime for the NorvaOS platform, excluding scheduled maintenance windows</li>
            <li><strong>Data residency:</strong> All data is stored exclusively within Canada (AWS ca-central-1, Montr&eacute;al). We do not transfer data outside Canadian borders under any circumstance</li>
            <li><strong>Security:</strong> We employ industry-standard encryption (AES-256 at rest, TLS 1.3 in transit), row-level tenant isolation, and continuous security monitoring</li>
            <li><strong>Transparency:</strong> We will notify Subscribers promptly in the event of any security incident that may affect their data, in accordance with PIPEDA breach notification requirements</li>
          </ul>

          <h3>4.1 Scheduled Maintenance</h3>
          <p>
            Scheduled maintenance windows will be communicated at least 48 hours in advance via email and
            in-app notification. Maintenance is typically performed during off-peak hours
            (Saturday 02:00&ndash;06:00 ET).
          </p>

          <h2>5. Subscriber Obligations</h2>
          <p>As a Subscriber, you agree to:</p>
          <ul>
            <li>Provide accurate and current registration information</li>
            <li>Maintain the confidentiality of account credentials and notify us immediately of any unauthorised access</li>
            <li>Ensure that your use of the platform complies with applicable laws, professional regulations, and Law Society rules</li>
            <li>Obtain appropriate consent from your clients before entering their personal information into the platform</li>
            <li>Use the platform only for lawful purposes related to the practice of law or licensed immigration consulting</li>
            <li>Not attempt to reverse-engineer, decompile, or circumvent any security measures of the platform</li>
          </ul>

          <h2>6. Intellectual Property</h2>
          <p>
            The NorvaOS platform, including its source code, design, user interface, documentation,
            and branding, is the exclusive intellectual property of NorvaOS Inc. and is protected by
            Canadian and international intellectual property laws. Your subscription grants a limited,
            non-exclusive, non-transferable licence to use the platform for the duration of your
            subscription.
          </p>

          <h2>7. Limitation of Liability</h2>
          <p>
            NorvaOS is a practice management tool and does not provide legal advice. The platform is
            provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the maximum extent permitted
            by law:
          </p>
          <ul>
            <li>NorvaOS shall not be liable for indirect, incidental, special, consequential, or punitive damages</li>
            <li>Our total aggregate liability for any claim arising from these Terms or use of the platform shall not exceed the total fees paid by the Subscriber in the twelve (12) months preceding the claim</li>
            <li>NorvaOS is not responsible for the accuracy, legality, or appropriateness of data entered by Subscribers or their staff</li>
          </ul>

          <h2>8. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless NorvaOS Inc., its officers, directors, employees, and
            agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising
            from your use of the platform, violation of these Terms, or infringement of any third-party
            rights.
          </p>

          <h2>9. Termination</h2>
          <ul>
            <li><strong>By Subscriber:</strong> You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing period</li>
            <li><strong>By NorvaOS:</strong> We may suspend or terminate your account for material breach of these Terms, non-payment, or conduct that threatens the security or integrity of the platform, upon 14 days&rsquo; written notice (except in cases of imminent security risk)</li>
          </ul>

          <h2>10. Dispute Resolution</h2>
          <p>
            These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada
            applicable therein. Any dispute arising from these Terms shall first be subject to good-faith
            negotiation for a period of 30 days. If unresolved, disputes shall be submitted to binding
            arbitration in Ottawa, Ontario, under the rules of the ADR Institute of Canada.
          </p>

          <h2>11. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be communicated at least
            30 days before taking effect via email and in-app notification. Continued use of the platform
            after the effective date constitutes acceptance of the updated Terms. If you do not agree with
            the changes, you may cancel your subscription before the effective date.
          </p>

          <h2>12. Severability</h2>
          <p>
            If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions
            shall continue in full force and effect.
          </p>

          <h2>13. Contact</h2>
          <p>
            For questions about these Terms, please contact us at{' '}
            <a href="mailto:legal@norvaos.com" className="text-indigo-600 hover:text-indigo-800">
              legal@norvaos.com
            </a>.
          </p>
        </div>

        {/* Back link */}
        <div className="mt-16 border-t border-gray-200 pt-8">
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            &larr; Back to NorvaOS
          </Link>
        </div>
      </main>
    </div>
  )
}
