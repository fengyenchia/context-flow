import { expect, it } from "vitest";
import { buildConvergencePrompt } from "./convergence-context";

it("uses developed ideas as primary sources, with relationships and full content", () => {
  const text = "完整的想法".repeat(300);
  const prompt = buildConvergencePrompt(
    [
      {
        id: "zone-background",
        data: { nodeTitle: "背景限制", nodeContent: "預算" },
      },
      {
        id: "diverge-one",
        data: { nodeTitle: "聲音互動", nodeContent: text, starred: true },
      },
      { id: "converge-old", data: { nodeTitle: "不應循環當成來源" } },
    ],
    [
      { source: "zone-background", target: "diverge-one", label: "延伸" },
      { source: "diverge-one", target: "converge-old" },
    ],
  );
  expect(prompt).toContain(text);
  expect(prompt).toContain('"important":true');
  expect(prompt).toContain('"label":"延伸"');
  expect(prompt).toContain("來源");
  expect(prompt).not.toContain("converge-old");
  expect(prompt).not.toContain("不應循環當成來源");
});

it("does not invent routes without divergent ideas", () => {
  expect(() =>
    buildConvergencePrompt([{ id: "zone-one", data: {} }], []),
  ).toThrow("發散思考區");
});
