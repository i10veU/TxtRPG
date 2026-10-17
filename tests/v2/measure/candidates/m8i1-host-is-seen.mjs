// M8 balance step 2b (docs/v2/m8-balance-preregistration.md §11), candidate I1 -- a host that big cannot hide: once the band
// is five strong, a watch that is spotted still sees the rafts being lashed (the "crossing soon" word, and the fact).
// Measurement only.
export function patch(d) {
  const a = d.actions.act_watch_band_camp;
  const soon = a?.outcomes?.success?.find((e) => e.op === "if" && JSON.stringify(e.then).includes("rum_band_crossing_soon"));
  if (!soon || !Array.isArray(a.outcomes.fail)) throw new Error("m8i1: the band watch changed");
  a.outcomes.fail.push({ op: "if", when: soon.when, then: [
    { op: "fact", fact: "fact_band_crossing", set: "soon" },
    { op: "rumor", rumor: "rum_band_crossing_soon", observe: true, source: "obs_loc_band_camp", confidence: 80, about: "now" },
    { op: "narrate", textId: "txt_band_camp_rafts_seen" }
  ] });
  d.texts.txt_band_camp_rafts_seen = "쫓겨 나오는 길에도 보았다. 강가에서 뗏목을 엮고 있다. 오래 기다리지 않을 셈이다.";
}
