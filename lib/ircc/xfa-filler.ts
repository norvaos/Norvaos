/**
 * IRCC XFA PDF Filler — fills XFA-based IRCC form PDFs with client profile data.
 *
 * Official IRCC PDFs (IMM 5257, IMM 5406) use XFA (XML Forms Architecture) which
 * stores form data in embedded XML streams, not standard AcroForm fields.
 *
 * This module:
 * 1. Opens the PDF binary
 * 2. Locates the XFA datasets XML stream
 * 3. Parses and fills the XML with client profile data
 * 4. Writes the modified XML back into the PDF
 *
 * Uses `pikepdf` (Python) for the low-level XFA stream manipulation via a
 * child process, since no Node.js library supports XFA natively.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { profilePathGet } from './questionnaire-engine'

const execFileAsync = promisify(execFile)

// ── XFA Field Mapping: Profile → XFA XML paths ──────────────────────────────

/** Maps IRCCProfile paths to XFA XML element paths for IMM 5406 */
const IMM5406_XFA_MAP: Record<string, string> = {
  // Section A — Applicant
  'personal.family_name': 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[0].Row.FamilyName',
  'personal.given_name': 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[0].Row.GivenNames',
  'personal.date_of_birth': 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[0].Row.DOB',
  'personal.place_of_birth_country': 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[1].Row.COB',
  'contact_info.mailing_address': 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[1].Row.Address',
  'marital.status': 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[1].Row.MaritalStatus',
  'contact_info.email': 'SectionA.SectionAinfo.Applicant.PaddedEntry.PersonalData[1].Row.Email',

  // Section A — Spouse
  'marital.spouse_family_name': 'SectionA.SectionAinfo.Spouse.PaddedEntry.PersonalData[0].Row.FamilyName',
  'marital.spouse_given_name': 'SectionA.SectionAinfo.Spouse.PaddedEntry.PersonalData[0].Row.GivenNames',
  'marital.spouse_date_of_birth': 'SectionA.SectionAinfo.Spouse.PaddedEntry.PersonalData[0].Row.DOB',

  // Section A — Mother (Parent1)
  'family.mother.family_name': 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[0].Row.FamilyName',
  'family.mother.given_name': 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[0].Row.GivenNames',
  'family.mother.date_of_birth': 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[0].Row.DOB',
  'family.mother.country_of_birth': 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[1].Row.COB',
  'family.mother.address': 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[1].Row.Address',
  'family.mother.marital_status': 'SectionA.SectionAinfo.Parent1.PaddedEntry.PersonalData[1].Row.MaritalStatus',

  // Section A — Father (Parent2)
  'family.father.family_name': 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[0].Row.FamilyName',
  'family.father.given_name': 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[0].Row.GivenNames',
  'family.father.date_of_birth': 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[0].Row.DOB',
  'family.father.country_of_birth': 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[1].Row.COB',
  'family.father.address': 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[1].Row.Address',
  'family.father.marital_status': 'SectionA.SectionAinfo.Parent2.PaddedEntry.PersonalData[1].Row.MaritalStatus',

  // Section D — Signature / Use of Representative
  '__signature': 'SectionD.Signature.Signature',
  '__signed_date': 'SectionD.Signature.SignedDate',
}

