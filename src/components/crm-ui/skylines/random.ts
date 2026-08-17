// Deterministic pseudo-randomness shared by every skyline piece: the same
// seed string always produces the same building layout/window pattern, so
// a given city looks the same on every render/every user, while different
// cities look distinct from one another - no per-city data to store.
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(hash, 31) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// mulberry32 - tiny, fast, good-enough distribution for decorative use.
export function createRandom(seed: number): () => number {
  let state = seed;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
