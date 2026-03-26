/**
 * UI Helpers  -  Scroll-and-Glow, Deep Linking, Field Focus
 *
 * Used by the Compliance Diagnostic Modal to navigate users directly
 * to the specific field that needs attention.
 */

/**
 * Scrolls an element into view and highlights it with a temporary glow.
 * Used for "Fix" buttons in the Compliance Diagnostic Modal.
 *
 * @param fieldId - The DOM id of the target input/element
 * @param options.delay - ms to wait before scrolling (default 150, for page mount)
 * @param options.glowDuration - ms to keep the glow (default 2500)
 */
export function scrollToField(
  fieldId: string,
  options: { delay?: number; glowDuration?: number } = {}
) {
  const { delay = 150, glowDuration = 2500 } = options

  setTimeout(() => {
    const element = document.getElementById(fieldId)
    if (!element) return

    // 1. Smooth scroll to centre of viewport
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // 2. Visual glow  -  amber ring pulse
    element.classList.add(
      'ring-4',
      'ring-amber-400',
      'ring-offset-2',
      'transition-all',
      'duration-500',
    )

    // 3. Focus the input if possible
    if ('focus' in element && typeof element.focus === 'function') {
      element.focus()
    }

    // 4. Remove glow after duration
    setTimeout(() => {
      element.classList.remove(
        'ring-4',
        'ring-amber-400',
        'ring-offset-2',
      )
    }, glowDuration)
  }, delay)
}
