// M8 balance step 2 (docs/v2/m8-balance-preregistration.md §10), candidate K2 -- a flight emboldens the band: the raid comes
// a day sooner (`raid_days` +1), so the days at the crossroads hold fewer stands. Measurement only.
export function patch(d) {
  const opts = d.choices.choice_final_battle.options;
  for (const id of ["opt_final_chief_flee", "opt_final_right_hand_flee"]) {
    const o = opts.find((x) => x.id === id);
    if (!o || !Array.isArray(o.effects)) throw new Error(`m8k2: ${id} changed`);
    o.effects.push({ op: "signal", key: "raid_days", add: 1 }, { op: "narrate", textId: "txt_final_band_presses" });
  }
  d.texts.txt_final_band_presses = "물러서는 등을 본 무리가 기세를 올린다. 습격이 하루 앞당겨진다.";
}
