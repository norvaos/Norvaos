/**
 * Audit-Optimizer 3.0 Pre-Submission IRCC AI-Readability Optimizer
 * Keyword Catalogue & Structural Rules
 *
 * IRCC uses AI-powered pre-screening for immigration applications.
 * This catalogue defines the keyword taxonomy, metadata zone weights,
 * and structural rules that affect machine-readability scores.
 */

// ---------------------------------------------------------------------------
// Keyword Taxonomy
// ---------------------------------------------------------------------------

export const AUDIT_KEYWORDS = {
  dual_intent: [
    'Dual Intent',
    'temporary resident',
    'genuine temporary purpose',
    'implied status',
    'restoration of status',
    'dual intent applicant',
    'bona fide temporary resident',
    'non-immigrant intent',
    'temporary purpose established',
    'section 22(2)',
    'subsection 179(b)',
    'reasonable purpose of visit',
    'ties to home country',
    'purpose of travel',
    'temporary stay',
  ],

  economic: [
    'Economic Admissibility',
    'LMIA',
    'NOC/TEER',
    'Labour Market Impact',
    'Labour Market Impact Assessment',
    'Express Entry',
    'Comprehensive Ranking System',
    'CRS score',
    'Provincial Nominee Program',
    'PNP',
    'Federal Skilled Worker',
    'Federal Skilled Trades',
    'Canadian Experience Class',
    'arranged employment',
    'positive LMIA',
    'LMIA-exempt',
    'wage offer',
    'prevailing wage',
    'National Occupational Classification',
    'TEER category',
    'work experience equivalency',
    'educational credential assessment',
    'ECA',
    'settlement funds',
    'Invitation to Apply',
    'ITA',
    'points-based assessment',
    'human capital factors',
    'skill transferability',
    'adaptability factors',
  ],

  humanitarian: [
    'Humanitarian and Compassionate',
    'H&C',
    'best interests of the child',
    'establishment in Canada',
    'hardship',
    'unusual and undeserved hardship',
    'disproportionate hardship',
    'country conditions',
    'risk upon return',
    'adverse country conditions',
    'degree of establishment',
    'ties to Canada',
    'section 25(1)',
    'subsection 25(1)',
    'humanitarian grounds',
    'compassionate grounds',
    'H&C considerations',
    'H&C factors',
    'Kanthasamy factors',
    'best interests analysis',
    'moral obligation',
    'public policy considerations',
    'exceptional circumstances',
    'children directly affected',
    'family unity',
    'integration into Canadian society',
    'community ties',
    'emotional hardship',
    'psychological hardship',
    'medical hardship',
    'financial hardship',
    'length of establishment',
  ],

  inadmissibility: [
    'rehabilitation',
    'criminal inadmissibility',
    'danger to the public',
    'misrepresentation',
    'section 36',
    'section 34',
    'section 35',
    'section 37',
    'section 40',
    'serious criminality',
    'criminality',
    'deemed rehabilitation',
    'individual rehabilitation',
    'record suspension',
    'criminal equivalency',
    'foreign conviction',
    'inadmissible on grounds of',
    'Temporary Resident Permit',
    'TRP',
    'security inadmissibility',
    'health inadmissibility',
    'excessive demand on health or social services',
    'financial inadmissibility',
    'non-compliance',
    'misrepresentation under section 40',
    'direct misrepresentation',
    'innocent misrepresentation',
    'material fact',
    'withholding material information',
    'exclusion order',
    'deportation order',
    'departure order',
    'removal order',
    'Authorization to Return to Canada',
    'ARC',
    'ministerial relief',
    'danger opinion',
    'organized criminality',
  ],

  procedural: [
    'procedural fairness',
    'duty of fairness',
    'Baker factors',
    'legitimate expectations',
    'right to be heard',
    'audi alteram partem',
    'natural justice',
    'procedural fairness letter',
    'opportunity to respond',
    'fairness letter',
    'adequate reasons',
    'right to reasons',
    'bias',
    'reasonable apprehension of bias',
    'fettering of discretion',
    'relevant considerations',
    'irrelevant considerations',
    'Vavilov standard',
    'reasonableness review',
    'standard of review',
    'judicial review',
    'leave for judicial review',
    'Federal Court',
    'Immigration and Refugee Board',
    'IRB',
    'Immigration Appeal Division',
    'IAD',
    'Refugee Appeal Division',
    'RAD',
    'Immigration Division',
    'ID',
    'Refugee Protection Division',
    'RPD',
    'administrative decision-maker',
    'duty to act fairly',
    'disclosure obligation',
  ],

  family: [
    'Family Class',
    'spousal sponsorship',
    'conjugal partner',
    'common-law partner',
    'dependent child',
    'sponsorship undertaking',
    'sponsor eligibility',
    'minimum necessary income',
    'genuine relationship',
    'marriage of convenience',
    'bad faith relationship',
    'relationship genuineness',
    'cohabitation evidence',
    'financial interdependence',
    'shared household responsibilities',
    'mutual commitment',
    'Super Visa',
    'parent and grandparent sponsorship',
    'parent and grandparent program',
    'adoption',
    'orphaned relatives',
    'lonely Canadian',
    'last remaining family member',
    'accompanying dependant',
    'age lock-in date',
    'excluded relationship',
    'proxy marriage',
    'telephone marriage',
    'inland sponsorship',
    'outland sponsorship',
    'open work permit for spouse',
    'conditional measures',
    'two-year cohabitation requirement',
    'sponsorship bar',
    'sponsorship default',
  ],

  refugee: [
    'Convention refugee',
    'person in need of protection',
    'well-founded fear',
    'persecution',
    'refugee claim',
    'refugee protection',
    'section 96',
    'section 97',
    'risk of torture',
    'risk to life',
    'cruel and unusual treatment or punishment',
    'nexus to Convention ground',
    'race',
    'religion',
    'nationality',
    'membership in a particular social group',
    'political opinion',
    'state protection',
    'internal flight alternative',
    'IFA',
    'objective basis',
    'subjective fear',
    'country of reference',
    'country of origin information',
    'National Documentation Package',
    'NDP',
    'similarly situated individuals',
    'agent of persecution',
    'state agent',
    'non-state actor',
    'sur place claim',
    'Pre-Removal Risk Assessment',
    'PRRA',
    'cessation',
    'vacation of refugee status',
    'exclusion under Article 1F',
    'complicity in crimes',
    'Private Sponsorship of Refugees',
    'PSR',
    'Government-Assisted Refugee',
    'GAR',
    'Blended Visa Office-Referred',
    'BVOR',
    'designated country of origin',
    'manifestly unfounded',
    'no credible basis',
    'Basis of Claim form',
    'BOC',
  ],

  business: [
    'Start-Up Visa',
    'self-employed',
    'significant benefit',
    'cultural activities',
    'Start-Up Visa Program',
    'SUV',
    'letter of support',
    'designated organization',
    'venture capital fund',
    'angel investor group',
    'business incubator',
    'commitment certificate',
    'essential business owner',
    'business visitor',
    'intra-company transferee',
    'ICT',
    'significant benefit to Canada',
    'cultural contribution',
    'athletic contribution',
    'self-employed persons program',
    'relevant experience in cultural activities',
    'relevant experience in athletics',
    'world-class level',
    'Owner-Operator LMIA',
    'Entrepreneur',
    'business immigration',
    'net worth requirement',
    'business plan',
    'due diligence',
    'peer review',
  ],
} as const;

