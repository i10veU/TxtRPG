// M8 balance step 2d (§13), candidate W -- the band's blades: in the last fight a failed exchange hurts 2 more (the
// character's own HP, with or without the mail shirt). Measurement only.
export function patch(d) {
  // the pack shares effect objects between the options' outcomes: a copy first, so each blow changes once
  const fight = d.choices.choice_final_battle;
  fight.options = JSON.parse(JSON.stringify(fight.options));
  let n = 0;
  const sharpen = (effects) => {
    for (const e of effects ?? []) {
      if (e.op === "hp" && e.subject === undefined && e.add < 0) { e.add -= 2; n += 1; }
      if (e.op === "if") { sharpen(e.then); sharpen(e.else); }
    }
  };
  for (const o of fight.options) sharpen(o.outcomes?.fail);
  if (n === 0) throw new Error("m8w: no wound in a failed exchange");
}
