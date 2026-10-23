import { expect, it } from "vitest";
import { exportTiles } from "./export-tiles";

it("keeps normal areas on a single readable page", () => {
  expect(exportTiles(1000, 650)).toEqual([{ x: 0, y: 0, row: 0, column: 0 }]);
});

it("covers very wide/tall graphs without a giant canvas or downscaling", () => {
  const tiles = exportTiles(30000, 2000);
  expect(tiles.at(-1)!.x + 1000).toBeGreaterThanOrEqual(30000);
  expect(tiles.at(-1)!.y + 650).toBeGreaterThanOrEqual(2000);
  expect(tiles[1].x).toBe(680);
  expect(new Set(tiles.map((tile) => `${tile.x}:${tile.y}`)).size).toBe(
    tiles.length,
  );
});

it("rejects invalid values instead of looping indefinitely", () => {
  expect(() => exportTiles(Infinity, 5)).toThrow();
  expect(() => exportTiles(100, 100, 1000, 650, 650)).toThrow();
});