/** Union of all keyword category names */
export type AuditCategory = keyof typeof AUDIT_KEYWORDS;

// ---------------------------------------------------------------------------
// Metadata Zones  -  where keyword placement has highest regulator impact
// ---------------------------------------------------------------------------

export interface MetadataZone {
  readonly weight: number;
  readonly description: string;
}

export const METADATA_ZONES = {
  title_page: {
    weight: 3,
    description: 'Cover letter header and subject line',
  },
  opening_paragraph: {
    weight: 2.5,
    description: 'First 200 words of cover letter',
  },
  legal_arguments: {
    weight: 2,
    description: 'Main body \u2014 legal basis sections',
  },
  conclusion: {
    weight: 1.5,
    description: 'Final summary and prayer for relief',
  },
  annexes: {
    weight: 1,
    description: 'Supporting document references',
  },
} as const satisfies Record<string, MetadataZone>;

/** Union of all metadata zone names */
export type MetadataZoneName = keyof typeof METADATA_ZONES;

// ---------------------------------------------------------------------------
// Structural Rules  -  IRCC pre-screen checks
// ---------------------------------------------------------------------------

export interface StructureRule {
  readonly id: string;
  readonly rule: string;
  readonly severity: 'critical' | 'warning' | 'info';
  readonly description: string;
}

export const STRUCTURE_RULES = [
  {
    id: 'STRUCT-001',
    rule: 'PDF must have bookmarks or a table of contents',
    severity: 'critical',
    description:
      'The regulator relies on bookmark navigation to locate sections. PDFs without bookmarks are flagged for manual review, which delays processing.',
  },
  {
    id: 'STRUCT-002',
    rule: 'Cover letter must be the first document',
    severity: 'critical',
    description:
      'The cover letter provides the regulator with the application summary and keyword context. It must appear as the first document or first bookmarked section.',
  },
  {
    id: 'STRUCT-003',
    rule: 'All forms must be searchable (not image-only)',
    severity: 'critical',
    description:
      'Image-only PDFs cannot be parsed by the regulator\u2019s text extraction. All forms must contain an embedded text layer (OCR at minimum).',
  },
  {
    id: 'STRUCT-004',
    rule: 'File naming must follow IRCC conventions',
    severity: 'warning',
    description:
      'Files should follow the pattern: IMM{FormNumber}_{LastName}_{FirstName}.pdf (e.g., IMM5257_Smith_John.pdf). Non-conforming names may cause indexing errors.',
  },
  {
    id: 'STRUCT-005',
    rule: 'Total file size should be under 10 MB per document',
    severity: 'warning',
    description:
      'Documents exceeding 10 MB may time out during processing. Compress images and flatten form fields to reduce file size.',
  },
  {
    id: 'STRUCT-006',
    rule: 'PDF version must be 1.4 or higher',
    severity: 'info',
    description:
      'Older PDF versions may lack features required for reliable text extraction. Save or re-export documents as PDF 1.4+.',
  },
  {
    id: 'STRUCT-007',
    rule: 'No password protection or encryption on submitted PDFs',
    severity: 'critical',
    description:
      'Encrypted or password-protected PDFs cannot be opened by the regulator. Remove all security restrictions before submission.',
  },
  {
    id: 'STRUCT-008',
    rule: 'Embedded fonts must be standard or subset-embedded',
    severity: 'info',
    description:
      'Non-embedded custom fonts can cause character-mapping failures in text extraction. Subset-embed all fonts when exporting to PDF.',
  },
  {
    id: 'STRUCT-009',
    rule: 'Each supporting document must be a separate PDF',
    severity: 'warning',
    description:
      'Merging unrelated supporting documents into a single PDF prevents the regulator from categorising them correctly. Keep each document separate.',
  },
  {
    id: 'STRUCT-010',
    rule: 'Cover letter should contain explicit references to annexes',
    severity: 'info',
    description:
      'Cross-references between the cover letter and annexes (e.g., "See Annex A") help the regulator map supporting evidence to legal arguments.',
  },
] as const satisfies readonly StructureRule[];
