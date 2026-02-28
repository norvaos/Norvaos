import {
  LayoutDashboard,
  Users,
  Briefcase,
  Target,
  CheckSquare,
  Calendar,
  CalendarCheck,
  FileText,
  Mail,
  MessageSquare,
  DollarSign,
  BarChart3,
  Settings,
  Phone,
  Globe,
  FileInput,
  FileSignature,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  featureFlag?: string
  comingSoon?: boolean
  badge?: string
  /** Sub-items rendered as a collapsible dropdown in the sidebar */
  children?: NavItem[]
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const navigation: NavSection[] = [
  {
    title: 'CRM',
    items: [
      {
        title: 'Dashboards',
        href: '/',
        icon: LayoutDashboard,
        children: [
          { title: 'Overview', href: '/', icon: LayoutDashboard },
          { title: 'Immigration', href: '/dashboards/immigration', icon: Globe },
        ],
      },
      { title: 'Contacts', href: '/contacts', icon: Users },
      { title: 'Matters', href: '/matters', icon: Briefcase },
      { title: 'Leads', href: '/leads', icon: Target },
      { title: 'Intake Forms', href: '/settings/forms', icon: FileInput },
      { title: 'Bookings', href: '/bookings', icon: CalendarCheck },
    ],
  },
  {
    title: 'Work',
    items: [
      { title: 'Tasks', href: '/tasks', icon: CheckSquare },
      { title: 'Calendar', href: '/calendar', icon: Calendar },
      { title: 'Documents', href: '/documents', icon: FileText },
    ],
  },
  {
    title: 'Communicate',
    items: [
      { title: 'Email', href: '/communications', icon: Mail, comingSoon: true, featureFlag: 'email_sync' },
      { title: 'Phone', href: '/communications/phone', icon: Phone, comingSoon: true, featureFlag: 'phone' },
      { title: 'Chat', href: '/chat', icon: MessageSquare, comingSoon: true },
    ],
  },
  {
    title: 'Finance',
    items: [
      { title: 'Billing', href: '/billing', icon: DollarSign },
      { title: 'Reports', href: '/reports', icon: BarChart3, featureFlag: 'advanced_reporting' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { title: 'Visa Invitation', href: '/tools/visitor-visa-invitation', icon: FileSignature },
    ],
  },
  {
    title: 'Admin',
    items: [
      { title: 'Settings', href: '/settings', icon: Settings },
    ],
  },
]
