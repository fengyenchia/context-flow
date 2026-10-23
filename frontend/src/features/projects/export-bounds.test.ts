import { expect, it } from "vitest";
import { exportBounds } from "./export-bounds";

it("includes nodes left and above the viewport without clipping", () => {
  const nodes = [
    { x: -800, y: -500, width: 220, height: 100 },
    { x: 1600, y: 700, width: 300, height: 400 },
  ];
  const bounds = exportBounds(nodes);
  expect(bounds).toEqual({ x: 832, y: 532, width: 2764, height: 1664 });
  for (const node of nodes) {
    expect(node.x + bounds.x).toBeGreaterThanOrEqual(32);
    expect(node.y + bounds.y).toBeGreaterThanOrEqual(32);
    expect(node.x + bounds.x + node.width).toBeLessThanOrEqual(
      bounds.width - 32,
    );
  }
});

it("keeps a useful size for an empty area", () => {
  expect(exportBounds([])).toEqual({ x: 32, y: 32, width: 640, height: 520 });
});
