import { describe, expect, it } from "vitest";
import { findFreeNodePosition } from "./node-placement";

describe("new node placement", () => {
  it("keeps the preferred position when the area is empty", () => {
    expect(findFreeNodePosition({ x: 20, y: 30 }, [])).toEqual({
      x: 20,
      y: 30,
    });
  });
  it("uses measured height to place a node below an existing node", () => {
    expect(
      findFreeNodePosition({ x: 20, y: 30 }, [
        { position: { x: 20, y: 30 }, measured: { width: 220, height: 300 } },
      ]),
    ).toEqual({ x: 20, y: 362 });
  });
  it("skips all collisions even when the stored order is reversed", () => {
    expect(
      findFreeNodePosition({ x: 0, y: 0 }, [
        { position: { x: 0, y: 212 } },
        { position: { x: 0, y: 0 } },
      ]),
    ).toEqual({ x: 0, y: 424 });
  });
  it("does not move for a separate horizontal branch or mutate its input", () => {
    const preferred = { x: 0, y: 0 };
    expect(
      findFreeNodePosition(preferred, [{ position: { x: 400, y: 0 } }]),
    ).toEqual(preferred);
    expect(preferred).toEqual({ x: 0, y: 0 });
  });
});