/** Maps IRCCProfile paths to XFA XML element paths for IMM 5257 */
const IMM5257_XFA_MAP: Record<string, string> = {
  // Page 1 — Personal Details
  'personal.family_name': 'Page1.PersonalDetails.Name.FamilyName',
  'personal.given_name': 'Page1.PersonalDetails.Name.GivenName',
  'personal.date_of_birth': 'Page1.PersonalDetails.DOB',
  'personal.place_of_birth_city': 'Page1.PersonalDetails.PlaceBirthCity',
  'personal.place_of_birth_country': 'Page1.PersonalDetails.PlaceBirthCountry',
  'personal.citizenship': 'Page1.PersonalDetails.Citizenship.Citizenship',
  'personal.current_country_of_residence': 'Page1.PersonalDetails.CurrentCOR.Row2.Country',
  'personal.residence_status': 'Page1.PersonalDetails.CurrentCOR.Row2.Status',
  'visit.visa_type': 'Page1.PersonalDetails.VisaType.VisaType',

  // Page 1 — Marital Status
  'marital.status': 'Page1.MaritalStatus.SectionA.MaritalStatus',
  'marital.date_of_current_relationship': 'Page1.MaritalStatus.SectionA.DateOfMarriage',
  'marital.spouse_family_name': 'Page1.MaritalStatus.SectionA.FamilyName',
  'marital.spouse_given_name': 'Page1.MaritalStatus.SectionA.GivenName',

  // Page 2 — Passport
  'passport.number': 'Page2.MaritalStatus.SectionA.Passport.PassportNum.PassportNum',
  'passport.country_of_issue': 'Page2.MaritalStatus.SectionA.Passport.CountryofIssue.CountryofIssue',
  'passport.issue_date': 'Page2.MaritalStatus.SectionA.Passport.IssueDate.IssueDate',
  'passport.expiry_date': 'Page2.MaritalStatus.SectionA.Passport.ExpiryDate',

  // Page 2 — Language
  'language.native_language': 'Page2.MaritalStatus.SectionA.Languages.languages.nativeLang.nativeLang',
  'language.preferred_language': 'Page2.MaritalStatus.SectionA.Languages.languages.ableToCommunicate.ableToCommunicate',

  // Page 2 — Contact Information
  'contact_info.mailing_address.apt_unit': 'Page2.ContactInformation.contact.AddressRow1.Apt.AptUnit',
  'contact_info.mailing_address.street_number': 'Page2.ContactInformation.contact.AddressRow1.StreetNum.StreetNum',
  'contact_info.mailing_address.street_name': 'Page2.ContactInformation.contact.AddressRow1.Streetname.Streetname',
  'contact_info.mailing_address.city': 'Page2.ContactInformation.contact.AddressRow2.CityTow.CityTown',
  'contact_info.mailing_address.country': 'Page2.ContactInformation.contact.AddressRow2.Country.Country',
  'contact_info.mailing_address.province_state': 'Page2.ContactInformation.contact.AddressRow2.ProvinceState.ProvinceState',
  'contact_info.mailing_address.postal_code': 'Page2.ContactInformation.contact.AddressRow2.PostalCode.PostalCode',
  'contact_info.email': 'Page2.ContactInformation.contact.FaxEmail.Email',

  // Page 3 — Details of Visit
  'visit.purpose': 'Page3.DetailsOfVisit.PurposeRow1.PurposeOfVisit.PurposeOfVisit',
  'visit.from_date': 'Page3.DetailsOfVisit.PurposeRow1.HowLongStay.FromDate',
  'visit.to_date': 'Page3.DetailsOfVisit.PurposeRow1.HowLongStay.ToDate',
  'visit.funds_available_cad': 'Page3.DetailsOfVisit.PurposeRow1.Funds.Funds',
}

// ── XFA Data Map for array fields (children, siblings) ───────────────────────

interface XFAArrayMapping {
  /** Profile path to the array (e.g. "family.children") */
  profilePath: string
  /** XFA parent path containing repeated elements */
  xfaBasePath: string
  /** XFA element name for each entry */
  xfaEntryName: string
  /** Sub-field mappings within each entry */
  subFields: Record<string, string>
}

