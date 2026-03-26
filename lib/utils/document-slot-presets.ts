// ============================================================================
// Document Slot Template Presets for Immigration Case Types
// ============================================================================
// Each preset includes detailed bilingual descriptions so clients know exactly
// what to provide, reducing office interaction after retainer signing.
// ============================================================================

export interface SlotPreset {
  slot_name: string
  description: string
  description_fr: string
  category: string
  person_role_scope: string | null
  is_required: boolean
  accepted_file_types: string[]
}

const DEFAULT_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const PDF_ONLY = ['application/pdf']
const PHOTO_TYPES = ['image/jpeg', 'image/png']

// ============================================================================
// VISITOR VISA (Temporary Resident Visa  -  TRV) PRESETS
// ============================================================================

export const VISITOR_VISA_PRESETS: SlotPreset[] = [
  // ── Identity Documents ───────────────────────────────────────────────
  {
    slot_name: 'Valid Passport  -  Bio Page & Stamped Pages',
    description:
      'Upload a clear colour scan of your passport bio/data page showing your full name, date of birth, nationality, passport number, and expiry date. Also include scans of ALL pages that contain visa stamps, entry/exit stamps, or endorsements. Your passport must be valid for at least 6 months beyond your planned travel dates and have at least 2 blank pages available.',
    description_fr:
      "Téléversez une copie couleur claire de la page de données biographiques de votre passeport montrant votre nom complet, date de naissance, nationalité, numéro de passeport et date d'expiration. Incluez également les copies de TOUTES les pages contenant des tampons de visa, des tampons d'entrée/sortie ou des mentions. Votre passeport doit être valide au moins 6 mois après vos dates de voyage prévues et avoir au moins 2 pages vierges disponibles.",
    category: 'identity',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'National Identity Card',
    description:
      'Upload a clear scan of both sides of your national identity card (front and back). This should show your full legal name, date of birth, photo, and ID number. If your country does not issue a national ID card, you may skip this document and indicate it as not applicable.',
    description_fr:
      "Téléversez une copie claire des deux côtés de votre carte d'identité nationale (recto et verso). Celle-ci doit montrer votre nom légal complet, votre date de naissance, votre photo et votre numéro d'identité. Si votre pays ne délivre pas de carte d'identité nationale, vous pouvez ignorer ce document et l'indiquer comme non applicable.",
    category: 'identity',
    person_role_scope: 'any',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Digital Photographs  -  IRCC Specifications',
    description:
      'Upload 2 identical digital photos meeting IRCC specifications: 35mm x 45mm (1.37" x 1.77"), taken within the last 6 months, with a plain white or light-coloured background. Your face must be centred, clearly visible from chin to crown, with a neutral expression and mouth closed. Remove glasses, hats, or head coverings (unless worn daily for religious or medical reasons). File must be high resolution (minimum 420 x 540 pixels).',
    description_fr:
      "Téléversez 2 photos numériques identiques conformes aux spécifications d'IRCC : 35mm x 45mm (1,37\" x 1,77\"), prises dans les 6 derniers mois, avec un fond blanc uni ou de couleur claire. Votre visage doit être centré, clairement visible du menton au sommet du crâne, avec une expression neutre et la bouche fermée. Retirez les lunettes, chapeaux ou couvre-chefs (sauf s'ils sont portés quotidiennement pour des raisons religieuses ou médicales). Le fichier doit être en haute résolution (minimum 420 x 540 pixels).",
    category: 'identity',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: PHOTO_TYPES,
  },
  {
    slot_name: 'Birth Certificate',
    description:
      'Upload a clear scan of your birth certificate. If the original document is not in English or French, you must also provide a certified translation from a certified translator. The translation must include the translator\'s certification stamp, signature, and contact information.',
    description_fr:
      "Téléversez une copie claire de votre certificat de naissance. Si le document original n'est pas en anglais ou en français, vous devez également fournir une traduction certifiée par un traducteur agréé. La traduction doit inclure le cachet de certification du traducteur, sa signature et ses coordonnées.",
    category: 'identity',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Financial Documents ──────────────────────────────────────────────
  {
    slot_name: 'Bank Statements  -  Last 3 Months',
    description:
      'Upload your official bank statements for the last 3 consecutive months from each bank account you hold. Statements must clearly show: your full name as account holder, the bank name and logo, account number, opening and closing balances for each month, and all transactions. Online bank printouts are acceptable if they include the bank\'s official header. The statements must demonstrate you have sufficient funds to cover your travel, accommodation, and living expenses during your stay in Canada.',
    description_fr:
      "Téléversez vos relevés bancaires officiels des 3 derniers mois consécutifs pour chaque compte bancaire que vous détenez. Les relevés doivent clairement montrer : votre nom complet en tant que titulaire du compte, le nom et le logo de la banque, le numéro de compte, les soldes d'ouverture et de clôture pour chaque mois, et toutes les transactions. Les impressions bancaires en ligne sont acceptables si elles incluent l'en-tête officiel de la banque. Les relevés doivent démontrer que vous disposez de fonds suffisants pour couvrir vos frais de voyage, d'hébergement et de subsistance pendant votre séjour au Canada.",
    category: 'financial',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Employment Letter',
    description:
      'Upload an official letter from your current employer on company letterhead, signed by your supervisor or HR department. The letter must include: your full name, job title/position, date of hire, annual salary or hourly wage, confirmation that you have been granted leave for your travel dates, and confirmation that your position will be held for your return. Include the company name, address, phone number, and the signatory\'s contact information.',
    description_fr:
      "Téléversez une lettre officielle de votre employeur actuel sur papier à en-tête de l'entreprise, signée par votre superviseur ou le département des ressources humaines. La lettre doit inclure : votre nom complet, votre titre/poste, la date d'embauche, le salaire annuel ou le taux horaire, la confirmation que vous avez obtenu un congé pour vos dates de voyage, et la confirmation que votre poste sera maintenu à votre retour. Incluez le nom de l'entreprise, l'adresse, le numéro de téléphone et les coordonnées du signataire.",
    category: 'employment',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Pay Stubs  -  Last 3 Months',
    description:
      'Upload your most recent 3 months of pay stubs or salary slips. Each pay stub should show your name, employer name, pay period, gross and net earnings, and any deductions. If your employer does not issue formal pay stubs, a signed letter confirming your salary payment history is acceptable.',
    description_fr:
      "Téléversez vos 3 derniers mois de fiches de paie ou bulletins de salaire. Chaque fiche de paie doit montrer votre nom, le nom de l'employeur, la période de paie, les revenus bruts et nets, et toute déduction. Si votre employeur ne délivre pas de fiches de paie formelles, une lettre signée confirmant votre historique de versement de salaire est acceptable.",
    category: 'financial',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Property Ownership Documents',
    description:
      'If you own property (house, land, apartment, or commercial property), upload the deed, title certificate, or official property registration document. This helps demonstrate your financial ties to your home country. Include any mortgage statements if applicable.',
    description_fr:
      "Si vous possédez des biens immobiliers (maison, terrain, appartement ou propriété commerciale), téléversez l'acte de propriété, le certificat de titre ou le document officiel d'enregistrement de propriété. Ceci aide à démontrer vos liens financiers avec votre pays d'origine. Incluez tout relevé hypothécaire le cas échéant.",
    category: 'financial',
    person_role_scope: 'principal_applicant',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Business Registration / Incorporation',
    description:
      'If you are self-employed or own a business, upload your business registration certificate, incorporation documents, or trade licence. Also include recent business financial statements or tax returns showing your business income. This demonstrates your financial ties and intention to return home.',
    description_fr:
      "Si vous êtes travailleur autonome ou propriétaire d'une entreprise, téléversez votre certificat d'enregistrement d'entreprise, vos documents de constitution ou votre licence commerciale. Incluez également les états financiers récents de l'entreprise ou les déclarations de revenus montrant vos revenus d'entreprise. Ceci démontre vos liens financiers et votre intention de retourner dans votre pays.",
    category: 'financial',
    person_role_scope: 'principal_applicant',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Financial Support Letter (if sponsored)',
    description:
      'If someone else is financially supporting your trip (e.g., a family member, friend, or sponsor), upload a signed letter from them confirming: their full name, relationship to you, that they will cover your travel and living expenses in Canada, the amount they are providing, and the duration of support. The sponsor must also provide their bank statements and proof of income.',
    description_fr:
      "Si quelqu'un d'autre finance votre voyage (par exemple, un membre de la famille, un ami ou un parrain), téléversez une lettre signée de sa part confirmant : son nom complet, sa relation avec vous, qu'il couvrira vos frais de voyage et de subsistance au Canada, le montant qu'il fournit et la durée du soutien. Le sponsor doit également fournir ses relevés bancaires et sa preuve de revenu.",
    category: 'financial',
    person_role_scope: 'principal_applicant',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Travel Documents ─────────────────────────────────────────────────
  {
    slot_name: 'Travel Itinerary',
    description:
      'Upload your complete travel itinerary including: confirmed or tentative flight booking (round-trip showing departure and return dates), hotel or accommodation reservations for your entire stay, and any planned internal travel within Canada. You do not need to purchase final tickets before the visa is approved  -  a booking confirmation or itinerary quote is sufficient.',
    description_fr:
      "Téléversez votre itinéraire de voyage complet incluant : la réservation de vol confirmée ou provisoire (aller-retour montrant les dates de départ et de retour), les réservations d'hôtel ou d'hébergement pour toute la durée de votre séjour, et tout voyage interne prévu au Canada. Vous n'avez pas besoin d'acheter les billets définitifs avant l'approbation du visa  -  une confirmation de réservation ou un devis d'itinéraire est suffisant.",
    category: 'other',
    person_role_scope: null,
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Purpose of Visit Statement',
    description:
      'Write and upload a 1-2 page letter explaining: the specific purpose of your visit to Canada (tourism, family visit, business meeting, medical treatment, etc.), the planned dates and duration of your stay, your detailed plans and activities while in Canada, where you will stay, who you will visit (if applicable), and why you will return to your home country after your visit. This letter should be signed and dated by you.',
    description_fr:
      "Rédigez et téléversez une lettre de 1 à 2 pages expliquant : le but spécifique de votre visite au Canada (tourisme, visite familiale, réunion d'affaires, traitement médical, etc.), les dates et la durée prévues de votre séjour, vos plans et activités détaillés au Canada, votre lieu d'hébergement, les personnes que vous visiterez (le cas échéant), et pourquoi vous retournerez dans votre pays d'origine après votre visite. Cette lettre doit être signée et datée par vous.",
    category: 'other',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Previous Travel History',
    description:
      'Upload scans of previous visa stamps, travel visas, and entry/exit stamps from other countries you have visited in the past 10 years. If you have a previous or expired passport with travel stamps, include those pages as well. A strong travel history (especially to the US, UK, EU, Australia, or other developed countries) strengthens your application.',
    description_fr:
      "Téléversez des copies des tampons de visa précédents, des visas de voyage et des tampons d'entrée/sortie des autres pays que vous avez visités au cours des 10 dernières années. Si vous avez un passeport précédent ou expiré avec des tampons de voyage, incluez également ces pages. Un historique de voyage solide (en particulier aux États-Unis, au Royaume-Uni, dans l'UE, en Australie ou dans d'autres pays développés) renforce votre demande.",
    category: 'other',
    person_role_scope: 'principal_applicant',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Travel Insurance Certificate',
    description:
      'Upload proof of travel/medical insurance that covers your entire planned stay in Canada. The policy must include: your full name, policy number, coverage dates (must cover the full duration of your stay), coverage amount (minimum CAD $100,000 recommended), and confirmation it covers emergency medical care, hospitalisation, and repatriation. Purchase insurance that can be cancelled or adjusted in case the visa is not approved.',
    description_fr:
      "Téléversez une preuve d'assurance voyage/médicale couvrant l'intégralité de votre séjour prévu au Canada. La police doit inclure : votre nom complet, le numéro de police, les dates de couverture (doivent couvrir toute la durée de votre séjour), le montant de couverture (minimum 100 000 CAD recommandé), et la confirmation qu'elle couvre les soins médicaux d'urgence, l'hospitalisation et le rapatriement. Souscrivez une assurance qui peut être annulée ou ajustée au cas où le visa ne serait pas approuvé.",
    category: 'medical',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Ties to Home Country ─────────────────────────────────────────────
  {
    slot_name: 'Proof of Employment or Business Ties',
    description:
      'Upload documentation demonstrating your employment or business commitments in your home country that require your return. This could include: employment contract, business licence, professional membership certificates, or a letter from your employer confirming your ongoing position. For students, upload your university enrolment letter showing you are registered for an upcoming semester.',
    description_fr:
      "Téléversez des documents démontrant vos engagements professionnels ou commerciaux dans votre pays d'origine qui nécessitent votre retour. Cela peut inclure : un contrat de travail, une licence commerciale, des certificats d'adhésion professionnelle, ou une lettre de votre employeur confirmant votre poste en cours. Pour les étudiants, téléversez votre lettre d'inscription universitaire montrant que vous êtes inscrit pour un semestre à venir.",
    category: 'employment',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Property Deed or Lease Agreement',
    description:
      'Upload your property deed (if you own a home or land) or your current lease/rental agreement. This demonstrates your residential ties to your home country and your intention to return. Include the property address and your name as owner or tenant.',
    description_fr:
      "Téléversez votre acte de propriété (si vous possédez une maison ou un terrain) ou votre contrat de bail/location actuel. Cela démontre vos liens résidentiels avec votre pays d'origine et votre intention d'y retourner. Incluez l'adresse de la propriété et votre nom en tant que propriétaire ou locataire.",
    category: 'property',
    person_role_scope: 'principal_applicant',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Family Ties Letter',
    description:
      'Upload a brief letter explaining your family situation in your home country  -  for example, your spouse, children, parents, or other dependents who will remain in your home country during your travel. Mention their names, ages, and your relationship. This demonstrates strong ties and your commitment to return.',
    description_fr:
      "Téléversez une brève lettre expliquant votre situation familiale dans votre pays d'origine  -  par exemple, votre conjoint, vos enfants, vos parents ou d'autres personnes à charge qui resteront dans votre pays d'origine pendant votre voyage. Mentionnez leurs noms, âges et votre relation. Cela démontre des liens solides et votre engagement à retourner.",
    category: 'relationship',
    person_role_scope: 'principal_applicant',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Invitation Documents ─────────────────────────────────────────────
  {
    slot_name: 'Invitation Letter from Host in Canada',
    description:
      'If you are visiting a family member or friend in Canada, upload a signed invitation letter from your host. The letter must include: the host\'s full name, address in Canada, phone number, and email; your full name and relationship to the host; the purpose and duration of your visit; where you will stay; who will pay for your expenses; and the host\'s signature and date. The letter should be addressed to "The Visa Officer, Immigration, Refugees and Citizenship Canada (IRCC)".',
    description_fr:
      "Si vous rendez visite à un membre de votre famille ou à un ami au Canada, téléversez une lettre d'invitation signée de votre hôte. La lettre doit inclure : le nom complet de l'hôte, son adresse au Canada, son numéro de téléphone et son courriel ; votre nom complet et votre relation avec l'hôte ; le but et la durée de votre visite ; votre lieu d'hébergement ; qui paiera vos dépenses ; et la signature et la date de l'hôte. La lettre doit être adressée à « L'agent des visas, Immigration, Réfugiés et Citoyenneté Canada (IRCC) ».",
    category: 'relationship',
    person_role_scope: null,
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Host  -  Proof of Status in Canada',
    description:
      'Upload a copy of your Canadian host\'s proof of legal status: Canadian citizenship certificate, Permanent Resident card (front and back), valid work permit, or study permit. This confirms your host is legally residing in Canada.',
    description_fr:
      "Téléversez une copie de la preuve de statut légal de votre hôte au Canada : certificat de citoyenneté canadienne, carte de résident permanent (recto et verso), permis de travail valide ou permis d'études. Cela confirme que votre hôte réside légalement au Canada.",
    category: 'relationship',
    person_role_scope: null,
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Host  -  Proof of Income / Financial Capacity',
    description:
      'Upload your Canadian host\'s proof of income or financial capacity if they are sponsoring your trip. This can include: their most recent Notice of Assessment (NOA) from the Canada Revenue Agency, their last 3 months of bank statements, an employment letter, or their T4 slip. This demonstrates your host can financially support your visit.',
    description_fr:
      "Téléversez la preuve de revenu ou de capacité financière de votre hôte au Canada s'il parraine votre voyage. Cela peut inclure : son dernier avis de cotisation (ADC) de l'Agence du revenu du Canada, ses 3 derniers mois de relevés bancaires, une lettre d'emploi ou son feuillet T4. Cela démontre que votre hôte peut soutenir financièrement votre visite.",
    category: 'financial',
    person_role_scope: null,
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Background / Police ──────────────────────────────────────────────
  {
    slot_name: 'Police Clearance Certificate',
    description:
      'Upload a police clearance certificate (also known as a criminal record check or good conduct certificate) from every country where you have lived for 6 months or more since age 18. The certificate must be issued within the last 6 months and should confirm you have no criminal record. If the document is not in English or French, include a certified translation.',
    description_fr:
      "Téléversez un certificat de vérification de casier judiciaire (également connu sous le nom de certificat de bonne conduite) de chaque pays où vous avez vécu pendant 6 mois ou plus depuis l'âge de 18 ans. Le certificat doit avoir été délivré au cours des 6 derniers mois et doit confirmer que vous n'avez pas de casier judiciaire. Si le document n'est pas en anglais ou en français, incluez une traduction certifiée.",
    category: 'background',
    person_role_scope: 'any',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Medical Exam Results (if applicable)',
    description:
      'If you are required to undergo a medical examination (based on your country of residence or length of stay), upload the results from an IRCC-designated panel physician. You will receive specific instructions from IRCC or your lawyer if a medical exam is required. The panel physician will submit results directly to IRCC, but keep a copy for your records.',
    description_fr:
      "Si vous devez passer un examen médical (en fonction de votre pays de résidence ou de la durée de votre séjour), téléversez les résultats d'un médecin désigné par IRCC. Vous recevrez des instructions spécifiques d'IRCC ou de votre avocat si un examen médical est requis. Le médecin désigné soumettra les résultats directement à IRCC, mais conservez une copie pour vos dossiers.",
    category: 'medical',
    person_role_scope: 'any',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Application Forms ────────────────────────────────────────────────
  {
    slot_name: 'IMM 5257  -  Application for Visitor Visa',
    description:
      'Download and complete IRCC form IMM 5257 (Application for Temporary Resident Visa). Fill in all fields accurately  -  do not leave any fields blank (write "N/A" if not applicable). The form must be signed and dated. Your lawyer will review this form before submission. Download the latest version from the IRCC website.',
    description_fr:
      "Téléchargez et remplissez le formulaire IRCC IMM 5257 (Demande de visa de résident temporaire). Remplissez tous les champs avec précision  -  ne laissez aucun champ vide (écrivez « S/O » si non applicable). Le formulaire doit être signé et daté. Votre avocat examinera ce formulaire avant la soumission. Téléchargez la dernière version sur le site Web d'IRCC.",
    category: 'general',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: PDF_ONLY,
  },
  {
    slot_name: 'IMM 5645  -  Family Information Form',
    description:
      'Download and complete IRCC form IMM 5645 (Family Information). List ALL your family members including spouse/partner, children (regardless of age), parents, and siblings. Include their full names, dates of birth, current addresses, and occupations. Do not omit any family members even if they are not travelling with you.',
    description_fr:
      "Téléchargez et remplissez le formulaire IRCC IMM 5645 (Renseignements sur la famille). Indiquez TOUS les membres de votre famille, y compris votre conjoint/partenaire, vos enfants (quel que soit leur âge), vos parents et vos frères et sœurs. Incluez leurs noms complets, dates de naissance, adresses actuelles et professions. N'omettez aucun membre de la famille même s'il ne voyage pas avec vous.",
    category: 'general',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: PDF_ONLY,
  },
  {
    slot_name: 'Schedule 1  -  Background / Declaration (IMM 5257)',
    description:
      'Download and complete Schedule 1 of IMM 5257 (Additional Information). This form asks about your education history, employment history for the past 10 years, membership in organisations, military service, and government positions. Answer all questions honestly and completely. Any gaps in your timeline should be explained.',
    description_fr:
      "Téléchargez et remplissez l'annexe 1 du formulaire IMM 5257 (Renseignements supplémentaires). Ce formulaire demande des informations sur votre historique d'études, votre historique d'emploi des 10 dernières années, votre appartenance à des organisations, votre service militaire et vos postes gouvernementaux. Répondez à toutes les questions honnêtement et complètement. Tout écart dans votre chronologie doit être expliqué.",
    category: 'general',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: PDF_ONLY,
  },
]

// ============================================================================
// EXTENSION / RENEWAL (Visitor Status Extension  -  Maintain Status) PRESETS
// ============================================================================

export const EXTENSION_PRESETS: SlotPreset[] = [
  // ── Identity Documents ───────────────────────────────────────────────
  {
    slot_name: 'Valid Passport  -  Bio Page & Stamped Pages',
    description:
      'Upload a clear colour scan of your passport bio/data page showing your full name, date of birth, nationality, passport number, and expiry date. Also include scans of ALL pages with stamps  -  particularly your most recent Canada entry stamp. Your passport must be valid for at least 6 months beyond your intended stay.',
    description_fr:
      "Téléversez une copie couleur claire de la page de données biographiques de votre passeport montrant votre nom complet, date de naissance, nationalité, numéro de passeport et date d'expiration. Incluez également les copies de TOUTES les pages avec des tampons  -  en particulier votre plus récent tampon d'entrée au Canada. Votre passeport doit être valide au moins 6 mois au-delà de votre séjour prévu.",
    category: 'identity',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Current Visa / Permit  -  Copy',
    description:
      'Upload a copy of your current Canadian visa, visitor record, or permit that you are requesting to extend. This shows your current authorised status and its expiry date. If you have a visitor record (IMM 1442) issued at the port of entry, include that as well.',
    description_fr:
      "Téléversez une copie de votre visa canadien actuel, de votre fiche de visiteur ou de votre permis que vous demandez de prolonger. Cela montre votre statut autorisé actuel et sa date d'expiration. Si vous avez une fiche de visiteur (IMM 1442) délivrée au point d'entrée, incluez-la également.",
    category: 'identity',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Digital Photographs  -  IRCC Specifications',
    description:
      'Upload 2 identical digital photos meeting IRCC specifications: 35mm x 45mm, taken within the last 6 months, with a plain white or light-coloured background. Your face must be centred, clearly visible from chin to crown, with a neutral expression. Remove glasses unless worn for medical reasons. File must be high resolution (minimum 420 x 540 pixels).',
    description_fr:
      "Téléversez 2 photos numériques identiques conformes aux spécifications d'IRCC : 35mm x 45mm, prises dans les 6 derniers mois, avec un fond blanc uni ou de couleur claire. Votre visage doit être centré, clairement visible du menton au sommet du crâne, avec une expression neutre. Retirez les lunettes sauf si elles sont portées pour des raisons médicales. Le fichier doit être en haute résolution (minimum 420 x 540 pixels).",
    category: 'identity',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: PHOTO_TYPES,
  },

  // ── Status Documents ─────────────────────────────────────────────────
  {
    slot_name: 'Previous Approval Letter / IRCC Correspondence',
    description:
      'Upload the original approval letter or any correspondence received from IRCC regarding your current visa or status in Canada. This includes the letter of introduction (if you applied from outside Canada) or the approval confirmation. Include any subsequent IRCC letters regarding your status.',
    description_fr:
      "Téléversez la lettre d'approbation originale ou toute correspondance reçue d'IRCC concernant votre visa actuel ou votre statut au Canada. Cela inclut la lettre d'introduction (si vous avez fait la demande depuis l'extérieur du Canada) ou la confirmation d'approbation. Incluez toute lettre d'IRCC ultérieure concernant votre statut.",
    category: 'other',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Port of Entry Stamp / Entry Record',
    description:
      'Upload a scan of the Canada entry stamp in your passport showing the date you entered Canada. If you entered electronically (eTA), provide a screenshot of your travel history from the CBSA website or your eTA confirmation. This confirms when you entered and helps calculate your authorised stay period.',
    description_fr:
      "Téléversez une copie du tampon d'entrée au Canada dans votre passeport montrant la date de votre entrée au Canada. Si vous êtes entré électroniquement (AVE), fournissez une capture d'écran de votre historique de voyage du site Web de l'ASFC ou de votre confirmation d'AVE. Cela confirme quand vous êtes entré et aide à calculer votre période de séjour autorisé.",
    category: 'identity',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Financial Documents ──────────────────────────────────────────────
  {
    slot_name: 'Bank Statements  -  Last 3 Months',
    description:
      'Upload your official bank statements for the last 3 consecutive months. These can be from your Canadian bank account or your home country bank account (or both). Statements must show: your name, bank name, account number, transaction history, and current balance. You must demonstrate you have sufficient funds to support yourself for the extended period without working in Canada.',
    description_fr:
      "Téléversez vos relevés bancaires officiels des 3 derniers mois consécutifs. Ceux-ci peuvent provenir de votre compte bancaire canadien ou de votre compte bancaire dans votre pays d'origine (ou les deux). Les relevés doivent montrer : votre nom, le nom de la banque, le numéro de compte, l'historique des transactions et le solde actuel. Vous devez démontrer que vous disposez de fonds suffisants pour subvenir à vos besoins pendant la période prolongée sans travailler au Canada.",
    category: 'financial',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Proof of Financial Support (if sponsored)',
    description:
      'If someone else is financially supporting your extended stay, upload a signed support letter from your sponsor along with their proof of income and bank statements. The letter must confirm: the sponsor\'s name, relationship to you, commitment to cover your expenses, and the duration of financial support.',
    description_fr:
      "Si quelqu'un d'autre soutient financièrement votre séjour prolongé, téléversez une lettre de soutien signée de votre parrain accompagnée de sa preuve de revenu et de ses relevés bancaires. La lettre doit confirmer : le nom du parrain, sa relation avec vous, son engagement à couvrir vos dépenses et la durée du soutien financier.",
    category: 'financial',
    person_role_scope: 'principal_applicant',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Purpose of Extension ─────────────────────────────────────────────
  {
    slot_name: 'Purpose of Extension Statement',
    description:
      'Write and upload a signed letter explaining: why you need to extend your stay in Canada beyond the original authorised period, what you have been doing during your current stay, your updated plans and activities for the extended period, your intended new departure date, and confirmation that you will leave Canada by the new requested date. Be specific and honest about your reasons.',
    description_fr:
      "Rédigez et téléversez une lettre signée expliquant : pourquoi vous devez prolonger votre séjour au Canada au-delà de la période autorisée initiale, ce que vous avez fait pendant votre séjour actuel, vos plans et activités mis à jour pour la période prolongée, votre nouvelle date de départ prévue, et la confirmation que vous quitterez le Canada à la nouvelle date demandée. Soyez précis et honnête quant à vos raisons.",
    category: 'other',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Updated Travel Itinerary',
    description:
      'Upload your updated travel plans including new return flight booking (or tentative booking confirmation), updated accommodation arrangements for the extended stay period, and any internal travel plans within Canada. Show that you have concrete departure plans.',
    description_fr:
      "Téléversez vos plans de voyage mis à jour incluant la nouvelle réservation de vol retour (ou confirmation de réservation provisoire), les arrangements d'hébergement mis à jour pour la période de séjour prolongée, et tout plan de voyage interne au Canada. Montrez que vous avez des plans de départ concrets.",
    category: 'other',
    person_role_scope: null,
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Updated Accommodation Arrangements',
    description:
      'Upload proof of where you will be staying during your extended time in Canada. This can be: a hotel or Airbnb booking confirmation, a letter from your Canadian host confirming you can continue staying with them, or a rental/lease agreement. Include the address and dates of stay.',
    description_fr:
      "Téléversez une preuve de l'endroit où vous séjournerez pendant votre séjour prolongé au Canada. Cela peut être : une confirmation de réservation d'hôtel ou Airbnb, une lettre de votre hôte au Canada confirmant que vous pouvez continuer à séjourner chez lui, ou un contrat de location/bail. Incluez l'adresse et les dates de séjour.",
    category: 'other',
    person_role_scope: null,
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Compliance Documents ─────────────────────────────────────────────
  {
    slot_name: 'Proof of Compliance with Current Status',
    description:
      'Upload evidence that you have maintained your visitor status and complied with all conditions. This means you have not worked in Canada without authorisation, have not attended school for more than 6 months, and have not overstayed your authorised period. A brief signed statement confirming your compliance is sufficient, along with any supporting documents.',
    description_fr:
      "Téléversez des preuves que vous avez maintenu votre statut de visiteur et respecté toutes les conditions. Cela signifie que vous n'avez pas travaillé au Canada sans autorisation, que vous n'avez pas fréquenté l'école pendant plus de 6 mois, et que vous n'avez pas dépassé votre période autorisée. Une brève déclaration signée confirmant votre conformité est suffisante, accompagnée de tout document justificatif.",
    category: 'other',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Proof of Departure Arrangements',
    description:
      'Upload evidence of your plans to leave Canada. This can include: a return flight booking or confirmation, a travel agent booking reference, or evidence of obligations in your home country that require your return (e.g., upcoming employment start date, university semester start, family commitments). This demonstrates your intention to leave Canada by the extended date.',
    description_fr:
      "Téléversez des preuves de vos plans pour quitter le Canada. Cela peut inclure : une réservation ou confirmation de vol retour, une référence de réservation d'agent de voyage, ou des preuves d'obligations dans votre pays d'origine qui nécessitent votre retour (par exemple, date de début d'emploi à venir, début de semestre universitaire, engagements familiaux). Cela démontre votre intention de quitter le Canada à la date prolongée.",
    category: 'other',
    person_role_scope: 'principal_applicant',
    is_required: true,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Medical / Background (if applicable) ─────────────────────────────
  {
    slot_name: 'Updated Medical Exam Results (if applicable)',
    description:
      'If your previous medical exam results have expired (valid for 12 months) or if IRCC requires a new medical exam for your extension, upload the updated results from an IRCC-designated panel physician. Your lawyer will advise you if this is necessary.',
    description_fr:
      "Si vos résultats d'examen médical précédents ont expiré (valides 12 mois) ou si IRCC exige un nouvel examen médical pour votre prolongation, téléversez les résultats mis à jour d'un médecin désigné par IRCC. Votre avocat vous conseillera si cela est nécessaire.",
    category: 'medical',
    person_role_scope: 'any',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Updated Police Clearance Certificate (if applicable)',
    description:
      'If your previous police clearance certificate has expired (typically valid for 6-12 months) or if you have been in Canada for an extended period, you may need to provide an updated certificate. Your lawyer will advise if this is required for your extension.',
    description_fr:
      "Si votre certificat de vérification de casier judiciaire précédent a expiré (généralement valide de 6 à 12 mois) ou si vous êtes au Canada depuis une période prolongée, vous devrez peut-être fournir un certificat mis à jour. Votre avocat vous conseillera si cela est nécessaire pour votre prolongation.",
    category: 'background',
    person_role_scope: 'any',
    is_required: false,
    accepted_file_types: DEFAULT_FILE_TYPES,
  },

  // ── Application Forms ────────────────────────────────────────────────
  {
    slot_name: 'IMM 5708  -  Application to Change Conditions or Extend Stay',
    description:
      'Download and complete IRCC form IMM 5708 (Application to Change Conditions, Extend my Stay, or Remain in Canada as a Visitor). Fill in all fields accurately using information that matches your passport and current status documents. Do not leave any fields blank  -  write "N/A" if not applicable. The form must be signed and dated. Your lawyer will review before submission.',
    description_fr:
      "Téléchargez et remplissez le formulaire IRCC IMM 5708 (Demande de modification des conditions, de prolongation de séjour ou de maintien au Canada en tant que visiteur). Remplissez tous les champs avec précision en utilisant des informations correspondant à votre passeport et vos documents de statut actuels. Ne laissez aucun champ vide  -  écrivez « S/O » si non applicable. Le formulaire doit être signé et daté. Votre avocat l'examinera avant la soumission.",
    category: 'general',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: PDF_ONLY,
  },
  {
    slot_name: 'IMM 5645  -  Family Information Form',
    description:
      'Download and complete IRCC form IMM 5645 (Family Information). List ALL your family members including spouse/partner, children, parents, and siblings with their full names, dates of birth, addresses, and occupations. Do not omit any family member even if they are not in Canada.',
    description_fr:
      "Téléchargez et remplissez le formulaire IRCC IMM 5645 (Renseignements sur la famille). Indiquez TOUS les membres de votre famille, y compris votre conjoint/partenaire, vos enfants, vos parents et vos frères et sœurs avec leurs noms complets, dates de naissance, adresses et professions. N'omettez aucun membre de la famille même s'il n'est pas au Canada.",
    category: 'general',
    person_role_scope: 'any',
    is_required: true,
    accepted_file_types: PDF_ONLY,
  },
  {
    slot_name: 'Document Checklist (IMM 5558)',
    description:
      'Download and complete the IRCC Document Checklist (IMM 5558). Check off each document you are including in your application package. This helps IRCC process your application efficiently and ensures you have not missed any required documents. Your lawyer will review the completed checklist.',
    description_fr:
      "Téléchargez et remplissez la liste de contrôle des documents IRCC (IMM 5558). Cochez chaque document que vous incluez dans votre dossier de demande. Cela aide IRCC à traiter votre demande efficacement et garantit que vous n'avez omis aucun document requis. Votre avocat examinera la liste de contrôle complétée.",
    category: 'general',
    person_role_scope: null,
    is_required: true,
    accepted_file_types: PDF_ONLY,
  },
]

// ============================================================================
// SPOUSAL SPONSORSHIP PRESETS
// ============================================================================

export const SPOUSAL_SPONSORSHIP_PRESETS: SlotPreset[] = [
  // ── Identity Documents ───────────────────────────────────────────────
  {
    slot_name: 'Valid Passport  -  Sponsor',
    description: 'Upload a clear colour scan of the Canadian sponsor\'s passport bio/data page showing full name, date of birth, photo, and expiry date. Include all stamped pages.',
    description_fr: 'Téléversez une copie couleur claire de la page de données biographiques du passeport du parrain canadien montrant le nom complet, la date de naissance, la photo et la date d\'expiration. Incluez toutes les pages estampillées.',
    category: 'identity', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Valid Passport  -  Applicant (Bio Page & Stamped Pages)',
    description: 'Upload a clear colour scan of the principal applicant\'s passport bio/data page and ALL stamped pages. Passport must be valid for at least 12 months.',
    description_fr: 'Téléversez une copie couleur claire de la page de données biographiques du passeport du demandeur principal et de TOUTES les pages estampillées. Le passeport doit être valide au moins 12 mois.',
    category: 'identity', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Digital Photographs  -  IRCC Specifications (Both Parties)',
    description: 'Upload 2 identical digital photos for EACH person (sponsor and applicant) meeting IRCC specifications: 35mm x 45mm, taken within the last 6 months, white background, neutral expression.',
    description_fr: 'Téléversez 2 photos numériques identiques pour CHAQUE personne (parrain et demandeur) conformes aux spécifications IRCC : 35mm x 45mm, prises dans les 6 derniers mois, fond blanc, expression neutre.',
    category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: PHOTO_TYPES,
  },
  {
    slot_name: 'Birth Certificate  -  Applicant',
    description: 'Upload a certified copy of the applicant\'s birth certificate showing full name, date of birth, place of birth, and parents\' names. If not in English or French, include a certified translation.',
    description_fr: 'Téléversez une copie certifiée de l\'acte de naissance du demandeur montrant le nom complet, la date de naissance, le lieu de naissance et les noms des parents. Si ce n\'est pas en anglais ou en français, incluez une traduction certifiée.',
    category: 'identity', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  // ── Proof of Canadian Status (Sponsor) ─────────────────────────────
  {
    slot_name: 'Proof of Canadian Citizenship or PR  -  Sponsor',
    description: 'Upload proof that the sponsor is a Canadian citizen or permanent resident. Accepted documents: Canadian citizenship certificate, Canadian passport, Confirmation of Permanent Residence (COPR), or PR card (front and back).',
    description_fr: 'Téléversez une preuve que le parrain est citoyen canadien ou résident permanent. Documents acceptés : certificat de citoyenneté canadienne, passeport canadien, Confirmation de résidence permanente (COPR) ou carte de RP (recto et verso).',
    category: 'identity', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  // ── Relationship Evidence ──────────────────────────────────────────
  {
    slot_name: 'Marriage Certificate or Common-Law Declaration',
    description: 'Upload a certified copy of your marriage certificate, or if common-law, a Statutory Declaration of Common-Law Union (IMM 5409). For marriages, the certificate must show both parties\' names, date and place of marriage. If not in English or French, include a certified translation.',
    description_fr: 'Téléversez une copie certifiée de votre certificat de mariage, ou si en union de fait, une Déclaration solennelle d\'union de fait (IMM 5409). Pour les mariages, le certificat doit montrer les noms des deux parties, la date et le lieu du mariage. Si ce n\'est pas en anglais ou en français, incluez une traduction certifiée.',
    category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Relationship Photos (Chronological)',
    description: 'Upload 10-20 photos of you together as a couple, in chronological order. Include photos from different events, locations, and time periods (dating, engagement, wedding, holidays, family gatherings). Write dates and descriptions on the back or in a separate document.',
    description_fr: 'Téléversez 10 à 20 photos de vous ensemble en couple, dans l\'ordre chronologique. Incluez des photos de différents événements, lieux et périodes (fréquentation, fiançailles, mariage, vacances, réunions de famille). Écrivez les dates et descriptions au dos ou dans un document séparé.',
    category: 'other', person_role_scope: null, is_required: true, accepted_file_types: [...DEFAULT_FILE_TYPES, 'image/jpeg', 'image/png'],
  },
  {
    slot_name: 'Communication Evidence (Messages, Calls, Emails)',
    description: 'Upload screenshots or logs showing ongoing communication between you and your partner. Include call logs, text messages, WhatsApp/messaging app conversations, emails, or video call history. Show communication across different time periods.',
    description_fr: 'Téléversez des captures d\'écran ou journaux montrant la communication continue entre vous et votre partenaire. Incluez les journaux d\'appels, messages texte, conversations WhatsApp/applications de messagerie, courriels ou historique d\'appels vidéo. Montrez la communication à travers différentes périodes.',
    category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Joint Financial Documents',
    description: 'Upload evidence of shared financial responsibilities: joint bank accounts, shared lease or mortgage, jointly addressed bills/utilities, shared insurance policies, or joint tax returns. Any documents showing both names at the same address strengthen the application.',
    description_fr: 'Téléversez des preuves de responsabilités financières partagées : comptes bancaires conjoints, bail ou hypothèque partagé, factures/services publics adressés aux deux noms, polices d\'assurance conjointes ou déclarations de revenus conjointes.',
    category: 'financial', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Letters from Family and Friends',
    description: 'Upload 2-5 signed letters from family members and friends who can attest to the genuineness of your relationship. Each letter should include: the writer\'s full name, relationship to the couple, how long they have known the couple, specific examples of the relationship, and their contact information.',
    description_fr: 'Téléversez 2 à 5 lettres signées de membres de la famille et d\'amis pouvant attester de l\'authenticité de votre relation. Chaque lettre doit inclure : le nom complet du rédacteur, sa relation avec le couple, depuis combien de temps il connaît le couple, des exemples spécifiques de la relation et ses coordonnées.',
    category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  // ── Financial (Sponsor) ────────────────────────────────────────────
  {
    slot_name: 'Proof of Income  -  Sponsor (NOA, T4, Pay Stubs)',
    description: 'Upload the sponsor\'s proof of income: Notice of Assessment (NOA) from the CRA for the most recent tax year, T4 slips, last 3 months of pay stubs, and/or employment letter. If self-employed, include T1 General, financial statements, and business registration.',
    description_fr: 'Téléversez la preuve de revenu du parrain : Avis de cotisation (ADC) de l\'ARC pour l\'année d\'imposition la plus récente, feuillets T4, 3 derniers mois de talons de paie et/ou lettre d\'emploi. Si travailleur autonome, incluez T1 Générale, états financiers et enregistrement d\'entreprise.',
    category: 'financial', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Employment Letter  -  Sponsor',
    description: 'Upload a letter from the sponsor\'s employer on company letterhead confirming: job title, employment start date, salary/hourly rate, employment status (full-time/part-time), and that employment is ongoing. Letter must be dated within the last 3 months.',
    description_fr: 'Téléversez une lettre de l\'employeur du parrain sur papier à en-tête confirmant : le titre du poste, la date de début d\'emploi, le salaire/taux horaire, le statut d\'emploi (temps plein/partiel) et que l\'emploi est en cours. La lettre doit être datée dans les 3 derniers mois.',
    category: 'financial', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  // ── Background ─────────────────────────────────────────────────────
  {
    slot_name: 'Police Clearance Certificate  -  Applicant',
    description: 'Upload a police clearance certificate from each country where the applicant has lived for 6 months or more since age 18. The certificate must be issued within the last 12 months. If from a non-English/French country, include a certified translation.',
    description_fr: 'Téléversez un certificat de vérification de casier judiciaire de chaque pays où le demandeur a vécu pendant 6 mois ou plus depuis l\'âge de 18 ans. Le certificat doit être émis dans les 12 derniers mois. Si d\'un pays non anglophone/francophone, incluez une traduction certifiée.',
    category: 'background', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Medical Exam Results  -  Applicant',
    description: 'Complete a medical examination with an IRCC-designated panel physician. The physician will submit results directly to IRCC. Upload your copy of the medical report or confirmation receipt. Your lawyer will provide the panel physician list for your area.',
    description_fr: 'Passez un examen médical auprès d\'un médecin désigné par IRCC. Le médecin soumettra les résultats directement à IRCC. Téléversez votre copie du rapport médical ou du reçu de confirmation. Votre avocat vous fournira la liste des médecins désignés pour votre région.',
    category: 'medical', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  // ── Forms ──────────────────────────────────────────────────────────
  {
    slot_name: 'IMM 1344  -  Sponsorship Application',
    description: 'Download and complete IRCC form IMM 1344 (Application to Sponsor, Sponsorship Agreement and Undertaking). The sponsor must complete and sign this form. Fill in all fields accurately. Your lawyer will review before submission.',
    description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 1344 (Demande de parrainage, Entente de parrainage et Engagement). Le parrain doit remplir et signer ce formulaire. Remplissez tous les champs avec précision. Votre avocat l\'examinera avant la soumission.',
    category: 'general', person_role_scope: null, is_required: true, accepted_file_types: PDF_ONLY,
  },
  {
    slot_name: 'IMM 0008  -  Generic Application Form for Canada',
    description: 'Download and complete IRCC form IMM 0008. The principal applicant must complete this form with personal details, education, employment history, and travel history. Fill in all fields  -  write "N/A" if not applicable.',
    description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 0008. Le demandeur principal doit remplir ce formulaire avec ses données personnelles, études, antécédents professionnels et historique de voyage. Remplissez tous les champs  -  écrivez « S/O » si non applicable.',
    category: 'general', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: PDF_ONLY,
  },
  {
    slot_name: 'IMM 5532  -  Relationship Information and Sponsorship Evaluation',
    description: 'Download and complete IRCC form IMM 5532. Both the sponsor and applicant must provide detailed information about their relationship history, how they met, key milestones, and plans for the future together.',
    description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 5532. Le parrain et le demandeur doivent fournir des informations détaillées sur l\'historique de leur relation, comment ils se sont rencontrés, les étapes clés et les projets d\'avenir ensemble.',
    category: 'general', person_role_scope: null, is_required: true, accepted_file_types: PDF_ONLY,
  },
  {
    slot_name: 'IMM 5669  -  Schedule A (Background/Declaration)',
    description: 'Download and complete IRCC form IMM 5669 (Schedule A). The applicant must provide background information including personal history, education, employment, military service, and government positions for the last 10 years.',
    description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 5669 (Annexe A). Le demandeur doit fournir des informations de base incluant l\'historique personnel, les études, l\'emploi, le service militaire et les postes gouvernementaux des 10 dernières années.',
    category: 'general', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: PDF_ONLY,
  },
]

// ============================================================================
// WORK PERMIT PRESETS
// ============================================================================

export const WORK_PERMIT_PRESETS: SlotPreset[] = [
  { slot_name: 'Valid Passport  -  Bio Page & Stamped Pages', description: 'Upload a clear colour scan of your passport bio/data page and ALL stamped pages. Your passport must be valid for the duration of the work permit plus 6 months.', description_fr: 'Téléversez une copie couleur claire de la page bio de votre passeport et de TOUTES les pages estampillées. Votre passeport doit être valide pour la durée du permis de travail plus 6 mois.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Digital Photographs  -  IRCC Specifications', description: 'Upload 2 identical digital photos meeting IRCC specifications: 35mm x 45mm, taken within the last 6 months, white background, neutral expression.', description_fr: 'Téléversez 2 photos numériques identiques conformes aux spécifications IRCC : 35mm x 45mm, prises dans les 6 derniers mois, fond blanc, expression neutre.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: PHOTO_TYPES },
  { slot_name: 'LMIA or LMIA-Exempt Offer of Employment Number', description: 'Upload the positive Labour Market Impact Assessment (LMIA) issued to the employer, OR the LMIA-exempt offer of employment number. This document confirms the employer has been authorised to hire a foreign worker.', description_fr: 'Téléversez l\'Évaluation de l\'impact sur le marché du travail (EIMT) positive délivrée à l\'employeur, OU le numéro d\'offre d\'emploi exemptée d\'EIMT.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Employment Offer Letter / Contract', description: 'Upload the signed job offer letter or employment contract from the Canadian employer. Must include: job title, duties, salary, work location, start date, and duration. Must be on company letterhead and signed by an authorised representative.', description_fr: 'Téléversez la lettre d\'offre d\'emploi signée ou le contrat de travail de l\'employeur canadien. Doit inclure : titre du poste, fonctions, salaire, lieu de travail, date de début et durée.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Resume / Curriculum Vitae', description: 'Upload your up-to-date resume/CV showing education, work experience, skills, and qualifications relevant to the job offered. Include dates, employers, and detailed job descriptions.', description_fr: 'Téléversez votre CV à jour montrant les études, l\'expérience professionnelle, les compétences et qualifications pertinentes pour l\'emploi offert.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Educational Credentials (Degrees, Diplomas, Transcripts)', description: 'Upload copies of all post-secondary degrees, diplomas, certificates, and transcripts. If not in English or French, include certified translations. An Educational Credential Assessment (ECA) may be required.', description_fr: 'Téléversez des copies de tous les diplômes, certificats et relevés de notes postsecondaires. Si non en anglais ou français, incluez des traductions certifiées.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Professional Licences or Certifications', description: 'Upload copies of any professional licences, trade certifications, or regulatory body memberships required for the job (e.g., engineering licence, medical licence, trade certificate). Include any Canadian equivalency assessments.', description_fr: 'Téléversez des copies de toutes les licences professionnelles, certifications ou adhésions à des organismes de réglementation requises pour l\'emploi.', category: 'other', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Proof of Work Experience (Reference Letters)', description: 'Upload reference letters from previous employers confirming your work experience. Each letter must include: employer name and contact, your job title, dates of employment, hours per week, and a description of your duties and responsibilities.', description_fr: 'Téléversez des lettres de référence d\'employeurs précédents confirmant votre expérience professionnelle. Chaque lettre doit inclure : nom et coordonnées de l\'employeur, votre titre, dates d\'emploi, heures par semaine et description de vos fonctions.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Language Test Results (if required)', description: 'Upload your language test results if required for the work permit category. Accepted tests: IELTS (General Training), CELPIP (General), TEF Canada, or TCF Canada. Results must be less than 2 years old.', description_fr: 'Téléversez vos résultats de test linguistique si requis. Tests acceptés : IELTS (Formation générale), CELPIP (Général), TEF Canada ou TCF Canada. Les résultats doivent dater de moins de 2 ans.', category: 'other', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Bank Statements  -  Last 3 Months', description: 'Upload official bank statements for the last 3 months showing sufficient funds to support yourself (and family if applicable) during initial settlement in Canada.', description_fr: 'Téléversez les relevés bancaires officiels des 3 derniers mois montrant des fonds suffisants pour subvenir à vos besoins (et ceux de votre famille le cas échéant) lors de l\'établissement initial au Canada.', category: 'financial', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Police Clearance Certificate', description: 'Upload a police clearance certificate from each country where you have lived for 6 months or more since age 18. Must be issued within the last 12 months.', description_fr: 'Téléversez un certificat de vérification de casier judiciaire de chaque pays où vous avez vécu 6 mois ou plus depuis l\'âge de 18 ans. Doit être émis dans les 12 derniers mois.', category: 'background', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Medical Exam Results (if required)', description: 'If required for your work permit category, complete a medical exam with an IRCC-designated panel physician. Upload your copy of the medical report or confirmation receipt.', description_fr: 'Si requis pour votre catégorie de permis de travail, passez un examen médical auprès d\'un médecin désigné par IRCC. Téléversez votre copie du rapport médical ou du reçu de confirmation.', category: 'medical', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'IMM 1295  -  Work Permit Application', description: 'Download and complete IRCC form IMM 1295 (Application for Work Permit Made Outside of Canada) or IMM 5710 (if applying from inside Canada). Fill in all fields accurately.', description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 1295 (Demande de permis de travail présentée à l\'extérieur du Canada) ou IMM 5710 (si vous postulez depuis le Canada).', category: 'general', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: PDF_ONLY },
  { slot_name: 'IMM 5645  -  Family Information Form', description: 'Download and complete IRCC form IMM 5645 listing ALL family members.', description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 5645 listant TOUS les membres de la famille.', category: 'general', person_role_scope: 'any', is_required: true, accepted_file_types: PDF_ONLY },
]

// ============================================================================
// STUDY PERMIT PRESETS
// ============================================================================

export const STUDY_PERMIT_PRESETS: SlotPreset[] = [
  { slot_name: 'Valid Passport  -  Bio Page & Stamped Pages', description: 'Upload a clear colour scan of your passport bio/data page and ALL stamped pages. Passport must be valid for the duration of your study program.', description_fr: 'Téléversez une copie couleur claire de la page bio de votre passeport et de TOUTES les pages estampillées.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Digital Photographs  -  IRCC Specifications', description: 'Upload 2 identical digital photos meeting IRCC specifications: 35mm x 45mm, last 6 months, white background.', description_fr: 'Téléversez 2 photos numériques identiques conformes aux spécifications IRCC : 35mm x 45mm, 6 derniers mois, fond blanc.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: PHOTO_TYPES },
  { slot_name: 'Letter of Acceptance from DLI', description: 'Upload the original letter of acceptance from a Canadian Designated Learning Institution (DLI). Must include: DLI number, program name, program duration, start date, tuition fees, and any conditions of acceptance.', description_fr: 'Téléversez la lettre d\'acceptation originale d\'un Établissement d\'enseignement désigné (EED) canadien. Doit inclure : numéro EED, nom du programme, durée, date de début, frais de scolarité et conditions.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Proof of Financial Support (Tuition + Living)', description: 'Upload proof you can pay tuition fees AND living expenses for the first year (minimum $20,635 CAD outside Quebec, or $15,828 CAD inside Quebec, plus tuition). Accepted: bank statements, GIC certificate, scholarship letters, or sponsor\'s proof of funds.', description_fr: 'Téléversez une preuve que vous pouvez payer les frais de scolarité ET les frais de subsistance pour la première année. Acceptés : relevés bancaires, certificat CPG, lettres de bourse ou preuve de fonds du parrain.', category: 'financial', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'GIC Certificate (if applicable)', description: 'Upload your Guaranteed Investment Certificate (GIC) confirmation from a participating Canadian financial institution. The GIC demonstrates you have funds available for living expenses during your first year.', description_fr: 'Téléversez votre confirmation de Certificat de placement garanti (CPG) d\'une institution financière canadienne participante.', category: 'financial', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Previous Transcripts and Diplomas', description: 'Upload transcripts and diplomas from all previous educational institutions (high school and post-secondary). Include certified translations if not in English or French.', description_fr: 'Téléversez les relevés de notes et diplômes de tous les établissements d\'enseignement précédents. Incluez des traductions certifiées si non en anglais ou français.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Language Test Results (IELTS/TOEFL/TEF)', description: 'Upload your English or French language test results as required by the DLI. Common tests: IELTS Academic, TOEFL iBT, PTE Academic, TEF Canada, or TCF Canada.', description_fr: 'Téléversez vos résultats de test linguistique en anglais ou français tel que requis par l\'EED.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Statement of Purpose / Study Plan', description: 'Upload a signed letter explaining: why you chose this program and institution, how it aligns with your career goals, your plans after graduation, and your ties to your home country.', description_fr: 'Téléversez une lettre signée expliquant : pourquoi vous avez choisi ce programme et cette institution, comment cela s\'aligne avec vos objectifs de carrière, vos plans après la diplomation et vos liens avec votre pays d\'origine.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Police Clearance Certificate', description: 'Upload a police clearance certificate from each country where you have lived for 6 months or more since age 18.', description_fr: 'Téléversez un certificat de vérification de casier judiciaire de chaque pays où vous avez vécu 6 mois ou plus depuis l\'âge de 18 ans.', category: 'background', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Medical Exam Results (if required)', description: 'If required, upload medical exam results from an IRCC-designated panel physician.', description_fr: 'Si requis, téléversez les résultats d\'examen médical d\'un médecin désigné par IRCC.', category: 'medical', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Provincial Attestation Letter (PAL)', description: 'Upload the Provincial Attestation Letter issued by the province or territory where your DLI is located. This is required for most study permit applications submitted after January 22, 2024.', description_fr: 'Téléversez la Lettre d\'attestation provinciale émise par la province ou le territoire où se trouve votre EED.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'IMM 1294  -  Study Permit Application', description: 'Download and complete IRCC form IMM 1294 (Application for Study Permit Made Outside of Canada). Fill in all fields accurately.', description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 1294 (Demande de permis d\'études).', category: 'general', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: PDF_ONLY },
  { slot_name: 'IMM 5645  -  Family Information Form', description: 'Download and complete IRCC form IMM 5645 listing ALL family members.', description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 5645 listant TOUS les membres de la famille.', category: 'general', person_role_scope: 'any', is_required: true, accepted_file_types: PDF_ONLY },
]

// ============================================================================
// PERMANENT RESIDENCE (Express Entry / PNP) PRESETS
// ============================================================================

export const PERMANENT_RESIDENCE_PRESETS: SlotPreset[] = [
  { slot_name: 'Valid Passport  -  Bio Page & Stamped Pages', description: 'Upload a clear colour scan of your passport bio/data page and ALL stamped pages.', description_fr: 'Téléversez une copie couleur de la page bio de votre passeport et de TOUTES les pages estampillées.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Digital Photographs  -  IRCC Specifications', description: 'Upload 2 identical digital photos per person meeting IRCC specifications: 35mm x 45mm, last 6 months, white background.', description_fr: 'Téléversez 2 photos par personne conformes aux spécifications IRCC : 35mm x 45mm, 6 derniers mois, fond blanc.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: PHOTO_TYPES },
  { slot_name: 'Birth Certificate', description: 'Upload a certified copy of your birth certificate. If not in English or French, include a certified translation.', description_fr: 'Téléversez une copie certifiée de votre acte de naissance. Si non en anglais ou français, incluez une traduction certifiée.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Language Test Results (IELTS/CELPIP/TEF/TCF)', description: 'Upload your language test results. For Express Entry: IELTS General Training, CELPIP General, TEF Canada, or TCF Canada. Results must be less than 2 years old and meet minimum CLB requirements for your program.', description_fr: 'Téléversez vos résultats de test linguistique. Résultats de moins de 2 ans requis.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Educational Credential Assessment (ECA)', description: 'Upload your ECA report from an IRCC-designated organisation (WES, IQAS, CES, etc.) confirming your foreign education is equivalent to a Canadian credential. Include both the ECA report and the original transcripts/diplomas.', description_fr: 'Téléversez votre rapport d\'Évaluation des diplômes d\'études (EDE) d\'un organisme désigné par IRCC.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Work Experience Reference Letters', description: 'Upload detailed reference letters for EACH qualifying work experience. Each letter MUST include: company letterhead, your job title, dates of employment (start/end), hours per week, annual salary, detailed list of duties and responsibilities, and supervisor\'s name + contact information.', description_fr: 'Téléversez des lettres de référence détaillées pour CHAQUE expérience de travail admissible.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Proof of Funds', description: 'Upload proof you meet the minimum settlement funds requirement. Bank statements, investment statements, or a combination. Funds must have been available for at least 6 months prior to application. Current minimums: 1 person $14,690, 2 people $18,288, 3 people $22,483 CAD (updated annually).', description_fr: 'Téléversez une preuve que vous répondez aux exigences minimales de fonds d\'établissement.', category: 'financial', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Provincial Nomination Certificate (if PNP)', description: 'If applying through a Provincial Nominee Program, upload your official Provincial Nomination Certificate.', description_fr: 'Si vous postulez via un Programme des candidats des provinces, téléversez votre certificat de nomination provincial officiel.', category: 'other', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Marriage Certificate (if applicable)', description: 'Upload a certified marriage certificate if including a spouse in your application.', description_fr: 'Téléversez un certificat de mariage certifié si vous incluez un conjoint dans votre demande.', category: 'identity', person_role_scope: null, is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Police Clearance Certificates', description: 'Upload police clearance certificates from every country you have lived in for 6+ months since age 18. Must be less than 12 months old.', description_fr: 'Téléversez les certificats de vérification de casier judiciaire de chaque pays où vous avez vécu 6+ mois depuis l\'âge de 18 ans.', category: 'background', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Medical Exam Results', description: 'Complete a medical exam with an IRCC-designated panel physician. Upload your copy of the results or confirmation receipt.', description_fr: 'Passez un examen médical auprès d\'un médecin désigné par IRCC. Téléversez votre copie des résultats.', category: 'medical', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'IMM 0008  -  Generic Application Form', description: 'Download and complete IRCC form IMM 0008 for each person included in the application.', description_fr: 'Téléchargez et remplissez le formulaire IRCC IMM 0008 pour chaque personne incluse dans la demande.', category: 'general', person_role_scope: 'any', is_required: true, accepted_file_types: PDF_ONLY },
  { slot_name: 'IMM 5669  -  Schedule A (Background/Declaration)', description: 'Download and complete IMM 5669 for each person 18 years or older.', description_fr: 'Téléchargez et remplissez l\'IMM 5669 pour chaque personne de 18 ans ou plus.', category: 'general', person_role_scope: 'any', is_required: true, accepted_file_types: PDF_ONLY },
]

// ============================================================================
// REFUGEE CLAIM PRESETS
// ============================================================================

export const REFUGEE_CLAIM_PRESETS: SlotPreset[] = [
  { slot_name: 'Valid Passport or Travel Document', description: 'Upload any identity or travel documents you have: passport, national ID card, birth certificate, or travel document. If your documents were lost or confiscated, provide a written explanation of what happened.', description_fr: 'Téléversez tout document d\'identité ou de voyage que vous avez. Si vos documents ont été perdus ou confisqués, fournissez une explication écrite.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Digital Photographs  -  IRCC Specifications', description: 'Upload 2 identical photos per person: 35mm x 45mm, white background, neutral expression.', description_fr: 'Téléversez 2 photos par personne : 35mm x 45mm, fond blanc, expression neutre.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: PHOTO_TYPES },
  { slot_name: 'Basis of Claim Form (BOC)', description: 'Complete the Basis of Claim (BOC) form describing in detail the persecution you faced or fear, including: specific incidents with dates and locations, who persecuted you, why you were targeted, what happened to you, efforts to get protection in your home country, and why you cannot return.', description_fr: 'Remplissez le formulaire Fondement de la demande d\'asile (FDA) décrivant en détail la persécution que vous avez subie ou craignez.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Personal Narrative / Detailed Declaration', description: 'Write a detailed personal narrative expanding on your BOC form. Describe your life history, the persecution you experienced, specific incidents in chronological order, your escape, and why you fear returning. Be as detailed and specific as possible.', description_fr: 'Rédigez un récit personnel détaillé développant votre formulaire FDA. Décrivez votre histoire de vie et la persécution que vous avez vécue.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Supporting Evidence of Persecution', description: 'Upload ANY evidence supporting your claim: police reports, medical records, photographs of injuries, threatening letters or messages, news articles mentioning you or your group, court documents, arrest warrants, or affidavits from witnesses.', description_fr: 'Téléversez TOUTE preuve appuyant votre demande : rapports de police, dossiers médicaux, photos de blessures, lettres de menace, articles de presse, documents judiciaires.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Country Condition Documentation', description: 'Upload reports or articles about human rights conditions in your country relevant to your claim. Sources: Amnesty International, Human Rights Watch, UNHCR, US State Department, or reputable news organisations.', description_fr: 'Téléversez des rapports sur les conditions des droits de la personne dans votre pays pertinents à votre demande.', category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Medical or Psychological Reports (if applicable)', description: 'If you suffered physical or psychological harm, upload medical reports, hospital records, or a psychological assessment from a qualified professional documenting your injuries or trauma.', description_fr: 'Si vous avez subi des préjudices physiques ou psychologiques, téléversez des rapports médicaux ou une évaluation psychologique.', category: 'medical', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Identity Documents from Home Country', description: 'Upload any identity documents from your home country: national ID card, birth certificate, driver\'s licence, military service card, voter registration card, or any other government-issued document.', description_fr: 'Téléversez tout document d\'identité de votre pays d\'origine.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
]

// ============================================================================
// CITIZENSHIP PRESETS
// ============================================================================

export const CITIZENSHIP_PRESETS: SlotPreset[] = [
  { slot_name: 'Permanent Resident Card (Front & Back)', description: 'Upload a clear scan of both sides of your current or most recent PR card. If expired, still include it.', description_fr: 'Téléversez une copie claire des deux côtés de votre carte de RP actuelle ou la plus récente.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Valid Passport  -  All Pages', description: 'Upload ALL pages of your current passport and any previous passports used during the qualifying period (5 years before application). Include blank pages.', description_fr: 'Téléversez TOUTES les pages de votre passeport actuel et de tout passeport précédent utilisé pendant la période admissible.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Digital Photographs  -  IRCC Specifications', description: 'Upload 2 identical photos per person: 35mm x 45mm, white background, taken in last 6 months.', description_fr: 'Téléversez 2 photos par personne : 35mm x 45mm, fond blanc, prises dans les 6 derniers mois.', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: PHOTO_TYPES },
  { slot_name: 'Proof of Physical Presence in Canada (Travel Records)', description: 'Upload detailed records of ALL your travel outside Canada during the qualifying period (5 years). Include: travel dates, destination, purpose. Use IRCC\'s physical presence calculator. Provide boarding passes, stamps, or flight records as evidence.', description_fr: 'Téléversez des relevés détaillés de TOUS vos voyages hors du Canada pendant la période admissible (5 ans).', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Canadian Tax Returns (NOAs)  -  Last 5 Years', description: 'Upload your Notice of Assessment (NOA) from the Canada Revenue Agency for each of the 5 tax years within the qualifying period. You must have filed taxes for at least 3 of the 5 years.', description_fr: 'Téléversez votre Avis de cotisation (ADC) de l\'ARC pour chacune des 5 années d\'imposition dans la période admissible.', category: 'financial', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Language Test Results (CLB 4+)', description: 'Upload proof of English or French language ability at CLB level 4 or higher. Accepted tests: IELTS General Training, CELPIP General, TEF Canada, or TCF Canada. Required for applicants aged 18-54.', description_fr: 'Téléversez une preuve de compétence linguistique en anglais ou français au NCLC 4 ou plus.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Confirmation of Permanent Residence (COPR / IMM 5292)', description: 'Upload your original Confirmation of Permanent Residence document (IMM 5292 or COPR) showing the date you became a permanent resident.', description_fr: 'Téléversez votre Confirmation de résidence permanente originale (IMM 5292 ou COPR).', category: 'identity', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'CIT 0002  -  Application for Canadian Citizenship', description: 'Download and complete IRCC form CIT 0002 (Application for Canadian Citizenship  -  Adults). Fill in all fields accurately.', description_fr: 'Téléchargez et remplissez le formulaire IRCC CIT 0002 (Demande de citoyenneté canadienne  -  Adultes).', category: 'general', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: PDF_ONLY },
]

// ============================================================================
// LMIA PRESETS
// ============================================================================

export const LMIA_PRESETS: SlotPreset[] = [
  { slot_name: 'Business Registration / Incorporation Documents', description: 'Upload proof the business is legally registered and operating in Canada: articles of incorporation, business licence, CRA business number confirmation, or provincial/territorial business registration.', description_fr: 'Téléversez une preuve que l\'entreprise est légalement enregistrée et opère au Canada.', category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Business Financial Statements', description: 'Upload the company\'s financial statements for the last 2 fiscal years: income statement, balance sheet, and T2 corporate tax returns. These demonstrate the business can afford to pay the offered wage.', description_fr: 'Téléversez les états financiers de l\'entreprise pour les 2 derniers exercices.', category: 'financial', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Proof of Recruitment Efforts', description: 'Upload evidence of efforts to hire Canadians/PRs before seeking a foreign worker: job postings (with dates) on Job Bank for at least 4 weeks + 2 additional recruitment methods, applications received, interview records, and reasons for rejecting Canadian candidates.', description_fr: 'Téléversez des preuves des efforts pour embaucher des Canadiens/RP avant de chercher un travailleur étranger.', category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Job Bank Posting Confirmation', description: 'Upload screenshots or confirmation of the job posting on the Government of Canada Job Bank. The posting must have been active for at least 4 consecutive weeks within the 3 months before the LMIA application.', description_fr: 'Téléversez des captures d\'écran ou la confirmation de l\'offre d\'emploi sur le Guichet-Emplois du gouvernement du Canada.', category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Additional Recruitment Advertisements', description: 'Upload proof of at least 2 additional recruitment methods used (besides Job Bank): online job boards, professional associations, recruitment agencies, job fairs, union hiring halls, etc. Include dates and screenshots.', description_fr: 'Téléversez des preuves d\'au moins 2 méthodes de recrutement supplémentaires utilisées (en plus du Guichet-Emplois).', category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Detailed Job Description', description: 'Upload a detailed description of the position: job title matching NOC code, detailed duties and responsibilities, required education and experience, working conditions, wage and benefits, hours of work, and work location.', description_fr: 'Téléversez une description détaillée du poste : titre correspondant au code CNP, fonctions détaillées, exigences, conditions de travail, salaire et avantages.', category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Prevailing Wage Evidence', description: 'Upload evidence that the offered wage meets or exceeds the prevailing wage for the occupation in the work location. Use the Job Bank wage report for the specific NOC code and region.', description_fr: 'Téléversez une preuve que le salaire offert atteint ou dépasse le salaire courant pour la profession dans le lieu de travail.', category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Transition Plan (if high-wage)', description: 'For high-wage positions, upload a transition plan describing how the employer will reduce reliance on temporary foreign workers over time. Include plans for: hiring Canadians, training existing staff, and supporting the TFW\'s transition to PR.', description_fr: 'Pour les postes à haut salaire, téléversez un plan de transition décrivant comment l\'employeur réduira sa dépendance aux travailleurs étrangers temporaires.', category: 'other', person_role_scope: null, is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Employment Contract / Offer Letter for Foreign Worker', description: 'Upload the draft employment contract or offer letter for the foreign worker. Must include: job title, duties, wage, hours, benefits, work location, and employment duration.', description_fr: 'Téléversez le projet de contrat de travail ou la lettre d\'offre pour le travailleur étranger.', category: 'other', person_role_scope: null, is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'EMP 5593  -  LMIA Application Form', description: 'Download and complete Service Canada form EMP 5593 (Application for a Labour Market Impact Assessment). Fill in all sections accurately.', description_fr: 'Téléchargez et remplissez le formulaire EMP 5593 (Demande d\'évaluation de l\'impact sur le marché du travail).', category: 'general', person_role_scope: null, is_required: true, accepted_file_types: PDF_ONLY },
]

// ============================================================================
// JUDICIAL REVIEW PRESETS
// ============================================================================

export const JUDICIAL_REVIEW_PRESETS: SlotPreset[] = [
  { slot_name: 'IRCC Decision / Refusal Letter', description: 'Upload the full IRCC decision letter or refusal that you are seeking to challenge. Include all pages and any accompanying reasons or notes. This is the decision being reviewed by the Federal Court.', description_fr: 'Téléversez la lettre de décision ou de refus complète d\'IRCC que vous contestez. Incluez toutes les pages et les raisons ou notes accompagnantes.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Global Case Management System (GCMS) Notes', description: 'Upload your GCMS notes obtained through an Access to Information and Privacy (ATIP) request. These notes contain the officer\'s internal processing notes and reasoning for the decision. If not yet obtained, your lawyer will advise on the ATIP request process.', description_fr: 'Téléversez vos notes du SMGC obtenues par une demande d\'accès à l\'information et de protection des renseignements personnels (AIPRP).', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Original Application Package (as submitted to IRCC)', description: 'Upload a complete copy of the original application that was refused. Include all forms, supporting documents, cover letter, and anything else that was submitted. This allows the court to review what the officer had before them.', description_fr: 'Téléversez une copie complète de la demande originale qui a été refusée. Incluez tous les formulaires, documents à l\'appui, lettre de présentation.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Applicant\'s Affidavit', description: 'Upload a sworn affidavit from the applicant setting out the facts relevant to the judicial review. Your lawyer will prepare or help you draft this document. It must be signed before a commissioner of oaths or notary public.', description_fr: 'Téléversez un affidavit assermenté du demandeur exposant les faits pertinents à la révision judiciaire. Votre avocat préparera ou vous aidera à rédiger ce document.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Valid Passport  -  Bio Page', description: 'Upload a clear scan of your passport bio/data page showing your full name, date of birth, nationality, and passport number.', description_fr: 'Téléversez une copie claire de la page bio de votre passeport montrant votre nom complet, date de naissance, nationalité et numéro de passeport.', category: 'identity', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'New or Updated Supporting Evidence', description: 'Upload any new evidence that was not part of the original application, or updated evidence that strengthens your case. This may include: new employment letters, updated financial documents, relationship evidence, or expert opinions.', description_fr: 'Téléversez toute nouvelle preuve qui ne faisait pas partie de la demande originale, ou des preuves mises à jour qui renforcent votre dossier.', category: 'other', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Country Condition Reports (if applicable)', description: 'If the decision involved risk assessment or refugee issues, upload current country condition reports from authoritative sources (UNHCR, Amnesty International, Human Rights Watch, US State Department).', description_fr: 'Si la décision impliquait une évaluation des risques, téléversez des rapports actuels sur les conditions du pays de sources autorisées.', category: 'other', person_role_scope: null, is_required: false, accepted_file_types: DEFAULT_FILE_TYPES },
  { slot_name: 'Previous IRCC Correspondence', description: 'Upload any other correspondence with IRCC related to this matter: procedural fairness letters, requests for additional documents, previous approvals, or any communication between you and the immigration office.', description_fr: 'Téléversez toute autre correspondance avec IRCC liée à cette affaire.', category: 'other', person_role_scope: 'principal_applicant', is_required: true, accepted_file_types: DEFAULT_FILE_TYPES },
]

// ============================================================================
// COMBINED VISITOR VISA + EXTENSION PRESET
// (Matches "Visitor Visa / Extension" case type)
// ============================================================================

export const VISITOR_VISA_EXTENSION_COMBINED_PRESETS: SlotPreset[] = [
  ...VISITOR_VISA_PRESETS,
  // Add extension-specific documents that aren't duplicates
  {
    slot_name: 'Current Visa / Permit  -  Copy (for extensions)',
    description: 'If extending your stay, upload a copy of your current Canadian visa, visitor record, or permit showing your current authorised status and expiry date. If you have a visitor record (IMM 1442) issued at the port of entry, include that as well.',
    description_fr: 'Si vous prolongez votre séjour, téléversez une copie de votre visa canadien actuel, fiche de visiteur ou permis montrant votre statut autorisé actuel et sa date d\'expiration.',
    category: 'identity', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'Purpose of Extension Statement (for extensions)',
    description: 'If extending your stay, write and upload a signed letter explaining why you need to extend, what you have been doing, your updated plans, your new departure date, and confirmation you will leave by the requested date.',
    description_fr: 'Si vous prolongez votre séjour, rédigez et téléversez une lettre signée expliquant pourquoi vous devez prolonger, ce que vous avez fait, vos plans mis à jour et votre nouvelle date de départ.',
    category: 'other', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: DEFAULT_FILE_TYPES,
  },
  {
    slot_name: 'IMM 5708  -  Application to Extend Stay (for extensions)',
    description: 'If extending your stay, download and complete IRCC form IMM 5708 (Application to Change Conditions, Extend my Stay, or Remain in Canada as a Visitor).',
    description_fr: 'Si vous prolongez votre séjour, téléchargez et remplissez le formulaire IRCC IMM 5708.',
    category: 'general', person_role_scope: 'principal_applicant', is_required: false, accepted_file_types: PDF_ONLY,
  },
]

// ============================================================================
// Preset metadata for the UI
// ============================================================================
// These labels match the immigration_case_types in the database exactly.

export const DOCUMENT_PRESETS = [
  {
    id: 'express_entry_pr',
    label: 'Express Entry PR',
    description: 'Document requirements for Express Entry Permanent Residence (Federal Skilled Worker, CEC, Federal Skilled Trades, PNP)',
    presets: PERMANENT_RESIDENCE_PRESETS,
  },
  {
    id: 'spousal_sponsorship',
    label: 'Spousal Sponsorship',
    description: 'Document requirements for sponsoring a spouse or partner for permanent residence in Canada',
    presets: SPOUSAL_SPONSORSHIP_PRESETS,
  },
  {
    id: 'work_permit',
    label: 'Work Permit',
    description: 'Document requirements for a Canadian work permit (LMIA-based or LMIA-exempt)',
    presets: WORK_PERMIT_PRESETS,
  },
  {
    id: 'study_permit',
    label: 'Study Permit',
    description: 'Document requirements for a Canadian study permit at a Designated Learning Institution',
    presets: STUDY_PERMIT_PRESETS,
  },
  {
    id: 'visitor_visa_extension',
    label: 'Visitor Visa / Extension',
    description: 'Document requirements for a visitor visa (TRV) or extending visitor status in Canada',
    presets: VISITOR_VISA_EXTENSION_COMBINED_PRESETS,
  },
  {
    id: 'refugee_claim',
    label: 'Refugee Claim',
    description: 'Document requirements for a refugee protection claim in Canada',
    presets: REFUGEE_CLAIM_PRESETS,
  },
  {
    id: 'judicial_review',
    label: 'Judicial Review',
    description: 'Document requirements for a Federal Court judicial review of an IRCC decision',
    presets: JUDICIAL_REVIEW_PRESETS,
  },
  {
    id: 'citizenship',
    label: 'Citizenship',
    description: 'Document requirements for a Canadian citizenship application',
    presets: CITIZENSHIP_PRESETS,
  },
  {
    id: 'lmia',
    label: 'LMIA (Employer)',
    description: 'Document requirements for an employer\'s Labour Market Impact Assessment application',
    presets: LMIA_PRESETS,
  },
] as const
