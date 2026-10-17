// M8 balance step 2b (docs/v2/m8-balance-preregistration.md §11), candidates F1/F2 -- the band's size arms the one who leads
// it: as it crosses, his swordsmanship rises with the band, and the last fight's opposed difficulty counts it. Shared by
// m8f1-band-arms-leader-half.mjs (+1 at three, +1 at five) and m8f2-band-arms-leader.mjs (+1 each step from two).
// Measurement only.
export function armLeader(d, thresholds) {
  const ev = d.events.evt_unrest_band_crosses;
  if (!ev || !Array.isArray(ev.effects)) throw new Error("m8f: the crossing changed");
  const lives = { op: "alive", subject: "npc_bandit_leader" };
  for (const n of thresholds) {
    ev.effects.push({ op: "if", when: { op: "signal", key: "band_strength", min: n }, then: [
      { op: "if", when: lives, then: [{ op: "skill", subject: "npc_bandit_leader", skill: "swordsmanship", add: 1 }],
        else: [{ op: "skill", subject: "npc_band_lieutenant", skill: "swordsmanship", add: 1 }] }
    ] });
  }
  let n = 0;
  for (const o of d.choices.choice_final_battle.options) {
    const opposed = o.check?.difficulty?.opposed;
    if (opposed) { opposed.skill = "swordsmanship"; n += 1; }
  }
  if (n === 0) throw new Error("m8f: no opposed check in the last fight");
}
