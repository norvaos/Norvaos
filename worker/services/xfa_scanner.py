"""
XFA Field Scanner — extracts all fillable field paths from an IRCC XFA PDF.

Ported from scripts/xfa-scanner.py for the FastAPI sidecar worker.
Accepts PDF bytes (from upload) instead of a file path.

Output dict:
  {
    "root_element": "form1",
    "is_xfa": true,
    "field_count": 185,
    "fields": [
      {
        "xfa_path": "Page1.PersonalDetails.Name.FamilyName",
        "suggested_type": "text",
        "suggested_label": "Family Name",
        "caption_label": "Family name / Nom de famille"
      },
      ...
    ]
  }

Uses pikepdf + lxml.
"""

from __future__ import annotations

import io
import re
import logging

import pikepdf
from lxml import etree

logger = logging.getLogger(__name__)


def get_local(elem) -> str:
    """Return the local tag name of an lxml element, stripping any namespace."""
    tag = elem.tag if isinstance(elem.tag, str) else ''
    return etree.QName(tag).localname if '{' in tag else tag


def extract_draw_text(elem) -> str | None:
    """Extract visible label text from an XFA <draw> element.

    Tries the common XFA structures found in IRCC forms:
      draw > value > text          (most common)
      draw > caption > value > text
    Returns the stripped text, or None if nothing useful is found.
    """
    for child in elem:
        local = get_local(child)
        if local == 'value':
            for grandchild in child:
                if get_local(grandchild) == 'text' and grandchild.text:
                    txt = grandchild.text.strip()
                    if txt:
                        return txt
        elif local == 'caption':
            for grandchild in child:
                if get_local(grandchild) == 'value':
                    for ggchild in grandchild:
                        if get_local(ggchild) == 'text' and ggchild.text:
                            txt = ggchild.text.strip()
                            if txt:
                                return txt
    return None


def camel_to_label(name: str) -> str:
    """Convert camelCase or PascalCase to a human-readable label."""
    label = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    label = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', label)
    label = re.sub(r'\[\d+\]', '', label)
    return label.strip()


def detect_field_type(field_elem, ns: dict) -> str:
    """Detect field type from XFA template <ui> children."""
    ui = field_elem.find('.//xfa:ui', ns) if ns.get('xfa') else None
    if ui is None:
        tag = field_elem.tag
        if isinstance(tag, str) and '{' in tag:
            field_ns = tag.split('}')[0].lstrip('{')
            ui = field_elem.find(f'{{{field_ns}}}ui')
    if ui is None:
        ui = field_elem.find('ui')

    if ui is not None:
        for child in ui:
            local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else (child.tag or '')
            if local == 'textEdit':
                return 'text'
            elif local == 'choiceList':
                return 'choice'
            elif local == 'dateTimeEdit':
                return 'date'
            elif local == 'checkButton':
                return 'checkbox'
            elif local == 'numericEdit':
                return 'number'
            elif local == 'signature':
                return 'signature'
            elif local == 'imageEdit':
                return 'image'
            elif local == 'barcode':
                return 'barcode'

    return 'text'


def extract_fields_from_template(template_root, ns: dict) -> list:
    """Recursively extract all field paths from XFA template XML.

    draw-aware: when iterating container children, the last seen <draw> text
    is passed as caption_hint to any immediately following <field>.
    """
    fields = []

    def walk(elem, path_parts: list, caption_hint: str | None = None):
        local_tag = get_local(elem)
        name = elem.get('name', '')

        if not name:
            for child in elem:
                walk(child, path_parts)
            return

        current_path = path_parts + [name]

        if local_tag == 'field':
            field_type = detect_field_type(elem, ns)
            xfa_path = '.'.join(current_path)
            fields.append({
                'xfa_path': xfa_path,
                'suggested_type': field_type,
                'suggested_label': camel_to_label(name),
                'caption_label': caption_hint,
            })

        elif local_tag in ('subform', 'subformSet', 'area', 'exclGroup'):
            last_draw: str | None = None
            for child in elem:
                child_local = get_local(child)
                child_name = child.get('name', '')

                if child_local == 'draw':
                    txt = extract_draw_text(child)
                    if txt:
                        last_draw = txt
                elif child_local == 'field' and child_name:
                    walk(child, current_path, caption_hint=last_draw)
                elif child_local in ('subform', 'subformSet', 'area', 'exclGroup'):
                    walk(child, current_path)
                else:
                    walk(child, current_path)

        else:
            for child in elem:
                walk(child, current_path)

    for child in template_root:
        walk(child, [])

    return fields


