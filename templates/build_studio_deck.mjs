import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactToolModule = process.env.ARTIFACT_TOOL_PATH ? pathToFileURL(process.env.ARTIFACT_TOOL_PATH).href : "@oai/artifact-tool";
const { Presentation, PresentationFile } = await import(artifactToolModule);

const [specPath, projectPath, assetMapPath, outputPath, renderDir] = process.argv.slice(2);
if (!renderDir) throw new Error("usage: build_studio_deck.mjs SPEC PROJECT ASSET_MAP OUTPUT RENDER_DIR");
const spec = JSON.parse(await fs.readFile(specPath, "utf8"));
const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
const assetMap = JSON.parse(await fs.readFile(assetMapPath, "utf8"));
if (spec.approvalStatus !== "approved") throw new Error("Studio PPTX export requires an approved storyboard");
if (spec.slides.reduce((sum, slide) => sum + slide.expectedSeconds, 0) !== spec.durationMinutes * 60) throw new Error("slide timing does not equal duration");
const elements = new Map(project.elements.map((element) => [element.id, element]));
const C = { paper: "#F4F0E7", ink: "#1C1D1A", muted: "#77776F", line: "#C9C2B4", accent: "#C45C32", white: "#FFFFFF", dark: "#20211F" };
const FONT = "Malgun Gothic";

async function writeBlob(filePath, blob) { await fs.mkdir(path.dirname(filePath), { recursive: true }); await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer())); }
function addText(slide, name, value, position, style = {}) {
  const box = slide.shapes.add({ geometry: "textbox", name, position, fill: "none", line: { style: "solid", fill: "none", width: 0 } });
  box.text = String(value ?? ""); box.text.style = { typeface: FONT, fontSize: 20, color: C.ink, verticalAlignment: "top", autoFit: "shrinkText", ...style }; return box;
}
function addRect(slide, name, position, fill = C.white, line = C.line) { return slide.shapes.add({ geometry: "rect", name, position, fill, line: { style: "solid", fill: line, width: 1 } }); }
function addRule(slide, name, left, top, width, color = C.line, weight = 1) { slide.shapes.add({ geometry: "straightConnector1", name, position: { left, top, width, height: 0 }, fill: "none", line: { style: "solid", fill: color, width: weight } }); }
async function addVisual(slide, elementId, position, fit = "contain") {
  const asset = assetMap[elementId]; if (!asset) return false;
  addRect(slide, `visual-ground-${elementId}`, position, C.white, C.line);
  slide.images.add({ blob: new Uint8Array(await fs.readFile(asset.path)), contentType: asset.contentType, alt: `Original Studio element ${elementId}`, fit, position }); return true;
}
function chrome(slide, item) {
  addText(slide, `kicker-${item.number}`, "ARCHIPANEL STUDIO · SOURCE-TRACEABLE PRESENTATION", { left: 54, top: 25, width: 880, height: 18 }, { fontSize: 10, bold: true, color: C.muted, letterSpacing: 1 });
  addText(slide, `page-${item.number}`, String(item.number).padStart(2, "0"), { left: 1170, top: 675, width: 56, height: 18 }, { fontSize: 10, bold: true, color: C.muted, alignment: "right" });
  addRule(slide, `foot-${item.number}`, 54, 667, 1172);
}
function trace(slide, item) { addText(slide, `trace-${item.number}`, `SOURCE BLOCK · ${item.sourceContentBlockIds.join(" / ")}\nSOURCE ELEMENT · ${item.sourceElementIds.join(" / ")}`, { left: 54, top: 620, width: 1172, height: 35 }, { fontSize: 9, color: C.muted, alignment: "right" }); }

