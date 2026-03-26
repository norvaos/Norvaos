/**
 * Billing enforcement acceptance tests.
 *
 * Renders permission-gated surfaces as a Lawyer role (no billing:view)
 * and asserts that NO financial values appear in the rendered output.
 *
 * This is the final safeguard: even if static analysis passes, these tests
 * verify the runtime behaviour of the RequirePermission gates.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// ── Role fixtures ────────────────────────────────────────────────────────────

const LAWYER_ROLE = {
  id: 'role-lawyer',
  name: 'Lawyer',
  permissions: {
    contacts: { view: true, create: true, edit: true, delete: false },
    matters: { view: true, create: true, edit: true, delete: false },
    tasks: { view: true, create: true, edit: true, delete: true },
    // billing is intentionally ABSENT  -  Lawyer has NO billing:view
  },
  is_system: true,
}

// ── Hoisted mock values ──────────────────────────────────────────────────────

const { mockUseUserRole } = vi.hoisted(() => ({
  mockUseUserRole: vi.fn(() => ({ role: LAWYER_ROLE, isLoading: false })),
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/hooks/use-user-role', () => ({
  useUserRole: mockUseUserRole,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Billing enforcement – Lawyer role sees no financial data', () => {
  describe('RequirePermission with billing entity', () => {
    it('page variant: shows "Billing Restricted" and hides children', async () => {
      const { RequirePermission } = await import('@/components/require-permission')

      const { container } = render(
        <RequirePermission entity="billing" action="view">
          <div data-testid="financial-content">
            <span>$12,500.00</span>
            <span>Total Billed</span>
          </div>
        </RequirePermission>
      )

      // Children must NOT be rendered
      expect(screen.queryByTestId('financial-content')).not.toBeInTheDocument()
      expect(screen.queryByText('$12,500.00')).not.toBeInTheDocument()
      expect(screen.queryByText('Total Billed')).not.toBeInTheDocument()

      // Denied UX must appear
      expect(screen.getByTestId('require-permission-denied')).toBeInTheDocument()
      expect(screen.getByText('Billing Restricted')).toBeInTheDocument()

      // No dollar signs or currency values anywhere in the rendered output
      expect(container.textContent).not.toMatch(/\$[\d,]+/)
    })

    it('inline variant: shows "Billing Restricted" and hides children', async () => {
      const { RequirePermission } = await import('@/components/require-permission')

      const { container } = render(
        <RequirePermission entity="billing" action="view" variant="inline">
          <div data-testid="revenue-chart">
            <span>Revenue: $45,000</span>
          </div>
        </RequirePermission>
      )

      // Children must NOT be rendered
      expect(screen.queryByTestId('revenue-chart')).not.toBeInTheDocument()
      expect(screen.queryByText(/\$45,000/)).not.toBeInTheDocument()

      // Denied UX must appear
      expect(screen.getByTestId('require-permission-denied')).toBeInTheDocument()
      expect(screen.getByText('Billing Restricted')).toBeInTheDocument()

      // No dollar signs or currency values anywhere in the rendered output
      expect(container.textContent).not.toMatch(/\$[\d,]+/)
    })

    it('non-billing entity still shows "Access Restricted" (not "Billing Restricted")', async () => {
      const { RequirePermission } = await import('@/components/require-permission')

      render(
        <RequirePermission entity="settings" action="edit">
          <div>Settings Content</div>
        </RequirePermission>
      )

      expect(screen.getByText('Access Restricted')).toBeInTheDocument()
      expect(screen.queryByText('Billing Restricted')).not.toBeInTheDocument()
    })
  })

  describe('useCanViewBilling hook', () => {
    it('returns false for Lawyer role', async () => {
      const { useCanViewBilling } = await import('@/lib/hooks/use-can-view-billing')

      // Create a test component that renders the hook result
      function TestComponent() {
        const { canViewBilling, isLoading } = useCanViewBilling()
        return (
          <div>
            <span data-testid="can-view">{String(canViewBilling)}</span>
            <span data-testid="is-loading">{String(isLoading)}</span>
          </div>
        )
      }

      render(<TestComponent />)

      expect(screen.getByTestId('can-view').textContent).toBe('false')
      expect(screen.getByTestId('is-loading').textContent).toBe('false')
    })
  })

  describe('Zero numeric inference in denied state', () => {
    it('denied billing gate contains no numbers, currency symbols, or financial terms', async () => {
      const { RequirePermission } = await import('@/components/require-permission')

      const { container } = render(
        <RequirePermission entity="billing" action="view">
          <div>
            <span>$99,999.99</span>
            <span>Revenue: $0.00</span>
            <span>A/R: $5,000</span>
          </div>
        </RequirePermission>
      )

      const text = container.textContent ?? ''

      // No dollar signs
      expect(text).not.toContain('$')
      // No "Revenue", "A/R", "Total Billed", "Total Paid", "Trust Balance" terms
      expect(text).not.toMatch(/Revenue/i)
      expect(text).not.toMatch(/Total Billed/i)
      expect(text).not.toMatch(/Total Paid/i)
      expect(text).not.toMatch(/Trust Balance/i)
      expect(text).not.toMatch(/A\/R/i)
      expect(text).not.toMatch(/Amount Due/i)
      // Must contain "Billing Restricted"
      expect(text).toContain('Billing Restricted')
    })
  })
})