const IMM5406_ARRAY_MAPS: XFAArrayMapping[] = [
  {
    profilePath: 'family.children',
    xfaBasePath: 'SectionB.SectionBinfo',
    xfaEntryName: 'Child',
    subFields: {
      'family_name': 'PaddedEntry.PersonalData[0].Row.FamilyName',
      'given_name': 'PaddedEntry.PersonalData[0].Row.GivenNames',
      'date_of_birth': 'PaddedEntry.PersonalData[0].Row.DOB',
      'relationship': 'PaddedEntry.PersonalData[0].Row.Relationship',
      'country_of_birth': 'PaddedEntry.PersonalData[1].Row.COB',
      'address': 'PaddedEntry.PersonalData[1].Row.Address',
      'marital_status': 'PaddedEntry.PersonalData[1].Row.MaritalStatus',
    },
  },
  {
    profilePath: 'family.siblings',
    xfaBasePath: 'SectionC.SectionCinfo',
    xfaEntryName: 'Sibling',
    subFields: {
      'family_name': 'PaddedEntry.PersonalData[0].Row.FamilyName',
      'given_name': 'PaddedEntry.PersonalData[0].Row.GivenNames',
      'date_of_birth': 'PaddedEntry.PersonalData[0].Row.DOB',
      'relationship': 'PaddedEntry.PersonalData[0].Row.Relationship',
      'country_of_birth': 'PaddedEntry.PersonalData[1].Row.COB',
      'address': 'PaddedEntry.PersonalData[1].Row.Address',
      'marital_status': 'PaddedEntry.PersonalData[1].Row.MaritalStatus',
    },
  },
]

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fill an XFA-based IRCC PDF with client profile data.
 * Uses Python/pikepdf for the actual PDF manipulation.
 *
 * @param pdfPath - Path to the blank XFA PDF template
 * @param profile - Client's IRCCProfile data (from contacts.immigration_data)
 * @param formCode - 'IMM5257' or 'IMM5406'
 * @param representativeName - Optional representative name for the signature section
 *
 * Returns the filled PDF bytes, or null if filling fails.
 */
