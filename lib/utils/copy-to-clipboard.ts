/**
 * Copy text to clipboard  -  works on HTTP localhost and unfocused windows.
 * Uses execCommand fallback, then window.prompt as last resort.
 */
export function copyToClipboard(text: string): boolean {
  // Method 1: execCommand with textarea
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;'
  document.body.appendChild(el)
  el.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    // ignore
  }
  document.body.removeChild(el)

  if (ok) return true

  // Method 2: window.prompt so user can Cmd+C manually
  window.prompt('Copy this link (Cmd+C):', text)
  return false
}
