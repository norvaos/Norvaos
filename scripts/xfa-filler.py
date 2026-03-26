#!/usr/bin/env python3
"""
Fill XFA form fields in a PDF using pikepdf + lxml + PyMuPDF.

Usage: python3 xfa-filler.py <field_data.json>

The JSON input file must contain:
{
  "pdfPath":     "/path/to/blank/template.pdf",
  "outputPath":  "/path/to/filled/output.pdf",
  "rootElement": "form1",
  "scalarFields": { "Page1.Field": "value", ... },
  "arrayData": [
    {
      "basePath":  "Page1.EmploymentHistory",
      "entryName": "Entry",
      "entries":   [ { "EmployerName": "Acme Corp", ... }, ... ]
    }
  ],
  "barcodeData": {
    "code":       "IMM5257E",
    "applicant":  "Smith, John",
    "generated":  "2026-03-11",
    "version":    "v3",
    "hash":       "abc123..."
  }
}

barcodeData is optional. When provided, a PDF417 reference barcode is embedded
at the bottom-right of the first page. Barcode failure is non-fatal  -  the fill
succeeds regardless.

Strategy:
  1. pikepdf reads the XFA datasets XML stream (locates the datasets object number)
  2. lxml parses and modifies the XML with form field values
  3. PyMuPDF (fitz) does an incremental save  -  appending only the modified
     datasets stream to the original file.  This preserves the UR3 / DocMDP
     digital-rights signatures so Adobe Acrobat's JavaScript engine, Validate
     button, and barcode generation keep working.
  4. (Optional) pdf417gen renders a reference barcode and fitz inserts it as an
     image annotation on page 1.

Stdout (JSON):
  { "barcode_embedded": true|false }

Exit codes:
  0  Success
  1  Import error (missing dependency)
  2  Input file not found
  3  Fill error
  4  Invalid input JSON
"""

import sys
import json
import re
import shutil

# ── Dependency check ───────────────────────────────────────────────────────────

try:
    import pikepdf
    from lxml import etree
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    sys.exit(1)

# ── XFA path helpers ───────────────────────────────────────────────────────────

def parse_xfa_path(path):
    """Parse an XFA path like 'SectionA.Row[1].Field' into (name, index) segments."""
    segments = []
    for part in path.split('.'):
        match = re.match(r'(\w+)\[(\d+)\]', part)
        if match:
            segments.append((match.group(1), int(match.group(2))))
        else:
            segments.append((part, 0))
    return segments


def find_or_create_element(parent, tag_name, index=0):
    """Return the nth child element with tag_name under parent, creating if needed."""
    matches = []
    for child in parent:
        local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else child.tag
        if local == tag_name:
            matches.append(child)

    while len(matches) <= index:
        new_elem = etree.SubElement(parent, tag_name)
        matches.append(new_elem)

    return matches[index]


