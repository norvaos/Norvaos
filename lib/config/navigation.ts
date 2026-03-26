// Navigation configuration
import {
  LayoutDashboard,
  Globe,
  Users,
  Briefcase,
  Target,
  CheckSquare,
  Calendar,
  CalendarCheck,
  Clock,
  FileText,
  Mail,
  DollarSign,
  BarChart3,
  Settings,
  Building2,
  MonitorSmartphone,
  Bell,
  Shield,
  Landmark,
  Layers,
  AlertTriangle,
  Receipt,
  Activity,
  BookOpen,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  title: string
  /** i18n dictionary key  -  resolved at render time; `title` is the English fallback */
  labelKey?: string
  href: string
  icon: LucideIcon
  featureFlag?: string
  comingSoon?: boolean
  badge?: string
  /** Mark as deprecated  -  still shown but with a visual indicator */
  deprecated?: boolean
  /** Sub-items rendered as a collapsible dropdown in the sidebar */
  children?: NavItem[]
}

export interface NavSection {
  title: string
  /** i18n dictionary key for the section heading */
  labelKey?: string
  items: NavItem[]
}

export const navigation: NavSection[] = [
  {
    title: 'Main',
    labelKey: 'nav.section_main',
    items: [
      { title: 'Dashboard', labelKey: 'nav.dashboard', href: '/', icon: LayoutDashboard },
      { title: 'Front Desk', labelKey: 'nav.front_desk', href: '/front-desk', icon: MonitorSmartphone, featureFlag: 'front_desk_mode' },
    ],
  },
  {
    title: 'Practice',
    labelKey: 'nav.section_practice',
    items: [
      { title: 'Contacts', labelKey: 'nav.contacts', href: '/contacts', icon: Users },
      { title: 'Matters', labelKey: 'nav.matters', href: '/matters', icon: Briefcase },
      { title: 'Leads', labelKey: 'nav.leads', href: '/leads', icon: Target },
      { title: 'Bookings', labelKey: 'nav.bookings', href: '/bookings', icon: CalendarCheck },
      { title: 'Norva Guardian', labelKey: 'nav.guardian', href: '/guardian', icon: Shield },
      { title: 'Norva Academy', labelKey: 'nav.academy', href: '/academy', icon: GraduationCap },
    ],
  },
  {
    title: 'Work',
    labelKey: 'nav.section_work',
    items: [
      { title: 'Tasks', labelKey: 'nav.tasks', href: '/tasks', icon: CheckSquare },
      { title: 'Calendar', labelKey: 'nav.calendar', href: '/calendar', icon: Calendar },
      { title: 'Documents', labelKey: 'nav.documents', href: '/documents', icon: FileText },
      {
        title: 'Norva Knowledge Wiki',
        labelKey: 'nav.wiki',
        href: '/wiki',
        icon: BookOpen,
        children: [
          { title: 'Search', labelKey: 'nav.search', href: '/wiki', icon: BookOpen },
          { title: 'Playbooks', labelKey: 'nav.playbooks', href: '/wiki/playbooks', icon: BookOpen },
          { title: 'Snippets', labelKey: 'nav.snippets', href: '/wiki/snippets', icon: BookOpen },
        ],
      },
    ],
  },
  {
    title: 'Finance',
    labelKey: 'nav.section_finance',
    items: [
      { title: 'Billing', labelKey: 'nav.billing', href: '/billing', icon: DollarSign },
      { title: 'Norva Ledger', labelKey: 'nav.ledger', href: '/trust', icon: Landmark },
      { title: 'Time Tracking', labelKey: 'nav.time_tracking', href: '/time-tracking', icon: Clock },
    ],
  },
  {
    title: 'Admin',
    labelKey: 'nav.section_admin',
    items: [
      {
        title: 'Settings',
        labelKey: 'nav.settings',
        href: '/settings',
        icon: Settings,
        children: [
          { title: 'General', labelKey: 'nav.general', href: '/settings', icon: Settings },
          { title: 'Users & Roles', labelKey: 'nav.users_roles', href: '/settings/users', icon: Users },
          { title: 'Matter Types', labelKey: 'nav.matter_types', href: '/admin/matter-types', icon: Layers },
          { title: 'Expiry Reminders', labelKey: 'nav.expiry_reminders', href: '/settings/expiry-reminders', icon: Bell },
          { title: 'Access Control', labelKey: 'nav.access_control', href: '/settings/access-control', icon: Shield },
          { title: 'Trust Accounts', labelKey: 'nav.trust_accounts', href: '/settings/trust-accounts', icon: Landmark },
          { title: 'Fee Templates', labelKey: 'nav.fee_templates', href: '/settings/fee-templates', icon: Receipt },
          { title: 'Reports', labelKey: 'nav.reports', href: '/reports', icon: BarChart3, featureFlag: 'advanced_reporting' },
          { title: 'Partner Pulse', labelKey: 'nav.partner_pulse', href: '/analytics/partner-pulse', icon: Activity },
          { title: 'Integrations', labelKey: 'nav.integrations', href: '/integrations/clio', icon: Globe, comingSoon: true },
          { title: 'IRCC Forms', labelKey: 'nav.ircc_forms', href: '/admin/ircc-forms', icon: FileText },
          { title: 'Tenants', labelKey: 'nav.tenants', href: '/admin/tenants', icon: Building2 },
          { title: 'Critical Actions', labelKey: 'nav.critical_actions', href: '/admin/critical-actions', icon: AlertTriangle },
          { title: 'Security Command', labelKey: 'nav.security_command', href: '/admin/sentinel-command', icon: Shield },
          { title: 'Communications', labelKey: 'nav.communications', href: '/communications', icon: Mail, deprecated: true },
        ],
      },
    ],
  },
]
