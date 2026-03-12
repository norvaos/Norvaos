import type { IrccFieldType } from '@/lib/types/ircc-forms'

/**
 * Maps the XFA scanner's `suggested_type` to a questionnaire `field_type`.
 *
 * The scanner detects raw XFA UI types (textEdit, choiceList, checkButton, etc.)
 * and returns simplified names (text, choice, checkbox, date, number, etc.).
 *
 * This function converts those into the field_type values used by the
 * questionnaire engine and field editor.
 *
 * Used as a fallback when the auto-classify module doesn't have a
 * pattern match for a specific XFA path.
 */
export function scannerTypeToFieldType(scannerType: string | null | undefined): IrccFieldType | null {
  switch (scannerType) {
    case 'choice':
      return 'select'
    case 'checkbox':
      return 'boolean'
    case 'date':
      return 'date'
    case 'number':
      return 'number'
    case 'signature':
    case 'barcode':
    case 'image':
      // These are system/non-fillable types — don't set a field_type
      return null
    case 'text':
    default:
      // text is the default, let auto-classify or admin mapping handle it
      return null
  }
}
