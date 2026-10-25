// A schematic of paths the player can travel *right now*, not a world map.
// The caller supplies only links already authorized by the engine's current
// requirements; no hidden location, future route, fact or RNG enters here.
export function visibleRoads(location, canTravel) {
  if (!Array.isArray(location?.links)) return [];
  return location.links
    .filter((link) => link && typeof link.to === "string" &&
      (link.requires === undefined || canTravel(link.requires)))
    .map((link) => ({ to: link.to, minutes: Number.isInteger(link.minutes) ? link.minutes : null }));
}

export function roadLayout(count) {
  if (count <= 0) return [];
  if (count === 1) return [[0.78, 0.5]];
  if (count === 2) return [[0.2, 0.5], [0.8, 0.5]];
  if (count === 3) return [[0.2, 0.27], [0.8, 0.27], [0.5, 0.84]];
  if (count === 4) return [[0.2, 0.25], [0.8, 0.25], [0.2, 0.78], [0.8, 0.78]];
  // Future packs may contain more exits: evenly distribute around the center.
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    return [0.5 + 0.35 * Math.cos(a), 0.5 + 0.33 * Math.sin(a)];
  });
}

function duration(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0) return "";
  if (minutes < 60) return `${minutes}분`;
  return minutes % 60 === 0 ? `${minutes / 60}시간` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

// The canvas is deliberately noninteractive. Real movement remains in the
// existing accessible buttons; this layer never dispatches engine actions.
export function drawRoadSketch(canvas, originName, roads, options = {}) {
  if (!canvas || !Array.isArray(roads) || roads.length < 2) return false;
  const width = Math.min(1200, Math.max(0, Math.round(canvas.clientWidth)));
  const ctx = canvas.getContext?.("2d");
  if (!ctx || width < 180) return false;
  const height = 160;
  const ratio = Math.min(2, Math.max(1, options.pixelRatio ?? globalThis.devicePixelRatio ?? 1));
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const ink = options.ink || "#26352b";
  const muted = options.muted || "#5b655d";
  const accent = options.accent || "#45604a";
  const rule = options.rule || "#aeb6ae";
  const center = [width / 2, height / 2];
  const positions = roadLayout(roads.length).map(([x, y]) => [x * width, y * height]);
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  roads.forEach((road, i) => {
    const [x, y] = positions[i];
    const goal = road.to === options.target;
    ctx.strokeStyle = goal ? accent : rule;
    ctx.setLineDash(goal ? [5, 3] : []);
    ctx.beginPath();
    ctx.moveTo(center[0], center[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  roads.forEach((road, i) => {
    const [x, y] = positions[i];
    const goal = road.to === options.target;
    ctx.fillStyle = goal ? accent : muted;
    ctx.beginPath();
    ctx.arc(x, y, goal ? 6 : 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = goal ? accent : ink;
    ctx.fillText(road.name, x, y - 12, Math.min(110, width * 0.3));
    const time = duration(road.minutes);
    if (time) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = muted;
      ctx.fillText(time, x, y + 19, Math.min(110, width * 0.3));
    }
  });
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(center[0], center[1], 7, 0, 2 * Math.PI);
  ctx.fill();
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.fillText(originName, center[0], center[1] - 14, Math.min(125, width * 0.34));
  return true;
}