const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
for (const item of spec.slides) {
  if (!item.sourceContentBlockIds.length || !item.sourceElementIds.length) throw new Error(`slide ${item.number} has no source trace`);
  const slide = presentation.slides.add(); slide.background.fill = item.number === spec.slideCount ? C.dark : C.paper;
  const sourceElements = item.sourceElementIds.map((id) => elements.get(id)).filter(Boolean);
  const visual = sourceElements.find((element) => ["image", "pdf"].includes(element.type));
  if (item.number === 1) {
    addText(slide, "cover-kicker", `${spec.durationMinutes} MINUTES · ${spec.slideCount} SLIDES`, { left: 60, top: 62, width: 500, height: 24 }, { fontSize: 12, bold: true, color: C.accent, letterSpacing: 1.3 });
    addText(slide, "cover-title", item.title, { left: 60, top: 142, width: 520, height: 170 }, { fontSize: 52, bold: true }); addRule(slide, "cover-rule", 60, 344, 190, C.accent, 3);
    addText(slide, "cover-key", item.keySentence, { left: 60, top: 380, width: 500, height: 118 }, { fontSize: 24 });
    if (visual) await addVisual(slide, visual.id, { left: 650, top: 0, width: 630, height: 720 }, "cover");
    addText(slide, "cover-trace", `SOURCE · ${item.sourceContentBlockIds.join(" / ")}`, { left: 60, top: 646, width: 520, height: 20 }, { fontSize: 9, color: C.muted });
  } else if (item.number === spec.slideCount) {
    if (visual) await addVisual(slide, visual.id, { left: 690, top: 0, width: 590, height: 720 }, "cover");
    addText(slide, `close-title-${item.number}`, item.title, { left: 54, top: 145, width: 560, height: 154 }, { fontSize: 48, bold: true, color: C.white }); addRule(slide, `close-rule-${item.number}`, 54, 340, 190, C.accent, 3);
    addText(slide, `close-key-${item.number}`, item.keySentence, { left: 54, top: 382, width: 540, height: 125 }, { fontSize: 24, color: C.white });
    addText(slide, `close-trace-${item.number}`, `SOURCE · ${item.sourceContentBlockIds.join(" / ")}`, { left: 54, top: 646, width: 560, height: 20 }, { fontSize: 9, color: "#CBC6BB" });
  } else {
    chrome(slide, item); addText(slide, `title-${item.number}`, item.title, { left: 54, top: 62, width: 1172, height: 58 }, { fontSize: 36, bold: true });
    if (visual) {
      const visualLeft = item.number % 2 === 0; const imagePos = visualLeft ? { left: 54, top: 142, width: 720, height: 450 } : { left: 510, top: 142, width: 716, height: 450 }; const textLeft = visualLeft ? 820 : 54;
      await addVisual(slide, visual.id, imagePos, visual.type === "image" ? "cover" : "contain");
      addText(slide, `purpose-label-${item.number}`, "PRESENTATION PURPOSE", { left: textLeft, top: 160, width: 350, height: 20 }, { fontSize: 10, bold: true, color: C.accent, letterSpacing: .9 });
      addText(slide, `purpose-${item.number}`, item.purpose, { left: textLeft, top: 196, width: 350, height: 86 }, { fontSize: 20, bold: true }); addRule(slide, `midrule-${item.number}`, textLeft, 312, 350, C.ink, 2);
      addText(slide, `key-${item.number}`, item.keySentence, { left: textLeft, top: 342, width: 350, height: 170 }, { fontSize: 24, bold: true });
    } else {
      addText(slide, `purpose-${item.number}`, item.purpose, { left: 54, top: 150, width: 510, height: 70 }, { fontSize: 18, bold: true, color: C.accent });
      addText(slide, `key-${item.number}`, item.keySentence, { left: 54, top: 250, width: 790, height: 190 }, { fontSize: 38, bold: true });
      const sourceText = sourceElements.filter((element) => element.type === "text").map((element) => element.text).join("\n\n");
      addRect(slide, `evidence-ground-${item.number}`, { left: 895, top: 145, width: 331, height: 430 }, C.white, C.line); addText(slide, `evidence-${item.number}`, sourceText || "원본 텍스트 근거 없음", { left: 920, top: 174, width: 282, height: 370 }, { fontSize: 16, color: C.muted });
    }
    trace(slide, item);
  }
  slide.speakerNotes.textFrame.setText(item.speakerNotes); slide.speakerNotes.setVisible(true);
}
await fs.mkdir(renderDir, { recursive: true });
for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  await writeBlob(path.join(renderDir, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 1 }));
  await fs.writeFile(path.join(renderDir, `${stem}.layout.json`), await (await slide.export({ format: "layout" })).text(), "utf8");
}
await writeBlob(path.join(renderDir, "montage.webp"), await presentation.export({ format: "webp", montage: true, scale: 1 }));
const pptx = await PresentationFile.exportPptx(presentation); await pptx.save(outputPath);
console.log(JSON.stringify({ outputPath, slideCount: presentation.slides.items.length, renderDir }));
