// M8 balance (docs/v2/m8-balance-preregistration.md), candidate C -- the band grows every four days instead of every three
// (a step each 5760 minutes instead of a caravan's cadence): it crosses about a week later. Measurement only.
export function patch(d) {
  const ev = d.events.evt_unrest_band_grows;
  if (ev.cooldown !== 4320) throw new Error("m8c: the pack's band cadence changed");
  ev.cooldown = 5760;
}
