"""
XFA Form Filler — fills XFA form fields in a PDF using pikepdf + lxml + PyMuPDF.

Ported from scripts/xfa-filler.py for the FastAPI sidecar worker.
Accepts PDF bytes + field data dict, returns filled PDF bytes.

Strategy:
  1. pikepdf reads the XFA datasets XML stream
  2. lxml parses and modifies the XML with form field values
  3. PyMuPDF (fitz) does an incremental save preserving UR3/DocMDP signatures
  4. (Optional) pdf417gen renders a reference barcode

Uses pikepdf + lxml + PyMuPDF.
"""

from __future__ import annotations

import io
import re
import shutil
import tempfile
import logging
from typing import Any

import pikepdf
from lxml import etree

logger = logging.getLogger(__name__)


# ── XFA path helpers ──────────────────────────────────────────────────────────

def parse_xfa_path(path: str) -> list[tuple[str, int]]:
    """Parse an XFA path like 'SectionA.Row[1].Field' into (name, index) segments."""
    segments = []
    for part in path.split('.'):
        match = re.match(r'(\w+)\[(\d+)\]', part)
        if match:
            segments.append((match.group(1), int(match.group(2))))
        else:
            segments.append((part, 0))
    return segments


def find_or_create_element(parent, tag_name: str, index: int = 0):
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


def set_xfa_value(root, path_segments: list[tuple[str, int]], value: str):
    """Navigate the XFA XML tree and set a leaf element's text to value."""
    current = root
    for tag_name, index in path_segments:
        current = find_or_create_element(current, tag_name, index)
    current.text = value


# ── Main filler ───────────────────────────────────────────────────────────────

