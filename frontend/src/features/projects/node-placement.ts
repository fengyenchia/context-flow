type Point = { x: number; y: number };
type PositionedNode = {
  position: Point;
  measured?: { width?: number; height?: number };
  style?: { width?: number | string; height?: number | string };
};

/** Keep new nodes in their own area and below any occupied center position. */
export function findFreeNodePosition(
  preferred: Point,
  nodes: PositionedNode[],
  width = 220,
) {
  const gap = 32;
  const height = 180;
  const position = { ...preferred };
  for (let attempt = 0; attempt <= nodes.length; attempt += 1) {
    const collision = nodes.find((node) => {
      const otherWidth =
        node.measured?.width || Number(node.style?.width) || width;
      const otherHeight =
        node.measured?.height || Number(node.style?.height) || height;
      return (
        position.x < node.position.x + otherWidth + gap &&
        position.x + width + gap > node.position.x &&
        position.y < node.position.y + otherHeight + gap &&
        position.y + height + gap > node.position.y
      );
    });
    if (!collision) break;
    position.y =
      collision.position.y +
      (collision.measured?.height ||
        Number(collision.style?.height) ||
        height) +
      gap;
  }
  return position;
}
