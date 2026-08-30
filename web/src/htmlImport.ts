import { addAssetFile } from "./projectIO";
import type { AssetRef, ContentLabel, HtmlSourceRef, PanelContentBlock, PanelElement, PanelProjectV1 } from "./types";
import { CONTENT_LABELS, DEFAULT_ADJUSTMENTS, DEFAULT_MASK, DEFAULT_TRANSFORM, newId } from "./types";

export type HtmlPanelCandidate = {
  id: string; nodeId: string; selector: string; groupKey: string; kind: "text" | "image";
  label: ContentLabel; title: string; text: string; confidence: number;
  bboxMm: { x: number; y: number; w: number; h: number };
  style: { fontFamily: string; fontSizePt: number; lineHeight: number; color: string; weight: number; align: "left" | "center" | "right" | "justify" };
  imageFile?: File; naturalWidth?: number; naturalHeight?: number; reviewFlags: string[];
};

export type HtmlPanelAnalysis = {
  htmlFile: File; sourceId: string; sha256: string; widthMm: number; heightMm: number;
  candidates: HtmlPanelCandidate[]; reviewFlags: string[];
};

const textSelector = "h1,h2,h3,h4,h5,h6,p,li,figcaption,[data-panel-element='text']";
const mediaSelector = "img,svg,[data-panel-element='image']";

function numberAttr(document: Document, name: string) {
  const root = document.querySelector<HTMLElement>("[data-archipanel-board]") ?? document.body;
  const attr = Number(root?.dataset[name as keyof DOMStringMap]);
  const meta = Number(document.querySelector<HTMLMetaElement>(`meta[name='archipanel-${name.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}']`)?.content);
  return Number.isFinite(attr) && attr > 0 ? attr : Number.isFinite(meta) && meta > 0 ? meta : undefined;
}

function labelFor(node: Element): { label: ContentLabel; confidence: number } {
  const explicit = node.closest<HTMLElement>("[data-panel-label]")?.dataset.panelLabel?.toLowerCase();
  if (explicit && CONTENT_LABELS.includes(explicit as ContentLabel)) return { label: explicit as ContentLabel, confidence: 1 };
  const text = `${node.getAttribute("alt") ?? ""} ${node.getAttribute("aria-label") ?? ""} ${node.id} ${node.className} ${node.textContent ?? ""}`.toLowerCase();
  const rules: [ContentLabel, string[]][] = [
    ["title", ["title", "프로젝트명", "제목"]], ["context", ["context", "맥락", "배경"]], ["site_analysis", ["site", "대지", "입지"]],
    ["concept", ["concept", "개념", "컨셉"]], ["massing", ["massing", "매싱"]], ["program", ["program", "프로그램"]],
    ["master_plan", ["master plan", "배치도", "배치"]], ["floor_plan", ["floor plan", "평면"]], ["section", ["section", "단면"]],
    ["elevation", ["elevation", "입면"]], ["materials", ["material", "재료"]], ["performance", ["performance", "환경", "성능"]],
    ["render", ["render", "렌더", "투시", "perspective"]], ["diagram", ["diagram", "다이어그램"]], ["caption", ["caption", "캡션"]],
  ];
  for (const [label, words] of rules) if (words.some((word) => text.includes(word))) return { label, confidence: .78 };
  const tagName = node.tagName.toLowerCase();
  if (/^h[1-2]$/.test(tagName)) return { label: "title", confidence: .72 };
  if (tagName === "figcaption") return { label: "caption", confidence: .82 };
  if (tagName === "img" || tagName === "svg") return { label: "render", confidence: .42 };
  return { label: "project_info", confidence: .48 };
}

async function svgTextToPng(svgText: string, name: string) {
  const parser = new DOMParser();
  const svg = parser.parseFromString(svgText, "image/svg+xml").documentElement;
  const viewBox = (svg.getAttribute("viewBox") ?? "").trim().split(/[ ,]+/).map(Number);
  const sourceWidth = Number.parseFloat(svg.getAttribute("width") ?? "") || (viewBox.length === 4 ? viewBox[2] : 1200) || 1200;
  const sourceHeight = Number.parseFloat(svg.getAttribute("height") ?? "") || (viewBox.length === 4 ? viewBox[3] : 800) || 800;
  const scale = Math.min(1, 2400 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("SVG 이미지를 안전한 PNG 미리보기로 변환하지 못했습니다."));
      image.src = url;
    });
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("SVG PNG 변환 실패")), "image/png"));
    return new File([png], `${name.replace(/\.svg$/i, "")}.png`, { type: "image/png" });
  } finally { URL.revokeObjectURL(url); }
}

