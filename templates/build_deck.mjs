import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const [specPath, manifestPath, outputPath, renderDir] = process.argv.slice(2);
if (!renderDir) throw new Error("usage: build_deck.mjs SPEC MANIFEST OUTPUT RENDER_DIR");
const spec = JSON.parse(await fs.readFile(specPath, "utf8"));
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const blocks = new Map(manifest.blocks.map((block) => [block.id, block]));
const C = { paper: "#F4F1EA", white: "#FFFFFF", ink: "#1B1B18", muted: "#6E6B63", rule: "#CBC5B8", accent: "#B85F35" };
const FONT = "Malgun Gothic";

async function writeBlob(filePath, blob) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}
function addText(slide, name, text, position, style = {}) {
  const shape = slide.shapes.add({ geometry: "textbox", name, position, fill: "none", line: { style: "solid", fill: "none", width: 0 } });
  shape.text = text;
  shape.text.style = { fontSize: 22, typeface: FONT, color: C.ink, verticalAlignment: "top", ...style };
  return shape;
}
function addRule(slide, name, left, top, width, color = C.rule, weight = 1) {
  slide.shapes.add({ geometry: "straightConnector1", name, position: { left, top, width, height: 0 }, fill: "none", line: { style: "solid", fill: color, width: weight } });
}
function addRect(slide, name, position, fill = C.white, line = C.rule) {
  return slide.shapes.add({ geometry: "rect", name, position, fill, line: { style: "solid", fill: line, width: 1 } });
}
async function blockBytes(blockId) {
  const block = blocks.get(blockId);
  if (!block) throw new Error("unknown block: " + blockId);
  return new Uint8Array(await fs.readFile(block.asset_ref));
}
async function addImage(slide, blockId, position, fit = "contain") {
  const block = blocks.get(blockId);
  addRect(slide, "image-field-" + blockId, position, C.white, C.rule);
  slide.images.add({ blob: await blockBytes(blockId), contentType: "image/png", alt: "Original panel block " + blockId + ", " + block.label, fit, position });
}
function chrome(slide, s) {
  addText(slide, "chrome-" + s.number, "ARCHITECTURE PANEL / SOURCE-TRACEABLE CRITIC", { left: 54, top: 24, width: 620, height: 20 }, { fontSize: 12, bold: true, color: C.muted, letterSpacing: 1.1 });
  addText(slide, "page-" + s.number, String(s.number).padStart(2, "0"), { left: 1172, top: 675, width: 54, height: 18 }, { fontSize: 12, bold: true, color: C.muted, alignment: "right" });
  addRule(slide, "footer-" + s.number, 54, 668, 1172);
}
function title(slide, s) {
  addText(slide, "title-" + s.number, s.title, { left: 54, top: 58, width: 1172, height: 58 }, { fontSize: 39, bold: true, autoFit: "shrinkText" });
}
function trace(slide, s) {
  addText(slide, "trace-" + s.number, "SOURCE · " + s.source_block_ids.join(" / "), { left: 54, top: 638, width: 1172, height: 18 }, { fontSize: 11, bold: true, color: C.muted, alignment: "right" });
}
function excerpt(block, max = 190) {
  const value = String((block && block.text) || "").replace(/\s+/g, " ").trim();
  if (!value) return "원문 OCR 검토 필요 · 확인되지 않은 문구는 자동 보정하지 않음";
  return value.length > max ? value.slice(0, max - 1).trim() + "…" : value;
}
function evidence(slide, s, blockId, position) {
  const block = blocks.get(blockId);
  addText(slide, "label-" + s.number, block.label.toUpperCase() + " · " + (block.drawing_scale || "SCALE NOT CONFIRMED"), { left: position.left, top: position.top, width: position.width, height: 22 }, { fontSize: 12, bold: true, color: C.accent, letterSpacing: .7 });
  addText(slide, "claim-" + s.number, s.description, { left: position.left, top: position.top + 42, width: position.width, height: 104 }, { fontSize: 25, bold: true, autoFit: "shrinkText" });
  addRule(slide, "evidence-rule-" + s.number, position.left, position.top + 170, position.width, C.ink, 2);
  addText(slide, "excerpt-" + s.number, excerpt(block), { left: position.left, top: position.top + 194, width: position.width, height: position.height - 194 }, { fontSize: 16, color: C.muted, autoFit: "shrinkText" });
}
async function cover(p, s, visual) {
  const slide = p.slides.add(); slide.background.fill = C.paper;
  addRect(slide, "cover-image-ground", { left: 630, top: 0, width: 650, height: 720 }, C.white, C.white);
  await addImage(slide, visual, { left: 630, top: 0, width: 650, height: 720 }, "cover");
  addText(slide, "cover-kicker", "15 MINUTE ARCHITECTURE CRITIC", { left: 54, top: 58, width: 500, height: 24 }, { fontSize: 13, bold: true, color: C.accent, letterSpacing: 1.3 });
  addText(slide, "cover-title", s.title, { left: 54, top: 142, width: 520, height: 178 }, { fontSize: 57, bold: true, autoFit: "shrinkText" });
  addRule(slide, "cover-rule", 54, 352, 210, C.ink, 2);
  addText(slide, "cover-description", s.description, { left: 54, top: 384, width: 490, height: 104 }, { fontSize: 24, color: C.ink, autoFit: "shrinkText" });
  addText(slide, "cover-meta", spec.duration_minutes + "분 · " + spec.slide_count + "장 · " + spec.audience, { left: 54, top: 590, width: 520, height: 26 }, { fontSize: 15, color: C.muted });
  addText(slide, "cover-trace", "SOURCE · " + s.source_block_ids.join(" / "), { left: 54, top: 650, width: 520, height: 18 }, { fontSize: 11, bold: true, color: C.muted });
  return slide;
}
async function split(p, s, visual, imageLeft) {
  const slide = p.slides.add(); slide.background.fill = C.paper; chrome(slide, s); title(slide, s);
  const imagePos = imageLeft ? { left: 54, top: 142, width: 730, height: 466 } : { left: 496, top: 142, width: 730, height: 466 };
  const textPos = imageLeft ? { left: 828, top: 150, width: 358, height: 430 } : { left: 54, top: 150, width: 390, height: 430 };
  await addImage(slide, visual, imagePos, "contain"); evidence(slide, s, visual, textPos); trace(slide, s); return slide;
}
async function drawing(p, s, visual) {
  const slide = p.slides.add(); slide.background.fill = C.paper; chrome(slide, s); title(slide, s);
  addText(slide, "drawing-claim-" + s.number, s.description, { left: 54, top: 121, width: 1172, height: 34 }, { fontSize: 18, bold: true, color: C.muted, autoFit: "shrinkText" });
  await addImage(slide, visual, { left: 54, top: 170, width: 1172, height: 440 }, "contain");
  const block = blocks.get(visual);
  addText(slide, "drawing-label-" + s.number, block.label.toUpperCase() + " · " + (block.drawing_scale || "SCALE NOT CONFIRMED"), { left: 54, top: 616, width: 560, height: 18 }, { fontSize: 11, bold: true, color: C.accent });
  trace(slide, s); return slide;
}
async function band(p, s, visual) {
  const slide = p.slides.add(); slide.background.fill = C.paper; chrome(slide, s); title(slide, s);
  await addImage(slide, visual, { left: 54, top: 146, width: 1172, height: 286 }, "contain");
  addRule(slide, "band-rule-" + s.number, 54, 466, 1172, C.ink, 2);
  addText(slide, "band-claim-" + s.number, s.description, { left: 54, top: 492, width: 760, height: 92 }, { fontSize: 29, bold: true, autoFit: "shrinkText" });
  addText(slide, "band-label-" + s.number, blocks.get(visual).label.toUpperCase() + " · SOURCE " + visual, { left: 866, top: 500, width: 320, height: 24 }, { fontSize: 12, bold: true, color: C.accent, alignment: "right" });
  addText(slide, "band-excerpt-" + s.number, excerpt(blocks.get(visual), 130), { left: 866, top: 540, width: 320, height: 70 }, { fontSize: 15, color: C.muted, alignment: "right", autoFit: "shrinkText" });
  trace(slide, s); return slide;
}
async function close(p, s, visual) {
  const slide = p.slides.add(); slide.background.fill = C.ink;
  await addImage(slide, visual, { left: 672, top: 0, width: 608, height: 720 }, "cover");
  addText(slide, "close-kicker", "SYNTHESIS", { left: 54, top: 62, width: 300, height: 24 }, { fontSize: 13, bold: true, color: "#D7D0C3", letterSpacing: 1.4 });
  addText(slide, "close-title", s.title, { left: 54, top: 144, width: 550, height: 176 }, { fontSize: 52, bold: true, color: C.white, autoFit: "shrinkText" });
  addRule(slide, "close-rule", 54, 354, 220, C.accent, 3);
  addText(slide, "close-description", s.description, { left: 54, top: 388, width: 520, height: 120 }, { fontSize: 24, color: C.white, autoFit: "shrinkText" });
  addText(slide, "close-trace", "SOURCE · " + s.source_block_ids.join(" / "), { left: 54, top: 648, width: 550, height: 20 }, { fontSize: 11, color: "#D7D0C3" }); return slide;
}

