// M8 balance step 3 (Q9 ①, docs/v2/m8-balance-preregistration.md §14) -- measurement only, an in-memory copy of the pack: the
// gear's price x1.2 (WB-0028 ①, D-109), rounded -- the merchant's steel sword 24 -> 29 and mail shirt 48 -> 58, the fallen's
// kit at the guild 12 -> 14 and 24 -> 29 (still about half). The iron sword and the jerkin (2 to 3 silver) stay
const PRICES = {
  choice_town_merchant_dialogue: { opt_town_merchant_buy_steel_sword: 24, opt_town_merchant_buy_mail_shirt: 48 },
  choice_guild_clerk_dialogue: { opt_guild_clerk_fallen_steel: 12, opt_guild_clerk_fallen_mail: 24 }
};
export function patch(d) {
  for (const [choice, options] of Object.entries(PRICES)) {
    for (const [id, was] of Object.entries(options)) {
      const o = d.choices[choice].options.find((x) => x.id === id);
      const now = Math.round(was * 1.2);
      const requires = JSON.stringify(o.requires);
      const min = `{"op":"money","min":${was}}`;
      if (!requires.includes(min) || !o.effects.some((e) => e.op === "money" && e.add === -was)) throw new Error(`${id}: not ${was}`);
      o.requires = JSON.parse(requires.replace(min, `{"op":"money","min":${now}}`));
      o.effects = o.effects.map((e) => (e.op === "money" && e.add === -was ? { ...e, add: -now } : e));
      o.name = o.name.replace(`은화 ${was}`, `은화 ${now}`);
    }
  }
}
