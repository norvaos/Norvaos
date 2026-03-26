import Link from 'next/link'
import { Shield } from 'lucide-react'
import { NorvaLogo } from '@/components/landing/norva-logo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | NorvaOS',
  description:
    'NorvaOS Privacy Policy — how we collect, use, and protect your personal information under PIPEDA.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <NorvaLogo size={28} id="privacy-header" />
            <span className="text-lg font-bold text-gray-900">NorvaOS</span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            <Shield className="h-3.5 w-3.5 text-indigo-500" />
            PIPEDA-Aligned
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: 26 March 2026</p>

        <div className="prose prose-gray mt-10 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-lg prose-p:leading-7 prose-li:leading-7">

          <p>
            NorvaOS Inc. (&ldquo;NorvaOS,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is a
            Canadian company that provides a legal practice management platform to law firms and licensed
            immigration consultants (&ldquo;Subscribers&rdquo;). We are committed to protecting the privacy of
            all individuals whose personal information is processed through our platform, including Subscribers,
            their staff, and their clients (&ldquo;End Users&rdquo;).
          </p>

          <p>
            This Privacy Policy describes how we collect, use, disclose, and safeguard personal information in
            accordance with the <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA) and
            applicable provincial privacy legislation.
          </p>

          <h2>1. Designation of Privacy Officer</h2>
          <p>
            NorvaOS has designated a Privacy Officer who is accountable for our compliance with this policy and
            applicable privacy legislation. All inquiries, complaints, or access requests should be directed to:
          </p>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 not-prose text-sm">
            <p className="font-semibold text-gray-900">Privacy Officer</p>
            <p className="mt-1 text-gray-600">NorvaOS Inc.</p>
            <p className="text-gray-600">Email: privacy@norvaos.com</p>
            <p className="text-gray-600">Mailing: Ottawa, Ontario, Canada</p>
          </div>

          <h2>2. Information We Collect</h2>
          <h3>2.1 Subscriber Information</h3>
          <p>When a law firm or consultant subscribes to NorvaOS, we collect:</p>
          <ul>
            <li>Firm name, address, and contact information</li>
            <li>Names and email addresses of authorised users</li>
            <li>Billing and payment information (processed by Stripe; we do not store full credit card numbers)</li>
            <li>Law Society membership numbers and jurisdictional information</li>
          </ul>

          <h3>2.2 End User Information (Client Data)</h3>
          <p>
            Subscribers use NorvaOS to manage legal matters on behalf of their clients. In this capacity,
            NorvaOS acts as a <strong>Data Custodian</strong> (processor) on behalf of the Subscriber (controller).
            Client data may include:
          </p>
          <ul>
            <li>Names, dates of birth, and contact details</li>
            <li>Immigration documents (passport numbers, UCI numbers, travel history)</li>
            <li>Legal matter details, case notes, and correspondence</li>
            <li>Financial records related to trust accounting and billing</li>
            <li>Documents uploaded to the Norva Vault (applications, supporting evidence)</li>
          </ul>

          <h3>2.3 Automatically Collected Information</h3>
          <ul>
            <li>Browser type, operating system, and device information</li>
            <li>IP address and approximate geographic location</li>
            <li>Pages visited, features used, and session duration</li>
            <li>Error logs and performance data</li>
          </ul>

          <h2>3. Purpose of Collection</h2>
          <p>We collect and use personal information for the following purposes:</p>
          <ul>
            <li><strong>Service delivery:</strong> Operating the NorvaOS platform, including matter management, document storage, conflict checks, billing, and trust accounting</li>
            <li><strong>Account administration:</strong> Managing Subscriber accounts, processing payments, and providing customer support</li>
            <li><strong>Compliance:</strong> Meeting regulatory requirements, including Law Society trust accounting rules, IRCC submission requirements, and audit obligations</li>
            <li><strong>Security:</strong> Detecting, preventing, and responding to security incidents, fraud, or unauthorised access</li>
            <li><strong>Product improvement:</strong> Analysing aggregated, de-identified usage patterns to improve platform performance and features</li>
            <li><strong>Communication:</strong> Sending service-related notifications, security alerts, and (with consent) product updates</li>
          </ul>

          <h2>4. Consent</h2>
          <p>
            We rely on the following bases for processing personal information:
          </p>
          <ul>
            <li><strong>Express consent:</strong> Obtained at the time of Subscriber registration and through Terms of Service acceptance</li>
            <li><strong>Implied consent:</strong> Where the collection is reasonable given the ongoing service relationship</li>
            <li><strong>Subscriber authorisation:</strong> For End User (client) data, the Subscriber is responsible for obtaining appropriate consent from their clients in accordance with solicitor-client privilege and applicable professional obligations</li>
          </ul>

          <h2>5. Data Residency</h2>
          <p>
            All personal information processed by NorvaOS is stored exclusively within Canada, in the
            AWS ca-central-1 region (Montr&eacute;al, Qu&eacute;bec) and Supabase infrastructure located in Canadian
            data centres. We do not transfer personal information outside of Canada. There are no exceptions
            to this policy.
          </p>

          <h2>6. Data Retention</h2>
          <p>We retain personal information in accordance with the following schedule:</p>
          <ul>
            <li><strong>Active accounts:</strong> Data is retained for the duration of the Subscriber&rsquo;s subscription</li>
            <li><strong>Trust accounting records:</strong> Retained for a minimum of <strong>seven (7) years</strong> following the completion of a matter, in compliance with Law Society of Ontario By-Law 9 and equivalent provincial requirements</li>
            <li><strong>Cancelled accounts:</strong> Subscriber data is retained for 90 days following cancellation, after which it is permanently deleted unless a longer retention period is required by law</li>
            <li><strong>Backup data:</strong> Encrypted backups are retained for 30 days and then automatically purged</li>
          </ul>

          <h2>7. Disclosure of Personal Information</h2>
          <p>We do not sell, rent, or trade personal information. We may disclose personal information only in the following limited circumstances:</p>
          <ul>
            <li><strong>Service providers:</strong> To trusted third-party processors who assist in operating our platform (e.g., Stripe for payments, AWS for hosting), subject to contractual data protection obligations</li>
            <li><strong>Legal obligations:</strong> Where required by law, court order, or regulatory authority</li>
            <li><strong>Security incidents:</strong> To law enforcement where necessary to investigate or prevent fraud or security threats</li>
            <li><strong>With consent:</strong> Where the individual has expressly consented to the disclosure</li>
          </ul>
          <p>
            <strong>We do not use client data to train artificial intelligence models.</strong> We do not monetise,
            aggregate for sale, or otherwise exploit personal information entrusted to us.
          </p>

          <h2>8. Safeguards</h2>
          <p>We protect personal information through administrative, technical, and physical safeguards, including:</p>
          <ul>
            <li>AES-256 encryption at rest for all stored data</li>
            <li>TLS 1.3 encryption in transit for all network communications</li>
            <li>Application-level PII encryption (AES-256-GCM) for sensitive fields such as passport numbers, dates of birth, and contact details</li>
            <li>SHA-256 document integrity hashing (Genesis Block) for tamper detection</li>
            <li>Row-Level Security (RLS) policies enforcing strict tenant isolation</li>
            <li>Role-based access control with audit logging</li>
            <li>Daily encrypted backups within Canadian data centres</li>
          </ul>
          <p>For a detailed technical overview, see our <Link href="/security" className="text-indigo-600 hover:text-indigo-800">Security page</Link>.</p>

          <h2>9. Individual Rights</h2>
          <p>Under PIPEDA, individuals have the right to:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of personal information we hold about them</li>
            <li><strong>Correction:</strong> Request correction of inaccurate or incomplete personal information</li>
            <li><strong>Withdrawal of consent:</strong> Withdraw consent to the collection, use, or disclosure of personal information, subject to legal or contractual restrictions</li>
            <li><strong>Complaint:</strong> File a complaint with the Office of the Privacy Commissioner of Canada</li>
          </ul>
          <p>
            For End User data managed by a Subscriber, individuals should contact the Subscriber (their law
            firm or consultant) directly, as they are the controller of that information.
          </p>

          <h2>10. Cookies and Tracking</h2>
          <p>
            NorvaOS uses essential cookies required for authentication and session management. We do not use
            third-party advertising cookies or cross-site tracking technologies. Analytics, where used, rely
            on aggregated, de-identified data only.
          </p>

          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be communicated to
            Subscribers via email and posted on this page with an updated &ldquo;Last updated&rdquo; date. Continued
            use of the platform following such notice constitutes acceptance of the updated policy.
          </p>

          <h2>12. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or wish to exercise your privacy rights, please
            contact our Privacy Officer at{' '}
            <a href="mailto:privacy@norvaos.com" className="text-indigo-600 hover:text-indigo-800">
              privacy@norvaos.com
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
