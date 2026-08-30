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
const blocks = new Map(project.contentBlocks.map((block) => [block.id, block]));
const C = { paper: "#F5F3EE", ink: "#171917", muted: "#6F746F", line: "#CED3CE", accent: "#3B82C4", white: "#FFFFFF", dark: "#171B1D", warn: "#B8673D" };
const FONT = "Malgun Gothic";

async function writeBlob(filePath, blob) { await fs.mkdir(path.dirname(filePath), { recursive: true }); await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer())); }
function addText(slide, name, value, position, style = {}) {
  const box = slide.shapes.add({ geometry: "textbox", name, position, fill: "none", line: { style: "solid", fill: "none", width: 0 } });
  box.text = String(value ?? ""); box.text.style = { typeface: FONT, fontSize: 18, color: C.ink, verticalAlignment: "top", autoFit: "shrinkText", ...style }; return box;
}
function addRect(slide, name, position, fill = C.white, line = C.line) { return slide.shapes.add({ geometry: "rect", name, position, fill, line: { style: "solid", fill: line, width: 1 } }); }
function addRule(slide, name, left, top, width, color = C.line, weight = 1) { slide.shapes.add({ geometry: "straightConnector1", name, position: { left, top, width, height: 0 }, fill: "none", line: { style: "solid", fill: color, width: weight } }); }
async function addVisual(slide, elementId, position, fit = "contain") {
  const asset = assetMap[elementId]; if (!asset) return false;
  addRect(slide, `visual-ground-${elementId}`, position, C.white, C.line);
  slide.images.add({ blob: new Uint8Array(await fs.readFile(asset.path)), contentType: asset.contentType, alt: `User-approved panel element ${elementId}`, fit, position }); return true;
}
function chrome(slide, item) {
  addText(slide, `kicker-${item.number}`, "ARCHIPANEL · DESIGN EXPLANATION", { left: 54, top: 24, width: 640, height: 18 }, { fontSize: 10, bold: true, color: C.muted, letterSpacing: 1.2 });
  addText(slide, `section-${item.number}`, String(item.designSectionId || "evidence").toUpperCase(), { left: 900, top: 24, width: 270, height: 18 }, { fontSize: 10, bold: true, color: C.accent, alignment: "right" });
  addText(slide, `page-${item.number}`, String(item.number).padStart(2, "0"), { left: 1176, top: 675, width: 50, height: 18 }, { fontSize: 10, bold: true, color: C.muted, alignment: "right" });
  addRule(slide, `foot-${item.number}`, 54, 666, 1172);
}
function addTitle(slide, item) { addText(slide, `title-${item.number}`, item.title, { left: 54, top: 60, width: 1172, height: 60 }, { fontSize: 36, bold: true }); }
function addTrace(slide, item) {
  const blockText = item.sourceContentBlockIds.slice(0, 4).join(" / ") + (item.sourceContentBlockIds.length > 4 ? ` +${item.sourceContentBlockIds.length - 4}` : "");
  addText(slide, `trace-${item.number}`, `SOURCE BLOCK · ${blockText}`, { left: 54, top: 630, width: 1100, height: 22 }, { fontSize: 8, color: C.muted, alignment: "right" });
}
function addPurpose(slide, item, position = { left: 54, top: 145, width: 360, height: 190 }) {
  addText(slide, `purpose-label-${item.number}`, "PRESENTATION PURPOSE", { left: position.left, top: position.top, width: position.width, height: 18 }, { fontSize: 9, bold: true, color: C.accent, letterSpacing: 1 });
  addText(slide, `purpose-${item.number}`, item.purpose, { left: position.left, top: position.top + 32, width: position.width, height: 72 }, { fontSize: 17, bold: true });
  addRule(slide, `purpose-rule-${item.number}`, position.left, position.top + 119, Math.min(180, position.width), C.ink, 2);
  addText(slide, `key-${item.number}`, item.keySentence, { left: position.left, top: position.top + 145, width: position.width, height: position.height }, { fontSize: 23, bold: true });
}
function addReview(slide, item, top = 540) {
  if (!item.reviewFlags?.length) return;
  addRect(slide, `review-ground-${item.number}`, { left: 54, top, width: 1172, height: 58 }, "#F7EDE6", "#E4BFA9");
  addText(slide, `review-${item.number}`, `REVIEW NEEDED · ${item.reviewFlags.join(" · ")}`, { left: 72, top: top + 17, width: 1135, height: 26 }, { fontSize: 11, bold: true, color: C.warn });
}

