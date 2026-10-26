// V2-Core-158 (D-136): the pictures -- a scene for every place, in the light of the hour, the cover of the book and the
// last page of a life (Seoul 2033's illustrations). Pure and deterministic: no DOM, no Math.random, and the game's own
// roll (state.rng) is never read -- the same place at the same hour is the same picture. ui/paint.js draws what this
// describes on a canvas.
//
// What a picture may show is what anyone standing there sees: the place, the light, its plain state (the spring's
// water, a village burnt or under the lord's banner). Nothing a check must find (the band's number) is drawn: the
// camp in the forest is always the same camp.

// --- the light ---------------------------------------------------------------------------------------------------
// the same hours as the words of the day (ui/app.js partOfDay): 깊은 밤 and 밤 are night, 새벽 dawn, 저녁 dusk
export const BANDS = ["dawn", "day", "dusk", "night"];
export function timeBand(minute) {
  const hour = Math.floor((((minute % 1440) + 1440) % 1440) / 60);
  if (hour < 5) return "night";
  if (hour < 7) return "dawn";
  if (hour < 17) return "day";
  if (hour < 20) return "dusk";
  return "night";
}

// --- what can be seen ----------------------------------------------------------------------------------------------
// the plain state of the place the player stands in, nothing else
export function marksOf(state, locationId) {
  const marks = {};
  if (locationId === "loc_forest_spring") marks.clear = state?.cases?.case_fouled_well?.stage === "resolved";
  if (locationId === "loc_village") {
    if (state?.facts?.fact_ending?.value === "frontier_fell") marks.fallen = true;
    else if (state?.signals?.lord_pact === 1) marks.banner = true;
  }
  return marks;
}

export function sceneOf(state, data) {
  const actorId = state?.player?.actorId;
  const locationId = state?.actors?.[actorId]?.locationId;
  const key = COMPOSE[locationId] ? locationId : "road";
  return { key, band: timeBand(state?.time?.minute ?? 0), marks: marksOf(state, locationId) };
}

// the last page: how the story closed, or where a life ended
export function endingScene(end) {
  if (end === "end_name") return { key: "loc_crossroads", band: "dawn", marks: {} };
  if (end === "end_held") return { key: "loc_village", band: "dawn", marks: {} };
  if (end === "end_lord") return { key: "loc_village", band: "day", marks: { banner: true } };
  if (end === "end_fell") return { key: "loc_village", band: "dusk", marks: { fallen: true } };
  return { key: "grave", band: "night", marks: {} };
}

// the cover: the night I crossed the river
export const COVER = { key: "cover", band: "night", marks: {} };

