export function exportTiles(
  width: number,
  height: number,
  tileWidth = 1000,
  tileHeight = 650,
  overlap = 320,
) {
  if (
    ![width, height, tileWidth, tileHeight, overlap].every(Number.isFinite) ||
    width < 0 ||
    height < 0 ||
    overlap < 0 ||
    overlap >= Math.min(tileWidth, tileHeight)
  )
    throw new Error("無效的匯出尺寸");
  const columns = Math.max(
    1,
    Math.ceil((width - overlap) / (tileWidth - overlap)),
  );
  const rows = Math.max(
    1,
    Math.ceil((height - overlap) / (tileHeight - overlap)),
  );
  return Array.from({ length: rows * columns }, (_, index) => ({
    column: index % columns,
    row: Math.floor(index / columns),
    x: (index % columns) * (tileWidth - overlap),
    y: Math.floor(index / columns) * (tileHeight - overlap),
  }));
}