export async function fillXFAForm(
  pdfPath: string,
  profile: Record<string, unknown>,
  formCode: string,
  representativeName?: string,
): Promise<Uint8Array | null> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'ircc-xfa-'))
  const inputPath = join(tmpDir, 'input.pdf')
  const outputPath = join(tmpDir, 'output.pdf')
  const dataPath = join(tmpDir, 'field_data.json')

  try {
    // 1. Copy the blank PDF to tmp
    const pdfBytes = await readFile(pdfPath)
    await writeFile(inputPath, pdfBytes)

    // 2. Build the field data JSON for the Python script
    const fieldMap = formCode === 'IMM5406' ? IMM5406_XFA_MAP : IMM5257_XFA_MAP
    const arrayMaps = formCode === 'IMM5406' ? IMM5406_ARRAY_MAPS : []
    const rootElement = formCode === 'IMM5406' ? 'IMM_5406' : 'form1'

    const scalarFields: Record<string, string> = {}
    for (const [profilePath, xfaPath] of Object.entries(fieldMap)) {
      // Handle special meta-fields (not from the profile)
      if (profilePath === '__signature') {
        if (representativeName) {
          scalarFields[xfaPath] = representativeName
        }
        continue
      }
      if (profilePath === '__signed_date') {
        // Always use today's date
        scalarFields[xfaPath] = new Date().toISOString().split('T')[0]
        continue
      }

      const value = profilePathGet(profile, profilePath)
      if (value == null || value === '') continue

      // Format the value for XFA
      let strValue: string
      if (typeof value === 'boolean') {
        strValue = value ? 'Yes' : 'No'
      } else if (typeof value === 'number') {
        strValue = String(value)
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Address objects → concatenate non-empty fields
        const parts = Object.values(value as Record<string, unknown>)
          .filter((v) => v != null && v !== '')
          .map(String)
        strValue = parts.join(', ')
      } else {
        strValue = String(value)
      }

      if (strValue) {
        scalarFields[xfaPath] = strValue
      }
    }

    // Build array field data
    const arrayData: Array<{
      basePath: string
      entryName: string
      entries: Array<Record<string, string>>
    }> = []

    for (const arrayMap of arrayMaps) {
      const arr = profilePathGet(profile, arrayMap.profilePath)
      if (!Array.isArray(arr) || arr.length === 0) continue

      const entries: Array<Record<string, string>> = []
      for (const item of arr) {
        if (typeof item !== 'object' || item === null) continue
        const entry: Record<string, string> = {}
        for (const [subKey, xfaSubPath] of Object.entries(arrayMap.subFields)) {
          const val = (item as Record<string, unknown>)[subKey]
          if (val != null && val !== '') {
            entry[xfaSubPath] = String(val)
          }
        }
        if (Object.keys(entry).length > 0) {
          entries.push(entry)
        }
      }

      if (entries.length > 0) {
        arrayData.push({
          basePath: arrayMap.xfaBasePath,
          entryName: arrayMap.xfaEntryName,
          entries,
        })
      }
    }

    const fieldData = {
      rootElement,
      scalarFields,
      arrayData,
    }

    await writeFile(dataPath, JSON.stringify(fieldData, null, 2))

    // 3. Run the Python script to fill the XFA fields
    const pythonScript = buildXFAPythonScript()
    const scriptPath = join(tmpDir, 'fill_xfa.py')
    await writeFile(scriptPath, pythonScript)

    await execFileAsync('python3', [scriptPath, inputPath, outputPath, dataPath], {
      timeout: 30000,
    })

    // 4. Read the output PDF
    const filledPdf = await readFile(outputPath)
    return new Uint8Array(filledPdf)
  } catch (error) {
    console.error('[xfa-filler] Error filling XFA form:', error)
    return null
  } finally {
    // Cleanup temp files
    try {
      await unlink(inputPath).catch(() => {})
      await unlink(outputPath).catch(() => {})
      await unlink(dataPath).catch(() => {})
      await unlink(join(tmpDir, 'fill_xfa.py')).catch(() => {})
      // Remove the temp directory
      const { rmdir } = await import('fs/promises')
      await rmdir(tmpDir).catch(() => {})
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ── Python Script Generator ──────────────────────────────────────────────────

function buildXFAPythonScript(): string {
  return `#!/usr/bin/env python3
"""
Fill XFA form fields in a PDF using pikepdf.

Usage: python3 fill_xfa.py <input.pdf> <output.pdf> <field_data.json>

The field_data.json contains:
{
  "rootElement": "IMM_5406" or "form1",
  "scalarFields": { "XFA.Path.To.Field": "value", ... },
  "arrayData": [
    {
      "basePath": "SectionB.SectionBinfo",
      "entryName": "Child",
      "entries": [
        { "PaddedEntry.PersonalData[0].Row.FamilyName": "Smith", ... },
        ...
      ]
    }
  ]
}
"""
import sys
import json
import re
import pikepdf
import xml.etree.ElementTree as ET

def parse_xfa_path(path):
    """Parse an XFA path like 'SectionA.Row[1].Field' into segments."""
    segments = []
    for part in path.split('.'):
        match = re.match(r'(\\w+)\\[(\\d+)\\]', part)
        if match:
            segments.append((match.group(1), int(match.group(2))))
        else:
            segments.append((part, 0))
    return segments

def find_or_create_element(parent, tag_name, index=0):
    """Find the nth element with tag_name under parent, or create it."""
    # Strip namespace for matching
    matches = []
    for child in parent:
        local_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if local_tag == tag_name:
            matches.append(child)

    while len(matches) <= index:
        new_elem = ET.SubElement(parent, tag_name)
        matches.append(new_elem)

    return matches[index]

def set_xfa_value(root, path_segments, value):
    """Navigate the XFA XML tree and set a field value."""
    current = root
    for tag_name, index in path_segments:
        current = find_or_create_element(current, tag_name, index)
    current.text = value

def main():
    if len(sys.argv) != 4:
        print("Usage: fill_xfa.py <input.pdf> <output.pdf> <field_data.json>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    data_path = sys.argv[3]

    with open(data_path, 'r') as f:
        field_data = json.load(f)

    root_element = field_data['rootElement']
    scalar_fields = field_data.get('scalarFields', {})
    array_data = field_data.get('arrayData', [])

    if not scalar_fields and not array_data:
        # No data to fill — just copy the PDF
        import shutil
        shutil.copy2(input_path, output_path)
        return

    # Open PDF
    pdf = pikepdf.open(input_path)
    acroform = pdf.Root.get('/AcroForm')
    if acroform is None:
        print("No AcroForm found")
        sys.exit(1)

    xfa = acroform.get('/XFA')
    if xfa is None:
        print("No XFA entry found")
        sys.exit(1)

    # Find the datasets stream
    items = list(xfa)
    datasets_index = None
    datasets_stream = None

    for i in range(0, len(items), 2):
        name = str(items[i])
        if name == 'datasets':
            datasets_index = i + 1
            datasets_stream = items[i + 1]
            break

    if datasets_stream is None:
        print("No datasets stream found")
        sys.exit(1)

    # Read and parse the datasets XML
    xml_bytes = bytes(datasets_stream)
    xml_text = xml_bytes.decode('utf-8', errors='replace')

    # Parse with namespace handling
    # Remove the xfa namespace prefix for easier manipulation
    # but keep it for reconstruction
    ET.register_namespace('xfa', 'http://www.xfa.org/schema/xfa-data/1.0/')
    tree_root = ET.fromstring(xml_text)

    # Find the data root element
    # The structure is: <xfa:datasets><xfa:data><ROOT_ELEMENT>...
    ns = {'xfa': 'http://www.xfa.org/schema/xfa-data/1.0/'}
    data_elem = tree_root.find('xfa:data', ns)
    if data_elem is None:
        # Try without namespace
        data_elem = tree_root.find('data')
    if data_elem is None:
        # The xfa:data might be a direct child
        for child in tree_root:
            local_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if local_tag == 'data':
                data_elem = child
                break

    if data_elem is None:
        print("No xfa:data element found in datasets")
        sys.exit(1)

    # Find the root form element (e.g., IMM_5406 or form1)
    form_root = None
    for child in data_elem:
        local_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if local_tag == root_element:
            form_root = child
            break

    if form_root is None:
        print(f"Root element '{root_element}' not found in datasets")
        sys.exit(1)

    # Find the page1 element (IMM5406 wraps everything in page1)
    page1 = None
    for child in form_root:
        local_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if local_tag == 'page1':
            page1 = child
            break

    # Use page1 if it exists, otherwise use form_root directly
    fill_root = page1 if page1 is not None else form_root

    # Fill scalar fields
    for xfa_path, value in scalar_fields.items():
        segments = parse_xfa_path(xfa_path)
        try:
            set_xfa_value(fill_root, segments, value)
        except Exception as e:
            print(f"Warning: Could not set {xfa_path}: {e}")

    # Fill array fields
    for arr in array_data:
        base_segments = parse_xfa_path(arr['basePath'])
        entry_name = arr['entryName']
        entries = arr['entries']

        # Navigate to the base element
        base_elem = fill_root
        for tag_name, index in base_segments:
            base_elem = find_or_create_element(base_elem, tag_name, index)

        # Find existing entry elements
        existing_entries = []
        for child in base_elem:
            local_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if local_tag == entry_name:
                existing_entries.append(child)

        # Fill each entry (up to the number of existing slots)
        for idx, entry_data in enumerate(entries):
            if idx < len(existing_entries):
                entry_elem = existing_entries[idx]
            else:
                # Create new entry element
                entry_elem = ET.SubElement(base_elem, entry_name)

            for sub_path, value in entry_data.items():
                segments = parse_xfa_path(sub_path)
                try:
                    set_xfa_value(entry_elem, segments, value)
                except Exception as e:
                    print(f"Warning: Could not set array field {sub_path}: {e}")

    # Serialize the modified XML back
    modified_xml = ET.tostring(tree_root, encoding='unicode', xml_declaration=False)
    # Add XML declaration
    modified_xml = '<?xml version="1.0" encoding="UTF-8"?>\\n' + modified_xml if not modified_xml.startswith('<?xml') else modified_xml
    modified_bytes = modified_xml.encode('utf-8')

    # Replace the datasets stream in the PDF
    new_stream = pikepdf.Stream(pdf, modified_bytes)
    # Copy any existing stream dictionary entries
    old_dict = datasets_stream.stream_dict if hasattr(datasets_stream, 'stream_dict') else {}
    for key, val in dict(old_dict).items():
        if key not in ('/Length', '/Filter', '/DecodeParms'):
            new_stream.stream_dict[key] = val

    # Replace in the XFA array
    items[datasets_index] = new_stream

    # Rebuild the XFA array
    new_xfa = pikepdf.Array(items)
    acroform['/XFA'] = new_xfa

    # Also set NeedAppearances to ensure readers re-render
    acroform[pikepdf.Name('/NeedAppearances')] = True

    # Save
    pdf.save(output_path)
    print(f"Successfully filled {output_path}")

if __name__ == '__main__':
    main()
`
}
