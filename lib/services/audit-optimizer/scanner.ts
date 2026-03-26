/**
 * Audit-Optimizer 3.0 Pre-Submission IRCC AI-Readability Scanner
 *
 * Analyses document text against the IRCC keyword taxonomy,
 * checks structural indicators, and produces a readability score
 * with actionable recommendations to maximise regulator throughput.
 */

import {
  AUDIT_KEYWORDS,
  METADATA_ZONES,
  STRUCTURE_RULES,
  type AuditCategory,
  type MetadataZoneName,
} from './keyword-catalog';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface KeywordMatch {
  /** Whether the keyword was found at least once */
  found: boolean;
  /** Total number of occurrences in the full text */
  count: number;
  /** Occurrences per 1 000 words */
  density: number;
  /** Metadata zones in which the keyword appears */
  zones: MetadataZoneName[];
}

export interface StructureIssue {
  rule: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  fix: string;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  message: string;
  action: string;
}

export interface ZoneAnalysis {
  /** Per-zone keyword density (total keyword hits / zone word count * 1000) */
  densities: Record<MetadataZoneName, number>;
  /** Per-zone keyword hit counts */
  hits: Record<MetadataZoneName, number>;
  /** Word counts per zone */
  wordCounts: Record<MetadataZoneName, number>;
}

