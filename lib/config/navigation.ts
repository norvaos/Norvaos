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
  Inbox,
  Zap,
  Bell,
  Shield,
  Landmark,
  TrendingUp,
  Layers,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  featureFlag?: string
  comingSoon?: boolean
  badge?: string
  /** Mark as deprecated — still shown but with a visual indicator */
  deprecated?: boolean
  /** Sub-items rendered as a collapsible dropdown in the sidebar */
  children?: NavItem[]
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const navigation: NavSection[] = [
  {
    title: 'Main',
    items: [
      { title: 'Dashboard', href: '/', icon: LayoutDashboard },
      { title: 'Front Desk', href: '/front-desk', icon: MonitorSmartphone, featureFlag: 'front_desk_mode' },
    ],
  },
  {
    title: 'Practice',
    items: [
      { title: 'Contacts', href: '/contacts', icon: Users },
      { title: 'Matters', href: '/matters', icon: Briefcase },
      { title: 'Leads', href: '/leads', icon: Target },
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
    title: 'Finance',
    items: [
      { title: 'Billing', href: '/billing', icon: DollarSign },
      { title: 'Trust Accounting', href: '/trust', icon: Landmark },
      { title: 'Time Tracking', href: '/time-tracking', icon: Clock },
    ],
  },
  {
    title: 'Admin',
    items: [
      {
        title: 'Settings',
        href: '/settings',
        icon: Settings,
        children: [
          { title: 'General', href: '/settings', icon: Settings },
          { title: 'Users & Roles', href: '/settings/users', icon: Users },
          { title: 'Matter Types', href: '/admin/matter-types', icon: Layers },
          { title: 'Email Accounts', href: '/settings/email-accounts', icon: Inbox },
          { title: 'Automation Rules', href: '/settings/automation-rules', icon: Zap },
          { title: 'Expiry Reminders', href: '/settings/expiry-reminders', icon: Bell },
          { title: 'Access Control', href: '/settings/access-control', icon: Shield },
          { title: 'Trust Accounts', href: '/settings/trust-accounts', icon: Landmark },
          { title: 'Analytics', href: '/analytics', icon: BarChart3 },
          { title: 'KPI Scorecard', href: '/analytics/scorecard', icon: TrendingUp },
          { title: 'Reports', href: '/reports', icon: BarChart3, featureFlag: 'advanced_reporting' },
          { title: 'Integrations', href: '/integrations/clio', icon: Globe, comingSoon: true },
          { title: 'Tenants', href: '/admin/tenants', icon: Building2 },
          { title: 'Critical Actions', href: '/admin/critical-actions', icon: AlertTriangle },
          { title: 'Communications', href: '/communications', icon: Mail, deprecated: true },
        ],
      },
    ],
  },
]
