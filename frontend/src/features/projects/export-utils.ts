import type { Project } from "@/lib/api/types";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { exportBounds } from "./export-bounds";
import { exportTiles } from "./export-tiles";
import { exportErrorMessage, prepareExportImages } from "./image-data";

type Page = { name: string; data: string };
const names: Record<string, string> = {
  zone: "資料架構區",
  diverge: "發散思考區",
  converge: "收斂總結區",
};

function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Only capture inert clones: resizing live React Flow triggers fitView and
 * measurements during export. Bounded tiles retain text size on large graphs. */
async function capturePages(
  root: HTMLElement,
  project: Project,
  emit: (page: Page) => Promise<void>,
) {
  await document.fonts.ready;
  const imageCache = new Map<string, Promise<string>>();
  const warnings = new Set<string>();
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.dataset.exportStage = "true";
  Object.assign(stage.style, {
    position: "fixed",
    left: "0",
    top: "0",
    transform: "translateX(-20000px)",
    width: "1000px",
    background: "#fff",
    color: "#242424",
    pointerEvents: "none",
    overflow: "hidden",
  });
  const style = document.createElement("style");
  style.textContent = `
    [data-export-stage] .react-flow__controls,
    [data-export-stage] .react-flow__minimap,
    [data-export-stage] .react-flow__attribution,
    [data-export-stage] .react-flow__background,
    [data-export-stage] button { display: none !important; }
    [data-export-stage] * { animation: none !important; transition: none !important; }
    [data-export-stage] .react-flow__node.selected { box-shadow: none !important; }
  `;
  document.head.append(style);
  document.body.append(stage);
  const heading = document.createElement("div");
  Object.assign(heading.style, {
    height: "44px",
    padding: "10px 16px",
    font: "600 16px sans-serif",
    boxSizing: "border-box",
    borderBottom: "1px solid #ddd",
  });
  stage.append(heading);
  const frame = document.createElement("div");
  Object.assign(frame.style, {
    position: "relative",
    overflow: "hidden",
    width: "1000px",
    height: "650px",
  });
  stage.append(frame);
  const capture = async (name: string) => {
    heading.textContent = `${project.name} · ${name}`;
    try {
      await emit({
        name,
        data: await toPng(stage, {
          width: 1000,
          height: 694,
          pixelRatio: 1.5,
          backgroundColor: "#ffffff",
          canvasWidth: 1000,
          canvasHeight: 694,
          style: {
            position: "relative",
            left: "0",
            top: "0",
            transform: "none",
            insetInlineStart: "0",
            insetBlockStart: "0",
          },
        }),
      });
    } catch (reason) {
      throw new Error(`匯出「${name}」失敗：${exportErrorMessage(reason)}`, {
        cause: reason,
      });
    }
  };
  try {
    const pool = document.createElement("div");
    Object.assign(pool.style, {
      width: "1000px",
      padding: "16px",
      boxSizing: "border-box",
      fontSize: "14px",
    });
    root
      .querySelectorAll<HTMLElement>("[data-export-resource]")
      .forEach((item) => {
        const clone = item.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("button").forEach((button) => button.remove());
        clone.querySelectorAll<HTMLElement>("*").forEach((element) => {
          element.classList.remove("truncate", "line-clamp-2", "line-clamp-3");
          element.style.maxHeight = "none";
        });
        pool.append(clone);
      });
    if (!pool.childElementCount) pool.textContent = "資料池目前沒有資料";
    await prepareExportImages(pool, imageCache, warnings);
    frame.append(pool);
    const poolHeight = Math.max(1, pool.scrollHeight);
    for (const tile of exportTiles(1000, poolHeight)) {
      pool.style.transform = `translateY(${-tile.y}px)`;
      await capture(`資料池-${tile.row + 1}`);
    }
    frame.replaceChildren();
    for (const area of root.querySelectorAll<HTMLElement>(
      "[data-canvas-area]",
    )) {
      const flow = area.querySelector<HTMLElement>(".react-flow");
      const viewport = flow?.querySelector<HTMLElement>(
        ".react-flow__viewport",
      );
      if (!flow || !viewport) continue;
      const rect = flow.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(
        getComputedStyle(viewport).transform,
      );
      const scale = Math.abs(matrix.a) || 1;
      const bounds = exportBounds(
        Array.from(flow.querySelectorAll<HTMLElement>(".react-flow__node")).map(
          (node) => {
            const box = node.getBoundingClientRect();
            return {
              x: (box.left - rect.left - matrix.e) / scale,
              y: (box.top - rect.top - matrix.f) / scale,
              width: box.width / scale,
              height: box.height / scale,
            };
          },
        ),
      );
      const clone = flow.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-collaboration-presence]').forEach(element => element.remove());
      Object.assign(clone.style, {
        width: "1000px",
        height: "650px",
        minHeight: "0",
        position: "relative",
        overflow: "hidden",
        flex: "none",
      });
      const renderer = clone.querySelector<HTMLElement>(
        ".react-flow__renderer",
      );
      if (renderer)
        Object.assign(renderer.style, { width: "1000px", height: "650px" });
      const cloneViewport = clone.querySelector<HTMLElement>(
        ".react-flow__viewport",
      )!;
      await prepareExportImages(clone, imageCache, warnings);
      frame.replaceChildren(clone);
      // html-to-image deep-clones SVGs without traversing their children. Resolve
      // SVG CSS here, otherwise label backgrounds lose their white fill and
      // become black rectangles over the relationship text in the PNG/PDF.
      clone.querySelectorAll<SVGElement>("svg, svg *").forEach((element) => {
        const computed = getComputedStyle(element);
        for (const property of [
          "fill",
          "stroke",
          "stroke-width",
          "font-size",
          "font-family",
          "font-weight",
          "opacity",
          "paint-order",
        ]) {
          element.style.setProperty(
            property,
            computed.getPropertyValue(property),
          );
        }
      });
      for (const tile of exportTiles(bounds.width, bounds.height)) {
        cloneViewport.style.transform = `translate(${bounds.x - tile.x}px, ${bounds.y - tile.y}px) scale(1)`;
        await capture(
          `${names[area.dataset.canvasArea || ""] || "畫布"}-${tile.row + 1}-${tile.column + 1}`,
        );
      }
      frame.replaceChildren();
    }
  } finally {
    stage.remove();
    style.remove();
  }
  return [...warnings];
}

