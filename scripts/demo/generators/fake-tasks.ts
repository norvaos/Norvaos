// ALL DATA IS SYNTHETIC — NOT REAL CLIENT DATA

const TASK_TEMPLATES = [
  { title: 'Prepare client questionnaire', category: 'preparation' },
  { title: 'Review identity documents', category: 'review' },
  { title: 'Draft application cover letter', category: 'drafting' },
  { title: 'Request police clearance certificate', category: 'collection' },
  { title: 'Organise financial supporting documents', category: 'collection' },
  { title: 'File application with IRCC', category: 'filing' },
  { title: 'Follow up on biometrics appointment', category: 'follow_up' },
  { title: 'Review IRCC correspondence', category: 'review' },
  { title: 'Prepare response to procedural fairness letter', category: 'drafting' },
  { title: 'Send status update to client', category: 'communication' },
  { title: 'Confirm hearing date with court', category: 'scheduling' },
  { title: 'Draft separation agreement', category: 'drafting' },
  { title: 'Calculate child support guidelines', category: 'calculation' },
  { title: 'Obtain property valuation', category: 'collection' },
  { title: 'Review opposing counsel disclosure', category: 'review' },
  { title: 'Schedule consultation with client', category: 'scheduling' },
  { title: 'Upload executed documents to portal', category: 'filing' },
  { title: 'Prepare invoice for disbursements', category: 'billing' },
  { title: 'Request interpreter for hearing', category: 'preparation' },
  { title: 'Archive completed application package', category: 'admin' },
  { title: 'Verify passport expiry dates', category: 'review' },
  { title: 'Obtain employment letter template', category: 'collection' },
  { title: 'Check IRCC processing time update', category: 'follow_up' },
  { title: 'Prepare fee agreement for signature', category: 'admin' },
  { title: 'Request transcript of proceedings', category: 'collection' },
  { title: 'File notice of appearance', category: 'filing' },
  { title: 'Review statutory declaration', category: 'review' },
  { title: 'Book medical examination appointment', category: 'scheduling' },
  { title: 'Confirm trust account receipt', category: 'billing' },
  { title: 'Close matter and send final reporting letter', category: 'admin' },
]

const PRIORITIES = ['low', 'medium', 'medium', 'high', 'urgent'] as const

import { randomUUID } from 'crypto'

export interface FakeTask {
  id: string
  tenant_id: string
  matter_id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'completed'
  due_date: string // YYYY-MM-DD
  is_billable: boolean
}

export function generateFakeTasks(
  tenantId: string,
  matterIds: string[],
  count = 30,
): FakeTask[] {
  const tasks: FakeTask[] = []

  for (let i = 0; i < count; i++) {
    const template = TASK_TEMPLATES[i % TASK_TEMPLATES.length]
    const daysOffset = (i % 21) - 7 // -7 to +13 days from today
    const dueDate = new Date(Date.now() + daysOffset * 86_400_000)
      .toISOString()
      .split('T')[0]

    const isCompleted = i % 5 === 0
    const isInProgress = i % 5 === 1

    tasks.push({
      id: randomUUID(),
      tenant_id: tenantId,
      matter_id: matterIds[i % matterIds.length],
      title: template.title,
      description: `Demo task ${i + 1} — synthetic data for demonstration purposes only.`,
      priority: PRIORITIES[i % PRIORITIES.length],
      status: isCompleted ? 'completed' : isInProgress ? 'in_progress' : 'pending',
      due_date: dueDate,
      is_billable: template.category !== 'admin' && i % 3 !== 0,
    })
  }

  return tasks
}
