import { expect, it } from "vitest";
import { pinchView } from "./touch";

it("keeps the touched canvas point anchored while pinching and panning", () => {
  const view = { zoom: 1, x: 20, y: 40 }, start = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
  expect(pinchView(view, start, [{ x: 100, y: 120 }, { x: 300, y: 120 }])).toEqual({ zoom: 2, x: -60, y: 0 });
  expect(pinchView(view, start, start)).toEqual(view);
});
it("bounds touch zoom and handles coincident contacts", () => {
  const result = pinchView({ zoom: 1, x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
  expect(result.zoom).toBe(4); expect(Number.isFinite(result.x)).toBe(true);
});