const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const drawingSlides = new Set([7, 9, 10, 11, 12]), bandSlides = new Set([5, 6, 13, 15]);
for (const s of spec.slides) {
  const visual = s.visual_block_ids[0];
  if (!s.source_block_ids.includes(visual)) throw new Error("slide " + s.number + " visual is not traceable");
  let slide;
  if (s.number === 1) slide = await cover(p, s, visual);
  else if (s.number === 16) slide = await close(p, s, visual);
  else if (drawingSlides.has(s.number)) slide = await drawing(p, s, visual);
  else if (bandSlides.has(s.number)) slide = await band(p, s, visual);
  else slide = await split(p, s, visual, s.number % 2 === 0);
  slide.speakerNotes.textFrame.setText(s.speaker_notes); slide.speakerNotes.setVisible(true);
}
await fs.mkdir(renderDir, { recursive: true });
for (const [index, slide] of p.slides.items.entries()) {
  const stem = "slide-" + String(index + 1).padStart(2, "0");
  await writeBlob(path.join(renderDir, stem + ".png"), await p.export({ slide, format: "png", scale: 1 }));
  await fs.writeFile(path.join(renderDir, stem + ".layout.json"), await (await slide.export({ format: "layout" })).text(), "utf8");
}
await writeBlob(path.join(renderDir, "montage.webp"), await p.export({ format: "webp", montage: true, scale: 1 }));
const pptx = await PresentationFile.exportPptx(p); await pptx.save(outputPath);
console.log(JSON.stringify({ outputPath, slideCount: p.slides.items.length, renderDir }));
