import { afterEach, describe, expect, it, vi } from "vitest";
import { exportErrorMessage, readImageData } from "./image-data";

afterEach(() => vi.unstubAllGlobals());

describe("persistent image data and export errors", () => {
  it("rejects non-image files", async () => {
    await expect(
      readImageData(new Blob(["text"], { type: "text/plain" })),
    ).rejects.toThrow("請選擇圖片");
  });
  it("stores image bytes rather than a blob URL", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        result = "data:image/png;base64,YWJj";
        onload?: () => void;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );
    expect(await readImageData(new Blob(["abc"], { type: "image/png" }))).toBe(
      "data:image/png;base64,YWJj",
    );
  });
  it("reports FileReader failures instead of leaving a pending save", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        onerror?: () => void;
        readAsDataURL() {
          this.onerror?.();
        }
      },
    );
    await expect(
      readImageData(new Blob(["abc"], { type: "image/png" })),
    ).rejects.toThrow("無法讀取圖片");
  });
  it("gives non-Error image events a usable message", () => {
    expect(exportErrorMessage(new Event("error"))).toContain("圖片轉換失敗");
    expect(exportErrorMessage(new Error("具體原因"))).toBe("具體原因");
    expect(exportErrorMessage("具體原因")).toBe("具體原因");
  });
});
