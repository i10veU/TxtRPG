// MG-045/046 step 1 (#328), candidate X1 (decision 3: an interest between the ferryman and the town merchant) -- the merchant's
// want travels south with the ferryman. The merchant needs frontier flour (Canon DC-06) and it comes over the ford (C-07);
// the ferryman, who carries the town's word south (C-12's role, `characters.md`), tells the frontier what the merchant wants.
// No trade between the two and no money changes hands: an interest of information only, so no new setting beyond the roles
// the World Bible already gives (adoption is the owner's, decision 3). Measurement only (static graph): the escort careers
// never trade (design doc section 5, confounder 4). Game values, fixed before measuring:
//   - the merchant's word on flour becomes knowledge (`fact_town_flour`: wanted / enough, confidence 70) where it was only said
//   - the ferryman passes it on once the caravans have made their round trip (NORTH_TALK_BACK, the echo's own condition),
//     confidence 40 (the yard's word: heard second hand)
//   - regard: the merchant +5 for each sack sold to him
const MERCHANT = "npc_town_merchant", FERRYMAN = "npc_ferryman";
const WANTED = { op: "signal", key: "town_flour_wanted", min: 1 };
const TRADES = { op: "relation", from: "org_mill_hamlet", to: "org_village", tag: "trading" };

export function patch(d) {
  d.facts.fact_town_flour = {};
  d.rumors.rum_town_flour_wanted = { factId: "fact_town_flour", claim: "wanted" };
  d.rumors.rum_town_flour_enough = { factId: "fact_town_flour", claim: "enough" };
  const told = (source, confidence) => ({
    op: "if", when: WANTED,
    then: [{ op: "rumor", rumor: "rum_town_flour_wanted", source, confidence }],
    else: [{ op: "rumor", rumor: "rum_town_flour_enough", source, confidence }]
  });
  const merchant = d.choices.choice_town_merchant_dialogue.options;
  const ask = merchant.find((o) => o.id === "opt_town_merchant_ask");
  ask.effects.push({ op: "if", when: TRADES, then: [told(MERCHANT, 70)] });
  for (const id of ["opt_town_merchant_sell_flour", "opt_town_merchant_sell_flour_fair"]) merchant.find((o) => o.id === id).effects.push({ op: "relation", from: MERCHANT, add: 5 });
  const news = d.choices.choice_ferryman_dialogue.options.find((o) => o.id === "opt_ferryman_news");
  news.effects.push({
    op: "if", when: { op: "and", of: [TRADES, { op: "signal", key: "caravan_visits", min: 2 }] },
    then: [told(FERRYMAN, 40), { op: "if", when: WANTED, then: [{ op: "narrate", textId: "txt_ferryman_flour_wanted" }], else: [{ op: "narrate", textId: "txt_ferryman_flour_enough" }] }]
  });
  Object.assign(d.texts, {
    txt_ferryman_flour_wanted: "\"성읍 상인이 밀가루를 더 찾는다더군. 상단 사람들이 그러던데.\"",
    txt_ferryman_flour_enough: "\"성읍엔 밀가루가 넉넉하다더군. 한동안은 가져가 봐야 헛걸음일 거요.\""
  });
}
