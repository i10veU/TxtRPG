// Pure, host-API-free RNG per docs/v2/architecture/CORE_CONTRACTS.md §2.7.
// No module-level/global state: every function takes its rng value as input
// and returns the next one. Do not add Math.random, Date, or any host API here.

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const GOLDEN_RATIO_32 = 0x9e3779b9;

// murmur3 fmix32 finalizer.
function fmix32(input) {
  let h = input >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// FNV-1a 32-bit, same algorithm as V1's hashSeededText (web/core/game-state.js).
export function hashString(text) {
  const str = String(text);
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

// Independent stream for a given (seed, label): used for world-generation
// draws that must not consume or affect the gameplay rng cursor (§2.7).
export function deriveSeed(seed, label) {
  return hashString(seed.toString(16) + ":" + label);
}

// rng: { seed: uint32, cursor: int >= 0 } -> { value: uint32, rng: next }
// cursor*GOLDEN_RATIO_32 uses Math.imul for correct 32-bit wraparound.
export function nextUint32(rng) {
  const seed = rng.seed >>> 0;
  const cursor = rng.cursor;
  const mixed = (seed + Math.imul(cursor, GOLDEN_RATIO_32)) >>> 0;
  const value = fmix32(mixed);
  return { value, rng: { seed, cursor: cursor + 1 } };
}

// -> { value: 1..sides, rng: next }
export function rollDie(rng, sides) {
  const { value, rng: nextRng } = nextUint32(rng);
  return { value: (value % sides) + 1, rng: nextRng };
}
