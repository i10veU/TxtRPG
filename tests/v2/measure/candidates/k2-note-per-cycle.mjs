// #335 (appendix G), contract candidate K2 -- measurement only: the merchant writes one note per caravan's cadence (the next
// caravan carries his settlement with the ferryman, and with it his next note)
export function patch(d) {
  const order = d.choices.choice_town_merchant_dialogue.options.find((x) => x.id === "opt_town_merchant_order");
  order.requires = { op: "and", of: [order.requires, { op: "signal", key: "note_written", max: 0 }] };
  order.effects = [...order.effects, { op: "signal", key: "note_written", add: 1 }];
  d.events.evt_caravan.effects = [...d.events.evt_caravan.effects, { op: "signal", key: "note_written", add: -9 }];
}
