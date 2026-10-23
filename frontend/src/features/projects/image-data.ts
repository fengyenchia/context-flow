/** Persist the bytes, not a session-scoped blob: URL that dies after reload. */
export function readImageData(file: Blob): Promise<string> {
  if (!file.type.startsWith("image/"))
    return Promise.reject(new Error("請選擇圖片檔案"));
  return readBlobData(file);
}

function readBlobData(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("無法讀取圖片，請重新選擇"));
    };
    reader.onerror = () => reject(new Error("無法讀取圖片，請重新選擇"));
    reader.onabort = () => reject(new Error("圖片讀取已取消"));
    reader.readAsDataURL(file);
  });
}

export function exportErrorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === "string" && reason.trim()) return reason;
  return "畫面或圖片轉換失敗，請檢查圖片是否可載入後重試";
}

/** Prepare only the inert export copy. Missing images must not abort the file. */
export async function prepareExportImages(
  root: HTMLElement,
  cache: Map<string, Promise<string>>,
  warnings: Set<string>,
) {
  for (const image of root.querySelectorAll<HTMLImageElement>("img")) {
    const source = image.currentSrc || image.src;
    try {
      if (!cache.has(source)) {
        cache.set(
          source,
          (async () => {
            const response = await fetch(source, {
              signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) throw new Error("圖片下載失敗");
            // Some object stores serve valid images as application/octet-stream.
            // Let the image decoder verify the bytes instead of rejecting MIME alone.
            const data = await readBlobData(await response.blob());
            await new Promise<void>((resolve, reject) => {
              const probe = new Image();
              const timer = window.setTimeout(
                () => finish(new Error("圖片載入逾時")),
                10_000,
              );
              const finish = (error?: Error) => {
                window.clearTimeout(timer);
                probe.onload = null;
                probe.onerror = null;
                if (error) reject(error);
                else resolve();
              };
              probe.onload = () => finish();
              probe.onerror = () => finish(new Error("圖片內容無法解碼"));
              probe.src = data;
            });
            return data;
          })(),
        );
      }
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.loading = "eager";
      image.src = await cache.get(source)!;
    } catch {
      const message = `${image.alt || "圖片"}：圖片無法載入，請重新上傳原圖`;
      warnings.add(message);
      const placeholder = document.createElement("div");
      placeholder.dataset.exportImageMissing = "true";
      placeholder.textContent = message;
      Object.assign(placeholder.style, {
        padding: "12px",
        font: "12px sans-serif",
        color: "#5b4949",
        background: "#f7eeee",
        border: "1px dashed #b79393",
        whiteSpace: "normal",
      });
      image.replaceWith(placeholder);
    }
  }
}
