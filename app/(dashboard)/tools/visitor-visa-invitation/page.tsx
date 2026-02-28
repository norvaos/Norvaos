import type { Metadata } from 'next'
import { InvitationWizard } from './_components/invitation-wizard'

export const metadata: Metadata = {
  title: 'Visitor Visa Invitation Letter',
}

export default function VisitorVisaInvitationPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Canadian Visitor Visa Invitation Letter
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill out the form below to generate a professional invitation letter for a Canadian Temporary Resident Visa (TRV) application.
        </p>
      </div>
      <InvitationWizard />
    </div>
  )
}
