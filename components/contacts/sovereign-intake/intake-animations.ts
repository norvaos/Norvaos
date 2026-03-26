/**
 * Sovereign Intake Animation Classes  -  Directive 42.0
 *
 * Micro-animations for progressive disclosure and prestige UX.
 * Uses Tailwind animate-in utilities.
 */

/** Fade in from bottom  -  used for card/section entrance */
export const ANIM_FADE_UP = 'animate-in fade-in slide-in-from-bottom-4 duration-500'

/** Fade in from right  -  used for step transitions */
export const ANIM_FADE_RIGHT = 'animate-in fade-in slide-in-from-right-4 duration-400'

/** Zoom in  -  used for badges and success states */
export const ANIM_ZOOM = 'animate-in zoom-in-50 fade-in duration-300'

/** Pulse glow  -  used for the compliance passed state */
export const ANIM_PULSE_GREEN = 'animate-pulse text-emerald-500'

/** Staggered delay classes for sequential field appearance */
export const STAGGER = {
  0: 'animate-in fade-in slide-in-from-bottom-2 duration-300',
  1: 'animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75',
  2: 'animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150',
  3: 'animate-in fade-in slide-in-from-bottom-2 duration-300 delay-200',
  4: 'animate-in fade-in slide-in-from-bottom-2 duration-300 delay-300',
} as const

/** Transition classes for step content swap */
export const STEP_TRANSITION = 'transition-all duration-300 ease-in-out'
