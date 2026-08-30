import JSZip from "jszip";
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

export async function packageProject(project: PanelProjectV1) {
  return downloadFromEndpoint(project, "/api/project/package", `${safeName(project.name)}.archipanel`);
}

export async function openPackage(file: File): Promise<PanelProjectV1> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("manifest.json이 없는 프로젝트입니다.");
  const rawProject = JSON.parse(await manifestEntry.async("string")) as PanelProjectV1;
  const version = (rawProject as unknown as { schemaVersion?: string }).schemaVersion;
  if (!version || !["1.0", "1.1", "1.2"].includes(version)) throw new Error(`지원하지 않는 스키마 ${version ?? "없음"}`);
  const project = migrateProject(rawProject);
  for (const asset of project.assets) {
    const path = asset.archivePath ?? Object.keys(zip.files).find((key) => key.startsWith(`assets/${asset.id}.`));
    const safePath = path && path.startsWith("assets/") && !path.split("/").includes("..") ? path : null;
    const entry = safePath ? zip.file(safePath) : null;
    if (!entry) { asset.review = [...(asset.review ?? []), "패키지에서 원본 누락"]; continue; }
    const blob = await entry.async("blob");
    const previewPaths = Object.keys(zip.files).filter((key) => key.startsWith(`previews/assets/${asset.id}/`)).sort((left, right) => Number(left.split("/").at(-1)?.split(".")[0]) - Number(right.split("/").at(-1)?.split(".")[0]));
    const pageThumbnails = await Promise.all(previewPaths.map((previewPath) => zip.file(previewPath)!.async("blob")));
    await db.assets.put({ id: asset.id, projectId: project.id, blob, thumbnail: pageThumbnails[0], pageThumbnails, updatedAt: new Date().toISOString() });
  }
  for (const font of project.fonts) {
    const path = Object.keys(zip.files).find((key) => key.startsWith(`fonts/${font.assetId}.`));
    const entry = path ? zip.file(path) : null;
    if (entry) await db.fonts.put({ id: font.assetId, projectId: project.id, blob: await entry.async("blob"), updatedAt: new Date().toISOString() });
  }
  return project;
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
