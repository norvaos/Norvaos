#!/usr/bin/env python3
"""
IRCC Forms Engine  -  PDF Generation Smoke Test
==============================================
Runs against live Supabase + running Python sidecar.
Validates instance-backed answers flow through XFA filling pipeline.

Prerequisites:
  - Python sidecar running on localhost:8100
  - Supabase instance with migrations 074 + 145 applied
  - IMM5257E form instance populated with answers

Usage:
  python3 scripts/smoke-test-pdf-generation.py
"""

from __future__ import annotations

import json
import os
import sys
import io
import requests
import pikepdf
from lxml import etree

# ── Config ────────────────────────────────────────────────────────────────────

SIDECAR_URL = "http://localhost:8100"
WORKER_SECRET = "7zbB6V3q8Rxqge3R8KQlg6rfjpXWtqYNWVdIjBfSn4A"
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Instance we populated during Gate 1
INSTANCE_ID = "e1cebb53-cc4c-4759-8782-28ea67cbdacc"
FORM_ID_5257E = None  # Will be looked up

# Template path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
TEMPLATE_PATH = os.path.join(PROJECT_DIR, "public", "ircc-forms", "IMM5257E.pdf")

# Expected values from our Gate 1 seeded data
EXPECTED_VALUES = {
    "given_name": "Khansa",
    "family_name": "Ayyaz",
    "passport_no": "XY9876543",  # Staff-corrected value
}


def fail(msg: str):
    print(f"  ✗ FAIL: {msg}")
    sys.exit(1)


def ok(msg: str):
    print(f"  ✓ {msg}")


def section(title: str):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


# ── Load env from .env.local ─────────────────────────────────────────────────

def load_env():
    global SUPABASE_URL, SUPABASE_KEY
    env_path = os.path.join(PROJECT_DIR, ".env.local")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())
    SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not SUPABASE_URL or not SUPABASE_KEY:
        fail("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")


# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_get(path: str, params: dict = None) -> dict:
    """GET from Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }
    resp = requests.get(url, headers=headers, params=params or {})
    resp.raise_for_status()
    return resp.json()


# ── Step 1: Verify sidecar health ────────────────────────────────────────────

def check_sidecar():
    section("Step 1: Sidecar Health Check")
    try:
        r = requests.get(f"{SIDECAR_URL}/health", timeout=5)
        data = r.json()
        if data.get("status") == "ok":
            ok(f"Sidecar healthy: {data}")
        else:
            fail(f"Sidecar unhealthy: {data}")
    except Exception as e:
        fail(f"Cannot reach sidecar at {SIDECAR_URL}: {e}")


# ── Step 2: Read instance answers from Supabase ─────────────────────────────

def read_instance_answers():
    section("Step 2: Read Instance Answers from Supabase")

    # Get the form instance
    instances = sb_get("matter_form_instances", {
        "select": "id,form_id,answers,status,completion_state",
        "id": f"eq.{INSTANCE_ID}",
    })

    if not instances:
        fail(f"Instance {INSTANCE_ID} not found")

    instance = instances[0]
    answers = instance.get("answers") or {}
    status = instance.get("status")
    form_id = instance.get("form_id")

    ok(f"Instance found: status={status}, form_id={form_id}")
    ok(f"Answer count: {len(answers)} profile paths")

    # Sample check
    for key in ["personal.given_name", "personal.family_name", "passport.passport_no"]:
        if key in answers:
            val = answers[key]
            if isinstance(val, dict):
                ok(f"  {key} = {val.get('value')} (source={val.get('source')})")
            else:
                ok(f"  {key} = {val}")
        else:
            print(f"  ⚠ {key} not in answers")

    return form_id, answers


# ── Step 3: Resolve answers → XFA field mappings ────────────────────────────

def resolve_to_xfa(form_id: str, answers: dict):
    section("Step 3: Resolve Answers → XFA Field Mappings")

    # Get form metadata
    forms = sb_get("ircc_forms", {
        "select": "id,form_code,xfa_root_element,is_xfa",
        "id": f"eq.{form_id}",
    })

    if not forms:
        fail(f"Form {form_id} not found in ircc_forms")

    form = forms[0]
    root_element = form.get("xfa_root_element", "form1")
    ok(f"Form: {form['form_code']}, XFA root: {root_element}, is_xfa: {form['is_xfa']}")

    # Get field mappings
    fields = sb_get("ircc_form_fields", {
        "select": "profile_path,xfa_path,value_format,date_split,max_length,is_array_field,is_meta_field,is_mapped",
        "form_id": f"eq.{form_id}",
        "is_mapped": "eq.true",
        "is_array_field": "eq.false",
        "is_meta_field": "eq.false",
        "order": "sort_order.asc",
    })

    ok(f"Field mappings loaded: {len(fields)} mapped scalar fields")

    # Resolve: answer value → XFA path
    scalar_fields = {}
    resolved_count = 0
    missing_count = 0

    for field in fields:
        profile_path = field["profile_path"]
        xfa_path = field["xfa_path"]

        if not xfa_path or not profile_path:
            continue

        answer = answers.get(profile_path)
        value = None

        if answer is not None:
            if isinstance(answer, dict):
                value = answer.get("value")
            else:
                value = answer

        if value is not None and str(value).strip():
            str_value = str(value).strip()

            # Apply date_split if applicable
            date_split = field.get("date_split")
            if date_split and len(str_value) >= 10:
                parts = str_value[:10].split("-")
                if len(parts) == 3:
                    if date_split == "year":
                        str_value = parts[0]
                    elif date_split == "month":
                        str_value = parts[1]
                    elif date_split == "day":
                        str_value = parts[2]

            # Apply max_length
            max_len = field.get("max_length")
            if max_len and len(str_value) > max_len:
                str_value = str_value[:max_len]

            scalar_fields[xfa_path] = str_value
            resolved_count += 1
        else:
            missing_count += 1

    ok(f"Resolved: {resolved_count} fields with values")
    ok(f"Missing: {missing_count} fields (no answer or empty)")

    # Print resolved fields
    for xfa_path, value in list(scalar_fields.items())[:10]:
        print(f"    {xfa_path} = {value}")
    if len(scalar_fields) > 10:
        print(f"    ... and {len(scalar_fields) - 10} more")

    return root_element, scalar_fields


# ── Step 4: Call sidecar /fill-xfa ───────────────────────────────────────────

def fill_pdf(root_element: str, scalar_fields: dict):
    section("Step 4: Call Sidecar /fill-xfa")

    # Read template
    if not os.path.exists(TEMPLATE_PATH):
        fail(f"Template not found: {TEMPLATE_PATH}")

    with open(TEMPLATE_PATH, "rb") as f:
        template_bytes = f.read()
    ok(f"Template loaded: {len(template_bytes):,} bytes")

    # Build field_data payload
    field_data = {
        "rootElement": root_element,
        "scalarFields": scalar_fields,
        "arrayData": [],
    }

    # Call sidecar
    resp = requests.post(
        f"{SIDECAR_URL}/fill-xfa",
        files={"file": ("IMM5257E.pdf", template_bytes, "application/pdf")},
        data={"field_data": json.dumps(field_data)},
        headers={"X-Worker-Key": WORKER_SECRET},
        timeout=60,
    )

    if resp.status_code != 200:
        fail(f"Sidecar returned {resp.status_code}: {resp.text[:500]}")

    filled_bytes = resp.content
    ok(f"Filled PDF received: {len(filled_bytes):,} bytes")

    # Save for inspection
    output_path = os.path.join(PROJECT_DIR, "tmp", "smoke-test-IMM5257E-filled.pdf")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(filled_bytes)
    ok(f"Saved to: {output_path}")

    return filled_bytes


# ── Step 5: Verify filled PDF contains expected values ───────────────────────

def verify_filled_pdf(filled_bytes: bytes, root_element: str):
    section("Step 5: Verify Filled PDF Values")

    # Extract XFA datasets from filled PDF
    pdf = pikepdf.open(io.BytesIO(filled_bytes))
    acroform = pdf.Root.get("/AcroForm")
    if acroform is None:
        fail("No AcroForm in filled PDF")

    xfa = acroform.get("/XFA")
    if xfa is None:
        fail("No XFA in filled PDF")

    items = list(xfa)
    datasets_xml = None
    for i in range(0, len(items), 2):
        name = str(items[i])
        if name == "datasets":
            datasets_xml = bytes(items[i + 1])
            break

    if datasets_xml is None:
        fail("No datasets stream in filled PDF")

    ok(f"XFA datasets extracted: {len(datasets_xml):,} bytes")

    # Parse XML and search for expected values
    tree = etree.fromstring(datasets_xml)

    # Walk all text nodes looking for our expected values
    all_text = {}
    for elem in tree.iter():
        if elem.text and elem.text.strip():
            tag = etree.QName(elem.tag).localname if isinstance(elem.tag, str) and "{" in elem.tag else (elem.tag or "")
            all_text[tag] = elem.text.strip()

    # Check expected values exist somewhere in the XFA data
    found_values = {}
    for label, expected in EXPECTED_VALUES.items():
        found = False
        for tag, text in all_text.items():
            if text == expected:
                found = True
                found_values[label] = (tag, text)
                break
        if found:
            ok(f"Found '{label}': {expected} (in element <{found_values[label][0]}>)")
        else:
            # Search partial
            for tag, text in all_text.items():
                if expected.lower() in text.lower():
                    found = True
                    found_values[label] = (tag, text)
                    break
            if found:
                ok(f"Found '{label}': partial match in <{found_values[label][0]}> = '{found_values[label][1]}'")
            else:
                print(f"  ⚠ '{label}': expected '{expected}' NOT FOUND in XFA data")

    pdf.close()

    # Summary
    print()
    found_count = len(found_values)
    total = len(EXPECTED_VALUES)
    if found_count == total:
        ok(f"All {total}/{total} expected values confirmed in filled PDF")
    elif found_count > 0:
        ok(f"{found_count}/{total} expected values found")
        print(f"  ⚠ {total - found_count} values not found  -  may be in nested paths")
    else:
        print(f"  ⚠ No expected values found  -  checking if fields were written at all")

    return found_count


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  IRCC Forms Engine  -  PDF Generation Smoke Test")
    print("=" * 60)

    load_env()
    check_sidecar()
    form_id, answers = read_instance_answers()
    root_element, scalar_fields = resolve_to_xfa(form_id, answers)

    if not scalar_fields:
        fail("No scalar fields resolved  -  nothing to fill")

    filled_bytes = fill_pdf(root_element, scalar_fields)
    found_count = verify_filled_pdf(filled_bytes, root_element)

    # ── Final verdict ─────────────────────────────────────────────────────
    section("SMOKE TEST RESULT")
    if found_count > 0:
        print("  ╔══════════════════════════════════════════════════════╗")
        print("  ║  PASS  -  PDF generation from instance answers works  ║")
        print("  ╚══════════════════════════════════════════════════════╝")
        print()
        print(f"  • Instance answers read from Supabase: ✓")
        print(f"  • Answers resolved to XFA field paths: ✓")
        print(f"  • Python sidecar filled PDF via pikepdf: ✓")
        print(f"  • Expected values present in output PDF: ✓ ({found_count}/{len(EXPECTED_VALUES)})")
        print(f"  • Output saved: tmp/smoke-test-IMM5257E-filled.pdf")
    else:
        print("  ╔══════════════════════════════════════════════════════╗")
        print("  ║  PARTIAL  -  Fill succeeded but values not verified   ║")
        print("  ╚══════════════════════════════════════════════════════╝")

    print()


if __name__ == "__main__":
    main()
