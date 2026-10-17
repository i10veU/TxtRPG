// M8 balance step 2d (docs/v2/m8-balance-preregistration.md §13), candidate D -- the band shields the one who leads it: in
// the last fight each blow that reaches him does 2 less (a great 7 -> 5, a success 5 -> 3, a half blow 2 -> 1; a counter
// 10 -> 8). The first fight with the chief (act one) is not touched. Measurement only.
export function patch(d) {
  // the pack shares effect objects between the options' outcomes: a copy first, so each blow changes once
  const fight = d.choices.choice_final_battle;
  fight.options = JSON.parse(JSON.stringify(fight.options));
  let n = 0;
  const soften = (effects) => {
    for (const e of effects ?? []) {
      if (e.op === "hp" && (e.subject === "npc_bandit_leader" || e.subject === "npc_band_lieutenant") && e.add < 0) { e.add = Math.min(-1, e.add + 2); n += 1; }
      if (e.op === "if") { soften(e.then); soften(e.else); }
    }
  };
  for (const o of fight.options) for (const tier of Object.values(o.outcomes ?? {})) soften(tier);
  if (n === 0) throw new Error("m8d: no blow to the leader in the last fight");
}
