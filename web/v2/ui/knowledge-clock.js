// J3 RC1: the character's *reported* danger, never the world's actual countdown.
// Pure projection of view().knowledge and public time. Do not read state.facts,
// signals, event timers, RNG, future rolls, or another actor's knowledge here.
//
// A level is how urgent the latest report sounds, NOT how far the hidden world
// has progressed. Newer observations replace older ones; a report can be wrong.
const REPORTS = Object.freeze({
  rum_elder_asks_band: [0, "강 건너의 움직임은 아직 확인하지 못했다."],
  rum_band_recruits: [1, "강 건너에서 사람을 모은다는 소식"],
  rum_band_led_by_scarred: [1, "무리를 이끄는 사내에 대한 소식"],
  rum_band_led_by_remnant: [1, "무리를 이끄는 자에 대한 소식"],
  rum_band_camp_way: [1, "무리가 북쪽 숲길로 향했다는 소식"],
  rum_band_size: [1, "숲 너머에서 무리를 보았다는 기록"],
  rum_band_crossing_soon: [2, "곧 강을 건너올 거라는 소식"],
  rum_band_crossed: [3, "강을 건넜다는 소식"],
  rum_raid_coming: [4, "마을을 향해 내려온다는 경고"]
});

export function knowledgeClock(knowledge, data, minute) {
  const today = Number.isFinite(minute) ? Math.floor(minute / 1440) : 0;
  const reports = Object.entries(knowledge ?? {}).flatMap(([rumorId, known]) => {
    // A report must belong to its own knowledge key; malformed saves cannot
    // smuggle an unrelated warning into the character's visible history.
    if (!known || typeof known.rumorId !== "string" || rumorId !== known.rumorId) return [];
    if (!Object.hasOwn(REPORTS, known.rumorId) || !Object.hasOwn(data?.rumors ?? {}, known.rumorId)) return [];
    const report = REPORTS[known.rumorId];
    const def = data.rumors[known.rumorId];
    // The player's entry must describe this pack's rumor, not a fabricated claim.
    if (!report || !def || def.factId !== known.factId || def.claim !== known.claim) return [];
    const aboutDay = Number.isInteger(known.aboutDay) ? known.aboutDay :
      Number.isInteger(known.lastSeenDay) ? known.lastSeenDay : today;
    const heardDay = Number.isInteger(known.lastSeenDay) ? known.lastSeenDay : aboutDay;
    // A future observation or a report not yet received is not knowledge.
    // Do not let either supersede a legitimately heard, older warning.
    if (aboutDay > today || heardDay > today ||
        (Number.isInteger(known.firstSeenDay) && known.firstSeenDay > today)) return [];
    // A normalized sources[] list is authoritative over the legacy source.
    // Keep the legacy field only when it agrees with that list, or when an
    // older Save has no list at all. This is display provenance, not proof.
    const sources = (Array.isArray(known.sources) ? known.sources : [known.source])
      .filter((source) => typeof source === "string");
    const source = sources.includes(known.source) ? known.source : sources[0] ?? null;
    return [{
      rumorId: known.rumorId,
      stage: report[0],
      text: report[1],
      aboutDay,
      heardDay,
      confidence: Number.isInteger(known.confidence) ? known.confidence : 0,
      source,
      sources,
      validDays: def.validDays
    }];
  });
  if (reports.length === 0) return null; // No rumor = no hint that a band exists.

  // The most recent *observation* takes precedence, not the most alarming
  // historic report. Same-day reports favor stronger evidence of danger.
  reports.sort((a, b) =>
    b.aboutDay - a.aboutDay || b.stage - a.stage ||
    b.confidence - a.confidence || a.rumorId.localeCompare(b.rumorId));
  const report = reports[0];
  const ageDays = Math.max(0, today - report.aboutDay);
  return {
    rumorId: report.rumorId,
    stage: report.stage,
    text: report.text,
    confidence: report.confidence,
    source: report.source,
    sources: report.sources,
    ageDays,
    heardAgeDays: Math.max(0, today - report.heardDay),
    stale: Number.isInteger(report.validDays) && ageDays >= report.validDays
  };
}
