// M8 balance step 2d (§13), candidate R -- a back turned is cut: breaking off the last fight costs 2 HP. Measurement only.
export function patch(d) {
  for (const id of ["opt_final_chief_flee", "opt_final_right_hand_flee"]) {
    const o = d.choices.choice_final_battle.options.find((x) => x.id === id);
    if (!o || !Array.isArray(o.effects)) throw new Error(`m8r: ${id} changed`);
    o.effects.unshift({ op: "hp", add: -2 });
  }
}
