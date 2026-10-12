// #335 (appendix G), contract candidate K1 -- measurement only, an in-memory copy of the pack: a sack carried on the merchant's
// note is sold at the note's price (4) even while the town wants flour; the market price (6 / 8) is the free trader's
const CARRYING = { op: "relation", from: "npc_town_merchant", to: "self", tag: "carrying" };
export function patch(d) {
  const opts = d.choices.choice_town_merchant_dialogue.options;
  for (const id of ["opt_town_merchant_sell_flour", "opt_town_merchant_sell_flour_fair"]) {
    const o = opts.find((x) => x.id === id);
    o.requires = { op: "and", of: [o.requires, { op: "not", of: CARRYING }] };
  }
  const note = opts.find((x) => x.id === "opt_town_merchant_sell_flour_note");
  note.requires = { op: "and", of: note.requires.of.filter((c) => !(c.op === "not" && c.of?.op === "signal" && c.of?.key === "town_flour_wanted")) };
}