export async function exportProjectPng(root: HTMLElement, project: Project) {
  const zip = new JSZip();
  let index = 0;
  const warnings = await capturePages(root, project, async ({ name, data }) => {
    zip.file(
      `${String(++index).padStart(3, "0")}-${name}.png`,
      data.split(",")[1],
      { base64: true },
    );
  });
  if (warnings.length) zip.file("圖片警告.txt", warnings.join("\n"));
  zip.file(
    "閱讀說明.txt",
    "資料池與三區分開輸出。大畫布依原始比例分片，檔名為區域-列-欄，相鄰圖片保留 320px 重疊以便完整閱讀一般節點與對照連線。編輯中的畫布不會被更動。",
  );
  download(
    `${project.name || "context-flow"}-PNG.zip`,
    await zip.generateAsync({ type: "blob" }),
  );
  return { warnings };
}

export async function exportProjectPdf(root: HTMLElement, project: Project) {
  const pages: Page[] = [];
  const warnings = await capturePages(root, project, async (page) => {
    pages.push(page);
  });
  const iframe = document.createElement("iframe");
  iframe.title = "PDF 列印預覽";
  Object.assign(iframe.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    left: "-20000px",
    top: "0",
  });
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.title = project.name;
  const style = doc.createElement("style");
  style.textContent =
    "@page { size: A4 landscape; margin: 8mm; } body { margin: 0; } section { height: 193mm; break-after: page; } section:last-child { break-after: auto; } img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: left top; }";
  doc.head.append(style);
  try {
    const images = pages.map(({ name, data }) => {
      const section = doc.createElement("section");
      const image = doc.createElement("img");
      image.alt = name;
      image.src = data;
      section.append(image);
      doc.body.append(section);
      return image;
    });
    await Promise.all(images.map((image) => image.decode()));
    const printWindow = iframe.contentWindow!;
    printWindow.addEventListener("afterprint", () => iframe.remove(), {
      once: true,
    });
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => iframe.remove(), 120_000);
    return { warnings };
  } catch (error) {
    iframe.remove();
    throw error;
  }
}