def extract_fields_from_datasets(datasets_root, root_element: str) -> list:
    """Fallback: extract field paths from XFA datasets XML (existing data)."""
    fields = []
    ns = {'xfa': 'http://www.xfa.org/schema/xfa-data/1.0/'}

    data_elem = datasets_root.find('xfa:data', ns)
    if data_elem is None:
        data_elem = datasets_root.find('data')
    if data_elem is None:
        for child in datasets_root:
            local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else (child.tag or '')
            if local == 'data':
                data_elem = child
                break

    if data_elem is None:
        return fields

    form_root = None
    for child in data_elem:
        local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else (child.tag or '')
        if local == root_element:
            form_root = child
            break

    if form_root is None:
        return fields

    page1 = None
    for child in form_root:
        local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else (child.tag or '')
        if local == 'page1':
            page1 = child
            break

    scan_root = page1 if page1 is not None else form_root

    def walk(elem, path_parts: list):
        for child in elem:
            local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else (child.tag or '')
            if not local or local.startswith('{'):
                continue

            current_path = path_parts + [local]

            if len(list(child)) == 0:
                fields.append({
                    'xfa_path': '.'.join(current_path),
                    'suggested_type': 'text',
                    'suggested_label': camel_to_label(local),
                    'caption_label': None,
                })
            else:
                walk(child, current_path)

    walk(scan_root, [])
    return fields


def scan_pdf(pdf_bytes: bytes) -> dict:
    """Scan an IRCC PDF and extract all XFA field paths.

    Accepts raw PDF bytes (from file upload) rather than a file path.
    """
    pdf = pikepdf.open(io.BytesIO(pdf_bytes))

    acroform = pdf.Root.get('/AcroForm')
    if acroform is None:
        pdf.close()
        return {
            'root_element': None,
            'is_xfa': False,
            'field_count': 0,
            'fields': [],
            'error': 'No AcroForm found — this may be a non-fillable PDF',
        }

    xfa = acroform.get('/XFA')
    if xfa is None:
        pdf.close()
        return {
            'root_element': None,
            'is_xfa': False,
            'field_count': 0,
            'fields': [],
            'note': 'No XFA entry — this is an AcroForm PDF (use pdf-lib, not pikepdf)',
        }

    items = list(xfa)
    template_stream = None
    datasets_stream = None
    root_element = None

    for i in range(0, len(items), 2):
        name = str(items[i])
        if name == 'template':
            template_stream = items[i + 1]
        elif name == 'datasets':
            datasets_stream = items[i + 1]

    fields = []

    # Strategy 1: Scan the template stream (most accurate)
    if template_stream is not None:
        try:
            template_bytes = bytes(template_stream)
            template_root = etree.fromstring(template_bytes)

            xfa_template_ns = ''
            root_tag = template_root.tag
            if isinstance(root_tag, str) and '{' in root_tag:
                xfa_template_ns = root_tag.split('}')[0].lstrip('{')
            elif template_root.nsmap:
                for uri in template_root.nsmap.values():
                    if uri and 'xfa-template' in uri:
                        xfa_template_ns = uri
                        break

            xfa_ns = {'xfa': xfa_template_ns} if xfa_template_ns else {}

            for child in template_root:
                local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else (child.tag or '')
                if local == 'subform':
                    name = child.get('name', '')
                    if name:
                        root_element = name
                    fields = extract_fields_from_template(child, xfa_ns)
                    break
        except Exception as e:
            logger.warning('Template scan failed: %s', e)

    # Strategy 2: Fallback to datasets stream
    if not fields and datasets_stream is not None:
        try:
            ds_bytes = bytes(datasets_stream)
            ds_root = etree.fromstring(ds_bytes)

            ns = {'xfa': 'http://www.xfa.org/schema/xfa-data/1.0/'}
            data_elem = ds_root.find('xfa:data', ns)
            if data_elem is None:
                data_elem = ds_root.find('data')
            if data_elem is None:
                for child in ds_root:
                    local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else (child.tag or '')
                    if local == 'data':
                        data_elem = child
                        break

            if data_elem is not None:
                for child in data_elem:
                    local = etree.QName(child.tag).localname if isinstance(child.tag, str) and '{' in child.tag else (child.tag or '')
                    if local and not local.startswith('{') and local != 'data':
                        root_element = local
                        break

            if root_element:
                fields = extract_fields_from_datasets(ds_root, root_element)
        except Exception as e:
            logger.warning('Datasets scan failed: %s', e)

    pdf.close()

    # Deduplicate by xfa_path
    seen = set()
    unique_fields = []
    for f in fields:
        if f['xfa_path'] not in seen:
            seen.add(f['xfa_path'])
            unique_fields.append(f)

    return {
        'root_element': root_element,
        'is_xfa': True,
        'field_count': len(unique_fields),
        'fields': unique_fields,
    }
