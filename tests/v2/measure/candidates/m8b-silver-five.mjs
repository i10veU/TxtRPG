// M8 balance (docs/v2/m8-balance-preregistration.md), candidate B -- the village's silver costs 5 instead of 10 (the same
// preparedness, three times at most). Measurement only: patches an in-memory copy of the pack.
export function patch(d) {
  const o = d.choices.choice_elder_dialogue.options.find((x) => x.id === "opt_elder_give_silver");
  const money = o.requires.of.find((c) => c.op === "money");
  const pay = o.effects.find((e) => e.op === "money");
  if (money.min !== 10 || pay.add !== -10) throw new Error("m8b: the pack's silver gift changed");
  money.min = 5;
  pay.add = -5;
}
