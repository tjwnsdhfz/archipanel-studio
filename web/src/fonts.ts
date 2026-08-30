import { db } from "./db";
import type { FontRef, PanelProjectV1 } from "./types";

export type SystemFontDefinition = { id: string; family: string; style: string; subfamily?: string; postscriptName?: string; weight: number; italic?: boolean; format?: "ttf" | "otf" | "ttc" | "woff" | "woff2"; supportsKorean?: boolean; embeddingPolicy?: "installable" | "editable" | "preview_print" | "restricted" | "unknown"; faceIndex?: number };

let catalogCache: SystemFontDefinition[] | null = null;

export async function fetchSystemFonts(): Promise<SystemFontDefinition[]> {
  if (catalogCache) return catalogCache;
  const response = await fetch("/api/fonts/system");
  if (!response.ok) return [];
  const payload = await response.json() as { fonts: SystemFontDefinition[] };
  catalogCache = payload.fonts;
  return catalogCache;
}

export async function refreshSystemFonts(): Promise<SystemFontDefinition[]> {
  catalogCache = null;
  const response = await fetch("/api/fonts/system/rescan", { method: "POST" });
  if (!response.ok) throw new Error("Windows 글꼴을 다시 검색하지 못했습니다.");
  const payload = await response.json() as { fonts: SystemFontDefinition[] };
  catalogCache = payload.fonts;
  return payload.fonts;
}

export async function inspectFontFile(file: File): Promise<SystemFontDefinition & { fingerprintSha256: string }> {
  const form = new FormData(); form.append("file", file);
  const response = await fetch("/api/fonts/inspect", { method: "POST", body: form });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "글꼴을 검사하지 못했습니다.");
  return response.json();
}

export async function installSystemFont(project: PanelProjectV1, definition: SystemFontDefinition): Promise<FontRef> {
  const id = `system-${definition.id}`;
  const existing = project.fonts.find((font) => font.id === id);
  if (existing) {
    const row = await db.fonts.get(existing.assetId);
    if (row) await loadFontFace(existing, row.blob);
    return existing;
  }
  const response = await fetch(`/api/fonts/system/${encodeURIComponent(definition.id)}`);
  if (!response.ok) throw new Error(`${definition.family} ${definition.style} 파일을 불러오지 못했습니다.`);
  const blob = await response.blob();
  await db.fonts.put({ id, projectId: project.id, blob, updatedAt: new Date().toISOString() });
  const policy = definition.embeddingPolicy ?? "unknown";
  const font: FontRef = { id, family: definition.family, style: definition.style, subfamily: definition.subfamily, postscriptName: definition.postscriptName, weight: definition.weight, italic: definition.italic, assetId: id,
    source: "system", format: definition.format, supportsKorean: definition.supportsKorean, embeddingPolicy: policy, embeddingAllowed: policy === "restricted" ? false : policy === "unknown" ? "unknown" : true };
  await loadFontFace(font, blob);
  return font;
}

export async function restoreProjectFonts(project: PanelProjectV1) {
  for (const font of project.fonts) {
    const row = await db.fonts.get(font.assetId);
    if (row) await loadFontFace(font, row.blob);
  }
}

export async function loadFontFace(font: FontRef, blob: Blob) {
  const key = `${font.family}-${font.style}-${font.weight}`;
  if ((document.fonts as FontFaceSet).check(`${font.weight} 12px "${font.family}"`)) return;
  const url = URL.createObjectURL(blob);
  try {
    const face = new FontFace(font.family, `url(${url})`, { style: font.style.toLowerCase().includes("italic") ? "italic" : "normal", weight: String(font.weight) });
    await face.load();
    document.fonts.add(face);
    document.documentElement.dataset.lastFontLoaded = key;
  } finally { URL.revokeObjectURL(url); }
}
