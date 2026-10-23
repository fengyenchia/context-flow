// Small, offline browser regression for offscreen capture positioning.
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({
    path: resolve("frontend/node_modules/html-to-image/dist/html-to-image.js"),
  });
  const result = await page.evaluate(async () => {
    const stage = document.createElement("div");
    Object.assign(stage.style, {
      position: "fixed",
      left: "0",
      top: "0",
      transform: "translateX(-20000px)",
      width: "1000px",
      background: "#fff",
      overflow: "hidden",
    });
    stage.innerHTML =
      '<div style="height:44px;color:black">Export title</div><div style="width:1000px;height:650px"><div style="margin:32px;width:280px;height:120px;background:rgb(241,249,246);color:black">Node content</div></div>';
    document.body.append(stage);
    const data = await window.htmlToImage.toPng(stage, {
      width: 1000,
      height: 694,
      pixelRatio: 1.5,
      backgroundColor: "#fff",
      style: {
        position: "relative",
        left: "0",
        top: "0",
        transform: "none",
        insetInlineStart: "0",
        insetBlockStart: "0",
      },
    });
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] < 250 && pixels[i + 1] > pixels[i] + 3) colored++;
    return { colored, width: image.width, height: image.height };
  });
  console.log(result);
  if (result.colored < 1000) throw new Error("Offscreen PNG rendered blank");
} finally {
  await browser.close();
}
