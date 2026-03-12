/**
 * RequirePermission component tests.
 *
 * Verifies the centralised permission gate renders correctly in
 * granted, denied, and loading states.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { RequirePermission } from '../require-permission'

// ── Hoisted mock for useUserRole ─────────────────────────────────────────────

const { mockUseUserRole } = vi.hoisted(() => ({
  mockUseUserRole: vi.fn(),
}))

vi.mock('@/lib/hooks/use-user-role', () => ({
  useUserRole: mockUseUserRole,
}))

// ── Role fixtures ────────────────────────────────────────────────────────────

const ADMIN_ROLE = {
  id: 'role-admin',
  name: 'Admin',
  permissions: { all: true } as Record<string, Record<string, boolean>>,
  is_system: true,
}

const LAWYER_ROLE = {
  id: 'role-lawyer',
  name: 'Lawyer',
  permissions: {
    contacts: { view: true, create: true, edit: true, delete: false },
    matters: { view: true, create: true, edit: true, delete: false },
    // billing is intentionally ABSENT
  },
  is_system: true,
}

const CUSTOM_ROLE_WITH_BILLING = {
  id: 'role-custom',
  name: 'BillingClerk',
  permissions: {
    billing: { view: true, create: false, edit: false, delete: false },
  },
  is_system: false,
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RequirePermission – component rendering', () => {
  beforeEach(() => {
    mockUseUserRole.mockReset()
  })

  // ── Granted state ──────────────────────────────────────────

  it('renders children when Admin role is present (page variant)', () => {
    mockUseUserRole.mockReturnValue({ role: ADMIN_ROLE, isLoading: false })

    render(
      <RequirePermission entity="billing" action="view">
        <div data-testid="protected-content">Billing Dashboard</div>
      </RequirePermission>
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.getByTestId('require-permission-granted')).toBeInTheDocument()
    expect(screen.queryByTestId('require-permission-denied')).not.toBeInTheDocument()
  })

  it('renders children when custom role has specific permission', () => {
    mockUseUserRole.mockReturnValue({ role: CUSTOM_ROLE_WITH_BILLING, isLoading: false })

    render(
      <RequirePermission entity="billing" action="view">
        <div data-testid="protected-content">Billing Dashboard</div>
      </RequirePermission>
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  // ── Denied state ───────────────────────────────────────────

  it('renders Billing Restricted for Lawyer without billing:view (page variant)', () => {
    mockUseUserRole.mockReturnValue({ role: LAWYER_ROLE, isLoading: false })

    render(
      <RequirePermission entity="billing" action="view">
        <div data-testid="protected-content">Billing Dashboard</div>
      </RequirePermission>
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('require-permission-denied')).toBeInTheDocument()
    expect(screen.getByText('Billing Restricted')).toBeInTheDocument()
    // Billing denial uses a custom default message (no permKey in text)
    expect(screen.getByText(/billing information/)).toBeInTheDocument()
  })

  it('renders inline denial for BillingTab (inline variant)', () => {
    mockUseUserRole.mockReturnValue({ role: LAWYER_ROLE, isLoading: false })

    render(
      <RequirePermission entity="billing" action="view" variant="inline">
        <div data-testid="billing-tab">Tab Content</div>
      </RequirePermission>
    )

    expect(screen.queryByTestId('billing-tab')).not.toBeInTheDocument()
    const denied = screen.getByTestId('require-permission-denied')
    expect(denied).toBeInTheDocument()
    // Inline billing variant shows "Billing Restricted" heading
    expect(screen.getByText('Billing Restricted')).toBeInTheDocument()
    // Billing denial uses a custom default message
    expect(screen.getByText(/billing information/)).toBeInTheDocument()
  })

  it('renders denied for Lawyer without settings:edit', () => {
    mockUseUserRole.mockReturnValue({ role: LAWYER_ROLE, isLoading: false })

    render(
      <RequirePermission entity="settings" action="edit">
        <div data-testid="settings-content">Template Editor</div>
      </RequirePermission>
    )

    expect(screen.queryByTestId('settings-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('require-permission-denied')).toBeInTheDocument()
    expect(screen.getByText(/settings:edit/)).toBeInTheDocument()
  })

  // ── Loading state ──────────────────────────────────────────

  it('renders loading skeleton while role is being fetched', () => {
    mockUseUserRole.mockReturnValue({ role: null, isLoading: true })

    const { container } = render(
      <RequirePermission entity="billing" action="view">
        <div data-testid="protected-content">Billing Dashboard</div>
      </RequirePermission>
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('require-permission-denied')).not.toBeInTheDocument()
    // Should NOT render granted or denied — only loading skeletons
    expect(screen.queryByTestId('require-permission-granted')).not.toBeInTheDocument()
    // The container should have content (the skeleton divs)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  // ── Null role (unauthenticated/no role assigned) ───────────

  it('renders denied when role is null (not loading)', () => {
    mockUseUserRole.mockReturnValue({ role: null, isLoading: false })

    render(
      <RequirePermission entity="billing" action="view">
        <div data-testid="protected-content">Billing Dashboard</div>
      </RequirePermission>
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('require-permission-denied')).toBeInTheDocument()
  })

  // ── data-permission attribute ──────────────────────────────

  it('sets data-permission attribute for automated testing', () => {
    mockUseUserRole.mockReturnValue({ role: ADMIN_ROLE, isLoading: false })

    render(
      <RequirePermission entity="billing" action="view">
        <div>Content</div>
      </RequirePermission>
    )

    const el = screen.getByTestId('require-permission-granted')
    expect(el.getAttribute('data-permission')).toBe('billing:view')
  })
})