// --- numbers that look drawn by hand ---------------------------------------------------------------------------
export function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// mulberry32: a small seeded generator for the pictures only
export function seeded(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hashOf(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a ridge line: smooth noise over x in [0, 1], in [0, 1]
export function ridgeLine(seed, rough = 3) {
  const r = seeded(seed);
  const lattice = Array.from({ length: 97 }, r);
  const at = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = lattice[((i % 97) + 97) % 97];
    const b = lattice[(((i + 1) % 97) + 97) % 97];
    return a + (b - a) * ((1 - Math.cos(f * Math.PI)) / 2);
  };
  return (x) => {
    let y = 0;
    let weight = 1;
    let total = 0;
    let freq = rough;
    for (let octave = 0; octave < 4; octave += 1) {
      y += at(x * freq + octave * 13.7) * weight;
      total += weight;
      weight *= 0.5;
      freq *= 2.1;
    }
    return y / total;
  };
}

// --- the palettes ------------------------------------------------------------------------------------------------
// ink on paper by day, ink under the moon by night; the dark theme dims each light so the page does not glare. The
// keys every light has: sky (top, low), horizon glow, three distances of hill (far, mid, near), ink, water and its
// shine, mist (and how thick), the sun or moon, a lit window, smoke (and how thick), the lord's banner
const LIGHT = {
  dawn: { skyTop: "#c4ccd6", skyLow: "#efdcc6", horizon: "#f2c79c", far: "#aeb6be", mid: "#87929b", near: "#56616a", ink: "#2b3239", water: "#bfc6cc", shine: "#fbe6cc", mist: "#f7f0e6", mistA: 0.62, orb: "#fbd7a2", lit: "#f0b45a", smoke: "#5c6066", smokeA: 0.34, banner: "#8a2f2f" },
  day: { skyTop: "#c7d7d3", skyLow: "#eef1e9", horizon: "#f3f1e2", far: "#b3c3bb", mid: "#8ba093", near: "#58705f", ink: "#27352c", water: "#b3c6c0", shine: "#f6f7f1", mist: "#f4f6f0", mistA: 0.58, orb: "#fbf4dc", lit: "#e6b25a", smoke: "#4c544f", smokeA: 0.3, banner: "#8a2f2f" },
  dusk: { skyTop: "#9f9aab", skyLow: "#e8be98", horizon: "#eea46c", far: "#968f9b", mid: "#726b77", near: "#463f4b", ink: "#241f27", water: "#a29ba4", shine: "#f5c896", mist: "#ecceb2", mistA: 0.45, orb: "#f6ad74", lit: "#f6b552", smoke: "#3c363e", smokeA: 0.34, banner: "#7d2a2a" },
  night: { skyTop: "#18232e", skyLow: "#2f3e48", horizon: "#3a4a52", far: "#394852", mid: "#28353e", near: "#18222a", ink: "#0d1419", water: "#202d37", shine: "#d6dccf", mist: "#6e828c", mistA: 0.2, orb: "#eef0e2", lit: "#f3c46a", smoke: "#96a0a5", smokeA: 0.16, banner: "#6e2a2a" }
};
const DARK = {
  dawn: { skyTop: "#232a33", skyLow: "#4a4036", horizon: "#6e5340", far: "#353b42", mid: "#2a3036", near: "#1d2227", ink: "#111518", water: "#2c3137", shine: "#c9a782", mist: "#46403a", mistA: 0.45, orb: "#d7b386", lit: "#e0a64e", smoke: "#969696", smokeA: 0.16, banner: "#8a3a3a" },
  day: { skyTop: "#27332f", skyLow: "#3a4540", horizon: "#46504a", far: "#33403a", mid: "#29342f", near: "#1c2522", ink: "#101614", water: "#2a3733", shine: "#97a79e", mist: "#3a443f", mistA: 0.5, orb: "#cfcab0", lit: "#d6a24c", smoke: "#969c98", smokeA: 0.16, banner: "#8a3a3a" },
  dusk: { skyTop: "#26232c", skyLow: "#4b392f", horizon: "#6b4532", far: "#342f37", mid: "#29252c", near: "#1b181e", ink: "#0f0d11", water: "#2c272e", shine: "#c99a6e", mist: "#483830", mistA: 0.42, orb: "#d38f5c", lit: "#e8a648", smoke: "#8c848a", smokeA: 0.18, banner: "#7a3434" },
  night: { skyTop: "#0b1116", skyLow: "#162129", horizon: "#1c2830", far: "#1b2830", mid: "#141e25", near: "#0d151a", ink: "#060a0d", water: "#121c23", shine: "#aab4ab", mist: "#506068", mistA: 0.16, orb: "#d9dccd", lit: "#e4b65e", smoke: "#96a0a5", smokeA: 0.12, banner: "#6a3030" }
};
export const PALETTE_KEYS = Object.keys(LIGHT.day);
export function paletteOf(band, dark = false) {
  return (dark ? DARK : LIGHT)[BANDS.includes(band) ? band : "day"];
}

// --- the compositions ----------------------------------------------------------------------------------------------
// x across and y down, both from 0 to 1; `base` is where a thing stands. Each place draws its own things in front of
// the sky, the light and the far hills; the painter lights the windows only when it is dark and the house still stands
const hills = (key, { far = 0.42, mid = 0.56, mist = 0.5 } = {}) => [
  { op: "ridge", tone: "far", base: far, amp: 0.2, rough: 2.6, seed: `${key}:far` },
  { op: "mist", y: mist, h: 0.14 },
  { op: "ridge", tone: "mid", base: mid, amp: 0.12, rough: 4.2, seed: `${key}:mid` }
];
const COMPOSE = {
  // 변경 마을: low earthen walls, thatch and one tiled roof (the elder's), the shared well
  loc_village: (m) => [
    ...hills("village"),
    { op: "trees", tone: "mid", kind: "round", x0: 0, x1: 0.2, base: 0.66, size: 0.17, n: 5, seed: "village:west" },
    { op: "trees", tone: "mid", kind: "pine", x0: 0.84, x1: 1, base: 0.65, size: 0.24, n: 5, seed: "village:east" },
    { op: "ground", tone: "near", y: 0.68, seed: "village:ground" },
    { op: "house", x: 0.16, base: 0.8, w: 0.15, h: 0.24, roof: "thatch", lit: true, broken: m.fallen },
    { op: "house", x: 0.38, base: 0.78, w: 0.2, h: 0.32, roof: "tile", lit: true, broken: m.fallen },
    { op: "house", x: 0.64, base: 0.81, w: 0.14, h: 0.22, roof: "thatch", lit: true },
    { op: "house", x: 0.83, base: 0.82, w: 0.12, h: 0.19, roof: "thatch", lit: true, broken: m.fallen },
    { op: "wall", x0: 0.02, x1: 0.98, base: 0.89, h: 0.07, gate: 0.53 },
    { op: "well", x: 0.27, base: 0.975, s: 0.2 },
    { op: "trees", tone: "near", kind: "round", x0: 0.92, x1: 0.94, base: 0.97, size: 0.44, n: 1, seed: "village:persimmon" },
    ...(m.fallen ? [{ op: "smoke", x: 0.17, base: 0.66, h: 0.5, seed: "village:s1" }, { op: "smoke", x: 0.39, base: 0.6, h: 0.56, seed: "village:s2" }, { op: "smoke", x: 0.83, base: 0.7, h: 0.4, seed: "village:s3" }] : []),
    ...(m.banner ? [{ op: "banner", x: 0.06, base: 0.9, h: 0.46 }] : []),
    { op: "figure", x: 0.335, base: 0.975, s: 0.16, when: ["dawn", "day"] }
  ],
  // 시장: cloth awnings on poles in front of the shops
  loc_market: () => [
    ...hills("market", { far: 0.4, mid: 0.54 }),
    { op: "house", x: 0.15, base: 0.7, w: 0.17, h: 0.23, roof: "tile", lit: true, tone: "mid" },
    { op: "house", x: 0.42, base: 0.69, w: 0.22, h: 0.28, roof: "tile", lit: true, tone: "mid" },
    { op: "house", x: 0.72, base: 0.7, w: 0.18, h: 0.23, roof: "tile", lit: true, tone: "mid" },
    { op: "ground", tone: "near", y: 0.72, seed: "market:ground" },
    { op: "stall", x: 0.12, base: 0.93, w: 0.2, h: 0.3, seed: "market:a" },
    { op: "stall", x: 0.37, base: 0.94, w: 0.21, h: 0.32, seed: "market:b" },
    { op: "stall", x: 0.63, base: 0.93, w: 0.2, h: 0.3, seed: "market:c" },
    { op: "stall", x: 0.87, base: 0.94, w: 0.19, h: 0.3, seed: "market:d" },
    { op: "figure", x: 0.245, base: 0.97, s: 0.17, when: ["dawn", "day", "dusk"] },
    { op: "figure", x: 0.5, base: 0.98, s: 0.18, when: ["day"] },
    { op: "figure", x: 0.755, base: 0.97, s: 0.16, when: ["day", "dusk"] }
  ],
  // 폐허: broken arches on a rise, rubble, a dead tree
  loc_ruins: () => [
    ...hills("ruins", { far: 0.4, mid: 0.54 }),
    { op: "ridge", tone: "near", base: 0.8, amp: 0.12, rough: 2.2, seed: "ruins:rise" },
    { op: "arch", x: 0.34, base: 0.77, w: 0.14, h: 0.34, broken: true },
    { op: "arch", x: 0.53, base: 0.74, w: 0.18, h: 0.46 },
    { op: "arch", x: 0.71, base: 0.78, w: 0.13, h: 0.3, broken: true },
    { op: "trees", tone: "near", kind: "dead", x0: 0.13, x1: 0.15, base: 0.82, size: 0.5, n: 1, seed: "ruins:dead" },
    { op: "rocks", x0: 0.22, x1: 0.88, base: 0.86, n: 10, seed: "ruins:rubble" },
    { op: "mist", y: 0.88, h: 0.12, when: ["dawn", "night"] },
    { op: "birds", y: 0.22, n: 3, seed: "ruins:crows", when: ["dusk"] }
  ],
  // 매몰 창고: only the architecture visible to someone already inside; no secret cache marker.
  loc_ruins_cellar: () => [
    ...hills('ruins:cellar', { far: 0.42, mid: 0.56 }),
    { op: 'ground', tone: 'near', y: 0.76, seed: 'cellar:floor' },
    { op: 'arch', x: 0.31, base: 0.76, w: 0.2, h: 0.53, broken: true },
    { op: 'arch', x: 0.66, base: 0.77, w: 0.24, h: 0.58, broken: true },
    { op: 'rocks', x0: 0.06, x1: 0.94, base: 0.92, n: 13, seed: 'cellar:fallen-stone' },
    { op: 'mist', y: 0.82, h: 0.12 }
  ],
  // Lower chamber is drawn only after arrival. No hidden world flags are read.
  loc_ruins_lower_vault: () => [
    ...hills('ruins:lower', { far: 0.48, mid: 0.62 }),
    { op: 'ground', tone: 'near', y: 0.81, seed: 'lower:floor' },
    { op: 'arch', x: 0.48, base: 0.81, w: 0.35, h: 0.62, broken: true },
    { op: 'rocks', x0: 0.12, x1: 0.9, base: 0.92, n: 12, seed: 'lower:stones' },
    { op: 'mist', y: 0.87, h: 0.1 }
  ],
  // New optional underground passages are drawn only when the player arrives.
  // Geometry never depends on undiscovered route flags or hidden loot.
  loc_ruins_gallery: () => [
    ...hills('ruins:gallery', { far: 0.48, mid: 0.63 }),
    { op: 'ground', tone: 'near', y: 0.82, seed: 'gallery:floor' },
    { op: 'arch', x: 0.25, base: 0.83, w: 0.19, h: 0.53, broken: true },
    { op: 'arch', x: 0.73, base: 0.83, w: 0.2, h: 0.59, broken: true },
    { op: 'rocks', x0: 0.12, x1: 0.92, base: 0.96, n: 15, seed: 'gallery:fallen' },
    { op: 'mist', y: 0.88, h: 0.1 }
  ],
  loc_ruins_watchpost: () => [
    ...hills('ruins:watchpost', { far: 0.44, mid: 0.6 }),
    { op: 'ground', tone: 'near', y: 0.78, seed: 'watchpost:floor' },
    { op: 'arch', x: 0.48, base: 0.78, w: 0.32, h: 0.61, broken: true },
    { op: 'wall', x0: 0.13, x1: 0.86, base: 0.88, h: 0.12, gate: 0.5 },
    { op: 'rocks', x0: 0.06, x1: 0.95, base: 0.97, n: 11, seed: 'watchpost:rubble' },
    { op: 'mist', y: 0.9, h: 0.08 }
  ],
  // 숲속 샘: a pool under tall pines; murky while the well is fouled, clear once it is not
  loc_forest_spring: (m) => [
    { op: "ridge", tone: "far", base: 0.38, amp: 0.14, rough: 2.4, seed: "spring:far" },
    { op: "trees", tone: "far", kind: "pine", x0: 0, x1: 1, base: 0.6, size: 0.3, n: 18, seed: "spring:far-pines" },
    { op: "mist", y: 0.58, h: 0.14 },
    { op: "ground", tone: "mid", y: 0.7, seed: "spring:ground" },
    { op: "pool", x: 0.5, y: 0.84, rx: 0.27, ry: 0.1, clear: Boolean(m.clear) },
    { op: "reeds", x0: 0.24, x1: 0.34, base: 0.87, seed: "spring:reeds-w" },
    { op: "reeds", x0: 0.66, x1: 0.76, base: 0.88, seed: "spring:reeds-e" },
    { op: "rocks", x0: 0.3, x1: 0.7, base: 0.95, n: 6, seed: "spring:stones" },
    { op: "trees", tone: "near", kind: "pine", x0: 0, x1: 0.2, base: 1.02, size: 0.95, n: 3, seed: "spring:frame-w" },
    { op: "trees", tone: "near", kind: "pine", x0: 0.82, x1: 1, base: 1.02, size: 0.9, n: 3, seed: "spring:frame-e" }
  ],
  // 옛 갈림길: the roads part at a wooden signpost; the toll post the bandits left
  loc_crossroads: () => [
    ...hills("crossroads", { far: 0.42, mid: 0.56 }),
    { op: "ground", tone: "near", y: 0.64, seed: "crossroads:ground" },
    { op: "road", from: [0.5, 1.02], to: [0.47, 0.7], w0: 0.3, w1: 0.05 },
    { op: "road", from: [0.47, 0.71], to: [0.08, 0.63], w0: 0.05, w1: 0.012 },
    { op: "road", from: [0.47, 0.71], to: [0.92, 0.62], w0: 0.05, w1: 0.012 },
    { op: "house", x: 0.8, base: 0.71, w: 0.1, h: 0.15, roof: "tile", broken: true, lit: false },
    { op: "trees", tone: "mid", kind: "round", x0: 0.02, x1: 0.22, base: 0.67, size: 0.16, n: 4, seed: "crossroads:grove" },
    { op: "signpost", x: 0.6, base: 0.92, s: 0.4 },
    { op: "rocks", x0: 0.36, x1: 0.4, base: 0.92, n: 2, seed: "crossroads:marker" },
    { op: "birds", y: 0.2, n: 4, seed: "crossroads:birds", when: ["dawn", "day"] }
  ],
  // 물레방아 마을: the wheel in the stream beside the mill
  loc_mill_hamlet: () => [
    ...hills("mill"),
    { op: "trees", tone: "mid", kind: "round", x0: 0.64, x1: 1, base: 0.66, size: 0.16, n: 5, seed: "mill:grove" },
    { op: "ground", tone: "near", y: 0.7, seed: "mill:ground" },
    { op: "house", x: 0.17, base: 0.77, w: 0.13, h: 0.2, roof: "thatch", lit: true },
    { op: "house", x: 0.86, base: 0.78, w: 0.11, h: 0.17, roof: "thatch", lit: true },
    { op: "river", y0: 0.84, y1: 1, seed: "mill:stream" },
    { op: "house", x: 0.6, base: 0.86, w: 0.23, h: 0.33, roof: "thatch", lit: true },
    { op: "wheel", x: 0.415, base: 0.96, r: 0.21 }
  ],
  // 강나루: a broad river, the ferry at the near bank, the far bank's trees
  loc_river_ford: () => [
    { op: "ridge", tone: "far", base: 0.4, amp: 0.2, rough: 2.4, seed: "ford:far" },
    { op: "mist", y: 0.48, h: 0.12 },
    { op: "trees", tone: "mid", kind: "round", x0: 0, x1: 1, base: 0.56, size: 0.12, n: 14, seed: "ford:far-bank" },
    { op: "river", y0: 0.55, y1: 0.86, seed: "ford:river" },
    { op: "ground", tone: "near", y: 0.86, seed: "ford:near-bank" },
    { op: "posts", x0: 0.24, x1: 0.34, base: 0.94, h: 0.2 },
    { op: "boat", x: 0.52, base: 0.8, s: 0.26, lantern: true, rower: true },
    { op: "reeds", x0: 0.72, x1: 0.93, base: 0.94, seed: "ford:reeds" }
  ],
  // 강 건너 길목: the road north, the board where notices are posted, a waystation
  loc_far_bank: () => [
    ...hills("far-bank"),
    { op: "ground", tone: "near", y: 0.67, seed: "far-bank:ground" },
    { op: "road", from: [0.44, 1.02], to: [0.6, 0.66], w0: 0.28, w1: 0.02 },
    { op: "house", x: 0.8, base: 0.79, w: 0.2, h: 0.29, roof: "tile", lit: true },
    { op: "board", x: 0.22, base: 0.93, s: 0.36 },
    { op: "signpost", x: 0.43, base: 0.9, s: 0.32 },
    { op: "trees", tone: "mid", kind: "pine", x0: 0.02, x1: 0.12, base: 0.69, size: 0.26, n: 3, seed: "far-bank:pines" }
  ],
  // 영주의 성읍: the town wall and its gate, roofs behind, the lord's banners
  loc_castle_town: () => [
    ...hills("castle", { far: 0.36, mid: 0.48 }),
    { op: "house", x: 0.32, base: 0.58, w: 0.15, h: 0.18, roof: "tile", lit: true, tone: "mid" },
    { op: "house", x: 0.5, base: 0.56, w: 0.2, h: 0.22, roof: "tile", lit: true, tone: "mid" },
    { op: "house", x: 0.68, base: 0.58, w: 0.15, h: 0.18, roof: "tile", lit: true, tone: "mid" },
    { op: "tower", x: 0.15, base: 0.62, w: 0.1, h: 0.42, tiers: 2 },
    { op: "tower", x: 0.85, base: 0.62, w: 0.1, h: 0.42, tiers: 2 },
    { op: "castle", x0: 0.03, x1: 0.97, base: 0.84, h: 0.26, gate: 0.5 },
    { op: "banner", x: 0.29, base: 0.58, h: 0.26 },
    { op: "banner", x: 0.71, base: 0.58, h: 0.26 },
    { op: "ground", tone: "near", y: 0.84, seed: "castle:ground", flat: true },
    { op: "road", from: [0.5, 1.02], to: [0.5, 0.85], w0: 0.26, w1: 0.08 }
  ],
  // 왕도: the great wall, the palace's tiered roofs, a city that does not end
  loc_royal_city: () => [
    { op: "ridge", tone: "far", base: 0.34, amp: 0.16, rough: 2.2, seed: "royal:far" },
    { op: "mist", y: 0.42, h: 0.12 },
    { op: "palace", x: 0.5, base: 0.6, w: 0.44, h: 0.44 },
    { op: "tower", x: 0.14, base: 0.64, w: 0.09, h: 0.4, tiers: 3 },
    { op: "tower", x: 0.86, base: 0.64, w: 0.09, h: 0.4, tiers: 3 },
    { op: "house", x: 0.29, base: 0.66, w: 0.14, h: 0.17, roof: "tile", lit: true, tone: "mid" },
    { op: "house", x: 0.71, base: 0.66, w: 0.14, h: 0.17, roof: "tile", lit: true, tone: "mid" },
    { op: "castle", x0: 0, x1: 1, base: 0.88, h: 0.24, gate: 0.5 },
    { op: "banner", x: 0.37, base: 0.64, h: 0.22 },
    { op: "banner", x: 0.63, base: 0.64, h: 0.22 },
    { op: "ground", tone: "near", y: 0.88, seed: "royal:ground", flat: true }
  ],
  // 북쪽 숲 너머: tents in a clearing among dark pines, a fire, a fence of stakes -- the same camp whatever its number
  loc_band_camp: () => [
    { op: "ridge", tone: "far", base: 0.36, amp: 0.14, rough: 2.6, seed: "camp:far" },
    { op: "trees", tone: "far", kind: "pine", x0: 0, x1: 1, base: 0.58, size: 0.3, n: 22, seed: "camp:far-pines" },
    { op: "trees", tone: "mid", kind: "pine", x0: 0, x1: 1, base: 0.7, size: 0.4, n: 10, seed: "camp:mid-pines" },
    { op: "ground", tone: "near", y: 0.74, seed: "camp:ground" },
    { op: "smoke", x: 0.48, base: 0.86, h: 0.7, seed: "camp:smoke" },
    { op: "tent", x: 0.3, base: 0.88, w: 0.14, h: 0.26 },
    { op: "tent", x: 0.63, base: 0.9, w: 0.17, h: 0.3 },
    { op: "tent", x: 0.8, base: 0.85, w: 0.11, h: 0.2 },
    { op: "fire", x: 0.48, base: 0.92 },
    { op: "palisade", x0: 0.02, x1: 0.2, base: 0.97, h: 0.22, seed: "camp:stakes" }
  ],
  // where the map has no picture of its own: a road over the hills
  road: () => [
    ...hills("road"),
    { op: "ground", tone: "near", y: 0.68, seed: "road:ground" },
    { op: "road", from: [0.52, 1.02], to: [0.56, 0.68], w0: 0.26, w1: 0.02 },
    { op: "trees", tone: "mid", kind: "round", x0: 0.04, x1: 0.3, base: 0.72, size: 0.17, n: 4, seed: "road:trees" }
  ],
  // the cover: the river at night, the ferry with its lantern, the far bank
  cover: () => [
    { op: "ridge", tone: "far", base: 0.4, amp: 0.22, rough: 2.2, seed: "cover:far" },
    { op: "mist", y: 0.5, h: 0.14 },
    { op: "trees", tone: "mid", kind: "pine", x0: 0, x1: 1, base: 0.56, size: 0.16, n: 18, seed: "cover:bank" },
    { op: "river", y0: 0.55, y1: 1, seed: "cover:river" },
    { op: "boat", x: 0.58, base: 0.82, s: 0.3, lantern: true, rower: true }
  ],
  // a life's end: a mound and a wooden marker on a hill under the moon
  grave: () => [
    { op: "ridge", tone: "far", base: 0.44, amp: 0.18, rough: 2.4, seed: "grave:far" },
    { op: "mist", y: 0.56, h: 0.14 },
    { op: "ridge", tone: "near", base: 0.92, amp: 0.26, rough: 1.6, seed: "grave:hill" },
    { op: "grave", x: 0.6, base: 0.74, s: 0.32 },
    { op: "trees", tone: "near", kind: "dead", x0: 0.24, x1: 0.26, base: 0.8, size: 0.46, n: 1, seed: "grave:tree" },
    { op: "birds", y: 0.28, n: 1, seed: "grave:crow" }
  ]
};
export const SCENE_KEYS = Object.keys(COMPOSE);

// the whole picture, back to front: the sky and its light, the place, the page's grain
export function opsOf(scene) {
  const { key, band, marks = {} } = scene;
  const place = (COMPOSE[key] ?? COMPOSE.road)(marks);
  const orb = band === "night" ? { op: "moon", x: 0.78, y: 0.2, r: 0.045 } : band === "day" ? { op: "sun", x: 0.24, y: 0.18, r: 0.05 } : { op: "sun", x: band === "dawn" ? 0.2 : 0.82, y: 0.5, r: 0.07, low: true };
  const sky = [{ op: "sky" }, ...(band === "night" ? [{ op: "stars", n: 70, seed: `${key}:stars` }] : []), orb];
  return [...sky, ...place.filter((o) => !o.when || o.when.includes(band)), { op: "grain", seed: key }];
}
