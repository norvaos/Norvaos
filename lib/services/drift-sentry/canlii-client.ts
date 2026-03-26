/**
 * CanLII API Client — Jurisdictional Drift Sentry
 *
 * Provides typed access to the CanLII case law API for monitoring
 * immigration-relevant court decisions across federal jurisdictions.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANLII_BASE_URL = 'https://api.canlii.org/v1';
const RATE_LIMIT_DELAY_MS = 200;

/** Immigration-relevant court database identifiers. */
export const CANLII_DATABASES = {
  fct: 'Federal Court / Cour fédérale',
  fca: 'Federal Court of Appeal',
  irb: 'Immigration and Refugee Board',
  scc: 'Supreme Court of Canada',
} as const;

export type CanLIIDatabaseId = keyof typeof CANLII_DATABASES;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CanLIICase {
  caseId: { en: string };
  title: string;
  citation: string;
  databaseId: string;
  decisionDate: string;
  url: string;
  keywords?: string[];
}

export interface CanLIISearchResult {
  resultCount: number;
  results: CanLIICase[];
}

export interface CanLIICaseMetadata {
  caseId: { en: string };
  title: string;
  citation: string;
  databaseId: string;
  decisionDate: string;
  url: string;
  keywords?: string[];
  language: string;
  docketNumber?: string;
  decisionNotes?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CanLIIApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | undefined,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'CanLIIApiError';
  }
}

export class CanLIIAuthError extends CanLIIApiError {
  constructor(endpoint: string) {
    super('CanLII API key is missing or invalid.', 401, endpoint);
    this.name = 'CanLIIAuthError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.CANLII_API_KEY;
  if (!key) {
    throw new CanLIIAuthError('(pre-flight)');
  }
  return key;
}

/** Simple rate-limit pause between successive requests. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestTime = 0;

async function rateLimitedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await delay(RATE_LIMIT_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();
  return fetch(url, init);
}

async function apiFetch<T>(endpoint: string): Promise<T> {
  const apiKey = getApiKey();
  const url = `${CANLII_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${apiKey}`;

  let response: Response;
  try {
    response = await rateLimitedFetch(url);
  } catch (err) {
    throw new CanLIIApiError(
      `Network error while calling CanLII: ${(err as Error).message}`,
      undefined,
      endpoint,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new CanLIIAuthError(endpoint);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new CanLIIApiError(
      `CanLII API returned ${response.status}: ${body}`,
      response.status,
      endpoint,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search CanLII case law by free-text query.
 *
 * @param params.query       Free-text search terms (e.g. "judicial review IRPA")
 * @param params.resultCount Maximum results to return (default 20)
 * @param params.databaseId  Restrict to a specific court database
 */
export async function searchCases(params: {
  query: string;
  resultCount?: number;
  databaseId?: string;
}): Promise<CanLIISearchResult> {
  const parts: string[] = [
    `fulltext=${encodeURIComponent(params.query)}`,
  ];
  if (params.resultCount) {
    parts.push(`resultCount=${params.resultCount}`);
  }
  if (params.databaseId) {
    parts.push(`databaseId=${params.databaseId}`);
  }

  const endpoint = `/search?${parts.join('&')}`;
  return apiFetch<CanLIISearchResult>(endpoint);
}

/**
 * Retrieve full metadata for a specific case.
 *
 * @param databaseId Court database identifier (e.g. "fct")
 * @param caseId     The case's English identifier
 */
export async function getCaseMetadata(
  databaseId: string,
  caseId: string,
): Promise<CanLIICaseMetadata> {
  const endpoint = `/caseBrowse/en/${encodeURIComponent(databaseId)}/${encodeURIComponent(caseId)}/en`;
  return apiFetch<CanLIICaseMetadata>(endpoint);
}

/**
 * List recent decisions for a given court database.
 *
 * @param databaseId  Court database identifier (e.g. "fct")
 * @param options.offset      Pagination offset
 * @param options.resultCount Number of results per page (default 25)
 */
export async function getRecentDecisions(
  databaseId: string,
  options?: { offset?: number; resultCount?: number },
): Promise<CanLIICase[]> {
  const parts: string[] = [];
  if (options?.offset !== undefined) {
    parts.push(`offset=${options.offset}`);
  }
  if (options?.resultCount !== undefined) {
    parts.push(`resultCount=${options.resultCount}`);
  }

  const qs = parts.length > 0 ? `?${parts.join('&')}` : '';
  const endpoint = `/caseBrowse/en/${encodeURIComponent(databaseId)}${qs}`;

  const data = await apiFetch<{ cases: CanLIICase[] }>(endpoint);
  return data.cases ?? [];
}
