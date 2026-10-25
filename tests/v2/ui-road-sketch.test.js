import assert from "node:assert/strict";
import { visibleRoads, roadLayout, drawRoadSketch } from "../../web/v2/ui/road-sketch.js";

const links = [
  { to: "loc_market", minutes: 15 },
  { to: "loc_ruins", minutes: 45, requires: { key: "rumor" } },
  { to: "loc_secret", minutes: 20, requires: { key: "secret" } },
  { to: "loc_spring", minutes: 60, requires: { key: "rumor" } }
];
const before = structuredClone(links);
const permitted = visibleRoads({ links }, (requires) => requires.key === "rumor");
assert.deepEqual(permitted, [
  { to: "loc_market", minutes: 15 },
  { to: "loc_ruins", minutes: 45 },
  { to: "loc_spring", minutes: 60 }
]);
assert.deepEqual(links, before, "projection cannot mutate engine links");
assert.deepEqual(visibleRoads({ links }, () => false), [{ to: "loc_market", minutes: 15 }]);
assert.deepEqual(visibleRoads(null, () => true), []);
assert.equal(roadLayout(4).length, 4);
assert.ok(roadLayout(7).every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));

const calls = [];
const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: () => true });
const canvas = { clientWidth: 640, width: 0, height: 0, getContext: () => ctx };
const sketch = permitted.map((road) => ({ ...road, name: road.to }));
const snapshot = structuredClone(sketch);
assert.equal(drawRoadSketch(canvas, "변경 마을", sketch, { target: "loc_ruins", pixelRatio: 2 }), true);
assert.equal(canvas.width, 1280);
assert.equal(canvas.height, 320);
assert.deepEqual(sketch, snapshot, "drawing cannot mutate visible routes");
assert.equal(calls.filter(([name]) => name === "lineTo").length, 3);
assert.ok(calls.some(([name, ...args]) => name === "fillText" && args[0] === "변경 마을"));
assert.ok(!calls.some(([name, ...args]) => name === "fillText" && args[0] === "loc_secret"), "hidden exits never enter drawing");
assert.equal(drawRoadSketch(canvas, "변경 마을", sketch.slice(0, 1)), false);
assert.equal(drawRoadSketch({ clientWidth: 120, getContext: () => ctx }, "변경 마을", sketch), false);
console.log("V2 visible road sketch: projection, layout, drawing and hidden-exit boundary PASS");
