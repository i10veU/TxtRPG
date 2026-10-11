// MG-045/046 step 1 (#328), candidate M1 -- the town merchant tells the road as the last caravan found it. Measurement only:
// patches an in-memory copy of the pack (docs/v2/people-of-ford-and-town-step0-design.md, appendix A). Game values, fixed
// before measuring, each from a precedent in the pack:
//   - regard: +10 for each steel sword or mail shirt bought from him (the clerk's +10 for a lead escort, LEAD_REMEMBERS)
//   - he talks of the road to a customer he knows, regard >= 10 (the clerk's GUILD_KNOWS, 10)
//   - his word is the road one turn old (`road_last`, kept at each turn), confidence 70: between the ledger (80) and the yard
//     (40), below a sighting (90)
//   - asking takes half an hour of the guard's time and needs his regard (B4: the word is not free)
const MERCHANT = "npc_town_merchant";
const KNOWN = { op: "relation", from: MERCHANT, to: "self", min: 10 };
const LAST = (n) => ({ op: "signal", key: "road_last", eq: n });

export function patch(d) {
  // the road as it was before this turn moves it: road_last := road_trouble (signals clamp at 0, so clear then add)
  const keep = [
    { op: "signal", key: "road_last", add: -9 },
    { op: "if", when: { op: "signal", key: "road_trouble", eq: 1 }, then: [{ op: "signal", key: "road_last", add: 1 }] },
    { op: "if", when: { op: "signal", key: "road_trouble", eq: 2 }, then: [{ op: "signal", key: "road_last", add: 2 }] }
  ];
  d.events.evt_road_north.effects = [...keep, ...d.events.evt_road_north.effects];
  const opts = d.choices.choice_town_merchant_dialogue.options;
  for (const id of ["opt_town_merchant_buy_steel_sword", "opt_town_merchant_buy_mail_shirt"]) opts.find((o) => o.id === id).effects.push({ op: "relation", from: MERCHANT, add: 10 });
  const word = (rumor, text) => [{ op: "rumor", rumor, source: MERCHANT, confidence: 70 }, { op: "narrate", textId: text }];
  opts.push({
    id: "opt_town_merchant_road",
    name: "지난 상단이 길에 대해 뭐라던지 묻는다",
    requires: KNOWN,
    minutes: 30,
    effects: [{
      op: "if", when: LAST(2), then: word("rum_road_dangerous", "txt_town_merchant_road_dangerous"),
      else: [{ op: "if", when: LAST(1), then: word("rum_road_uneasy", "txt_town_merchant_road_uneasy"), else: word("rum_road_quiet", "txt_town_merchant_road_quiet") }]
    }]
  });
  Object.assign(d.texts, {
    txt_town_merchant_road_quiet: "상인이 장부를 덮으며 말한다. \"지난번 상단은 강나루 길이 조용했다더군. 짐도 하나 안 잃고 왔소.\"",
    txt_town_merchant_road_uneasy: "상인이 목소리를 낮춘다. \"지난번 상단 사람들이 강나루 길이 어수선하다고들 했소. 그 뒤로는 나도 모르지.\"",
    txt_town_merchant_road_dangerous: "상인이 고개를 젓는다. \"지난번 상단은 강나루 길에서 혼쭐이 났다더군. 지금은 어떤지 모르겠소만.\""
  });
}

// policy families: like infoAvoid, and the merchant asked when the ledger is not open to the guard (`fallback`), or the
// merchant alone and never the clerk (`alone`, beside eyesAvoid which asks no one)
export const families = {
  mercAvoid: { dz: "avoid", ask: 1, merc: "fallback" },
  mercWhole: { dz: "whole", ask: 1, merc: "fallback" },
  mercAlone: { dz: "avoid", ask: 0, merc: "alone" }
};

const LEVEL = { quiet: 0, uneasy: 1, dangerous: 2 };
export function news(s, Pc, { run, P, C, d, evaluateCondition, standing, rel, bump, truth }) {
  if (!Pc.merc) return s;
  if (Pc.merc === "fallback" && standing(s) >= 10) return s;
  if (rel(s, MERCHANT) < 10) { bump("mercClosed"); return s; }
  const opt = d.choices.choice_town_merchant_dialogue.options.find((o) => o.id === "opt_town_merchant_road");
  if (!evaluateCondition(opt.requires, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" })) return s;
  const t = run(s, [P("act_talk_town_merchant"), C("opt_town_merchant_road")]);
  bump("mercAsks");
  const said = Object.values(t.knowledge?.[t.player.actorId] ?? {}).find((k) => k.factId === "fact_road_north" && k.lastSeenDay === Math.floor(t.time.minute / 1440) && k.sources?.includes(MERCHANT));
  if (said && LEVEL[said.claim] === truth(t)) bump("mercExact");
  return t;
}
