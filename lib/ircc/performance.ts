// ---------------------------------------------------------------------------
// Module N  -  Performance, Reliability, and Operational Quality
// Pure utility functions for the IRCC Forms Engine.
// No database or framework dependencies.
// ---------------------------------------------------------------------------

/**
 * Batch process multiple field operations efficiently.
 * Instead of N database calls for N fields, batches them into a single operation.
 */
export async function batchFieldOperations<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);
  }
}

// ---------------------------------------------------------------------------
// Answer-save debouncer
// ---------------------------------------------------------------------------

/**
 * Debounce answer saves to reduce database writes.
 * Collects multiple field changes within the window into a single save operation.
 */
export function createAnswerSaveDebouncer(
  saveFn: (updates: Record<string, unknown>) => Promise<void>,
  delayMs = 500,
): {
  enqueue: (profilePath: string, value: unknown) => void;
  flush: () => Promise<void>;
  cancel: () => void;
  pending: () => number;
} {
  const pendingUpdates = new Map<string, unknown>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function scheduleFlush() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, delayMs);
  }

  async function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingUpdates.size === 0) return;

    const snapshot: Record<string, unknown> = {};
    for (const [k, v] of pendingUpdates) {
      snapshot[k] = v;
    }
    pendingUpdates.clear();
    await saveFn(snapshot);
  }

  function enqueue(profilePath: string, value: unknown): void {
    pendingUpdates.set(profilePath, value);
    scheduleFlush();
  }

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingUpdates.clear();
  }

  function pending(): number {
    return pendingUpdates.size;
  }

  return { enqueue, flush, cancel, pending };
}

// ---------------------------------------------------------------------------
// Computation cache (LRU-style)
// ---------------------------------------------------------------------------

/**
 * Memoize expensive computations (condition evaluation, completion state)
 * with a simple LRU-style cache that evicts the oldest entry when maxSize
 * is reached.
 */
export function createComputationCache<K extends string, V>(
  maxSize = 100,
): {
  get: (key: K) => V | undefined;
  set: (key: K, value: V) => void;
  invalidate: (key: K) => void;
  clear: () => void;
  size: () => number;
} {
  // Map insertion order gives us a simple LRU eviction strategy:
  // the first key in iteration order is the oldest.
  const store = new Map<K, V>();

  function get(key: K): V | undefined {
    if (!store.has(key)) return undefined;
    // Move to end (most-recently used)
    const value = store.get(key)!;
    store.delete(key);
    store.set(key, value);
    return value;
  }

  function set(key: K, value: V): void {
    if (store.has(key)) {
      store.delete(key);
    } else if (store.size >= maxSize) {
      // Evict oldest (first key in iteration order)
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, value);
  }

  function invalidate(key: K): void {
    store.delete(key);
  }

  function clear(): void {
    store.clear();
  }

  function size(): number {
    return store.size;
  }

  return { get, set, invalidate, clear, size };
}

// ---------------------------------------------------------------------------
// Operation timing
// ---------------------------------------------------------------------------

/**
 * Measure and report timing for engine operations.
 * Logs to console in development, silent in production.
 */
export async function measureOperation<T>(
  name: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const isDev =
    typeof process !== "undefined" &&
    process.env?.NODE_ENV !== "production";

  const start = performance.now();
  try {
    const result = await operation();
    if (isDev) {
      const elapsed = (performance.now() - start).toFixed(2);
      // eslint-disable-next-line no-console
      console.log(`[perf] ${name}: ${elapsed}ms`);
    }
    return result;
  } catch (error) {
    if (isDev) {
      const elapsed = (performance.now() - start).toFixed(2);
      // eslint-disable-next-line no-console
      console.log(`[perf] ${name}: FAILED after ${elapsed}ms`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Rate limiter (sliding window)
// ---------------------------------------------------------------------------

/**
 * Rate limiter for API calls to prevent overwhelming the database.
 * Uses a sliding-window approach based on timestamps.
 */
export function createRateLimiter(
  maxCalls: number,
  windowMs: number,
): {
  acquire: () => Promise<void>;
  tryAcquire: () => boolean;
  remaining: () => number;
} {
  const timestamps: number[] = [];

  /** Remove timestamps that have fallen outside the current window. */
  function prune(): void {
    const cutoff = Date.now() - windowMs;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }
  }

  function tryAcquire(): boolean {
    prune();
    if (timestamps.length < maxCalls) {
      timestamps.push(Date.now());
      return true;
    }
    return false;
  }

  async function acquire(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (tryAcquire()) return;
      // Wait until the oldest timestamp expires out of the window.
      prune();
      const waitMs =
        timestamps.length > 0
          ? timestamps[0] + windowMs - Date.now() + 1
          : 0;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(waitMs, 1)),
      );
    }
  }

  function remaining(): number {
    prune();
    return Math.max(0, maxCalls - timestamps.length);
  }

  return { acquire, tryAcquire, remaining };
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff + jitter
// ---------------------------------------------------------------------------

/**
 * Retry wrapper with exponential backoff for transient failures.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 200;
  const maxDelayMs = options?.maxDelayMs ?? 5000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;

      // Exponential backoff: baseDelay * 2^attempt, capped at maxDelay
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      // Add jitter: random value between 0 and the exponential delay
      const jitter = Math.random() * exponentialDelay;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
