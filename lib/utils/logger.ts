const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  info: (...args: unknown[]) => {
    if (isDev) console.info('[NorvaOS]', ...args)
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn('[NorvaOS]', ...args)
  },
  error: (...args: unknown[]) => {
    console.error('[NorvaOS]', ...args)
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug('[NorvaOS]', ...args)
  },
}
