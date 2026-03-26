/**
 * Canadian National Occupational Classification (NOC) 2021 Codes
 *
 * This module provides a comprehensive database of NOC codes used in
 * Canadian immigration applications (Express Entry, LMIA, work permits).
 *
 * NOC 2021 uses 5-digit codes and the TEER (Training, Education,
 * Experience, and Responsibilities) category system:
 *
 *   TEER 0  -  Management occupations
 *   TEER 1  -  Occupations usually requiring a university degree
 *   TEER 2  -  Occupations usually requiring a college diploma or apprenticeship (2+ years)
 *   TEER 3  -  Occupations usually requiring a college diploma or apprenticeship (< 2 years)
 *   TEER 4  -  Occupations usually requiring a high school diploma or on-the-job training
 *   TEER 5  -  Occupations usually requiring short work demonstration or on-the-job training
 */

export interface NocCode {
  /** 5-digit NOC 2021 code */
  code: string;
  /** Official occupation title */
  title: string;
  /** TEER category (0-5) */
  teer: number;
}

export const NOC_CODES: readonly NocCode[] = [
  // ---------------------------------------------------------------------------
  // TEER 0  -  Management occupations
  // ---------------------------------------------------------------------------
  { code: "00010", title: "Legislators", teer: 0 },
  { code: "00011", title: "Senior government managers and officials", teer: 0 },
  { code: "00012", title: "Senior managers - financial, communications and other business services", teer: 0 },
  { code: "00013", title: "Senior managers - trade, broadcasting and other services", teer: 0 },
  { code: "00015", title: "Senior managers - construction, transportation, production and utilities", teer: 0 },
  { code: "10010", title: "Financial managers", teer: 0 },
  { code: "10011", title: "Human resources managers", teer: 0 },
  { code: "10012", title: "Purchasing managers", teer: 0 },
  { code: "10019", title: "Other administrative services managers", teer: 0 },
  { code: "10020", title: "Insurance, real estate and financial brokerage managers", teer: 0 },
  { code: "10021", title: "Banking, credit and other investment managers", teer: 0 },
  { code: "10022", title: "Advertising, marketing and public relations managers", teer: 0 },
  { code: "10029", title: "Other business services managers", teer: 0 },
  { code: "20010", title: "Engineering managers", teer: 0 },
  { code: "20011", title: "Architecture and science managers", teer: 0 },
  { code: "20012", title: "Computer and information systems managers", teer: 0 },
  { code: "30010", title: "Managers in health care", teer: 0 },
  { code: "40010", title: "Government managers - health and social policy development and program administration", teer: 0 },
  { code: "40011", title: "Government managers - economic analysis, policy development and program administration", teer: 0 },
  { code: "40012", title: "Government managers - education policy development and program administration", teer: 0 },
  { code: "40020", title: "Administrators - post-secondary education and vocational training", teer: 0 },
  { code: "40021", title: "School principals and administrators of elementary and secondary education", teer: 0 },
  { code: "40030", title: "Managers in social, community and correctional services", teer: 0 },
  { code: "50010", title: "Library, archive, museum and art gallery managers", teer: 0 },
  { code: "50011", title: "Managers - publishing, motion pictures, broadcasting and performing arts", teer: 0 },
  { code: "50012", title: "Recreation, sports and fitness program and service directors", teer: 0 },
  { code: "60010", title: "Corporate sales managers", teer: 0 },
  { code: "60020", title: "Retail and wholesale trade managers", teer: 0 },
  { code: "60030", title: "Restaurant and food service managers", teer: 0 },
  { code: "60031", title: "Accommodation service managers", teer: 0 },
  { code: "60040", title: "Managers in customer and personal services", teer: 0 },
  { code: "70010", title: "Construction managers", teer: 0 },
  { code: "70011", title: "Home building and renovation managers", teer: 0 },
  { code: "70012", title: "Facility operation and maintenance managers", teer: 0 },
  { code: "70020", title: "Managers in transportation", teer: 0 },
  { code: "80010", title: "Managers in natural resources production and fishing", teer: 0 },
  { code: "80020", title: "Managers in agriculture", teer: 0 },
  { code: "80021", title: "Managers in horticulture", teer: 0 },
  { code: "90010", title: "Manufacturing managers", teer: 0 },
  { code: "90011", title: "Utilities managers", teer: 0 },

  // ---------------------------------------------------------------------------
  // TEER 1  -  Occupations usually requiring a university degree
  // ---------------------------------------------------------------------------
  { code: "11100", title: "Financial auditors and accountants", teer: 1 },
  { code: "11101", title: "Financial and investment analysts", teer: 1 },
  { code: "11102", title: "Financial advisors", teer: 1 },
  { code: "11109", title: "Other financial officers", teer: 1 },
  { code: "11200", title: "Human resources professionals", teer: 1 },
  { code: "11201", title: "Professional occupations in business management consulting", teer: 1 },
  { code: "11202", title: "Professional occupations in advertising, marketing and public relations", teer: 1 },
  { code: "12010", title: "Supervisors, general office and administrative support workers", teer: 1 },
  { code: "12011", title: "Supervisors, finance, insurance and related administrative workers", teer: 1 },
  { code: "12013", title: "Supervisors, library, correspondence and related information workers", teer: 1 },
  { code: "12100", title: "Specialists in human resources", teer: 1 },
  { code: "12101", title: "Specialists in business management consulting", teer: 1 },
  { code: "21100", title: "Physicists and astronomers", teer: 1 },
  { code: "21101", title: "Chemists", teer: 1 },
  { code: "21102", title: "Geoscientists and oceanographers", teer: 1 },
  { code: "21110", title: "Biologists and related scientists", teer: 1 },
  { code: "21200", title: "Architects", teer: 1 },
  { code: "21201", title: "Landscape architects", teer: 1 },
  { code: "21202", title: "Urban and land use planners", teer: 1 },
  { code: "21203", title: "Land surveyors", teer: 1 },
  { code: "21210", title: "Mathematicians, statisticians and actuaries", teer: 1 },
  { code: "21211", title: "Data scientists", teer: 1 },
  { code: "21220", title: "Cybersecurity specialists", teer: 1 },
  { code: "21221", title: "Business systems specialists", teer: 1 },
  { code: "21222", title: "Information systems specialists", teer: 1 },
  { code: "21223", title: "Database analysts and data administrators", teer: 1 },
  { code: "21230", title: "Computer systems developers and programmers", teer: 1 },
  { code: "21231", title: "Software engineers and designers", teer: 1 },
  { code: "21232", title: "Software developers and programmers", teer: 1 },
  { code: "21233", title: "Web designers", teer: 1 },
  { code: "21234", title: "Web developers and programmers", teer: 1 },
  { code: "21300", title: "Civil engineers", teer: 1 },
  { code: "21301", title: "Mechanical engineers", teer: 1 },
  { code: "21310", title: "Electrical and electronics engineers", teer: 1 },
  { code: "21311", title: "Computer engineers (except software engineers and designers)", teer: 1 },
  { code: "21320", title: "Chemical engineers", teer: 1 },
  { code: "21321", title: "Industrial and manufacturing engineers", teer: 1 },
  { code: "21322", title: "Metallurgical and materials engineers", teer: 1 },
  { code: "21330", title: "Mining engineers", teer: 1 },
  { code: "21331", title: "Geological engineers", teer: 1 },
  { code: "21332", title: "Petroleum engineers", teer: 1 },
  { code: "21340", title: "Aerospace engineers", teer: 1 },
  { code: "21399", title: "Other professional engineers", teer: 1 },
  { code: "31100", title: "Specialists in clinical and laboratory medicine", teer: 1 },
  { code: "31101", title: "Specialists in surgery", teer: 1 },
  { code: "31102", title: "General practitioners and family physicians", teer: 1 },
  { code: "31110", title: "Dentists", teer: 1 },
  { code: "31111", title: "Veterinarians", teer: 1 },
  { code: "31112", title: "Optometrists", teer: 1 },
  { code: "31113", title: "Chiropractors", teer: 1 },
  { code: "31120", title: "Pharmacists", teer: 1 },
  { code: "31121", title: "Dietitians and nutritionists", teer: 1 },
  { code: "31200", title: "Psychologists", teer: 1 },
  { code: "31201", title: "Social workers", teer: 1 },
  { code: "31202", title: "Physiotherapists", teer: 1 },
  { code: "31203", title: "Occupational therapists", teer: 1 },
  { code: "31204", title: "Kinesiologists and other professional occupations in therapy", teer: 1 },
  { code: "31209", title: "Other professional occupations in health diagnosing and treating", teer: 1 },
  { code: "31300", title: "Nursing coordinators and supervisors", teer: 1 },
  { code: "31301", title: "Registered nurses and registered psychiatric nurses", teer: 1 },
  { code: "31302", title: "Nurse practitioners", teer: 1 },
  { code: "31303", title: "Physician assistants, midwives and allied health professionals", teer: 1 },
  { code: "33100", title: "Dental hygienists and dental therapists", teer: 1 },
  { code: "33101", title: "Medical laboratory technologists", teer: 1 },
  { code: "33103", title: "Respiratory therapists, clinical perfusionists and cardiopulmonary technologists", teer: 1 },
  { code: "41100", title: "Judges", teer: 1 },
  { code: "41101", title: "Lawyers and Quebec notaries", teer: 1 },
  { code: "41200", title: "University professors and lecturers", teer: 1 },
  { code: "41201", title: "Post-secondary teaching and research assistants", teer: 1 },
  { code: "41210", title: "College and other vocational instructors", teer: 1 },
  { code: "41220", title: "Secondary school teachers", teer: 1 },
  { code: "41221", title: "Elementary school and kindergarten teachers", teer: 1 },
  { code: "41300", title: "Social workers", teer: 1 },
  { code: "41301", title: "Therapists in counselling and related specialized therapies", teer: 1 },
  { code: "41400", title: "Natural and applied science policy researchers, consultants and program officers", teer: 1 },
  { code: "41401", title: "Economists and economic policy researchers and analysts", teer: 1 },
  { code: "41402", title: "Business development officers and research analysts", teer: 1 },
  { code: "41403", title: "Social policy researchers, consultants and program officers", teer: 1 },
  { code: "41404", title: "Health policy researchers, consultants and program officers", teer: 1 },
  { code: "41405", title: "Education policy researchers, consultants and program officers", teer: 1 },

  // ---------------------------------------------------------------------------
  // TEER 2  -  Occupations usually requiring a college diploma or apprenticeship (2+ years)
  // ---------------------------------------------------------------------------
  { code: "12200", title: "Accounting technicians and bookkeepers", teer: 2 },
  { code: "12201", title: "Insurance adjusters and claims examiners", teer: 2 },
  { code: "12202", title: "Insurance underwriters", teer: 2 },
  { code: "13100", title: "Administrative officers", teer: 2 },
  { code: "13101", title: "Property administrators", teer: 2 },
  { code: "13110", title: "Administrative assistants", teer: 2 },
  { code: "13111", title: "Legal administrative assistants", teer: 2 },
  { code: "13112", title: "Medical administrative assistants", teer: 2 },
  { code: "21120", title: "Forestry professionals", teer: 2 },
  { code: "22100", title: "Chemical technologists and technicians", teer: 2 },
  { code: "22101", title: "Geological and mineral technologists and technicians", teer: 2 },
  { code: "22110", title: "Biological technologists and technicians", teer: 2 },
  { code: "22210", title: "Architectural technologists and technicians", teer: 2 },
  { code: "22211", title: "Industrial designers", teer: 2 },
  { code: "22212", title: "Drafting technologists and technicians", teer: 2 },
  { code: "22220", title: "Computer network and web technicians", teer: 2 },
  { code: "22221", title: "User support technicians", teer: 2 },
  { code: "22222", title: "Information systems testing technicians", teer: 2 },
  { code: "22300", title: "Civil engineering technologists and technicians", teer: 2 },
  { code: "22301", title: "Mechanical engineering technologists and technicians", teer: 2 },
  { code: "22302", title: "Industrial engineering and manufacturing technologists and technicians", teer: 2 },
  { code: "22310", title: "Electrical and electronics engineering technologists and technicians", teer: 2 },
  { code: "32100", title: "Opticians", teer: 2 },
  { code: "32101", title: "Licensed practical nurses", teer: 2 },
  { code: "32102", title: "Paramedical occupations", teer: 2 },
  { code: "32103", title: "Respiratory therapists and clinical perfusionists", teer: 2 },
  { code: "32104", title: "Pharmacy technicians", teer: 2 },
  { code: "32109", title: "Other technical occupations in therapy and assessment", teer: 2 },
  { code: "32110", title: "Denturists", teer: 2 },
  { code: "32111", title: "Dental hygienists and dental therapists", teer: 2 },
  { code: "32120", title: "Dental technologists and technicians", teer: 2 },
  { code: "42100", title: "Police officers (except commissioned)", teer: 2 },
  { code: "42200", title: "Paralegal and related occupations", teer: 2 },
  { code: "42201", title: "Social and community service workers", teer: 2 },
  { code: "42202", title: "Education and vocational counsellors", teer: 2 },
  { code: "42203", title: "Immigration, employment insurance and revenue officers", teer: 2 },
  { code: "43100", title: "Elementary and secondary school teacher assistants", teer: 2 },
  { code: "51100", title: "Librarians", teer: 2 },
  { code: "51111", title: "Journalists", teer: 2 },
  { code: "51112", title: "Technical writers", teer: 2 },
  { code: "51120", title: "Translators, terminologists and interpreters", teer: 2 },
  { code: "52100", title: "Authors and writers (except technical)", teer: 2 },
  { code: "52110", title: "Photographers", teer: 2 },
  { code: "52119", title: "Other creative designers and craftspersons", teer: 2 },
  { code: "52120", title: "Graphic designers and illustrators", teer: 2 },
  { code: "62020", title: "Food service supervisors", teer: 2 },
  { code: "62022", title: "Accommodation, travel, tourism and related services supervisors", teer: 2 },
  { code: "62100", title: "Technical sales specialists - wholesale trade", teer: 2 },
  { code: "62200", title: "Chefs", teer: 2 },
  { code: "63200", title: "Cooks", teer: 2 },

  // ---------------------------------------------------------------------------
  // TEER 3  -  Occupations usually requiring a college diploma or apprenticeship (< 2 years)
  // ---------------------------------------------------------------------------
  { code: "13200", title: "Customs brokers", teer: 3 },
  { code: "13201", title: "Production and transportation logistics coordinators", teer: 3 },
  { code: "14100", title: "General office support workers", teer: 3 },
  { code: "14101", title: "Receptionists", teer: 3 },
  { code: "14110", title: "Data entry clerks", teer: 3 },
  { code: "14200", title: "Accounting and related clerks", teer: 3 },
  { code: "14201", title: "Banking, insurance and other financial clerks", teer: 3 },
  { code: "14300", title: "Shippers and receivers", teer: 3 },
  { code: "14301", title: "Storekeepers and partspersons", teer: 3 },
  { code: "33102", title: "Medical laboratory assistants and related technical occupations", teer: 3 },
  { code: "33109", title: "Other assisting occupations in support of health services", teer: 3 },
  { code: "34100", title: "Animal care workers and veterinary assistants", teer: 3 },
  { code: "34101", title: "Dental assistants and dental laboratory assistants", teer: 3 },
  { code: "34102", title: "Nurse aides, orderlies and patient service associates", teer: 3 },
  { code: "44100", title: "Home support workers, housekeepers and related occupations", teer: 3 },
  { code: "44101", title: "Visiting homemakers, housekeepers and related occupations", teer: 3 },
  { code: "63100", title: "Insurance agents and brokers", teer: 3 },
  { code: "63102", title: "Real estate agents and salespersons", teer: 3 },
  { code: "64100", title: "Retail salespersons and visual merchandisers", teer: 3 },
  { code: "64101", title: "Cashiers", teer: 3 },
  { code: "64200", title: "Tailors, dressmakers, furriers and milliners", teer: 3 },
  { code: "64201", title: "Shoe repairers and shoemakers", teer: 3 },
  { code: "64300", title: "Butchers - retail and wholesale", teer: 3 },
  { code: "64301", title: "Bakers", teer: 3 },
  { code: "64409", title: "Other customer and information services representatives", teer: 3 },
  { code: "64410", title: "Security guards and related security service occupations", teer: 3 },
  { code: "72010", title: "Contractors and supervisors, machining, metal forming, shaping and erecting trades", teer: 3 },
  { code: "72011", title: "Contractors and supervisors, electrical trades and telecommunications occupations", teer: 3 },
  { code: "72012", title: "Contractors and supervisors, pipefitting trades", teer: 3 },
  { code: "72013", title: "Contractors and supervisors, carpentry trades", teer: 3 },
  { code: "72014", title: "Contractors and supervisors, other construction trades, installers, repairers and servicers", teer: 3 },
  { code: "72020", title: "Contractors and supervisors, mechanic trades", teer: 3 },
  { code: "72021", title: "Contractors and supervisors, heavy equipment operator crews", teer: 3 },
  { code: "72100", title: "Machinists and machining and tooling inspectors", teer: 3 },
  { code: "72101", title: "Tool and die makers", teer: 3 },
  { code: "72102", title: "Sheet metal workers", teer: 3 },
  { code: "72103", title: "Boilermakers", teer: 3 },
  { code: "72104", title: "Structural metal and platework fabricators and fitters", teer: 3 },
  { code: "72105", title: "Ironworkers", teer: 3 },
  { code: "72106", title: "Welders and related machine operators", teer: 3 },
  { code: "72200", title: "Electricians (except industrial and power system)", teer: 3 },
  { code: "72201", title: "Industrial electricians", teer: 3 },
  { code: "72300", title: "Plumbers", teer: 3 },
  { code: "72301", title: "Steamfitters, pipefitters and sprinkler system installers", teer: 3 },
  { code: "72310", title: "Carpenters", teer: 3 },
  { code: "72320", title: "Bricklayers", teer: 3 },
  { code: "72400", title: "Construction millwrights and industrial mechanics", teer: 3 },
  { code: "72401", title: "Heavy-duty equipment mechanics", teer: 3 },
  { code: "72410", title: "Automotive service technicians, truck and bus mechanics and mechanical repairers", teer: 3 },
  { code: "72500", title: "Crane operators", teer: 3 },
  { code: "73100", title: "Concrete finishers", teer: 3 },
  { code: "73101", title: "Tilesetters", teer: 3 },
  { code: "73102", title: "Plasterers, drywall installers and finishers and lathers", teer: 3 },
  { code: "73110", title: "Heavy equipment operators", teer: 3 },
  { code: "73200", title: "Residential and commercial installers and servicers", teer: 3 },
  { code: "73201", title: "Painters and decorators (except interior decorators)", teer: 3 },
  { code: "73300", title: "Transport truck drivers", teer: 3 },
  { code: "73301", title: "Bus drivers, subway operators and other transit operators", teer: 3 },
  { code: "73400", title: "Drilling and blasting", teer: 3 },

  // ---------------------------------------------------------------------------
  // TEER 4  -  Occupations usually requiring a high school diploma
  // ---------------------------------------------------------------------------
  { code: "44200", title: "Early childhood educators and assistants", teer: 4 },
  { code: "65100", title: "Cashiers", teer: 4 },
  { code: "65101", title: "Store shelf stockers, clerks and order fillers", teer: 4 },
  { code: "65102", title: "Other sales related occupations", teer: 4 },
  { code: "65200", title: "Food counter attendants, kitchen helpers and related support occupations", teer: 4 },
  { code: "65201", title: "Food and beverage servers", teer: 4 },
  { code: "65202", title: "Bartenders", teer: 4 },
  { code: "65210", title: "Other service support occupations", teer: 4 },
  { code: "65310", title: "Light duty cleaners", teer: 4 },
  { code: "65311", title: "Specialized cleaners", teer: 4 },
  { code: "65312", title: "Janitors, caretakers and building superintendents", teer: 4 },
  { code: "65320", title: "Dry cleaning, laundry and related occupations", teer: 4 },
  { code: "74100", title: "Mail and message carriers and postal clerks", teer: 4 },
  { code: "74101", title: "Letter carriers", teer: 4 },
  { code: "74200", title: "Railway yard and track maintenance workers", teer: 4 },
  { code: "74205", title: "Other transport equipment operators and related maintenance workers", teer: 4 },
  { code: "75100", title: "Delivery service drivers and door-to-door distributors", teer: 4 },
  { code: "75101", title: "Taxi and limousine drivers and chauffeurs", teer: 4 },
  { code: "85100", title: "Livestock labourers", teer: 4 },
  { code: "85101", title: "Harvesting labourers", teer: 4 },
  { code: "85103", title: "Nursery and greenhouse labourers", teer: 4 },
  { code: "86100", title: "Logging and forestry labourers", teer: 4 },
  { code: "95100", title: "Labourers in food and beverage processing", teer: 4 },
  { code: "95101", title: "Labourers in fish and seafood processing", teer: 4 },
  { code: "95109", title: "Other labourers in processing, manufacturing and utilities", teer: 4 },

  // ---------------------------------------------------------------------------
  // TEER 5  -  Occupations usually requiring short work demonstration or on-the-job training
  // ---------------------------------------------------------------------------
  { code: "75110", title: "Landscaping and grounds maintenance labourers", teer: 5 },
  { code: "75200", title: "Logging and forestry labourers", teer: 5 },
  { code: "75201", title: "Aquaculture and marine harvest labourers", teer: 5 },
  { code: "75210", title: "Mining and quarrying labourers", teer: 5 },
  { code: "75211", title: "Oil and gas drilling, servicing and related labourers", teer: 5 },
  { code: "76200", title: "Public works and other labourers", teer: 5 },
  { code: "76210", title: "Construction trades helpers and labourers", teer: 5 },
  { code: "85110", title: "Mine labourers", teer: 5 },
  { code: "86101", title: "Fishing vessel deckhands", teer: 5 },
  { code: "96100", title: "Labourers in textile processing and cutting", teer: 5 },
] as const;

/**
 * Look up the occupation title for a given NOC code.
 *
 * @param code - 5-digit NOC 2021 code
 * @returns The occupation title, or `undefined` if the code is not found
 */
export function getNocTitle(code: string): string | undefined {
  return NOC_CODES.find((entry) => entry.code === code)?.title;
}

/**
 * Look up the TEER level for a given NOC code.
 *
 * @param code - 5-digit NOC 2021 code
 * @returns The TEER level (0-5), or `undefined` if the code is not found
 */
export function getNocTeer(code: string): number | undefined {
  return NOC_CODES.find((entry) => entry.code === code)?.teer;
}
