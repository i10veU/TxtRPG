// V2-Core-153 (D-131): what a choice asks of me before I make it -- the time it takes, what every outcome costs, the
// check and its chance, and what I have or lack. Seoul 2033 marks a choice's demand green or red; Citizen Sleeper shows
// its dice; Roadwarden tells what costs time. Read from the pack's definitions and the engine's own evaluator and odds:
// pure, so the UI renders it and tests read it.
//
// What is told and what is not (D-06/D-15 kept): only what is mine -- my things, silver, strength left, skills, stats,
// traits, what I have unlocked. A requirement that reads the world (a flag, a relation, a case, a fact, someone alive,
// what I have heard) is never explained: if one of those is what stands in the way, the choice says nothing more, and a
// dialogue option behind one stays hidden.
import { checkOdds, evaluateCondition } from "../core/rules.js";

const MATERIAL = new Set(["item", "money", "resource", "skill", "stat", "trait", "unlock"]);
const TIER_WORDS = [
  [0.95, "sure", "확실함"],
  [0.7, "likely", "승산 높음"],
  [0.45, "even", "반반"],
  [0.2, "hard", "어려움"],
  [0, "desperate", "무모함"]
];

const word = (data, key, fallback) => data.texts?.[key] ?? fallback;

export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function ctxOf(state, data) {
  return { state, data, actorId: state.player.actorId, contextKind: "player" };
}

// what one requirement atom of mine is called
function atomLabel(atom, data) {
  switch (atom.op) {
    case "item": {
      const name = data.items?.[atom.item]?.name ?? atom.item;
      const many = Number.isInteger(atom.min) && atom.min > 1 ? ` ${atom.min}` : "";
      return atom.equipped === true ? `손에 든 ${name}` : `${name}${many}`;
    }
    case "money":
      return `은화 ${atom.min ?? 1}`;
    case "resource":
      return `${word(data, `lbl_res_${atom.resource}`, atom.resource)} ${atom.min ?? 1}`;
    case "skill":
      return `${word(data, `lbl_skill_${atom.skill}`, atom.skill)} ${atom.min ?? 1}`;
    case "stat":
      return `${word(data, `lbl_stat_${atom.stat}`, atom.stat)} ${atom.min ?? ""}`.trim();
    case "trait":
      return word(data, `lbl_trait_${atom.trait}`, atom.trait);
    case "unlock":
      return word(data, `lbl_unlock_${atom.id}`, atom.id);
    default:
      return null;
  }
}

// a material atom that only asks for an upper bound or the absence of something is not a need I can meet
const isNeed = (atom) => MATERIAL.has(atom.op) && atom.max === undefined && atom.eq === undefined && atom.remove !== true;

// needsOf(condition) -> { needs: [{ text, met }], hidden }: the needs of mine the condition names, met or not, and
// whether something that is not mine stands in the way (hidden). `or` of needs of mine reads "a 또는 b".
export function needsOf(condition, state, data) {
  const ctx = ctxOf(state, data);
  const walk = (c) => {
    if (!c || typeof c !== "object") return { needs: [], hidden: false };
    if (c.op === "and" && Array.isArray(c.of)) {
      return c.of.map(walk).reduce((acc, r) => ({ needs: [...acc.needs, ...r.needs], hidden: acc.hidden || r.hidden }), { needs: [], hidden: false });
    }
    const met = evaluateCondition(c, ctx);
    if (c.op === "or" && Array.isArray(c.of)) {
      if (met) {
        // the way I meet it, when it is a thing of mine (a lantern, or eyes that see in the dark)
        const mine = c.of.find((o) => o && isNeed(o) && evaluateCondition(o, ctx));
        return { needs: mine ? [{ text: atomLabel(mine, data), met: true }] : [], hidden: false };
      }
      if (c.of.every((o) => o && isNeed(o))) return { needs: [{ text: c.of.map((o) => atomLabel(o, data)).join(" 또는 "), met: false }], hidden: false };
      return { needs: [], hidden: true };
    }
    if (isNeed(c)) {
      const text = atomLabel(c, data);
      return text ? { needs: [{ text, met }], hidden: false } : { needs: [], hidden: !met };
    }
    return { needs: [], hidden: !met };
  };
  return walk(condition);
}

// the effects every outcome of a choice applies to me, without an `if`: what it surely costs
function sureEffects(def) {
  const own = (e) => e && typeof e === "object" && (e.subject === undefined || e.subject === "self");
  if (Array.isArray(def.effects)) return def.effects.filter(own);
  if (def.outcomes && typeof def.outcomes === "object") {
    const lists = Object.values(def.outcomes).filter(Array.isArray).map((l) => l.filter(own));
    if (lists.length === 0) return [];
    const key = (e) => JSON.stringify(e);
    return lists[0].filter((e) => lists.every((l) => l.some((o) => key(o) === key(e))));
  }
  return [];
}

export function costsOf(def, data) {
  const costs = [];
  sureEffects(def).forEach((e) => {
    if (e.op === "money" && e.add < 0 && !/은화/.test(def.name ?? "")) costs.push(`은화 ${-e.add}`);
    if (e.op === "resource" && e.add < 0) costs.push(`${word(data, `lbl_res_${e.resource}`, e.resource)} ${-e.add}`);
    if (e.op === "item" && e.add < 0) {
      const name = data.items?.[e.item]?.name ?? e.item;
      costs.push(-e.add > 1 ? `${name} ${-e.add}` : name);
    }
  });
  return costs;
}

export function oddsWord(chance) {
  const [, band, text] = TIER_WORDS.find(([at]) => chance >= at);
  return { band, text };
}

// the check's name: the skill it trains, else the stat it leans on
function checkName(spec, data) {
  if (typeof spec.skill === "string") return word(data, `lbl_skill_${spec.skill}`, spec.skill);
  if (typeof spec.stat === "string") return word(data, `lbl_stat_${spec.stat}`, spec.stat);
  return "판정";
}

// stakesOf(def) -> { note, risk, title } for an available choice, or { note, locked: true } for one I cannot take yet
// and can be told why. `null`: say nothing (a dialogue option behind something that is not mine stays hidden).
export function stakesOf(def, state, data) {
  const requirement = def.requires === undefined ? { needs: [], hidden: false } : needsOf(def.requires, state, data);
  const available = def.requires === undefined || evaluateCondition(def.requires, ctxOf(state, data));
  if (!available) {
    const lacking = requirement.needs.filter((n) => !n.met).map((n) => n.text);
    if (requirement.hidden || lacking.length === 0) return null;
    return { locked: true, note: `필요: ${lacking.join(" · ")}`, title: "가진 것이 모자라 아직은 할 수 없다" };
  }
  const parts = [];
  // what I have that makes this possible (my things and gifts, not the silver or strength it spends)
  requirement.needs
    .filter((n) => n.met)
    .filter((n) => !/^(은화|기력) /.test(n.text))
    .forEach((n) => parts.push(`✓ ${n.text}`));
  if (Number.isInteger(def.minutes) && def.minutes > 0) parts.push(duration(def.minutes));
  parts.push(...costsOf(def, data));
  let risk;
  let title;
  if (def.check && typeof def.check === "object") {
    const { chance } = checkOdds(def.check, ctxOf(state, data));
    const odds = oddsWord(chance.success);
    risk = odds.band;
    const name = checkName(def.check, data);
    parts.push(`${name} ${Math.round(chance.success * 100)}% · ${odds.text}`);
    title = `${name}(으)로 겨룬다. 해낼 가능성 ${Math.round(chance.success * 100)}%`;
  }
  return { note: parts.join(" · "), risk, title };
}
