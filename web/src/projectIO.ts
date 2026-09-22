import JSZip from "jszip";
import { exportBoardPng } from "./boardExport";
import { db } from "./db";
import type { AssetRef, PanelProjectV1, ReferenceLayoutV1 } from "./types";
import { migrateProject } from "./types";

export type InspectResult = {
  mime: string; widthPx?: number; heightPx?: number; pageCount?: number;
  thumbnailDataUrl?: string; review: string[];
};

export type ImportObjectCandidate = {
  id: string; pageIndex: number; kind: "text" | "pdf_region" | "image_region";
  bboxNormalized: { x: number; y: number; w: number; h: number };
  label: string; title: string; text: string; confidence: number;
  status: "suggested" | "needs_review"; rationale: string; groupKey?: string;
};
export type ImportAnalysis = {
  name: string; mime: string; sizeBytes: number; sha256: string; widthPx?: number; heightPx?: number;
  pageCount: number; candidateCount: number; review: string[];
  pages: { pageIndex: number; widthPx: number; heightPx: number; widthPt?: number; heightPt?: number; thumbnailDataUrl: string; candidates: ImportObjectCandidate[] }[];
};

export async function inspectFile(file: File): Promise<InspectResult> {
  if (["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    if (file.size > 25 * 1024 * 1024) throw new Error("이미지는 25MB 이하로 준비해 주세요.");
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error("이미지를 읽지 못했습니다. PNG·JPG·WebP 파일을 확인해 주세요."); }
    try {
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error("이미지는 4천만 픽셀 이하로 줄여 주세요.");
      return { mime: file.type, widthPx: bitmap.width, heightPx: bitmap.height, review: [] };
    } finally { bitmap.close(); }
  }
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/import/inspect", { method: "POST", body: form });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "파일을 검사하지 못했습니다.");
  return response.json();
}

export async function analyzeImportFile(file: File, maxRegions = 20): Promise<ImportAnalysis> {
  const form = new FormData(); form.append("file", file);
  const response = await fetch(`/api/import/analyze?max_regions=${maxRegions}`, { method: "POST", body: form });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "객체 후보를 분석하지 못했습니다.");
  return response.json();
}

export async function addAssetFile(project: PanelProjectV1, file: File, thumbnail?: Blob, metadata?: Partial<AssetRef>, pageThumbnails?: Blob[]) {
  const id = crypto.randomUUID();
  await db.assets.put({ id, projectId: project.id, blob: file, thumbnail, pageThumbnails, updatedAt: new Date().toISOString() });
  return {
    id, name: file.name, mime: file.type || metadata?.mime || "application/octet-stream",
    sizeBytes: file.size, widthPx: metadata?.widthPx, heightPx: metadata?.heightPx,
    pageCount: metadata?.pageCount, sha256: metadata?.sha256, review: metadata?.review ?? [],
  } satisfies AssetRef;
}

export async function dataUrlToBlob(dataUrl?: string) {
  if (!dataUrl) return undefined;
  return (await fetch(dataUrl)).blob();
}

async function projectForm(project: PanelProjectV1) {
  const form = new FormData();
  form.append("manifest", JSON.stringify(project));
  for (const asset of project.assets) {
    const row = await db.assets.get(asset.id);
    if (row) {
      form.append(`asset__${asset.id}`, row.blob, asset.name);
      for (const [index, preview] of (row.pageThumbnails ?? (row.thumbnail ? [row.thumbnail] : [])).entries()) form.append(`preview__${asset.id}__${index}`, preview, `${asset.id}-${index}.jpg`);
    } else {
      throw new Error(`원본 파일을 찾을 수 없습니다: ${asset.name}. 원본을 다시 연결한 뒤 내보내세요.`);
    }
  }
  for (const font of project.fonts) {
    if (font.embeddingAllowed === false || font.embeddingPolicy === "restricted") continue;
    const row = await db.fonts.get(font.assetId);
    if (row) {
      const mime = row.blob.type.toLowerCase();
      const extension = mime.includes("otf") || mime.includes("opentype") ? "otf" : mime.includes("woff2") ? "woff2" : mime.includes("woff") ? "woff" : "ttf";
      form.append(`font__${font.assetId}`, row.blob, `${font.family}-${font.style}.${extension}`);
    }
  }
  return form;
}

