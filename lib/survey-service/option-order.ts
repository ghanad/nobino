import "server-only";

// ──────────────────────────────────────────────
// Seeded pseudo-random number generator
// ──────────────────────────────────────────────

/**
 * Mulberry32 — a fast 32-bit seeded PRNG.
 * Returns a function that produces numbers in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a numeric seed from three identifiers.
 * Uses DJB2-style string hashing for each ID and combines them.
 */
function deriveSeed(
  surveyId: string,
  questionId: string,
  userId: string,
): number {
  const hash = (s: string): number => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return h;
  };

  // Combine the three hashes so order matters
  let seed = hash(surveyId);
  seed = ((seed << 5) + seed + hash(questionId)) | 0;
  seed = ((seed << 5) + seed + hash(userId)) | 0;

  return seed;
}

/**
 * Fisher-Yates shuffle using a seeded PRNG.
 */
function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const rng = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export interface OptionOrderItem {
  id: string;
  sortOrder: number;
}

/**
 * Return the deterministic display order of options for a given question,
 * survey, and recipient/user.
 *
 * - If `randomizeOptions` is false, options are returned in ascending sort
 *   order (stable by id as tiebreaker).
 * - If `randomizeOptions` is true, options are shuffled using a seed derived
 *   from the survey ID, question ID, and user ID.  The same seed always
 *   produces the same order; different users may receive different orders.
 *
 * This is a pure function — it does not query the database.
 */
export function getDeterministicOptionOrder(
  options: OptionOrderItem[],
  surveyId: string,
  questionId: string,
  userId: string,
  randomizeOptions: boolean,
): string[] {
  const designerOrder = [...options].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  if (!randomizeOptions) {
    return designerOrder.map((option) => option.id);
  }

  const seed = deriveSeed(surveyId, questionId, userId);
  const shuffled = seededShuffle(designerOrder, seed);
  return shuffled.map((option) => option.id);
}