function cleanDocument(document: Document, files: File[], objectUrls: string[], reviews: string[]) {
  document.querySelectorAll("script,iframe,object,embed,link[rel='stylesheet'],base").forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>("*").forEach((node) => {
    for (const attr of [...node.attributes]) if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
  });
  document.querySelectorAll("style").forEach((node) => { node.textContent = (node.textContent ?? "").replace(/@import[^;]+;/gi, "").replace(/url\(\s*['\"]?https?:[^)]+\)/gi, "none"); });
  const fileMap = new Map<string, File>();
  files.forEach((file) => { fileMap.set(file.name.toLowerCase(), file); const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath; if (relative) fileMap.set(relative.replace(/\\/g, "/").toLowerCase(), file); });
  document.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const original = image.getAttribute("src") ?? ""; image.dataset.apOriginalSrc = original;
    if (!original || original.startsWith("data:") || original.startsWith("blob:")) return;
    const normalized = decodeURIComponent(original.split(/[?#]/)[0]).replace(/^\.\//, "").replace(/\\/g, "/").toLowerCase();
    const file = fileMap.get(normalized) ?? fileMap.get(normalized.split("/").at(-1) ?? "");
    if (file) { const url = URL.createObjectURL(file); objectUrls.push(url); image.src = url; image.dataset.apFileName = file.name; }
    else { image.removeAttribute("src"); image.dataset.apUnresolved = original; reviews.push(`연결되지 않은 HTML 이미지: ${original}`); }
  });
}

async function imageFileFor(node: Element, files: File[]) {
  if (node.tagName.toLowerCase() === "svg") {
    const xml = new XMLSerializer().serializeToString(node);
    return svgTextToPng(xml, node.id || "inline-svg");
  }
  const image = node as HTMLImageElement; const fileName = image.dataset.apFileName;
  if (fileName) {
    const linked = files.find((file) => file.name === fileName);
    if (linked?.type === "image/svg+xml" || linked && /\.svg$/i.test(linked.name)) return svgTextToPng(await linked.text(), linked.name);
    return linked;
  }
  const source = image.dataset.apOriginalSrc ?? "";
  if (source.startsWith("data:")) {
    const blob = await (await fetch(source)).blob(); const extension = blob.type.includes("svg") ? "svg" : blob.type.split("/")[1] || "png";
    if (blob.type.includes("svg")) return svgTextToPng(await blob.text(), `${image.id || "embedded-image"}.svg`);
    return new File([blob], `${image.id || "embedded-image"}.${extension}`, { type: blob.type });
  }
  return undefined;
}

export async function analyzeHtmlPanel(files: File[]): Promise<HtmlPanelAnalysis> {
  const htmlFile = files.find((file) => /\.html?$/i.test(file.name));
  if (!htmlFile) throw new Error("HTML 파일이 필요합니다.");
  if (htmlFile.size > 20 * 1024 * 1024) throw new Error("HTML 파일은 20MB 이하만 허용합니다.");
  const raw = await htmlFile.text(); const parsed = new DOMParser().parseFromString(raw, "text/html");
  const reviewFlags: string[] = []; const objectUrls: string[] = []; cleanDocument(parsed, files, objectUrls, reviewFlags);
  const candidates = [...parsed.querySelectorAll<HTMLElement>(`${textSelector},${mediaSelector}`)].filter((node) => {
    if (node.matches("p,li,figcaption") && !node.textContent?.trim()) return false;
    const labelledAncestor = node.parentElement?.closest("[data-panel-element]");
    return !labelledAncestor;
  });
  candidates.forEach((node, index) => { node.dataset.apSourceIndex = String(index); });
  const iframe = document.createElement("iframe"); iframe.sandbox.add("allow-same-origin"); iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", left: "-20000px", top: "0", width: "1600px", height: "1200px", visibility: "hidden", pointerEvents: "none" });
  iframe.srcdoc = "<!doctype html>" + parsed.documentElement.outerHTML; document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve, reject) => { const timer = window.setTimeout(() => reject(new Error("HTML 렌더링 시간 초과")), 8000); iframe.onload = () => { clearTimeout(timer); resolve(); }; });
    const doc = iframe.contentDocument; if (!doc) throw new Error("HTML 미리보기 문서를 열 수 없습니다.");
    await doc.fonts?.ready;
    const root = doc.querySelector<HTMLElement>("[data-archipanel-board]") ?? doc.body;
    const rootRect = root.getBoundingClientRect(); const pixelWidth = Math.max(root.scrollWidth, rootRect.width, 1); const pixelHeight = Math.max(root.scrollHeight, rootRect.height, 1);
    const declaredWidth = numberAttr(parsed, "widthMm"); const declaredHeight = numberAttr(parsed, "heightMm");
    const landscape = pixelWidth >= pixelHeight;
    const widthMm = declaredWidth ?? (landscape ? 1800 : 841); const heightMm = declaredHeight ?? (landscape ? Math.round(widthMm / (pixelWidth / pixelHeight)) : 1189);
    if (!declaredWidth || !declaredHeight) reviewFlags.push(`판형 메타데이터 없음 · 렌더 비율 기준 ${widthMm}×${heightMm}mm 제안`);
    const result: HtmlPanelCandidate[] = [];
    for (const [index, sourceNode] of candidates.entries()) {
      const node = doc.querySelector<HTMLElement>(`[data-ap-source-index='${index}']`); if (!node) continue;
      const rect = node.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) continue;
      const { label, confidence } = labelFor(sourceNode); const style = iframe.contentWindow!.getComputedStyle(node);
      const x = Math.max(0, rect.left - rootRect.left + root.scrollLeft); const y = Math.max(0, rect.top - rootRect.top + root.scrollTop);
      const nodeId = sourceNode.id || `html-node-${index + 1}`; const selector = sourceNode.id ? `#${CSS.escape(sourceNode.id)}` : `[data-ap-source-index='${index}']`;
      const group = sourceNode.closest<HTMLElement>("[data-panel-block],[data-panel-label]"); const groupKey = group?.id || group?.dataset.panelBlock || group?.dataset.panelLabel || nodeId;
      const text = (sourceNode.textContent ?? "").replace(/\s+/g, " ").trim(); const title = (sourceNode.getAttribute("data-title") || sourceNode.getAttribute("alt") || text || label).slice(0, 100);
      const imageFile = sourceNode.matches(mediaSelector) ? await imageFileFor(sourceNode, files) : undefined;
      const review = sourceNode instanceof HTMLImageElement && sourceNode.dataset.apUnresolved ? [`이미지 누락: ${sourceNode.dataset.apUnresolved}`] : [];
      result.push({
        id: `html-candidate-${index + 1}`, nodeId, selector, groupKey,
        kind: sourceNode.matches(mediaSelector) ? "image" : "text", label, title, text, confidence,
        bboxMm: { x: x / pixelWidth * widthMm, y: y / pixelHeight * heightMm, w: rect.width / pixelWidth * widthMm, h: rect.height / pixelHeight * heightMm },
        style: { fontFamily: style.fontFamily.split(",")[0].replace(/["']/g, "") || "KoPubWorld Dotum_Pro", fontSizePt: Math.max(8, parseFloat(style.fontSize) * .75), lineHeight: Math.max(1, parseFloat(style.lineHeight) / Math.max(1, parseFloat(style.fontSize)) || 1.3), color: style.color || "#191a18", weight: Number(style.fontWeight) || 400, align: (["center", "right", "justify"].includes(style.textAlign) ? style.textAlign : "left") as HtmlPanelCandidate["style"]["align"] },
        imageFile, naturalWidth: (node as HTMLImageElement).naturalWidth || undefined, naturalHeight: (node as HTMLImageElement).naturalHeight || undefined, reviewFlags: review,
      });
    }
    const digest = await crypto.subtle.digest("SHA-256", await htmlFile.arrayBuffer()); const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    return { htmlFile, sourceId: newId(), sha256, widthMm, heightMm, candidates: result, reviewFlags };
  } finally { iframe.remove(); objectUrls.forEach((url) => URL.revokeObjectURL(url)); }
}

export async function materializeHtmlPanel(project: PanelProjectV1, boardId: string, analysis: HtmlPanelAnalysis, approved: boolean) {
  const htmlAsset = await addAssetFile(project, analysis.htmlFile, undefined, { mime: "text/html", sha256: analysis.sha256, review: analysis.reviewFlags });
  const assets: AssetRef[] = [htmlAsset]; const imageAssets = new Map<File, AssetRef>();
  for (const candidate of analysis.candidates) if (candidate.imageFile && !imageAssets.has(candidate.imageFile)) {
    const asset = await addAssetFile(project, candidate.imageFile, candidate.imageFile.size < 5_000_000 ? candidate.imageFile : undefined, { widthPx: candidate.naturalWidth, heightPx: candidate.naturalHeight, review: candidate.reviewFlags });
    imageAssets.set(candidate.imageFile, asset); assets.push(asset);
  }
  const elements: PanelElement[] = analysis.candidates.filter((item) => item.kind === "text" || item.imageFile).map((item) => {
    const common = { id: newId(), boardId, name: item.title, xMm: item.bboxMm.x, yMm: item.bboxMm.y, widthMm: Math.max(2, item.bboxMm.w), heightMm: Math.max(2, item.bboxMm.h), rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: structuredClone(DEFAULT_TRANSFORM), sourceHtml: { sourceId: analysis.sourceId, selector: item.selector, nodeId: item.nodeId } };
    if (item.kind === "text") return { ...common, type: "text", text: item.text, fontFamily: item.style.fontFamily, fontSizePt: item.style.fontSizePt, lineHeight: item.style.lineHeight, letterSpacingPt: 0, align: item.style.align, verticalAlign: "top", color: item.style.color, weight: item.style.weight, italic: false, underline: false, autoSize: false, styleRole: item.label === "title" ? "title" : item.label === "caption" ? "caption" : "body" } as PanelElement;
    return { ...common, type: "image", assetId: imageAssets.get(item.imageFile!)!.id, cropNormalized: { x: 0, y: 0, w: 1, h: 1 }, fit: "contain", mask: structuredClone(DEFAULT_MASK), adjustments: structuredClone(DEFAULT_ADJUSTMENTS) } as PanelElement;
  });
  const candidateByNode = new Map(analysis.candidates.map((item) => [item.nodeId, item]));
  const groups = new Map<string, PanelElement[]>(); elements.forEach((element) => { const source = element.sourceHtml && candidateByNode.get(element.sourceHtml.nodeId); const key = source?.groupKey ?? element.id; groups.set(key, [...(groups.get(key) ?? []), element]); });
  const blocks: PanelContentBlock[] = [...groups.entries()].map(([key, group], index) => {
    const sources = group.map((element) => candidateByNode.get(element.sourceHtml!.nodeId)!).filter(Boolean); const seed = sources.sort((left, right) => right.confidence - left.confidence)[0];
    return { id: newId(), boardId, elementIds: group.map((item) => item.id), label: seed.label, title: seed.title, summary: sources.filter((item) => item.kind === "text").map((item) => item.text).join("\n"), readingOrder: index + 1, importance: (["title", "concept", "render", "master_plan"].includes(seed.label) ? 5 : 3), confidence: Math.min(...sources.map((item) => item.confidence)), status: approved ? "approved" : sources.some((item) => item.confidence < .55) ? "needs_review" : "suggested", rationale: `HTML 원문 요소 ${key} · 스크립트 실행 없이 가져옴` };
  });
  const htmlSource: HtmlSourceRef = { id: analysis.sourceId, assetId: htmlAsset.id, name: analysis.htmlFile.name, sha256: analysis.sha256, importedAt: new Date().toISOString(), widthMm: analysis.widthMm, heightMm: analysis.heightMm, elementIds: elements.map((item) => item.id), reviewFlags: analysis.reviewFlags };
  return { assets, elements, blocks, htmlSource };
}
