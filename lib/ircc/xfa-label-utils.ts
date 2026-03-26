// ============================================================================
// XFA Label Utilities  -  Derive client-friendly labels from XFA paths
// ============================================================================
// Shared by:
//   - questionnaire-engine-db.ts (portal display)
//   - client-field-config-panel.tsx (admin config)
//   - xfa-scanner upload pipeline (future: auto-set label on insert)
// ============================================================================

/**
 * Convert a CamelCase/PascalCase XFA segment to readable text.
 * e.g. "SponsorDetails" → "Sponsor Details", "FamilyName" → "Family Name"
 */
export function humanizeSegment(segment: string): string {
  return segment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

/** Labels that are too generic to use  -  need path-derived context */
const GENERIC_LABELS = new Set([
  'Yes', 'No', 'Other', 'Text Field', 'Text Field1', 'Text Field2',
  'Text Field3', 'Text Field4', 'Text Field5',
  'Button', 'Button1', 'Check Box', 'Choice', 'Current Page', 'Page Count',
  'Reader Info', 'Proceed', 'Text1', 'Text2', 'Text3',
  'Dropdown', 'Dropdown1', 'Dropdown List',
  'Radio Button', 'Option',
  'From Yr', 'From MM', 'From DD', 'To Yr', 'To MM', 'To DD',
  // Scanner-derived abbreviations that should fall through to segment overrides
  'DOB', 'COB', 'Native Name', 'Given Names', 'yes', 'no',
  // Scanner-generated labels that are just humanized XFA segments (not helpful)
  'PA Family Name', 'PA Given Name', 'DOB Year', 'DOB Month', 'DOB Day',
  'Place Birth City', 'Place Birth Country', 'Status In Can', 'Province State',
  'Lang Pref', 'Relation From', 'Alias Family Name', 'Alias Given Name',
  'Co Signer Ind', 'Same Name Ind', 'Street Num', 'Apt Unit', 'PO Box',
  'City Town', 'Postal Code', 'Family Name', 'Given Name',
  'Bankrupt Ind', 'Prev Social Ind', 'Undertake Ind', 'Leave Can Ind', 'Late Pay Ind',
  'Signature Field1', 'Relation From Date', 'Streetname',
  'Date Stat In Can', 'UCI', 'Marital Status', 'Marital Status New',
  'Jail Ind', 'Sex Off Ind', 'Support Pay Ind', 'Revoke Citz Ind',
  'Inadmissible Ind', 'Act Parliment Ind', 'Alias Name Indicator',
  'PM Family Name', 'PM Given Name', 'Date Of Marriage',
  'Type Of Relationship', 'To Date', 'From Date',
  'Rel2Sponsor', 'Canada US', 'Actual Number', 'Area Code',
  'First Three', 'Last Five', 'Intl Number', 'Number Ext',
])

// ── Path Pattern Overrides ──────────────────────────────────────────────────
// Full-path regex → label. Checked first for context-aware labels.
// Order matters: first match wins.

const PATH_PATTERN_OVERRIDES: Array<{ pattern: RegExp; label: string }> = [
  // ── Sponsor Residency date fields ──
  { pattern: /SponsorResidency.*FromYr/i, label: 'When did you start living there?' },
  { pattern: /SponsorResidency.*FromMM/i, label: 'When did you start living there?' },
  { pattern: /SponsorResidency.*FromDD/i, label: 'When did you start living there?' },
  { pattern: /SponsorResidency.*ToYr/i, label: 'When did you stop living there?' },
  { pattern: /SponsorResidency.*ToMM/i, label: 'When did you stop living there?' },
  { pattern: /SponsorResidency.*ToDD/i, label: 'When did you stop living there?' },
  { pattern: /SponsorResidency.*Country/i, label: 'Country where you lived' },
  { pattern: /SponsorResidency.*CityTown/i, label: 'City / Town where you lived' },
  { pattern: /SponsorResidency.*ProvState/i, label: 'Province / State where you lived' },
  { pattern: /SponsorResidency.*Status/i, label: 'Your immigration status in that country' },
  { pattern: /SponsorResidency.*Street/i, label: 'Street address where you lived' },

  // ── Sponsor Employment date fields ──
  { pattern: /SponsorEA.*FromYr/i, label: 'When did you start this job?' },
  { pattern: /SponsorEA.*FromMM/i, label: 'When did you start this job?' },
  { pattern: /SponsorEA.*FromDD/i, label: 'When did you start this job?' },
  { pattern: /SponsorEA.*ToYr/i, label: 'When did you leave this job?' },
  { pattern: /SponsorEA.*ToMM/i, label: 'When did you leave this job?' },
  { pattern: /SponsorEA.*ToDD/i, label: 'When did you leave this job?' },
  { pattern: /SponsorEA.*Employer/i, label: 'Name of employer' },
  { pattern: /SponsorEA.*Occupation/i, label: 'Your occupation or job title' },
  { pattern: /SponsorEA.*Income/i, label: 'Annual income (CAD)' },
  { pattern: /SponsorEA.*Country/i, label: 'Country where you worked' },
  { pattern: /SponsorEA.*CityTown/i, label: 'City / Town where you worked' },

  // ── Generic Residency date fields ──
  { pattern: /Residency.*FromYr/i, label: 'When did you start living there?' },
  { pattern: /Residency.*FromMM/i, label: 'When did you start living there?' },
  { pattern: /Residency.*FromDD/i, label: 'When did you start living there?' },
  { pattern: /Residency.*ToYr/i, label: 'When did you stop living there?' },
  { pattern: /Residency.*ToMM/i, label: 'When did you stop living there?' },
  { pattern: /Residency.*ToDD/i, label: 'When did you stop living there?' },

  // ── Generic Employment date fields ──
  { pattern: /Employment.*FromYr/i, label: 'When did you start this job?' },
  { pattern: /Employment.*FromMM/i, label: 'When did you start this job?' },
  { pattern: /Employment.*FromDD/i, label: 'When did you start this job?' },
  { pattern: /Employment.*ToYr/i, label: 'When did you leave this job?' },
  { pattern: /Employment.*ToMM/i, label: 'When did you leave this job?' },
  { pattern: /Employment.*ToDD/i, label: 'When did you leave this job?' },

  // ── Education date fields ──
  { pattern: /Education.*FromYr/i, label: 'When did you start this program?' },
  { pattern: /Education.*FromMM/i, label: 'When did you start this program?' },
  { pattern: /Education.*ToYr/i, label: 'When did you finish this program?' },
  { pattern: /Education.*ToMM/i, label: 'When did you finish this program?' },

  // ── Travel History date fields ──
  { pattern: /TravelHistory.*FromYr/i, label: 'When did you arrive?' },
  { pattern: /TravelHistory.*FromMM/i, label: 'When did you arrive?' },
  { pattern: /TravelHistory.*FromDD/i, label: 'When did you arrive?' },
  { pattern: /TravelHistory.*ToYr/i, label: 'When did you leave?' },
  { pattern: /TravelHistory.*ToMM/i, label: 'When did you leave?' },
  { pattern: /TravelHistory.*ToDD/i, label: 'When did you leave?' },
  { pattern: /TravelHistory.*Country/i, label: 'Country you visited' },
  { pattern: /TravelHistory.*Purpose/i, label: 'Purpose of your trip' },
  { pattern: /TravelHistory.*Duration/i, label: 'How long did you stay?' },

  // ── Passport date fields ──
  { pattern: /Passport.*IssueDate/i, label: 'Date your passport was issued' },
  { pattern: /Passport.*ExpiryDate/i, label: 'Date your passport expires' },
  { pattern: /Passport.*IssueDateYr/i, label: 'Passport issue date' },
  { pattern: /Passport.*IssueDateMM/i, label: 'Passport issue date' },
  { pattern: /Passport.*IssueDateDD/i, label: 'Passport issue date' },
  { pattern: /Passport.*ExpiryDateYr/i, label: 'Passport expiry date' },
  { pattern: /Passport.*ExpiryDateMM/i, label: 'Passport expiry date' },
  { pattern: /Passport.*ExpiryDateDD/i, label: 'Passport expiry date' },
  { pattern: /Passport.*PassportNum/i, label: 'Passport number' },
  { pattern: /Passport.*PassportNo/i, label: 'Passport number' },
  { pattern: /Passport.*CountryOfIssue/i, label: 'Country that issued your passport' },

  // ── Sponsor DOB date-split ──
  { pattern: /Sponsor.*DOBYear/i, label: 'Sponsor\'s date of birth' },
  { pattern: /Sponsor.*DOBMonth/i, label: 'Sponsor\'s date of birth' },
  { pattern: /Sponsor.*DOBDay/i, label: 'Sponsor\'s date of birth' },

  // ── Contact Info context ──
  { pattern: /SponsorContactInfo.*CityTown/i, label: 'City / Town (current address)' },
  { pattern: /SponsorContactInfo.*ProvState/i, label: 'Province / State (current address)' },
  { pattern: /SponsorContactInfo.*Country/i, label: 'Country (current address)' },
  { pattern: /SponsorContactInfo.*PostalCode/i, label: 'Postal / ZIP code' },
  { pattern: /SponsorContactInfo.*StreetAddress/i, label: 'Street address (current address)' },
  { pattern: /SponsorContactInfo.*AptUnit/i, label: 'Apartment / Unit number' },
  { pattern: /SponsorContactInfo.*POBox/i, label: 'P.O. Box' },
  { pattern: /ContactInfo.*CityTown/i, label: 'City / Town (current address)' },
  { pattern: /ContactInfo.*ProvState/i, label: 'Province / State (current address)' },
  { pattern: /ContactInfo.*Country/i, label: 'Country (current address)' },
  { pattern: /ContactInfo.*PostalCode/i, label: 'Postal / ZIP code' },

  // ── Family Members / Dependants ──
  { pattern: /FamilyMembers.*FamilyName/i, label: 'Family member\'s family name' },
  { pattern: /FamilyMembers.*GivenName/i, label: 'Family member\'s given name' },
  { pattern: /FamilyMembers.*DOB/i, label: 'Family member\'s date of birth' },
  { pattern: /FamilyMembers.*Relationship/i, label: 'Relationship to you' },
  { pattern: /FamilyMembers.*Country/i, label: 'Country where they live' },
  { pattern: /Dependants.*FamilyName/i, label: 'Dependant\'s family name' },
  { pattern: /Dependants.*GivenName/i, label: 'Dependant\'s given name' },
  { pattern: /Dependants.*DOB/i, label: 'Dependant\'s date of birth' },
  { pattern: /Dependants.*Relationship/i, label: 'Relationship to you' },

  // ── Background questions (full question text) ──
  { pattern: /Background.*tuberculosis/i, label: 'Have you been in close contact with someone who has tuberculosis in the past 2 years?' },
  { pattern: /Background.*disorder/i, label: 'Do you have any serious physical or mental health condition?' },
  { pattern: /Background.*criminal/i, label: 'Have you ever been convicted of a criminal offence in any country?' },
  { pattern: /Background.*refused/i, label: 'Have you ever been refused a visa, denied entry, or ordered to leave any country?' },
  { pattern: /Background.*deported/i, label: 'Have you ever been deported or removed from any country?' },
  { pattern: /Background.*military/i, label: 'Have you ever served in the military, militia, or civil defence unit?' },
  { pattern: /Background.*overstay/i, label: 'Have you ever overstayed a visa in any country?' },

  // ── Details of Visit ──
  { pattern: /DetailsOfVisit.*FromYr/i, label: 'Planned arrival in Canada' },
  { pattern: /DetailsOfVisit.*FromMM/i, label: 'Planned arrival in Canada' },
  { pattern: /DetailsOfVisit.*FromDD/i, label: 'Planned arrival in Canada' },
  { pattern: /DetailsOfVisit.*ToYr/i, label: 'Planned departure from Canada' },
  { pattern: /DetailsOfVisit.*ToMM/i, label: 'Planned departure from Canada' },
  { pattern: /DetailsOfVisit.*ToDD/i, label: 'Planned departure from Canada' },
  { pattern: /DetailsOfVisit.*Purpose/i, label: 'Purpose of your visit to Canada' },
  { pattern: /DetailsOfVisit.*Funds/i, label: 'Funds available for your trip (in Canadian dollars)' },

  // ── IMM5710E  -  Details of Work ──────────────────────────────────────────
  { pattern: /DetailsOfWork.*NOCCode/i, label: 'National Occupation Classification (NOC) Code' },
  { pattern: /DetailsOfWork.*LMIA/i, label: 'LMIA Number' },
  { pattern: /DetailsOfWork.*Employer/i, label: 'Name of employer offering you work' },
  { pattern: /DetailsOfWork.*ProvTerr/i, label: 'Province / territory where you will work' },
  { pattern: /DetailsOfWork.*CityTown/i, label: 'City / town where you will work' },
  { pattern: /DetailsOfWork.*StartDate/i, label: 'Intended start date of work' },
  { pattern: /DetailsOfWork.*EndDate/i, label: 'Intended end date of work' },
  { pattern: /DetailsOfWork.*Duration/i, label: 'Duration of intended work' },
  { pattern: /DetailsOfWork.*Address/i, label: "Employer's address" },
  { pattern: /DetailsOfWork.*PostalCode/i, label: "Employer's postal code" },
  { pattern: /DetailsOfWork.*Country/i, label: 'Country where you will work' },

  // ── IMM5710E  -  Coming Into Canada ────────────────────────────────────────
  { pattern: /ComingIntoCda.*PortOfEntry/i, label: 'Port of entry into Canada' },
  { pattern: /ComingIntoCda.*DateExpArrive/i, label: 'Expected date of arrival in Canada' },
  { pattern: /ComingIntoCda.*ArrivalYr/i, label: 'Expected arrival date' },
  { pattern: /ComingIntoCda.*ArrivalMM/i, label: 'Expected arrival date' },
  { pattern: /ComingIntoCda.*ArrivalDD/i, label: 'Expected arrival date' },
  { pattern: /ComingIntoCda.*TransportType/i, label: 'Mode of transportation into Canada' },
  { pattern: /ComingIntoCda.*VehicleNum/i, label: 'Flight / vessel number' },

  // ── IMM5710E  -  U.S. Green Card ───────────────────────────────────────────
  { pattern: /USCard.*CardNum/i, label: 'U.S. Permanent Resident Card (Green Card) number' },
  { pattern: /USCard.*Expiry/i, label: 'Green Card expiry date' },
  { pattern: /USCard.*IssueDate/i, label: 'Green Card issue date' },

  // ── IMM5710E  -  National Identity Document ────────────────────────────────
  { pattern: /natID.*IDNum/i, label: 'National Identity Document number' },
  { pattern: /natID.*Num/i, label: 'National Identity Document number' },
  { pattern: /natID.*Country/i, label: 'Country that issued your national identity document' },
  { pattern: /natID.*Expiry/i, label: 'National Identity Document expiry date' },
  { pattern: /natID.*IssueDate/i, label: 'National Identity Document issue date' },
]

// ── Segment Overrides ───────────────────────────────────────────────────────
// Last-segment → client-friendly label. Used when no path pattern matched.

const SEGMENT_OVERRIDES: Record<string, string> = {
  // Common personal fields
  FamilyName: 'Family name (as shown on official documents)',
  GivenName: 'Given name(s)',
  GivenNames: 'Given name(s)',
  NativeName: 'Name in native characters (if applicable)',
  COB: 'Country of birth',
  PAFamilyName: 'Family name (as shown on passport)',
  PAGivenName: 'Given name(s) (as shown on passport)',
  DOB: 'Date of birth',
  DOBYear: 'Date of birth',
  DOBMonth: 'Date of birth',
  DOBDay: 'Date of birth',
  PADOB: 'Date of birth',
  PlaceOfBirth: 'Place of birth',
  CityOfBirth: 'City / Town of birth',
  PlaceBirthCity: 'City / Town of birth',
  CountryOfBirth: 'Country of birth',
  PlaceBirthCountry: 'Country of birth',
  MaritalStatus: 'Current marital status',
  PostalCode: 'Postal / ZIP code',
  StreetAddress: 'Street address',
  AptUnit: 'Apartment / Unit number',

  // Contact fields
  Email: 'Email address',
  Telephone: 'Phone number',
  TelephoneNum: 'Phone number',
  CellphoneNum: 'Cell phone number',
  FaxNum: 'Fax number',

  // Passport / ID
  PassportNum: 'Passport number',
  PassportNo: 'Passport number',
  IssueDate: 'Date issued',
  ExpiryDate: 'Expiry date',
  CountryOfIssue: 'Country that issued your passport',
  PlaceOfIssue: 'Place of issue',

  // Sponsor / Co-signer
  CoSignerInd: 'Is there a co-signer for this application?',
  SponsorRelationship: 'Your relationship to the person you are sponsoring',

  // Background
  PrevRefusalQ1: 'Have you ever been refused a visa or entry to any country?',
  PrevRefusalQ2: 'Have you ever been deported or removed from any country?',
  CriminalQ: 'Have you ever been convicted of a criminal offence?',
  MedicalQ: 'Do you have any serious medical condition?',

  // Employment
  Occupation: 'Your occupation or job title',
  Employer: 'Name of your employer',
  JobTitle: 'Job title or position',

  // Date fields  -  readable fallback when no section context is available
  FromDate: 'Start date',
  ToDate: 'End date',
  FromYr: 'Start date',
  FromMM: 'Start date',
  FromDD: 'Start date',
  ToYr: 'End date',
  ToMM: 'End date',
  ToDD: 'End date',

  // Gender / physical
  Sex: 'Sex',
  Height: 'Height (in centimetres)',
  EyeColour: 'Eye colour',

  // Languages
  NativeLang: 'Native language (mother tongue)',
  EnglishFrench: 'Can you communicate in English or French?',

  // Education
  HighestEd: 'Highest level of education completed',
  NumOfYears: 'Total number of years of education',

  // IMM1344 Sponsor-specific
  SponsorFamilyName: 'Sponsor\'s family name',
  SponsorGivenName: 'Sponsor\'s given name(s)',
  CoSignerFamilyName: 'Co-signer\'s family name',
  CoSignerGivenName: 'Co-signer\'s given name(s)',
  SponsorDOB: 'Sponsor\'s date of birth',
  SponsorCitizenship: 'Sponsor\'s country of citizenship',
  SponsorAddress: 'Sponsor\'s address',
  SponsorCityTown: 'Sponsor\'s city / town',
  SponsorProvState: 'Sponsor\'s province / state',
  SponsorCountry: 'Sponsor\'s country',
  SponsorPostalCode: 'Sponsor\'s postal code',
  SponsorTelephone: 'Sponsor\'s phone number',

  // Address / Location
  CityTown: 'City / Town',
  ProvState: 'Province / State',
  Country: 'Country',
  POBox: 'P.O. Box',
  StreetNum: 'Street number',
  StreetNo: 'Street number',
  Streetname: 'Street name',
  StreetName: 'Street name',
  ProvinceState: 'Province / State',
  SignatureField1: 'Signature',

  // Identifiers
  UCI: 'Unique Client Identifier (UCI)',
  ClientID: 'Client ID number',
  ApplicationID: 'Application ID',
  FileNumber: 'File number',

  // Relationship
  RelationshipToSponsor: 'Your relationship to the sponsor',
  RelationshipToApplicant: 'Your relationship to the applicant',

  // Common boolean questions
  ableToCommunicate: 'Are you able to communicate in English or French?',
  EverRefused: 'Have you ever been refused entry to Canada?',

  // Citizenship & Status
  Citizenship: 'Country of citizenship',
  CountryOfCitizenship: 'Country of citizenship',
  CurrentCountry: 'Country where you currently live',
  ResidenceStatus: 'Your immigration status in that country',
  ImmigrationStatus: 'Immigration status',
  StatusInCan: 'Your immigration status in Canada',
  StatusInCanOther: 'If other, please specify',

  // Relationship / marital specifics
  SpouseFamilyName: 'Spouse\'s family name',
  SpouseGivenName: 'Spouse\'s given name(s)',
  SpouseDOB: 'Spouse\'s date of birth',
  DateOfMarriage: 'Date of marriage or start of common-law relationship',
  PreviouslyMarried: 'Have you been previously married or in a common-law relationship?',
  SpouseCountryOfBirth: 'Spouse\'s country of birth',
  Relationship: 'Your relationship to the person you are sponsoring',
  RelationFrom: 'Date your relationship began',
  RelationFromDate: 'Date your relationship began',
  PrevSpouseAge: 'Previous spouse\'s age at time of relationship',
  NumDependants: 'Number of dependants included in this application',

  // Travel & Visit
  Purpose: 'Purpose of your visit',
  PurposeOfVisit: 'Purpose of your visit to Canada',
  DestinationCity: 'City you plan to visit',
  IntendedDuration: 'How long do you plan to stay?',
  FundsAvailable: 'Funds available for your trip (in Canadian dollars)',

  // Education detail
  FieldOfStudy: 'Field of study',
  InstitutionName: 'Name of school or institution',
  DiplomaOrDegree: 'Diploma or degree obtained',
  SchoolName: 'Name of school',

  // Boolean questions (IMM 5707)
  MarriageInPerson: 'Were you married in person?',
  Accompanying: 'Is this person accompanying you to Canada?',

  // ── IMM5710E  -  Work Permit Specific ─────────────────────────────────────
  NOCCode: 'National Occupation Classification (NOC) Code',
  LMIANum: 'LMIA Number',
  LMIANumber: 'LMIA Number',
  LMIAExemptCode: 'LMIA Exemption Code',
  LMIAExempt: 'LMIA Exemption Code',
  PortOfEntry: 'Port of Entry into Canada',
  ProvTerrWork: 'Province / Territory of Intended Work',
  ProvTerr: 'Province / Territory',
  CityWork: 'City / Town of Intended Work',
  IntendedEmployer: 'Name of Intended Employer',
  EmployerName: 'Name of Employer',
  EmployerAddress: "Employer's Street Address",
  EmployerCity: "Employer's City / Town",
  EmployerProv: "Employer's Province / Territory",
  EmployerCountry: "Employer's Country",
  EmployerPostal: "Employer's Postal Code",
  WorkPermitType: 'Type of Work Permit',
  OfferDuration: 'Duration of Job Offer',
  NAICSCode: 'NAICS Industry Code',
  TransportType: 'Mode of Transportation into Canada',
  VehicleNum: 'Flight / Vessel Number',
  DateExpArrive: 'Expected Arrival Date in Canada',
  // USCard fields
  USCardNum: 'U.S. Permanent Resident Card Number',
  USCardExpiry: 'U.S. Card Expiry Date',
  // National Identity Document
  NatIDNum: 'National Identity Document Number',
  IDNum: 'Document Number',
  NatIDCountry: 'Country of Issue',
  NatIDExpiry: 'Document Expiry Date',
  NatIDIssueDate: 'Document Issue Date',

  // Miscellaneous
  Signature: 'Signature',
  DateSigned: 'Date signed',
  PrintedName: 'Printed name',
  Consent: 'I consent to the collection and use of my personal information',
  Declaration: 'I declare that the information I have given is truthful, complete and correct',
  RepName: 'Name of your representative (if any)',
  RepMemberID: 'Representative\'s membership ID',
  RepOrganization: 'Representative\'s organization',
  RepTelephone: 'Representative\'s phone number',
  RepFax: 'Representative\'s fax number',
  RepEmail: 'Representative\'s email address',
  RepAddress: 'Representative\'s address',
  PaidRep: 'Are you using a paid representative?',
  CompensationReceived: 'Has the representative received compensation?',

  // Language preference
  LangPref: 'Preferred language for correspondence',

  // Radio-parent boolean indicators (used when .Yes suffix is stripped)
  Proceed: 'Would you like to proceed with this application?',
  AliasNameIndicator: 'Have you ever used any other name?',
  SameNameInd: 'Is the name the same as shown on your passport?',
  PrevMarriedIndicator: 'Have you been previously married or in a common-law relationship?',
  SameAsMailingIndicator: 'Is your residential address the same as your mailing address?',
  LiveOutsideCan: 'Do you currently live outside of Canada?',
  LiveQC: 'Do you live in Quebec?',
  Over18Ind: 'Are you 18 years of age or older?',
  CanCitzInd: 'Are you a Canadian citizen or permanent resident?',
  SpouseCLInd: 'Is your spouse or common-law partner included in this application?',
  ResideCanInd: 'Do you reside in Canada?',
  PrevSponsored: 'Have you previously sponsored someone?',
  PrevAppInd: 'Have you previously applied for immigration to Canada?',
  SocialAssistInd: 'Have you received social assistance?',
  DefaultInd: 'Have you ever defaulted on a sponsorship undertaking?',
  RemovalOrderInd: 'Are you subject to a removal order?',
  CriminalConvictionInd: 'Have you ever been convicted of a criminal offence?',
  ViolenceInd: 'Have you ever been convicted of an offence of a sexual nature or of violence?',
  ChargedInd: 'Have you been charged with or are awaiting trial for an offence?',
  IncarcerationInd: 'Are you currently incarcerated?',
  RelationshipPAInd: 'Are you related to the principal applicant?',
  PrevSponsoredDefaultInd: 'Has a previous sponsorship resulted in default?',
  SignedUndertakingInd: 'Have you signed a sponsorship undertaking?',

  // Additional IMM 1344 boolean indicators
  BankruptInd: 'Have you ever been bankrupt or in receivership?',
  PrevSocialInd: 'Have you previously received social assistance from a sponsored person?',
  UndertakeInd: 'Do you agree to undertake the financial responsibility of sponsorship?',
  LeaveCanInd: 'Do you intend to leave Canada during the sponsorship period?',
  LatePayInd: 'Have you ever been late on a court-ordered payment?',
  FailedSponsorInd: 'Have you ever failed to meet sponsorship obligations?',
  ChargesInd: 'Have you been charged with an offence?',
  ConvictionInd: 'Have you been convicted of an offence?',
  SexualConvictionInd: 'Have you been convicted of a sexual offence?',
  PrisonInd: 'Are you currently imprisoned?',
  RemovalInd: 'Are you subject to a removal order?',
  RefugeeInd: 'Are you a refugee claimant?',
  JailInd: 'Have you ever been incarcerated or jailed?',
  SexOffInd: 'Have you ever been convicted of a sexual offence?',
  SupportPayInd: 'Are you in default of a court-ordered support payment?',
  RevokeCitzInd: 'Is your Canadian citizenship being revoked?',
  InadmissibleInd: 'Have you been found inadmissible to Canada?',
  ActParlimentInd: 'Are you subject to proceedings under an Act of Parliament?',
  District: 'District or region',

  // Previous marriage
  PMFamilyName: 'Previous spouse\'s family name',
  PMGivenName: 'Previous spouse\'s given name(s)',
  TypeOfRelationship: 'Type of previous relationship',
  DateStatInCan: 'Date you obtained your status in Canada',
  MaritalStatusNew: 'Current marital status',
  Rel2Sponsor: 'Your relationship to the sponsor',

  // Phone field sub-segments
  ActualNumber: 'Phone number',
  AreaCode: 'Area code',
  FirstThree: 'Phone prefix',
  LastFive: 'Phone number',
  IntlNumber: 'International phone number',
  NumberExt: 'Extension',
  Type: 'Type',
  CanadaUS: 'Is this a Canadian or US number?',
  Details: 'Please provide details',
  Other: 'If other, please specify',
}

// ── Profile Path Overrides ─────────────────────────────────────────────────
// Consolidated from CLIENT_LABEL_OVERRIDES (ircc-questionnaire.tsx).
// Single source of truth for profile_path → human-readable label mapping.
// These take priority over XFA path derivation when a profile_path is known.

const PROFILE_PATH_OVERRIDES: Record<string, string> = {
  // Personal Details
  'personal.family_name': 'Family Name (as shown on passport)',
  'personal.given_name': 'Given Name(s) (as shown on passport)',
  'personal.other_names': 'Have you used any other names? (maiden name, aliases, nicknames)',
  'personal.sex': 'Sex',
  'personal.date_of_birth': 'Date of Birth',
  'personal.place_of_birth_city': 'City of Birth',
  'personal.place_of_birth_country': 'Country of Birth',
  'personal.eye_colour': 'Eye Colour',
  'personal.height_cm': 'Height in Centimetres',
  'personal.citizenship': 'Country of Citizenship',
  'personal.second_citizenship': 'Second Country of Citizenship (if any)',
  'personal.current_country_of_residence': 'Country Where You Currently Live',
  'personal.residence_status': 'Your Immigration Status in That Country',
  'personal.residence_from_date': 'Date You Started Living There',
  'personal.previous_countries': 'Countries Where You Have Lived (6 months or more)',
  // Marital Status
  'marital.status': 'Current Marital Status',
  'marital.date_of_current_relationship': 'Date of Marriage or Start of Relationship',
  'marital.spouse_family_name': "Spouse's Family Name",
  'marital.spouse_given_name': "Spouse's Given Name",
  'marital.spouse_date_of_birth': "Spouse's Date of Birth",
  'marital.previous_marriages': 'Previous Marriages or Common-Law Relationships',
  // Language
  'language.native_language': 'Native Language (Mother Tongue)',
  'language.english_ability': 'English Language Ability',
  'language.french_ability': 'French Language Ability',
  'language.preferred_language': 'Preferred Language for Communication',
  // Passport
  'passport.number': 'Passport Number',
  'passport.country_of_issue': 'Country That Issued Your Passport',
  'passport.issue_date': 'Passport Issue Date',
  'passport.expiry_date': 'Passport Expiry Date',
  // Contact Information
  'contact_info.telephone': 'Phone Number',
  'contact_info.alt_telephone': 'Alternate Phone Number',
  'contact_info.email': 'Email Address',
  // Visit Details
  'visit.visa_type': 'Type of Visa You Are Applying For',
  'visit.purpose': 'Purpose of Your Visit to Canada',
  'visit.purpose_details': 'Please provide more details about your visit',
  'visit.from_date': 'Planned Arrival Date in Canada',
  'visit.to_date': 'Planned Departure Date from Canada',
  'visit.funds_available_cad': 'Funds Available for Your Trip (in Canadian Dollars)',
  'visit.contacts_in_canada': 'People You Know in Canada',
  // Education
  'education.has_post_secondary': 'Have you completed any post-secondary education?',
  'education.highest_level': 'Highest Level of Education',
  'education.total_years': 'Total Years of Education',
  'education.history': 'Education History',
  // Employment
  'employment.current_occupation': 'Current Occupation',
  'employment.history': 'Employment History (Past 10 Years)',
  // Background
  'background.tuberculosis_contact': 'Have you been in close contact with someone with tuberculosis in the past two years?',
  'background.physical_mental_disorder': 'Do you have a serious physical or mental health condition?',
  'background.overstayed_visa': 'Have you ever overstayed a visa in any country?',
  'background.refused_visa': 'Have you ever been refused a visa or entry to any country?',
  'background.criminal_record': 'Have you ever been convicted of a criminal offence in any country?',
  'background.deported': 'Have you ever been deported or removed from any country?',
  'background.military_service': 'Have you ever served in the military or a militia?',
  'background.war_crimes': 'Have you ever been associated with war crimes or human rights violations?',
}

/**
 * Derive a client-friendly display label from an XFA field's metadata.
 *
 * Resolution order:
 *   1. `adminLabel`  -  custom label set by the firm admin (highest priority)
 *   2. Profile path override  -  matched against PROFILE_PATH_OVERRIDES (if profilePath provided)
 *   3. Path-pattern match  -  context-aware labels (e.g. Residency+FromYr → "When did you start living there?")
 *   4. `suggestedLabel`  -  auto-generated from scanner (if not generic)
 *   5. Segment override  -  last XFA segment matched against known mappings
 *   6. Humanized XFA path as fallback
 *
 * @param xfaPath - Full XFA path, e.g. "Part1.SponsorDetails.q1.FamilyName"
 * @param adminLabel - Custom label set by admin (field.label)
 * @param suggestedLabel - Auto-generated label from scanner (field.suggested_label)
 * @param profilePath - Profile path identifier (e.g. "personal.family_name")
 */
export function deriveClientLabel(
  xfaPath: string,
  adminLabel?: string | null,
  suggestedLabel?: string | null,
  profilePath?: string | null,
): string {
  // 1. Admin label always wins
  if (adminLabel) return adminLabel

  // 2. Check profile path overrides (stable, profile-path-keyed labels)
  if (profilePath && PROFILE_PATH_OVERRIDES[profilePath]) {
    return PROFILE_PATH_OVERRIDES[profilePath]
  }

  // 3. Check path pattern overrides (context-aware XFA regex)
  if (xfaPath) {
    for (const { pattern, label } of PATH_PATTERN_OVERRIDES) {
      if (pattern.test(xfaPath)) return label
    }
  }

  // 4. If suggested_label is meaningful, use it
  if (suggestedLabel && !GENERIC_LABELS.has(suggestedLabel)) {
    return suggestedLabel
  }

  // 5. Derive from XFA path
  if (!xfaPath) return suggestedLabel || 'Unknown Field'

  const parts = xfaPath.split('.')
  const lastSegment = parts[parts.length - 1]

  // 5a. Radio Yes/No sub-field: strip ".Yes" or ".No" and look up the parent indicator
  if ((lastSegment === 'Yes' || lastSegment === 'No') && parts.length >= 3) {
    const parentSegment = parts[parts.length - 2]
    if (SEGMENT_OVERRIDES[parentSegment]) {
      return SEGMENT_OVERRIDES[parentSegment]
    }
    // Fall through to normal derivation with the parent path
    const parentPath = parts.slice(0, -1).join('.')
    return deriveClientLabel(parentPath, null, suggestedLabel)
  }

  // Check last segment against known overrides
  if (SEGMENT_OVERRIDES[lastSegment]) {
    return SEGMENT_OVERRIDES[lastSegment]
  }

  // Remove top-level prefixes (Part1, Page1, etc.) and question numbers (q1, q2, etc.)
  const meaningful = parts
    .filter((p) => !/^(q\d+|Part\d+|Page\d+)$/i.test(p))
    // Filter out section-level names we already show as section titles
    .filter((p) => !/^(SponsorDetails|SponsorContactInfo|SponsorResidency|SponsorEA|CoSigner|PersonalDetails|ContactInfo|Residency|EmploymentDetails|Education|Languages|TravelDocuments|TravelHistory|Background|FamilyMembers|Dependants|genDetails|AppDetails|Declaration|Consent|RepInfo|MaritalStatus|Passport|DetailsOfVisit)$/i.test(p))
    // Filter out Proceed/Yes/No container noise from conditional XFA branches
    .filter((p) => !/^(Proceed|Yes|No)$/i.test(p))

  if (meaningful.length === 0) {
    return suggestedLabel || humanizeSegment(lastSegment)
  }

  // 6. Take the last meaningful segment and humanize it
  const last = meaningful[meaningful.length - 1]
  if (SEGMENT_OVERRIDES[last]) return SEGMENT_OVERRIDES[last]

  return humanizeSegment(last)
}
