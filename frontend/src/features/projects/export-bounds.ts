export function exportBounds(
  nodes: Array<{ x: number; y: number; width: number; height: number }>,
  padding = 32,
) {
  if (!nodes.length) return { x: padding, y: padding, width: 640, height: 520 };
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  return {
    x: padding - left,
    y: padding - top,
    width: Math.ceil(Math.max(640, right - left + padding * 2)),
    height: Math.ceil(Math.max(520, bottom - top + padding * 2)),
  };
}
