// MG-045/046 step 1 (#328), candidate F1 -- the ferryman knows the guard who brings the caravans to the river whole, and takes
// such a guard over for nothing. Help, not news. Measurement only: patches an in-memory copy of the pack
// (docs/v2/people-of-ford-and-town-step0-design.md, appendix A). Game values, fixed before measuring, from precedents:
//   - regard: +5 for each escort, lead or danger job that comes to the river without a failure (the clerk's +5, GUILD_REMEMBERS)
//   - at regard >= 15 he takes the guard over without the fare (the herbalist's and elder's trusted threshold, 15), as the
//     elder's letter does; the fare stays for everyone else
const FERRYMAN = "npc_ferryman";
const KNOWN = { op: "relation", from: FERRYMAN, to: "self", min: 15 };

export function patch(d) {
  const clerk = d.choices.choice_guild_clerk_dialogue.options;
  for (const id of ["opt_guild_clerk_escort", "opt_guild_clerk_escort_lead", "opt_guild_clerk_escort_danger"]) {
    const o = clerk.find((x) => x.id === id);
    for (const tier of ["great", "success"]) o.outcomes[tier].push({ op: "relation", from: FERRYMAN, add: 5 });
  }
  const ferry = d.choices.choice_ferryman_dialogue.options;
  const fare = ferry.find((o) => o.id === "opt_ferryman_cross");
  fare.requires = { op: "and", of: [fare.requires, { op: "not", of: KNOWN }] };
  ferry.push({
    id: "opt_ferryman_cross_known",
    name: "뱃사공이 손짓한다 — 그냥 건넌다",
    requires: { op: "and", of: [KNOWN, { op: "not", of: { op: "item", item: "item_passage_letter", min: 1 } }] },
    minutes: 30,
    effects: [{ op: "move", to: "loc_far_bank" }, { op: "narrate", textId: "txt_ferryman_cross_known" }]
  });
  d.texts.txt_ferryman_cross_known = "뱃사공이 당신을 알아보고 삯을 받지 않는다. \"상단을 무사히 데려오는 사람한테서 뱃삯은 안 받소.\"";
}

export function crossOption(s, { d, evaluateCondition, bump }) {
  const o = d.choices.choice_ferryman_dialogue.options.find((x) => x.id === "opt_ferryman_cross_known");
  if (evaluateCondition(o.requires, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" })) { bump("ferryFree"); return o.id; }
  return null;
}
