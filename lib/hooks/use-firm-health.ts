import { useQuery } from '@tanstack/react-query'

interface FirmHealthData {
  overallStatus: 'COMPLIANT' | 'WARNING' | 'CRITICAL'
  timestamp: string
  checks: {
    regionLock: { status: string; message: string }
    encryptionStatus: { status: string; message: string }
    auditParity: { status: string; message: string }
    sentinelSummary: { totalEvents: number; bySeverity: Record<string, number> }
    hardeningIntegrity: { totalGaps: number; totalGapsClosed: number; gapClosureRate: number }
  }
}

export function useFirmHealth() {
  const query = useQuery({
    queryKey: ['firm-health'],
    queryFn: async (): Promise<FirmHealthData> => {
      const res = await fetch('/api/admin/compliance-health')
      if (!res.ok) throw new Error('Failed to fetch firm health')
      return res.json()
    },
    refetchInterval: 30000,
    staleTime: 1000 * 10,
  })

  const overallStatus = query.data?.overallStatus ?? 'COMPLIANT'
  const riskLevel = overallStatus === 'CRITICAL' ? 'high' : overallStatus === 'WARNING' ? 'medium' : 'low'
  const shouldPulseAmber = overallStatus === 'WARNING' || overallStatus === 'CRITICAL'

  return {
    ...query,
    overallStatus,
    riskLevel,
    shouldPulseAmber,
  }
}