export interface AuditScanResult {
  /** Overall readability score 0-100 */
  readabilityScore: number;
  /** Per-keyword match details keyed by keyword string */
  keywordCoverage: Record<string, KeywordMatch>;
  /** Structural issues detected */
  structureIssues: StructureIssue[];
  /** Prioritised recommendations */
  recommendations: Recommendation[];
  /** Zone-level analysis */
  metadataZones: ZoneAnalysis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Case-insensitive count of non-overlapping occurrences of `keyword` in
 * `text`. Uses word-boundary-aware matching to avoid false positives on
 * partial substring hits (e.g. "art" inside "party").
 */
function countOccurrences(text: string, keyword: string): number {
  // Escape regex special characters in the keyword
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

/** Split document text into metadata zones by position heuristics. */
function splitIntoZones(text: string): Record<MetadataZoneName, string> {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.length;

  // Title page: first 50 words (covers header, subject line)
  const titleEnd = Math.min(50, total);
  // Opening paragraph: next 200 words
  const openingEnd = Math.min(titleEnd + 200, total);
  // Conclusion: last 200 words
  const conclusionStart = Math.max(openingEnd, total - 200);
  // Legal arguments: everything between opening and conclusion
  // Annexes: detected via markers or last 10% if no markers

  const titlePage = words.slice(0, titleEnd).join(' ');
  const openingParagraph = words.slice(titleEnd, openingEnd).join(' ');

  // Check for annex markers
  const annexMarkerRe = /\b(annex|appendix|exhibit|schedule|supporting documents?)\b/i;
  const bodyWords = words.slice(openingEnd, conclusionStart);
  const bodyText = bodyWords.join(' ');
  const annexIdx = bodyText.search(annexMarkerRe);

  let legalArguments: string;
  let annexes: string;

  if (annexIdx !== -1 && annexIdx > bodyText.length * 0.5) {
    // Split body at annex marker if it appears in the latter half
    legalArguments = bodyText.slice(0, annexIdx);
    annexes = bodyText.slice(annexIdx);
  } else {
    // Default: last 10% of body as annexes
    const annexStart = Math.floor(bodyWords.length * 0.9);
    legalArguments = bodyWords.slice(0, annexStart).join(' ');
    annexes = bodyWords.slice(annexStart).join(' ');
  }

  const conclusion = words.slice(conclusionStart).join(' ');

  return {
    title_page: titlePage,
    opening_paragraph: openingParagraph,
    legal_arguments: legalArguments,
    conclusion,
    annexes,
  };
}

// ---------------------------------------------------------------------------
// Category Mapping
// ---------------------------------------------------------------------------

const CASE_TYPE_CATEGORY_MAP: Record<string, AuditCategory[]> = {
  'work-permit': ['economic', 'dual_intent', 'procedural'],
  'study-permit': ['dual_intent', 'procedural'],
  'visitor-visa': ['dual_intent', 'procedural'],
  'express-entry': ['economic', 'procedural'],
  'pnp': ['economic', 'procedural'],
  'spousal-sponsorship': ['family', 'procedural'],
  'family-sponsorship': ['family', 'procedural'],
  'parent-grandparent': ['family', 'procedural'],
  'h-and-c': ['humanitarian', 'procedural', 'inadmissibility'],
  'humanitarian': ['humanitarian', 'procedural'],
  'refugee': ['refugee', 'procedural'],
  'prra': ['refugee', 'procedural'],
  'inadmissibility': ['inadmissibility', 'procedural'],
  'criminal-inadmissibility': ['inadmissibility', 'procedural'],
  'trp': ['inadmissibility', 'procedural'],
  'rehabilitation': ['inadmissibility', 'procedural'],
  'start-up-visa': ['business', 'economic', 'procedural'],
  'self-employed': ['business', 'procedural'],
  'business': ['business', 'economic', 'procedural'],
  'judicial-review': ['procedural'],
  'appeal': ['procedural'],
};

/**
 * Returns the keyword categories relevant to a given case type.
 * If no case type is provided or it is not recognised, all categories
 * are returned.
 */
export function getRelevantCategories(caseType?: string): AuditCategory[] {
  if (!caseType) {
    return Object.keys(AUDIT_KEYWORDS) as AuditCategory[];
  }

  const normalised = caseType.toLowerCase().replace(/[\s_]+/g, '-');
  const mapped = CASE_TYPE_CATEGORY_MAP[normalised];

  if (mapped) {
    return mapped;
  }

  // Fallback: try partial match
  for (const [key, categories] of Object.entries(CASE_TYPE_CATEGORY_MAP)) {
    if (normalised.includes(key) || key.includes(normalised)) {
      return categories;
    }
  }

  // No match  -  scan against all categories
  return Object.keys(AUDIT_KEYWORDS) as AuditCategory[];
}

// ---------------------------------------------------------------------------
// Structure Analysis
// ---------------------------------------------------------------------------

function analyseStructure(text: string): StructureIssue[] {
  const issues: StructureIssue[] = [];

  // STRUCT-001: Check for bookmark/TOC indicators in text
  const hasTocIndicators =
    /\b(table of contents|contents|bookmarks?)\b/i.test(text) ||
    /\.{3,}\s*\d+/m.test(text); // dotted leader lines typical of TOCs
  if (!hasTocIndicators) {
    issues.push({
      rule: 'PDF must have bookmarks or a table of contents',
      severity: 'critical',
      description:
        'No table of contents or bookmark indicators detected. The regulator uses bookmarks to navigate sections.',
      fix: 'Add a table of contents to the cover letter and ensure PDF bookmarks are generated when exporting.',
    });
  }

  // STRUCT-002: Cover letter should appear first
  const firstWords = text.slice(0, 500).toLowerCase();
  const hasCoverLetterFirst =
    /\b(cover letter|re:|subject:|dear\s+(honourable|officer|visa|immigration))/i.test(
      firstWords
    );
  if (!hasCoverLetterFirst) {
    issues.push({
      rule: 'Cover letter must be the first document',
      severity: 'critical',
      description:
        'The opening section does not appear to be a cover letter. The regulator expects the cover letter as the first document.',
      fix: 'Ensure the cover letter (with a clear salutation and subject line) is placed as the first document in the submission package.',
    });
  }

  // STRUCT-004: File naming convention check (text-based heuristic)
  const fileNameRefs = text.match(/IMM\d{4,5}/gi) || [];
  const hasProperNaming = fileNameRefs.length > 0;
  if (!hasProperNaming) {
    issues.push({
      rule: 'File naming must follow IRCC conventions',
      severity: 'warning',
      description:
        'No IRCC form references (e.g., IMM5257) detected. This may indicate non-standard file naming.',
      fix: 'Name files using the pattern IMM{FormNumber}_{LastName}_{FirstName}.pdf (e.g., IMM5257_Smith_John.pdf).',
    });
  }

  // STRUCT-010: Cross-references to annexes
  const hasAnnexReferences = /\b(annex|appendix|exhibit|tab|schedule)\s*[A-Z0-9]/i.test(text);
  if (!hasAnnexReferences) {
    issues.push({
      rule: 'Cover letter should contain explicit references to annexes',
      severity: 'info',
      description:
        'No explicit annex or exhibit references found. Cross-references help the regulator map evidence to arguments.',
      fix: 'Add references such as "See Annex A" or "Exhibit 1" in the cover letter body to link arguments to supporting documents.',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main Scanner
// ---------------------------------------------------------------------------

/**
 * Scans document text for IRCC AI-readability and returns a
 * comprehensive result with score, keyword coverage, structure issues,
 * zone analysis, and recommendations.
 *
 * @param text  The extracted text content of the PDF document(s).
 * @param caseType  Optional case type slug to narrow relevant categories
 *                  (e.g. "spousal-sponsorship", "h-and-c", "express-entry").
 */
export function scanDocument(text: string, caseType?: string): AuditScanResult {
  const totalWords = wordCount(text);
  if (totalWords === 0) {
    return {
      readabilityScore: 0,
      keywordCoverage: {},
      structureIssues: [
        {
          rule: 'Document is empty',
          severity: 'critical',
          description: 'No text content was extracted from the document.',
          fix: 'Ensure the PDF contains an embedded text layer. If the document is image-only, apply OCR before submission.',
        },
      ],
      recommendations: [
        {
          priority: 'high',
          category: 'general',
          message: 'The document appears to contain no extractable text.',
          action: 'Re-export the document as a searchable PDF or run OCR on all pages.',
        },
      ],
      metadataZones: {
        densities: { title_page: 0, opening_paragraph: 0, legal_arguments: 0, conclusion: 0, annexes: 0 },
        hits: { title_page: 0, opening_paragraph: 0, legal_arguments: 0, conclusion: 0, annexes: 0 },
        wordCounts: { title_page: 0, opening_paragraph: 0, legal_arguments: 0, conclusion: 0, annexes: 0 },
      },
    };
  }

  // 1. Determine relevant categories
  const categories = getRelevantCategories(caseType);

  // 2. Split into zones
  const zones = splitIntoZones(text);
  const zoneNames = Object.keys(zones) as MetadataZoneName[];

  // 3. Analyse keyword coverage
  const keywordCoverage: Record<string, KeywordMatch> = {};
  let totalKeywords = 0;
  let foundKeywords = 0;
  let weightedZoneScore = 0;
  let maxWeightedZoneScore = 0;

  for (const cat of categories) {
    const keywords = AUDIT_KEYWORDS[cat];
    for (const keyword of keywords) {
      totalKeywords++;
      const count = countOccurrences(text, keyword);
      const density = totalWords > 0 ? (count / totalWords) * 1000 : 0;
      const foundInZones: MetadataZoneName[] = [];

      for (const zoneName of zoneNames) {
        const zoneText = zones[zoneName];
        if (countOccurrences(zoneText, keyword) > 0) {
          foundInZones.push(zoneName);
        }
      }

      const found = count > 0;
      if (found) foundKeywords++;

      keywordCoverage[keyword] = { found, count, density, zones: foundInZones };

      // Zone placement scoring: each found keyword scores the weight of each zone it appears in
      if (found) {
        for (const z of foundInZones) {
          weightedZoneScore += METADATA_ZONES[z].weight;
        }
      }
      // Max possible: keyword appears in the highest-weight zone
      maxWeightedZoneScore += METADATA_ZONES.title_page.weight;
    }
  }

  // 4. Zone-level aggregation
  const zoneAnalysis: ZoneAnalysis = {
    densities: {} as Record<MetadataZoneName, number>,
    hits: {} as Record<MetadataZoneName, number>,
    wordCounts: {} as Record<MetadataZoneName, number>,
  };

  for (const zoneName of zoneNames) {
    const zoneText = zones[zoneName];
    const zoneWc = wordCount(zoneText);
    let zoneHits = 0;

    for (const cat of categories) {
      for (const keyword of AUDIT_KEYWORDS[cat]) {
        zoneHits += countOccurrences(zoneText, keyword);
      }
    }

    zoneAnalysis.wordCounts[zoneName] = zoneWc;
    zoneAnalysis.hits[zoneName] = zoneHits;
    zoneAnalysis.densities[zoneName] = zoneWc > 0 ? (zoneHits / zoneWc) * 1000 : 0;
  }

  // 5. Structure analysis
  const structureIssues = analyseStructure(text);
  const criticalStructureIssues = structureIssues.filter((i) => i.severity === 'critical').length;
  const warningStructureIssues = structureIssues.filter((i) => i.severity === 'warning').length;

  // Total possible structure rules to check
  const totalStructureChecks = STRUCTURE_RULES.length;
  const structurePenalty =
    (criticalStructureIssues * 3 + warningStructureIssues * 1.5) / (totalStructureChecks * 3);

  // 6. Calculate readability score
  // Keyword coverage: 40%
  const coverageRatio = totalKeywords > 0 ? foundKeywords / totalKeywords : 0;
  const keywordScore = coverageRatio * 40;

  // Zone placement: 30%
  const zonePlacementRatio =
    maxWeightedZoneScore > 0 ? weightedZoneScore / maxWeightedZoneScore : 0;
  const zoneScore = zonePlacementRatio * 30;

  // Structure: 30% (penalty-based)
  const structureScore = Math.max(0, 30 * (1 - structurePenalty));

  const readabilityScore = Math.round(
    Math.min(100, Math.max(0, keywordScore + zoneScore + structureScore))
  );

  // 7. Generate recommendations
  const recommendations: Recommendation[] = [];

  // Keyword coverage recommendations
  if (coverageRatio < 0.2) {
    recommendations.push({
      priority: 'high',
      category: 'keyword_coverage',
      message: `Only ${Math.round(coverageRatio * 100)}% of relevant IRCC keywords are present in the document.`,
      action:
        'Review the cover letter and legal arguments to incorporate standard IRCC terminology for the applicable case type.',
    });
  } else if (coverageRatio < 0.5) {
    recommendations.push({
      priority: 'medium',
      category: 'keyword_coverage',
      message: `${Math.round(coverageRatio * 100)}% keyword coverage detected. There is room for improvement.`,
      action:
        'Add missing IRCC-standard terms to strengthen readability. Focus on the categories most relevant to this application type.',
    });
  }

  // Missing category recommendations
  for (const cat of categories) {
    const catKeywords = AUDIT_KEYWORDS[cat];
    const catFound = catKeywords.filter((kw) => keywordCoverage[kw]?.found).length;
    const catCoverage = catKeywords.length > 0 ? catFound / catKeywords.length : 1;

    if (catCoverage === 0) {
      recommendations.push({
        priority: 'high',
        category: cat,
        message: `No keywords from the "${cat}" category were found.`,
        action: `This category is relevant to the case type. Include key terms such as: ${catKeywords.slice(0, 3).join(', ')}.`,
      });
    } else if (catCoverage < 0.15) {
      recommendations.push({
        priority: 'medium',
        category: cat,
        message: `Very low coverage (${Math.round(catCoverage * 100)}%) in the "${cat}" category.`,
        action: `Consider adding more standard terminology from this category. Missing terms include: ${catKeywords
          .filter((kw) => !keywordCoverage[kw]?.found)
          .slice(0, 5)
          .join(', ')}.`,
      });
    }
  }

  // Zone placement recommendations
  if (zoneAnalysis.hits.title_page === 0) {
    recommendations.push({
      priority: 'high',
      category: 'zone_placement',
      message: 'No IRCC keywords detected in the title/header area.',
      action:
        'Include the case type and key legal basis in the cover letter subject line or header (e.g., "Re: H&C Application pursuant to s. 25(1) of IRPA").',
    });
  }

  if (zoneAnalysis.hits.opening_paragraph === 0) {
    recommendations.push({
      priority: 'high',
      category: 'zone_placement',
      message: 'No IRCC keywords detected in the opening paragraph.',
      action:
        'The first 200 words carry high weight with the regulator. State the application type, legal basis, and key facts upfront.',
    });
  }

  if (zoneAnalysis.hits.conclusion === 0) {
    recommendations.push({
      priority: 'medium',
      category: 'zone_placement',
      message: 'No IRCC keywords detected in the conclusion.',
      action:
        'Summarise the key legal arguments and relief sought in the closing paragraph using standard IRCC terminology.',
    });
  }

  // Structure recommendations (convert issues to recommendations)
  for (const issue of structureIssues) {
    recommendations.push({
      priority: issue.severity === 'critical' ? 'high' : issue.severity === 'warning' ? 'medium' : 'low',
      category: 'structure',
      message: issue.description,
      action: issue.fix,
    });
  }

  // Sort recommendations by priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    readabilityScore,
    keywordCoverage,
    structureIssues,
    recommendations,
    metadataZones: zoneAnalysis,
  };
}