def fill_pdf(
    pdf_bytes: bytes,
    field_data: dict[str, Any],
) -> bytes:
    """Fill an XFA PDF with the given field data and return the filled PDF bytes.

    field_data keys:
      - rootElement: str (e.g. "form1", "IMM_5406")
      - scalarFields: dict[str, str]
      - arrayData: list[dict] with basePath, entryName, entries
      - barcodeData: optional dict
    """
    root_element = field_data.get('rootElement', 'form1')
    scalar_fields = field_data.get('scalarFields', {})
    array_data = field_data.get('arrayData', [])
    barcode_data = field_data.get('barcodeData')

    if not scalar_fields and not array_data:
        # Nothing to fill — return original bytes
        return pdf_bytes

    # ── Phase 1: Read XFA datasets with pikepdf ──────────────────────────

    pdf = pikepdf.open(io.BytesIO(pdf_bytes))

    acroform = pdf.Root.get('/AcroForm')
    if acroform is None:
        pdf.close()
        raise ValueError('No AcroForm found in PDF')

    xfa = acroform.get('/XFA')
    if xfa is None:
        pdf.close()
        raise ValueError('No XFA entry found in PDF')

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
        needs_pikepdf_fallback = True
        XFA_NS = 'http://www.xfa.org/schema/xfa-data/1.0/'
        tree_root = etree.Element('{%s}datasets' % XFA_NS, nsmap={'xfa': XFA_NS})
        data_elem = etree.SubElement(tree_root, '{%s}data' % XFA_NS)
        form_root = etree.SubElement(data_elem, root_element)
        logger.info("Created new datasets section with root '%s'", root_element)
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
            pdf.close()
            raise ValueError('No xfa:data element found in datasets stream')

        form_root = None
        for child in data_elem:
            local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else child.tag
            if local == root_element:
                form_root = child
                break

        if form_root is None:
            form_root = etree.SubElement(data_elem, root_element)
            logger.info("Created root element '%s' in existing datasets", root_element)

    pdf.close()

    # All DB-seeded XFA paths are rooted at form_root
    fill_root = form_root

    # ── Phase 3: Fill scalar fields ──────────────────────────────────────

    filled_count = 0

    for xfa_path, value in scalar_fields.items():
        segments = parse_xfa_path(xfa_path)
        try:
            set_xfa_value(fill_root, segments, str(value))
            filled_count += 1
        except Exception as e:
            logger.warning("Could not set scalar field '%s': %s", xfa_path, e)

    # ── Phase 4: Fill array / repeater fields ────────────────────────────

    for arr in array_data:
        base_segments = parse_xfa_path(arr['basePath'])
        entry_name = arr['entryName']
        entries = arr['entries']

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
                    logger.warning("Could not set array field '%s': %s", sub_path, e)

    modified_bytes = etree.tostring(tree_root, encoding='UTF-8', xml_declaration=False)

    # ── Phase 5: Save ────────────────────────────────────────────────────

    # Write original PDF to a temp file for PyMuPDF incremental save
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_in:
        tmp_in.write(pdf_bytes)
        tmp_input_path = tmp_in.name

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_out:
        tmp_output_path = tmp_out.name

    try:
        if needs_pikepdf_fallback:
            pdf2 = pikepdf.open(tmp_input_path)
            acroform2 = pdf2.Root.get('/AcroForm')
            xfa2 = acroform2.get('/XFA')
            items2 = list(xfa2)

            new_stream = pikepdf.Stream(pdf2, modified_bytes)

            insert_pos = len(items2)
            for i in range(0, len(items2), 2):
                if str(items2[i]) == 'postamble':
                    insert_pos = i
                    break

            items2.insert(insert_pos, pikepdf.String('datasets'))
            items2.insert(insert_pos + 1, new_stream)
            acroform2['/XFA'] = pikepdf.Array(items2)
            pdf2.save(tmp_output_path)
            pdf2.close()
            logger.info('Filled PDF (%d fields) [pikepdf fallback]', filled_count)
        else:
            # Existing datasets — incremental save preserves UR3/DocMDP signatures
            try:
                import fitz  # PyMuPDF
            except ImportError:
                # Pikepdf full-save fallback
                logger.warning('PyMuPDF not available — falling back to pikepdf full save')
                pdf3 = pikepdf.open(tmp_input_path)
                acroform3 = pdf3.Root.get('/AcroForm')
                xfa3 = acroform3.get('/XFA')
                items3 = list(xfa3)
                for i in range(0, len(items3), 2):
                    if str(items3[i]) == 'datasets':
                        items3[i + 1] = pikepdf.Stream(pdf3, modified_bytes)
                        break
                acroform3['/XFA'] = pikepdf.Array(items3)
                pdf3.save(tmp_output_path)
                pdf3.close()
                logger.info('Filled PDF (%d fields) [pikepdf full-save fallback]', filled_count)

                with open(tmp_output_path, 'rb') as f:
                    result_bytes = f.read()
                return result_bytes

            shutil.copy2(tmp_input_path, tmp_output_path)
            doc = fitz.open(tmp_output_path)
            doc.update_stream(datasets_obj_num, modified_bytes)
            doc.saveIncr()
            doc.close()
            logger.info('Filled PDF (%d fields) [incremental save]', filled_count)

        # Read filled PDF bytes
        with open(tmp_output_path, 'rb') as f:
            result_bytes = f.read()

    finally:
        import os
        os.unlink(tmp_input_path)
        # tmp_output_path cleaned below after barcode step

    # ── Phase 6: Embed reference PDF417 barcode (non-fatal) ──────────────

    barcode_embedded = False

    if barcode_data:
        try:
            import fitz
            import pdf417gen

            payload_parts = [
                barcode_data.get('code', ''),
                barcode_data.get('applicant', ''),
                barcode_data.get('generated', ''),
                barcode_data.get('version', ''),
                barcode_data.get('hash', '')[:12],
            ]
            payload = '|'.join(p for p in payload_parts if p)

            codes = pdf417gen.encode(payload, security_level=2, columns=6)
            image = pdf417gen.render_image(codes, padding=2, scale=2)
            buf = io.BytesIO()
            image.save(buf, format='PNG')
            png_bytes = buf.getvalue()

            # Write current result to a temp file for barcode insertion
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_bc:
                tmp_bc.write(result_bytes)
                tmp_bc_path = tmp_bc.name

            doc_bc = fitz.open(tmp_bc_path)
            page = doc_bc[0]
            page_rect = page.rect

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

            with open(tmp_bc_path, 'rb') as f:
                result_bytes = f.read()

            import os
            os.unlink(tmp_bc_path)

            barcode_embedded = True
            logger.info('Barcode embedded on page 1')

        except ImportError as e:
            logger.warning('Barcode skipped — missing dependency: %s', e)
        except Exception as e:
            logger.warning('Barcode embedding failed (non-fatal): %s', e)

    # Clean up output temp file
    try:
        import os
        os.unlink(tmp_output_path)
    except OSError:
        pass

    return result_bytes
