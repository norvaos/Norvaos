/**
 * Drift Alert Scanner  -  Jurisdictional Drift Sentry
 *
 * Scans recent CanLII decisions for case law developments that may
 * require re-strategy on active immigration matters.
 */

import {
  type CanLIICase,
  type CanLIIDatabaseId,
  CANLII_DATABASES,
  getRecentDecisions,
} from './canlii-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Keywords that signal potentially relevant case law changes. */
export const DRIFT_KEYWORDS = {
  immigration: [
    'judicial review',
    'procedural fairness',
    'unreasonable decision',
    'Baker',
    'Vavilov',
    'Dunsmuir',
    'reasonableness',
    'patent unreasonableness',
  ],
  policy: [
    'IRPA',
    'IRCC policy',
    'program delivery',
    'ministerial instructions',
  ],
  procedural: [
    'duty to disclose',
    'right to counsel',
    'natural justice',
    'audi alteram partem',
  ],
} as const;

/** Flattened set of all drift keywords for quick matching. */
const ALL_KEYWORDS: string[] = [
  ...DRIFT_KEYWORDS.immigration,
  ...DRIFT_KEYWORDS.policy,
  ...DRIFT_KEYWORDS.procedural,
];

/**
 * Court weight multiplier  -  higher-authority courts receive a stronger
 * relevance signal.
 */
const COURT_WEIGHT: Record<string, number> = {
  scc: 3,
  fca: 2.5,
  fct: 2,
  irb: 1.5,
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface DriftAlert {
  title: string;
  summary: string;
  sourceUrl: string;
  sourceCitation: string;
  court: string;
  keywords: string[];
  relevanceScore: number;
  decisionDate: string;
  rawData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Match a case's title and citation against DRIFT_KEYWORDS.
 * Returns the list of matched keywords.
 */
function matchKeywords(caseItem: CanLIICase): string[] {
  const haystack = `${caseItem.title} ${caseItem.citation}`.toLowerCase();
  return ALL_KEYWORDS.filter((kw) => haystack.includes(kw.toLowerCase()));
}

/**
 * Calculate a relevance score for a case based on keyword hits and court
 * authority weight.
 */
function calculateRelevanceScore(
  matchedKeywords: string[],
  databaseId: string,
): number {
  const keywordScore = matchedKeywords.length;
  const weight = COURT_WEIGHT[databaseId] ?? 1;
  return parseFloat((keywordScore * weight).toFixed(2));
}

/**
 * Determine whether a decision falls within the look-back window.
 */
function isWithinWindow(decisionDate: string, daysBack: number): boolean {
  const decision = new Date(decisionDate);
  if (isNaN(decision.getTime())) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  return decision >= cutoff;
}

/**
 * Resolve court label from database identifier.
 */
function courtLabel(databaseId: string): string {
  return (
    CANLII_DATABASES[databaseId as CanLIIDatabaseId] ?? databaseId
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan recent CanLII decisions across specified courts and return
 * drift alerts ranked by relevance.
 *
 * @param options.daysBack   Number of days to look back (default 14)
 * @param options.databases  Court database IDs to scan (default ['fct', 'fca'])
 */
export async function scanForDrifts(options?: {
  daysBack?: number;
  databases?: string[];
}): Promise<DriftAlert[]> {
  const daysBack = options?.daysBack ?? 14;
  const databases = options?.databases ?? ['fct', 'fca'];

  const alerts: DriftAlert[] = [];

  for (const db of databases) {
    const cases = await getRecentDecisions(db, { resultCount: 50 });

    for (const caseItem of cases) {
      // Skip decisions outside the look-back window
      if (!isWithinWindow(caseItem.decisionDate, daysBack)) {
        continue;
      }

      const matched = matchKeywords(caseItem);
      if (matched.length === 0) continue;

      const score = calculateRelevanceScore(matched, db);

      alerts.push({
        title: caseItem.title,
        summary: `New ${courtLabel(db)} decision matching ${matched.length} drift keyword(s): ${matched.join(', ')}.`,
        sourceUrl: caseItem.url,
        sourceCitation: caseItem.citation,
        court: courtLabel(db),
        keywords: matched,
        relevanceScore: score,
        decisionDate: caseItem.decisionDate,
        rawData: caseItem as unknown as Record<string, unknown>,
      });
    }
  }

  // Sort by relevance score descending
  alerts.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return alerts;
}

/**
 * Cross-reference a drift alert's keywords with matter-specific keywords
 * to assess how much a decision impacts a particular file.
 *
 * @returns Impact score between 0 and 100.
 */
export function assessImpact(
  alert: DriftAlert,
  matterKeywords: string[],
): number {
  if (matterKeywords.length === 0 || alert.keywords.length === 0) return 0;

  const normalisedMatterKws = matterKeywords.map((k) => k.toLowerCase());
  const normalisedAlertKws = alert.keywords.map((k) => k.toLowerCase());

  // Count overlapping keywords
  const overlap = normalisedAlertKws.filter((kw) =>
    normalisedMatterKws.some(
      (mk) => mk.includes(kw) || kw.includes(mk),
    ),
  ).length;

  // Base score: proportion of alert keywords that overlap, weighted by
  // relevance score (capped at 10 for normalisation purposes)
  const overlapRatio = overlap / normalisedAlertKws.length;
  const weightFactor = Math.min(alert.relevanceScore / 10, 1);
  const raw = overlapRatio * 70 + weightFactor * 30;

  return Math.min(100, Math.round(raw));
}

/**
 * Format a drift alert into a human-readable summary suitable for
 * notifications or dashboard display.
 */
export function formatAlertSummary(alert: DriftAlert): string {
  const lines: string[] = [
    `Drift Alert: ${alert.title}`,
    `Court: ${alert.court}`,
    `Citation: ${alert.sourceCitation}`,
    `Decision Date: ${alert.decisionDate}`,
    `Relevance Score: ${alert.relevanceScore}`,
    `Keywords: ${alert.keywords.join(', ')}`,
    '',
    alert.summary,
    '',
    `Full decision: ${alert.sourceUrl}`,
  ];
  return lines.join('\n');
}
