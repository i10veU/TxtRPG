// M8 balance (docs/v2/m8-balance-preregistration.md), candidate A -- the elder's warning prepares the village: when the
// elder, told who leads the band, warns the frontier (`frontier_warned`), the village's preparedness rises by one (the
// night paths and the spring watched). Measurement only: patches an in-memory copy of the pack.
const walk = (list, f) => { for (const e of list ?? []) { f(e); if (e.op === "if") { walk(e.then, f); walk(e.else, f); } } };
export function patch(d) {
  const word = d.choices.choice_elder_dialogue.options.find((o) => o.id === "opt_elder_band_word");
  let done = 0;
  walk(word.effects, (e) => {
    for (const branch of [e.then, e.else]) {
      if (Array.isArray(branch) && branch.some((x) => x.op === "flag" && x.key === "frontier_warned" && x.value === true) && !branch.some((x) => x.m8a)) {
        branch.push({ op: "signal", key: "frontier_defense", add: 1, m8a: true });
        done += 1;
      }
    }
  });
  for (const e of [word]) walk(e.effects, (x) => { delete x.m8a; });
  if (done !== 1) throw new Error(`m8a: expected one warning branch, patched ${done}`);
}
