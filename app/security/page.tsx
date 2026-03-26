import Link from 'next/link'
import { Shield, Lock, Fingerprint, ShieldCheck, Server, Database, Eye, KeyRound } from 'lucide-react'
import { NorvaLogo } from '@/components/landing/norva-logo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Security | NorvaOS',
  description:
    'NorvaOS Security — a technical overview of our encryption, infrastructure, and compliance architecture.',
}

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <NorvaLogo size={28} id="security-header" />
            <span className="text-lg font-bold text-gray-900">NorvaOS</span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            <Shield className="h-3.5 w-3.5 text-indigo-500" />
            Security Overview
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden py-20"
        style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-sm font-semibold text-indigo-200">
            <Shield className="h-3.5 w-3.5" />
            Technical Security Overview
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Security at NorvaOS
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-indigo-200">
            Built from the ground up for the security requirements of Canadian legal practice.
            Defence-in-depth architecture with encryption at every layer.
          </p>
        </div>
      </section>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-16">

        {/* Architecture Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {[
            {
              icon: Lock,
              title: 'Encryption at Rest',
              subtitle: 'AES-256',
              description:
                'All data stored in the NorvaOS platform is encrypted at rest using AES-256, the same encryption standard used by government agencies and financial institutions worldwide. Database volumes, file storage, and backups are all encrypted with managed keys that rotate automatically.',
              color: 'bg-indigo-600',
            },
            {
              icon: ShieldCheck,
              title: 'Encryption in Transit',
              subtitle: 'TLS 1.3',
              description:
                'Every connection to NorvaOS is protected with TLS 1.3, the latest transport layer security protocol. This ensures that data travelling between your browser and our servers cannot be intercepted, read, or modified. We enforce HSTS and do not support deprecated protocol versions.',
              color: 'bg-violet-600',
            },
            {
              icon: Fingerprint,
              title: 'Document Integrity',
              subtitle: 'SHA-256 Genesis Hash',
              description:
                'Every document stored in the Norva Vault receives a SHA-256 cryptographic hash at the moment of upload — the Genesis Block. This tamper-evident fingerprint provides irrefutable proof that a document has not been altered since it was first stored. Ideal for audit trails and evidentiary integrity.',
              color: 'bg-emerald-600',
            },
            {
              icon: KeyRound,
              title: 'Application-Level PII Encryption',
              subtitle: 'AES-256-GCM',
              description:
                'Sensitive personally identifiable information — including passport numbers, dates of birth, UCI numbers, and contact details — is encrypted at the application level using AES-256-GCM before being written to the database. Each value uses a unique initialisation vector (IV), ensuring that identical inputs produce different ciphertext.',
              color: 'bg-rose-600',
            },
            {
              icon: Database,
              title: 'Tenant Isolation',
              subtitle: 'Row-Level Security',
              description:
                'NorvaOS enforces strict tenant isolation at the database level using PostgreSQL Row-Level Security (RLS) policies. Every query is scoped to the authenticated tenant, making it architecturally impossible for one firm to access another firm\'s data — even in the event of an application-layer vulnerability.',
              color: 'bg-amber-600',
            },
            {
              icon: Eye,
              title: 'Audit Logging',
              subtitle: 'Sentinel Engine',
              description:
                'The NorvaOS Sentinel Engine maintains a comprehensive, immutable audit trail of all significant actions: logins, data access, document uploads, permission changes, and administrative operations. Audit logs are retained for the full life of the account and are available for Law Society audit review.',
              color: 'bg-cyan-600',
            },
          ].map((card) => (
            <div key={card.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{card.title}</h3>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-gray-400">{card.subtitle}</p>
              <p className="mt-3 text-sm leading-6 text-gray-600">{card.description}</p>
            </div>
          ))}
        </div>

        {/* Infrastructure Section */}
        <div className="prose prose-gray mt-16 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-lg prose-p:leading-7 prose-li:leading-7">

          <h2>Infrastructure</h2>

          <h3>Canadian Data Residency</h3>
          <p>
            NorvaOS infrastructure is hosted entirely within Canada. Our primary hosting provider,
            AWS, operates the ca-central-1 region in Montr&eacute;al, Qu&eacute;bec. Our database provider,
            Supabase, is configured to use Canadian data centres exclusively. <strong>No data leaves
            Canadian borders</strong> — not for backups, not for analytics, not for processing.
          </p>

          <h3>Backups</h3>
          <ul>
            <li><strong>Frequency:</strong> Automated daily backups with point-in-time recovery capability</li>
            <li><strong>Location:</strong> All backups are stored within Canadian data centres (ca-central-1)</li>
            <li><strong>Encryption:</strong> Backups are encrypted at rest using AES-256</li>
            <li><strong>Retention:</strong> Daily backups are retained for 30 days; monthly snapshots for 12 months</li>
            <li><strong>Testing:</strong> Backup restoration is tested quarterly to verify data integrity</li>
          </ul>

          <h3>Network Security</h3>
          <ul>
            <li>All endpoints served over HTTPS with TLS 1.3</li>
            <li>HTTP Strict Transport Security (HSTS) enforced with a one-year max-age</li>
            <li>Content Security Policy (CSP) headers to prevent XSS and injection attacks</li>
            <li>Rate limiting on authentication endpoints to prevent brute-force attacks</li>
            <li>DDoS protection via CDN-level mitigation</li>
          </ul>

          <h2>Application Security</h2>

          <h3>Authentication</h3>
          <ul>
            <li>Authentication is managed through Supabase Auth with secure, HTTP-only session tokens</li>
            <li>Passwords are hashed using bcrypt with adaptive cost factors</li>
            <li>Session tokens expire automatically and are rotated on each use</li>
            <li>Email-based magic links are available as a passwordless alternative</li>
          </ul>

          <h3>Authorisation</h3>
          <ul>
            <li>Role-based access control (RBAC) with configurable roles per tenant</li>
            <li>Row-Level Security (RLS) policies on every database table ensure data isolation</li>
            <li>API routes validate authentication and tenant context on every request</li>
            <li>Service-role keys are used only for server-side operations and are never exposed to the client</li>
          </ul>

          <h3>Secure Development Practices</h3>
          <ul>
            <li>All code changes go through peer review before deployment</li>
            <li>Automated static analysis and linting on every commit</li>
            <li>Dependency vulnerability scanning with automated alerts</li>
            <li>TypeScript throughout the entire codebase for type safety</li>
            <li>Parameterised queries and ORM usage to prevent SQL injection</li>
            <li>Input validation with Zod schemas on all API boundaries</li>
          </ul>

          <h2>Compliance</h2>

          <h3>PIPEDA Alignment</h3>
          <p>
            NorvaOS is designed in accordance with the ten Fair Information Principles of PIPEDA:
            accountability, identifying purposes, consent, limiting collection, limiting use/disclosure/retention,
            accuracy, safeguards, openness, individual access, and challenging compliance. Our{' '}
            <Link href="/privacy" className="text-indigo-600 hover:text-indigo-800">Privacy Policy</Link>{' '}
            details our commitments under each principle.
          </p>

          <h3>Law Society Requirements</h3>
          <p>
            NorvaOS supports compliance with Canadian Law Society requirements, including:
          </p>
          <ul>
            <li>Trust accounting with three-way reconciliation (Law Society of Ontario By-Law 9)</li>
            <li>Client identification and verification record-keeping</li>
            <li>Seven-year document and financial record retention</li>
            <li>Real-time compliance scoring at the firm, matter, and client levels</li>
            <li>Audit-ready reports exportable on demand</li>
          </ul>

          <h3>SOC 2 Readiness</h3>
          <p>
            NorvaOS architecture is designed to satisfy SOC 2 Type II trust service criteria for
            security, availability, and confidentiality. Our security controls, access policies, and
            monitoring infrastructure are documented and auditable. We are actively preparing for formal
            SOC 2 certification.
          </p>

          <h2>Incident Response</h2>
          <p>
            NorvaOS maintains a documented incident response plan that includes:
          </p>
          <ul>
            <li><strong>Detection:</strong> Automated monitoring and alerting for anomalous activity</li>
            <li><strong>Containment:</strong> Immediate isolation procedures to limit the scope of an incident</li>
            <li><strong>Notification:</strong> Prompt notification to affected Subscribers in accordance with PIPEDA breach notification requirements (within 72 hours of determination)</li>
            <li><strong>Remediation:</strong> Root cause analysis and implementation of corrective measures</li>
            <li><strong>Reporting:</strong> Notification to the Office of the Privacy Commissioner of Canada where required by law</li>
          </ul>

          <h2>Questions</h2>
          <p>
            If you have questions about our security practices or would like to discuss our architecture
            in more detail, please contact our team at{' '}
            <a href="mailto:security@norvaos.com" className="text-indigo-600 hover:text-indigo-800">
              security@norvaos.com
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
