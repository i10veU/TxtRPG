// M8 balance step 2 (docs/v2/m8-balance-preregistration.md §10), candidate K1 -- the band regroups when its foe flees: the
// one who leads it is whole again (HP to max), so the last fight is won in one stand, not worn down across several.
// Measurement only.
export function patch(d) {
  const opts = d.choices.choice_final_battle.options;
  for (const [id, subject] of [["opt_final_chief_flee", "npc_bandit_leader"], ["opt_final_right_hand_flee", "npc_band_lieutenant"]]) {
    const o = opts.find((x) => x.id === id);
    if (!o || !Array.isArray(o.effects)) throw new Error(`m8k1: ${id} changed`);
    o.effects.push({ op: "hp", subject, add: 99 }, { op: "narrate", textId: "txt_final_band_regroups" });
  }
  d.texts.txt_final_band_regroups = "등 뒤에서 무리가 다시 대오를 짓는다. 다음에는 처음부터 다시 맞서야 한다.";
}