def set_xfa_value(root, path_segments, value):
    """Navigate the XFA XML tree and set a leaf element's text to value."""
    current = root
    for tag_name, index in path_segments:
        current = find_or_create_element(current, tag_name, index)
    current.text = value


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) != 2:
        print("Usage: xfa-filler.py <field_data.json>", file=sys.stderr)
        sys.exit(4)

    data_path = sys.argv[1]

    try:
        with open(data_path, 'r', encoding='utf-8') as f:
            field_data = json.load(f)
    except FileNotFoundError:
        print(f"Input file not found: {data_path}", file=sys.stderr)
        sys.exit(2)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON in {data_path}: {e}", file=sys.stderr)
        sys.exit(4)

    input_path   = field_data.get('pdfPath')
    output_path  = field_data.get('outputPath')
    root_element = field_data.get('rootElement', 'form1')
    scalar_fields = field_data.get('scalarFields', {})
    array_data    = field_data.get('arrayData', [])
    barcode_data  = field_data.get('barcodeData')  # Optional  -  may be None

    if not input_path or not output_path:
        print("field_data.json must contain 'pdfPath' and 'outputPath'", file=sys.stderr)
        sys.exit(4)

    if not scalar_fields and not array_data:
        # Nothing to fill  -  copy blank template as output
        shutil.copy2(input_path, output_path)
        print(f"No fields to fill  -  copied blank template to {output_path}")
        return

    # ── Phase 1: Read XFA datasets with pikepdf ────────────────────────────

    try:
        pdf = pikepdf.open(input_path)
    except FileNotFoundError:
        print(f"PDF template not found: {input_path}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"Failed to open PDF: {e}", file=sys.stderr)
        sys.exit(3)

    acroform = pdf.Root.get('/AcroForm')
    if acroform is None:
        print("No AcroForm found in PDF", file=sys.stderr)
        sys.exit(3)

    xfa = acroform.get('/XFA')
    if xfa is None:
        print("No XFA entry found in PDF", file=sys.stderr)
        sys.exit(3)

    items = list(xfa)
    datasets_stream = None
    datasets_obj_num = None

    for i in range(0, len(items), 2):
        name = str(items[i])
        if name == 'datasets':
            datasets_stream = items[i + 1]
            datasets_obj_num = items[i + 1].objgen[0]
            break

    # ── Phase 2: Parse / create the XFA XML ───────────────────────────────

    needs_pikepdf_fallback = False

    if datasets_stream is None:
        # No existing datasets stream  -  create fresh XML structure
        needs_pikepdf_fallback = True
        XFA_NS = 'http://www.xfa.org/schema/xfa-data/1.0/'
        tree_root = etree.Element('{%s}datasets' % XFA_NS, nsmap={'xfa': XFA_NS})
        data_elem = etree.SubElement(tree_root, '{%s}data' % XFA_NS)
        form_root = etree.SubElement(data_elem, root_element)
        print(f"Created new datasets section with root '{root_element}'", file=sys.stderr)
    else:
        xml_bytes = bytes(datasets_stream)
        tree_root = etree.fromstring(xml_bytes)

        ns = {'xfa': 'http://www.xfa.org/schema/xfa-data/1.0/'}
        data_elem = tree_root.find('xfa:data', ns) or tree_root.find('data')

        if data_elem is None:
            for child in tree_root:
                local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else child.tag
                if local == 'data':
                    data_elem = child
                    break

        if data_elem is None:
            print("No xfa:data element found in datasets stream", file=sys.stderr)
            sys.exit(3)

        form_root = None
        for child in data_elem:
            local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else child.tag
            if local == root_element:
                form_root = child
                break

        if form_root is None:
            form_root = etree.SubElement(data_elem, root_element)
            print(f"Created root element '{root_element}' in existing datasets", file=sys.stderr)

    pdf.close()

    # All DB-seeded XFA paths are rooted at form_root (e.g. Page1.PersonalDetails.FamilyName).
    # Using any intermediate 'page1' child as fill_root causes double-nesting
    # (form1/page1/Page1/...) which breaks XFA binding in Adobe Acrobat.
    fill_root = form_root

    # ── Phase 3: Fill scalar fields ────────────────────────────────────────

    filled_count = 0

    for xfa_path, value in scalar_fields.items():
        segments = parse_xfa_path(xfa_path)
        try:
            set_xfa_value(fill_root, segments, str(value))
            filled_count += 1
        except Exception as e:
            print(f"Warning: could not set scalar field '{xfa_path}': {e}", file=sys.stderr)

    # ── Phase 4: Fill array / repeater fields ─────────────────────────────

    for arr in array_data:
        base_segments = parse_xfa_path(arr['basePath'])
        entry_name    = arr['entryName']
        entries       = arr['entries']

        base_elem = fill_root
        for tag_name, index in base_segments:
            base_elem = find_or_create_element(base_elem, tag_name, index)

        existing_entries = [
            child for child in base_elem
            if (etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else child.tag) == entry_name
        ]

        for idx, entry_data in enumerate(entries):
            entry_elem = existing_entries[idx] if idx < len(existing_entries) else etree.SubElement(base_elem, entry_name)
            for sub_path, value in entry_data.items():
                segments = parse_xfa_path(sub_path)
                try:
                    set_xfa_value(entry_elem, segments, str(value))
                    filled_count += 1
                except Exception as e:
                    print(f"Warning: could not set array field '{sub_path}': {e}", file=sys.stderr)

    modified_bytes = etree.tostring(tree_root, encoding='UTF-8', xml_declaration=False)

    # ── Phase 5: Save ──────────────────────────────────────────────────────

    try:
        if needs_pikepdf_fallback:
            # No existing datasets stream  -  inject it via pikepdf
            pdf2 = pikepdf.open(input_path)
            acroform2 = pdf2.Root.get('/AcroForm')
            xfa2 = acroform2.get('/XFA')
            items2 = list(xfa2)

            new_stream = pikepdf.Stream(pdf2, modified_bytes)

            # Insert before 'postamble' if present, otherwise append
            insert_pos = len(items2)
            for i in range(0, len(items2), 2):
                if str(items2[i]) == 'postamble':
                    insert_pos = i
                    break

            items2.insert(insert_pos, pikepdf.String('datasets'))
            items2.insert(insert_pos + 1, new_stream)
            acroform2['/XFA'] = pikepdf.Array(items2)
            pdf2.save(output_path)
            pdf2.close()
            print(f"Filled {output_path} ({filled_count} fields) [pikepdf fallback]")
        else:
            # Existing datasets  -  incremental save preserves UR3/DocMDP signatures
            try:
                import fitz  # PyMuPDF
            except ImportError:
                print("PyMuPDF (fitz) not available  -  falling back to pikepdf full save", file=sys.stderr)
                # Pikepdf full-save fallback (loses UR3/DocMDP but produces valid PDF)
                pdf3 = pikepdf.open(input_path)
                acroform3 = pdf3.Root.get('/AcroForm')
                xfa3 = acroform3.get('/XFA')
                items3 = list(xfa3)
                for i in range(0, len(items3), 2):
                    if str(items3[i]) == 'datasets':
                        items3[i + 1] = pikepdf.Stream(pdf3, modified_bytes)
                        break
                acroform3['/XFA'] = pikepdf.Array(items3)
                pdf3.save(output_path)
                pdf3.close()
                print(f"Filled {output_path} ({filled_count} fields) [pikepdf full-save fallback]")
                return

            shutil.copy2(input_path, output_path)
            doc = fitz.open(output_path)
            doc.update_stream(datasets_obj_num, modified_bytes)
            doc.saveIncr()
            doc.close()
            print(f"Filled {output_path} ({filled_count} fields) [incremental save]")

    except Exception as e:
        print(f"Save failed: {e}", file=sys.stderr)
        sys.exit(3)

    # ── Phase 6: Embed reference PDF417 barcode (non-fatal) ────────────────

    barcode_embedded = False

    if barcode_data:
        try:
            import io
            import fitz  # PyMuPDF  -  already imported above if incremental path was taken
            import pdf417gen  # pip install pdf417gen

            # Build barcode payload string (pipe-delimited for compactness)
            payload_parts = [
                barcode_data.get('code', ''),
                barcode_data.get('applicant', ''),
                barcode_data.get('generated', ''),
                barcode_data.get('version', ''),
                barcode_data.get('hash', '')[:12],  # Truncate hash for barcode capacity
            ]
            payload = '|'.join(p for p in payload_parts if p)

            # Render PDF417 barcode to PNG bytes
            codes = pdf417gen.encode(payload, security_level=2, columns=6)
            image = pdf417gen.render_image(codes, padding=2, scale=2)
            buf = io.BytesIO()
            image.save(buf, format='PNG')
            png_bytes = buf.getvalue()

            # Insert barcode image annotation at bottom-right of page 1
            doc_bc = fitz.open(output_path)
            page = doc_bc[0]
            page_rect = page.rect

            # Place in lower-right corner with 12pt margin
            barcode_w = 160
            barcode_h = 40
            margin = 12
            rect = fitz.Rect(
                page_rect.x1 - barcode_w - margin,
                page_rect.y1 - barcode_h - margin,
                page_rect.x1 - margin,
                page_rect.y1 - margin,
            )

            page.insert_image(rect, stream=png_bytes, keep_proportion=True)
            doc_bc.saveIncr()
            doc_bc.close()

            barcode_embedded = True
            print(f"Barcode embedded on page 1", file=sys.stderr)

        except ImportError as e:
            print(f"Barcode skipped  -  missing dependency: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Barcode embedding failed (non-fatal): {e}", file=sys.stderr)

    # ── Done  -  emit JSON result to stdout ──────────────────────────────────
    print(json.dumps({'barcode_embedded': barcode_embedded}))


if __name__ == '__main__':
    main()
