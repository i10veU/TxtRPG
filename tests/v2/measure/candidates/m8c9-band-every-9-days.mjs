// M8 balance (docs/v2/m8-balance-preregistration.md §8), candidate C9 -- the band grows every 9 days instead of every three
// (a step each 12960 minutes): with the gathering at about day 6, it is six strong about 45 days later. Measurement only.
export function patch(d) {
  const ev = d.events.evt_unrest_band_grows;
  if (ev.cooldown !== 4320) throw new Error("m8c9: the pack's band cadence changed");
  ev.cooldown = 12960;
}