export async function downloadFromEndpoint(project: PanelProjectV1, endpoint: string, filename: string, options?: Record<string, unknown>) {
  const form = await projectForm(project);
  if (options) form.append("options", JSON.stringify(options));
  const response = await fetch(endpoint, { method: "POST", body: form });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "내보내기에 실패했습니다.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function packageProject(project: PanelProjectV1, portablePsd = false) {
  if (!project.psdSources.length) {
    const blob = await buildLocalPackage(project);
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${safeName(project.name)}.archipanel`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  return downloadFromEndpoint(project, "/api/project/package", `${safeName(project.name)}.archipanel`, { portablePsd });
}

export async function buildLocalPackage(project: PanelProjectV1): Promise<Blob> {
  if (project.psdSources.length) throw new Error("PSD 원본 패키지는 서버 연결이 필요합니다.");
  const manifest = structuredClone(project); const zip = new JSZip(); let bytes = 0;
  for (const asset of manifest.assets) {
    const row = await db.assets.get(asset.id);
    if (!row) throw new Error(`원본 파일을 찾을 수 없습니다: ${asset.name}`);
    bytes += row.blob.size;
    if (bytes > 100 * 1024 * 1024) throw new Error("브라우저 백업은 원본 합계 100MB까지 지원합니다.");
    asset.archivePath = `assets/${asset.id}.bin`;
    zip.file(asset.archivePath, await row.blob.arrayBuffer());
    for (const [i, preview] of (row.pageThumbnails ?? (row.thumbnail ? [row.thumbnail] : [])).entries()) {
      bytes += preview.size; if (bytes > 100 * 1024 * 1024) throw new Error("미리보기를 포함한 백업이 100MB를 넘습니다.");
      zip.file(`previews/assets/${asset.id}/${i}.jpg`, await preview.arrayBuffer());
    }
  }
  for (const font of manifest.fonts) {
    if (font.embeddingAllowed === false || font.embeddingPolicy === "restricted") continue;
    const row = await db.fonts.get(font.assetId);
    if (!row) throw new Error(`글꼴 파일을 찾을 수 없습니다: ${font.family}`);
    bytes += row.blob.size; if (bytes > 100 * 1024 * 1024) throw new Error("글꼴을 포함한 백업이 100MB를 넘습니다.");
    zip.file(`fonts/${font.assetId}.bin`, await row.blob.arrayBuffer());
  }
  zip.file("manifest.json", JSON.stringify(manifest));
  return zip.generateAsync({type:"blob",compression:"STORE"});
}

export async function downloadCanvasPreview(name: string) {
  const blob = await exportBoardPng();
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `${safeName(name)}-preview.png`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openPackage(file: File): Promise<PanelProjectV1> {
  if (file.size > 100 * 1024 * 1024) throw new Error("작업 파일은 100MB 이하로 준비해 주세요.");
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("manifest.json이 없는 프로젝트입니다.");
  const rawProject = JSON.parse(await manifestEntry.async("string")) as PanelProjectV1;
  const version = (rawProject as unknown as { schemaVersion?: string }).schemaVersion;
  if (!version || !["1.0", "1.1", "1.2", "1.3", "1.4"].includes(version)) throw new Error(`지원하지 않는 스키마 ${version ?? "없음"}`);
  if (!rawProject || !Array.isArray(rawProject.boards) || !rawProject.boards.length || !Array.isArray(rawProject.elements) || !Array.isArray(rawProject.assets)) throw new Error("프로젝트의 보드·레이어·자산 목록을 확인해 주세요.");
  const project = migrateProject(rawProject);
  // Import as a separate copy; old local work and asset bytes must never be overwritten.
  const identities = new Map<string,string>([[project.id, crypto.randomUUID()]]);
  for (const asset of project.assets) identities.set(asset.id, crypto.randomUUID());
  for (const font of project.fonts) if (!identities.has(font.assetId)) identities.set(font.assetId, crypto.randomUUID());
  for (const asset of project.assets) {
    const path = asset.archivePath ?? Object.keys(zip.files).find((key) => key.startsWith(`assets/${asset.id}.`));
    const safePath = path && path.startsWith("assets/") && !path.split("/").includes("..") ? path : null;
    const entry = safePath ? zip.file(safePath) : null;
    if (!entry) { asset.review = [...(asset.review ?? []), "패키지에서 원본 누락"]; continue; }
    const blob = await entry.async("blob");
    const previewPaths = Object.keys(zip.files).filter((key) => key.startsWith(`previews/assets/${asset.id}/`)).sort((left, right) => Number(left.split("/").at(-1)?.split(".")[0]) - Number(right.split("/").at(-1)?.split(".")[0]));
    const pageThumbnails = await Promise.all(previewPaths.map((previewPath) => zip.file(previewPath)!.async("blob")));
    await db.assets.put({ id: identities.get(asset.id)!, projectId: identities.get(project.id)!, blob, thumbnail: pageThumbnails[0], pageThumbnails, updatedAt: new Date().toISOString() });
  }
  for (const font of project.fonts) {
    const path = Object.keys(zip.files).find((key) => key.startsWith(`fonts/${font.assetId}.`));
    const entry = path ? zip.file(path) : null;
    if (entry) await db.fonts.put({ id: identities.get(font.assetId)!, projectId: identities.get(project.id)!, blob: await entry.async("blob"), updatedAt: new Date().toISOString() });
  }
  return JSON.parse(JSON.stringify(project), (_key, value: unknown) => typeof value === "string" ? (identities.get(value) ?? value) : value) as PanelProjectV1;
}

export const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").trim() || "archipanel";

export async function getAssetUrl(id: string, thumbnail = true) {
  const row = await db.assets.get(id);
  if (!row) return null;
  return URL.createObjectURL(thumbnail && row.thumbnail ? row.thumbnail : row.blob);
}

export async function loadDecomposedPanelDemo() {
  const response = await fetch("/api/demo/decomposed-panel");
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "패널 분해 예시를 불러오지 못했습니다.");
  const payload = await response.json() as { project: PanelProjectV1; assetId: string; assetUrl: string; referenceLayout: ReferenceLayoutV1; regionCount: number; sourceNotice: string };
  const assetResponse = await fetch(payload.assetUrl);
  if (!assetResponse.ok) throw new Error("예시 패널 원본 자산을 불러오지 못했습니다.");
  const blob = await assetResponse.blob();
  await db.assets.put({ id: payload.assetId, projectId: payload.project.id, blob, thumbnail: await createDemoThumbnail(blob), updatedAt: new Date().toISOString() });
  await db.referenceLayouts.put(payload.referenceLayout);
  return payload;
}

async function createDemoThumbnail(blob: Blob) {
  const image = await createImageBitmap(blob, { resizeWidth: 1600, resizeQuality: "high" });
  const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
  canvas.getContext("2d")?.drawImage(image, 0, 0); image.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("예시 썸네일 생성 실패")), "image/jpeg", .84));
}