const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
for (const item of spec.slides) {
  if (!item.sourceContentBlockIds.length || !item.sourceElementIds.length) throw new Error(`slide ${item.number} has no source trace`);
  const slide = presentation.slides.add();
  const sourceElements = item.sourceElementIds.map((id) => elements.get(id)).filter(Boolean);
  const elementLabels = new Map();
  for (const blockId of item.sourceContentBlockIds) for (const elementId of (blocks.get(blockId)?.elementIds || [])) elementLabels.set(elementId, blocks.get(blockId)?.label || "");
  const visualRank = (element) => ({ render: 0, detail: 1, concept: 2, master_plan: 3, floor_plan: 4 }[elementLabels.get(element.id)] ?? 5);
  const visuals = sourceElements.filter((element) => ["image", "pdf"].includes(element.type) && assetMap[element.id]).sort((left, right) => visualRank(left) - visualRank(right));
  const layout = item.layoutKind || (item.number === 1 ? "cover" : item.number === spec.slideCount ? "closing" : "image_text");
  slide.background.fill = layout === "closing" ? C.dark : C.paper;

  if (layout === "cover") {
    if (visuals[0]) await addVisual(slide, visuals[0].id, { left: 650, top: 0, width: 630, height: 720 }, "cover");
    addText(slide, "cover-kicker", `${spec.durationMinutes} MIN · ${spec.slideCount} SLIDES · ${spec.audience}`, { left: 60, top: 60, width: 540, height: 28 }, { fontSize: 11, bold: true, color: C.accent, letterSpacing: 1.1 });
    addText(slide, "cover-title", item.title, { left: 60, top: 140, width: 520, height: 150 }, { fontSize: 52, bold: true });
    addRule(slide, "cover-rule", 60, 330, 180, C.accent, 3);
    addText(slide, "cover-key", item.keySentence, { left: 60, top: 370, width: 520, height: 145 }, { fontSize: 24, bold: true });
    addText(slide, "cover-source", `APPROVED PANEL EVIDENCE · ${item.sourceContentBlockIds.length} BLOCK`, { left: 60, top: 646, width: 520, height: 20 }, { fontSize: 9, color: C.muted });
  } else if (layout === "closing") {
    if (visuals[0]) await addVisual(slide, visuals[0].id, { left: 760, top: 0, width: 520, height: 720 }, "cover");
    addText(slide, "closing-kicker", "EVIDENCE-BOUND CONCLUSION", { left: 54, top: 64, width: 560, height: 22 }, { fontSize: 11, bold: true, color: C.accent, letterSpacing: 1.1 });
    addText(slide, "closing-title", item.title, { left: 54, top: 140, width: 620, height: 120 }, { fontSize: 46, bold: true, color: C.white });
    addRule(slide, "closing-rule", 54, 300, 190, C.accent, 3);
    addText(slide, "closing-key", item.keySentence, { left: 54, top: 340, width: 610, height: 150 }, { fontSize: 24, bold: true, color: C.white });
    addText(slide, "closing-review", item.reviewFlags?.length ? `검토 필요\n${item.reviewFlags.join("\n")}` : "검토 필요 없음", { left: 54, top: 525, width: 610, height: 100 }, { fontSize: 13, color: "#D8DAD8" });
  } else if (layout === "evidence_map") {
    chrome(slide, item); addTitle(slide, item);
    const ids = item.sourceContentBlockIds.slice(0, 12); const cols = 4; const cardW = 276; const cardH = 116;
    for (const [index, id] of ids.entries()) {
      const x = 54 + (index % cols) * 293; const y = 145 + Math.floor(index / cols) * 134; const block = blocks.get(id);
      addRect(slide, `evidence-card-${index}`, { left: x, top: y, width: cardW, height: cardH }, C.white, C.line);
      addText(slide, `evidence-num-${index}`, String(index + 1).padStart(2, "0"), { left: x + 16, top: y + 14, width: 36, height: 18 }, { fontSize: 9, bold: true, color: C.accent });
      addText(slide, `evidence-title-${index}`, block?.title || block?.label || id, { left: x + 16, top: y + 42, width: 244, height: 48 }, { fontSize: 16, bold: true });
      addText(slide, `evidence-label-${index}`, String(block?.label || "evidence").toUpperCase(), { left: x + 16, top: y + 93, width: 244, height: 13 }, { fontSize: 8, color: C.muted });
    }
    addReview(slide, item, 555); addTrace(slide, item);
  } else if (["hero", "gallery", "technical"].includes(layout) && visuals.length) {
    chrome(slide, item); addTitle(slide, item);
    if (layout === "gallery" && visuals.length > 1) {
      const shown = visuals.slice(0, 4); const w = 558; const h = 198;
      for (const [index, visual] of shown.entries()) await addVisual(slide, visual.id, { left: 54 + (index % 2) * 580, top: 144 + Math.floor(index / 2) * 218, width: w, height: h }, "cover");
      addText(slide, `gallery-key-${item.number}`, item.keySentence, { left: 54, top: 586, width: 1000, height: 54 }, { fontSize: 18, bold: true });
    } else {
      await addVisual(slide, visuals[0].id, { left: 54, top: 142, width: 750, height: 450 }, layout === "technical" ? "contain" : "cover");
      addPurpose(slide, item, { left: 842, top: 155, width: 350, height: 190 });
    }
    addTrace(slide, item);
  } else {
    chrome(slide, item); addTitle(slide, item);
    const visual = visuals[0];
    if (visual) await addVisual(slide, visual.id, { left: 520, top: 145, width: 706, height: 390 }, layout === "image_text" ? "cover" : "contain");
    addPurpose(slide, item, { left: 54, top: 148, width: visual ? 410 : 780, height: 210 });
    const evidence = item.evidenceTitles?.slice(0, 4) || [];
    if (evidence.length) {
      addText(slide, `evidence-label-${item.number}`, "APPROVED EVIDENCE", { left: 54, top: 505, width: 340, height: 18 }, { fontSize: 9, bold: true, color: C.accent, letterSpacing: 1 });
      addText(slide, `evidence-list-${item.number}`, evidence.map((value, index) => `${String(index + 1).padStart(2, "0")}  ${value}`).join("\n"), { left: 54, top: 532, width: 410, height: 92 }, { fontSize: 13, color: C.muted });
    }
    addReview(slide, item, 552); addTrace(slide, item);
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
