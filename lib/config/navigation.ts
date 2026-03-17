import {
  LayoutDashboard,
  Users,
  Briefcase,
  Target,
  CheckSquare,
  Calendar,
  CalendarCheck,
  Clock,
  FileText,
  Mail,
  MessageSquare,
  DollarSign,
  BarChart3,
  Settings,
  Phone,
  Globe,
  Building2,
  MonitorSmartphone,
  Inbox,
  Zap,
  Bell,
  Shield,
  Landmark,
  TrendingUp,
  PhoneCall,
  Scale,
  User,
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
      { title: 'Email', href: '/communications', icon: Mail, deprecated: true },
      { title: 'Phone', href: '/communications/phone', icon: Phone, comingSoon: true, featureFlag: 'phone' },
      { title: 'Chat', href: '/chat', icon: MessageSquare, comingSoon: true },
    ],
  },
  {
    title: 'Finance',
    items: [
      { title: 'Time Tracking', href: '/time-tracking', icon: Clock },
      { title: 'Billing', href: '/billing', icon: DollarSign },
      { title: 'Trust Accounting', href: '/trust', icon: Landmark },
      { title: 'Reports', href: '/reports', icon: BarChart3, featureFlag: 'advanced_reporting' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { title: 'KPI Scorecard', href: '/analytics/scorecard', icon: TrendingUp },
      { title: 'Financial Analytics', href: '/analytics', icon: BarChart3 },
      { title: 'Trust Compliance', href: '/analytics/trust-compliance', icon: Landmark },
    ],
  },
  {
    title: 'Operations',
    items: [
      { title: 'Front Desk', href: '/front-desk', icon: MonitorSmartphone, featureFlag: 'front_desk_mode' },
      { title: 'Command Centre', href: '/leads', icon: LayoutDashboard },
      { title: 'Critical Actions', href: '/admin/critical-actions', icon: AlertTriangle },
    ],
  },
  {
    title: 'Workspaces',
    items: [
      {
        title: 'Role Workspaces',
        href: '/workspace/front-desk',
        icon: PhoneCall,
        children: [
          { title: 'Front Desk', href: '/workspace/front-desk', icon: PhoneCall },
          { title: 'Legal Assistant', href: '/workspace/legal-assistant', icon: FileText },
          { title: 'Lawyer', href: '/workspace/lawyer', icon: Scale },
          { title: 'Billing', href: '/workspace/billing', icon: DollarSign },
          { title: 'Admin', href: '/workspace/admin', icon: Settings },
          { title: 'Client Portal', href: '/workspace/client', icon: User },
          { title: 'Partner', href: '/workspace/partner', icon: BarChart3 },
        ],
      },
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
          { title: 'All Settings', href: '/settings', icon: Settings },
          { title: 'Email Accounts', href: '/settings/email-accounts', icon: Inbox },
          { title: 'Automation Rules', href: '/settings/automation-rules', icon: Zap },
          { title: 'Expiry Reminders', href: '/settings/expiry-reminders', icon: Bell },
          { title: 'Access Control', href: '/settings/access-control', icon: Shield },
          { title: 'Trust Accounts', href: '/settings/trust-accounts', icon: Landmark },
        ],
      },
      { title: 'Matter Types', href: '/admin/matter-types', icon: Layers },
      { title: 'Tenants', href: '/admin/tenants', icon: Building2 },
    ],
  },
]
