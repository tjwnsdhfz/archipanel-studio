export type UUID = string;
export type Tool = "select" | "hand" | "text" | "image" | "crop" | "mask" | "rect" | "ellipse" | "line" | "guide";
export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten";

export const CONTENT_LABELS = [
  "title", "project_info", "prologue", "context", "site_analysis", "concept", "design_process",
  "massing", "program", "master_plan", "site_plan", "floor_plan", "plan", "circulation", "section",
  "elevation", "facade", "diagram", "render", "detail", "materials", "accessibility", "performance",
  "caption", "source", "colophon",
] as const;
export type ContentLabel = typeof CONTENT_LABELS[number];
export type TypographyRole = "title" | "section" | "body" | "caption";

export type PrintProfile = {
  targetDpi: number;
  viewingDistanceMm: number;
  derivedWidthPx: number;
  derivedHeightPx: number;
};
export type Guide = { axis: "x" | "y"; positionMm: number; locked: boolean };

export type PanelBoard = {
  id: UUID; name: string; widthMm: number; heightMm: number; bleedMm: number; safeMarginMm: number;
  backgroundColor: string; grid: { enabled: boolean; sizeMm: number; subdivisions: number };
  guides: Guide[]; elementIds: UUID[]; printProfile: PrintProfile;
};

export type CommonElement = {
  id: UUID; boardId: UUID; name: string; xMm: number; yMm: number; widthMm: number; heightMm: number;
  rotationDeg: number; opacity: number; visible: boolean; locked: boolean;
  transform: TransformOptions; blendMode?: BlendMode;
  sourceHtml?: { sourceId: UUID; selector: string; nodeId: string };
};
export type TransformOptions = {
  originX: 0 | 0.5 | 1; originY: 0 | 0.5 | 1; skewXDeg: number; skewYDeg: number;
  flipX: boolean; flipY: boolean; lockAspect: boolean;
};
export type MaskPoint = { x: number; y: number; pressure?: number };
export type MaskOperation = {
  id: UUID; op: "add" | "subtract"; kind: "rect" | "ellipse" | "polygon" | "brush";
  rect?: { x: number; y: number; w: number; h: number }; points?: MaskPoint[];
  radiusNormalized?: number; hardness?: number;
};
export type LayerMaskV1 = { enabled: boolean; invert: boolean; featherMm: number; operations: MaskOperation[] };
export type ImageAdjustmentsV1 = {
  exposureEv: number; brightness: number; contrast: number; saturation: number; temperature: number; grayscale: number;
};
export type TextElement = CommonElement & {
  type: "text"; text: string; fontAssetId?: UUID; fontFamily: string; fontSizePt: number; lineHeight: number;
  letterSpacingPt: number; align: "left" | "center" | "right" | "justify"; verticalAlign: "top" | "middle" | "bottom";
  color: string; weight: number; italic: boolean; underline: boolean; autoSize: boolean; styleRole: TypographyRole;
};
export type ImageElement = CommonElement & {
  type: "image"; assetId: UUID; cropNormalized: { x: number; y: number; w: number; h: number };
  fit: "contain" | "cover" | "stretch"; flipX?: boolean; flipY?: boolean; mask: LayerMaskV1; adjustments: ImageAdjustmentsV1;
};
export type PdfElement = CommonElement & {
  type: "pdf"; assetId: UUID; pageIndex: number; clipNormalized: { x: number; y: number; w: number; h: number };
  fit: "contain" | "cover"; mask: LayerMaskV1; adjustments: ImageAdjustmentsV1;
};
export type PsdLayerElement = CommonElement & {
  type: "psd_layer"; sourceId: UUID; layerId: string; previewAssetId: UUID;
  renderPolicy: "source-layer" | "composite-unit"; cropNormalized: { x: number; y: number; w: number; h: number };
  fit: "contain" | "cover"; mask: LayerMaskV1; adjustments: ImageAdjustmentsV1; provenance: { sourceSha256: string; layerPath: string; fingerprint: string };
  reviewFlags: string[];
};
export type ShapeElement = CommonElement & {
  type: "shape"; shape: "rect" | "ellipse" | "line" | "polygon"; fill: string; stroke: string;
  strokeWidthMm: number; dash: number[];
};
export type GroupElement = CommonElement & { type: "group"; childIds: UUID[] };
export type PanelElement = TextElement | ImageElement | PdfElement | PsdLayerElement | ShapeElement | GroupElement;

export type AssetRef = {
  id: UUID; name: string; mime: string; sizeBytes: number; widthPx?: number; heightPx?: number; pageCount?: number;
  sha256?: string; thumbnailId?: string; archivePath?: string; review?: string[];
};
export type FontRef = {
  id: UUID; family: string; style: string; weight: number; assetId: UUID; embeddingAllowed: boolean | "unknown";
  source: "system" | "project"; postscriptName?: string; subfamily?: string; italic?: boolean;
  format?: "ttf" | "otf" | "woff" | "woff2" | "ttc"; supportsKorean?: boolean;
  embeddingPolicy?: "installable" | "editable" | "preview_print" | "restricted" | "unknown"; fingerprintSha256?: string;
};
export type TypographyStyle = {
  role: TypographyRole; label: string; fontFamily: string; fontSizePt: number; lineHeight: number;
  letterSpacingPt: number; weight: number; color: string;
};

export type PanelContentBlock = {
  id: UUID; boardId: UUID; elementIds: UUID[]; label: ContentLabel; title: string; summary: string;
  readingOrder: number; importance: 1 | 2 | 3 | 4 | 5; confidence: number;
  status: "suggested" | "approved" | "needs_review"; rationale?: string;
};
export type ReferenceProvenance = {
  title: string; creator: string; format: string; sourceUrl: string; license: string; projectType: string; collectedAt: string;
};
export type NormalizedReferenceBlock = {
  id: string; bbox: { x: number; y: number; w: number; h: number }; label: ContentLabel; readingOrder: number;
};
export type ReferenceLayoutV1 = {
  id: UUID; assetId?: UUID; provenance: ReferenceProvenance; boardAspectRatio: number; columnCount: number;
  whitespaceRatio: number; blocks: NormalizedReferenceBlock[]; featureVector: number[];
  approvalStatus: "review" | "approved" | "rejected"; createdAt: string;
};
export type ElementPlacement = { elementId: UUID; xMm: number; yMm: number; widthMm: number; heightMm: number };
export type LayoutProposalV1 = {
  id: UUID; projectId: UUID; boardId: UUID; strategy: "narrative" | "hero" | "technical";
  placements: ElementPlacement[]; scoreBreakdown: Record<string, number>; referenceLayoutIds: UUID[];
  packingMetrics?: { occupancy: number; whitespaceRatio: number; gridAlignment: number; rowCount: number };
  warnings: string[]; createdAt: string;
};
export type StudioSlideSpec = {
  number: number; title: string; purpose: string; keySentence: string; expectedSeconds: number;
  designSectionId: string; layoutKind: "cover" | "evidence_map" | "statement" | "image_text" | "hero" | "process" | "matrix" | "technical" | "gallery" | "synthesis" | "closing";
  evidenceTitles: string[];
  sourceContentBlockIds: UUID[]; sourceElementIds: UUID[]; speakerNotes: string; reviewFlags: string[];
};
export type DesignEvidenceV1 = {
  contentBlockId: UUID; elementIds: UUID[]; label: ContentLabel; title: string; summary: string; confidence: number;
};
export type DesignExplanationSectionV1 = {
  id: string; title: string; labels: ContentLabel[]; required: boolean; status: "confirmed" | "needs_review";
  evidence: DesignEvidenceV1[]; reviewFlags: string[];
};
export type DesignExplanationDataV1 = {
  schemaVersion: "1.0"; projectId: UUID; projectName: string; audience: string; sections: DesignExplanationSectionV1[];
  coverage: { approvedBlockCount: number; coveredSectionCount: number; totalSectionCount: number; missingSectionIds: string[] };
  sourceContentBlockIds: UUID[]; sourceElementIds: UUID[]; reviewFlags: string[]; generatedAt: string;
};
export type StudioPresentationSpecV1 = {
  id: UUID; projectId: UUID; audience: string; durationMinutes: number; slideCount: number; slides: StudioSlideSpec[];
  designExplanationData: DesignExplanationDataV1;
  aiGeneration?: { mode: "generative-ai"; model: string; endpointOrigin: string; userPrompt: string; generatedAt: string; evidencePolicy: "approved-blocks-only"; returnedSlideCount: number };
  approvedContentBlockIds: UUID[]; approvalStatus: "draft" | "approved"; createdAt: string; updatedAt: string;
};

export type HtmlSourceRef = {
  id: UUID; assetId: UUID; name: string; sha256: string; importedAt: string; widthMm: number; heightMm: number;
  elementIds: UUID[]; reviewFlags: string[];
};
export type PsdLayerRefV1 = {
  id: string; parentId: string | null; path: string; name: string; kind: "group" | "text" | "pixel" | "smart_object" | "adjustment";
  order: number; bboxPx: [number, number, number, number]; visible: boolean; locked: boolean; opacity: number; blendMode: string;
  text?: { value: string; editableCandidate: boolean; reason: string } | null; compatibility: "editable_text" | "group" | "raster_render_unit";
  renderUnitId: string; fingerprint: string; reviewFlags: string[];
};
export type PsdSourceRefV1 = {
  id: UUID; assetId: UUID; sha256: string; name: string; format: "PSD" | "PSB"; widthPx: number; heightPx: number; dpi: number;
  colorMode: "RGB"; bitDepth: 8 | 16; layers: PsdLayerRefV1[]; storageMode: "linked" | "portable";
  reviewStatus: "manual_verification_required" | "verified"; elementIds: UUID[]; importedAt: string;
};
export type DesignStatementVisualSlotV1 = { elementId: UUID; fit: "contain" | "cover"; crop: { x: number; y: number; w: number; h: number } | null };
export type DesignStatementPageV1 = {
  id: UUID; number: number; section: string; sectionTitle: string; pageType: "cover" | "contents" | "hero_render" | "summary_axon" | "context_map" | "problem_evidence" | "concept_statement" | "process_sequence" | "program_mapping" | "full_plan" | "plan_callout" | "section_elevation" | "material_detail" | "gallery" | "final_synthesis";
  title: string; claim: string; supportingText: string; caption: string; purpose: string; expectedSeconds: number; visualSlots: DesignStatementVisualSlotV1[];
  sourceContentBlockIds: UUID[]; sourceElementIds: UUID[]; originalEvidence: string[]; notes: string; reviewFlags: string[]; approvalStatus: "draft" | "approved";
};
export type DesignStatementSpecV1 = {
  schemaVersion: "1.0"; id: UUID; projectId: UUID; profile: "detailed" | "live"; audience: string;
  pageSize: { widthMm: number; heightMm: number }; projectInfo: Record<string, string>; pages: DesignStatementPageV1[]; pageCount: number; targetPageCount: number;
  approvedContentBlockIds: UUID[]; approvalStatus: "draft" | "approved"; aiMetadata: { mode: string; seed: number; sourcePolicy: "approved-blocks-only" }; createdAt: string; updatedAt: string;
};

export type PanelProjectV1 = {
  schemaVersion: "1.3"; id: UUID; name: string; defaultDpi: number; colorMode: "RGB"; boards: PanelBoard[];
  elements: PanelElement[]; assets: AssetRef[]; fonts: FontRef[]; contentBlocks: PanelContentBlock[];
  typographyStyles: TypographyStyle[]; layoutProposals: LayoutProposalV1[]; presentationSpecs: StudioPresentationSpecV1[];
  htmlSources: HtmlSourceRef[]; psdSources: PsdSourceRefV1[]; designStatementSpecs: DesignStatementSpecV1[];
  designStatement?: { projectInfo: Record<string, string> };
  createdAt: string; updatedAt: string;
};
export type PreflightIssue = {
  severity: "error" | "warning" | "info"; code: string; message: string; boardId?: UUID; elementId?: UUID;
};

export const BOARD_PRESETS = [
  { label: "A0 세로", widthMm: 841, heightMm: 1189 }, { label: "A0 가로", widthMm: 1189, heightMm: 841 },
  { label: "A1 세로", widthMm: 594, heightMm: 841 }, { label: "A1 가로", widthMm: 841, heightMm: 594 },
  { label: "A2 세로", widthMm: 420, heightMm: 594 }, { label: "A2 가로", widthMm: 594, heightMm: 420 },
  { label: "패널 1800 × 900", widthMm: 1800, heightMm: 900 },
] as const;
export const DEFAULT_TYPOGRAPHY_STYLES: TypographyStyle[] = [
  { role: "title", label: "제목", fontFamily: "KoPubWorld Dotum_Pro", fontSizePt: 64, lineHeight: 1.1, letterSpacingPt: -0.6, weight: 700, color: "#191a18" },
  { role: "section", label: "섹션", fontFamily: "KoPubWorld Dotum_Pro", fontSizePt: 32, lineHeight: 1.18, letterSpacingPt: -0.2, weight: 700, color: "#191a18" },
  { role: "body", label: "본문", fontFamily: "KoPubWorld Dotum_Pro", fontSizePt: 18, lineHeight: 1.35, letterSpacingPt: 0, weight: 400, color: "#282925" },
  { role: "caption", label: "캡션", fontFamily: "KoPubWorld Dotum_Pro", fontSizePt: 11, lineHeight: 1.25, letterSpacingPt: 0, weight: 400, color: "#5e605a" },
];

export const newId = () => crypto.randomUUID();
export const DEFAULT_TRANSFORM: TransformOptions = { originX: 0.5, originY: 0.5, skewXDeg: 0, skewYDeg: 0, flipX: false, flipY: false, lockAspect: true };
export const DEFAULT_MASK: LayerMaskV1 = { enabled: false, invert: false, featherMm: 0, operations: [] };
export const DEFAULT_ADJUSTMENTS: ImageAdjustmentsV1 = { exposureEv: 0, brightness: 0, contrast: 0, saturation: 0, temperature: 0, grayscale: 0 };
export const derivedPixels = (mm: number, dpi: number) => Math.round(mm / 25.4 * dpi);
export function makePrintProfile(widthMm: number, heightMm: number, targetDpi = 300): PrintProfile {
  return { targetDpi, viewingDistanceMm: 1200, derivedWidthPx: derivedPixels(widthMm, targetDpi), derivedHeightPx: derivedPixels(heightMm, targetDpi) };
}
export function syncBoardPrintProfile(board: PanelBoard) {
  board.printProfile.derivedWidthPx = derivedPixels(board.widthMm, board.printProfile.targetDpi);
  board.printProfile.derivedHeightPx = derivedPixels(board.heightMm, board.printProfile.targetDpi);
}
export function makeBoard(name = "A0 · 01", widthMm = 841, heightMm = 1189): PanelBoard {
  return { id: newId(), name, widthMm, heightMm, bleedMm: 3, safeMarginMm: 10, backgroundColor: "#f7f4ed",
    grid: { enabled: true, sizeMm: 5, subdivisions: 1 }, guides: [], elementIds: [], printProfile: makePrintProfile(widthMm, heightMm) };
}
export function makeProject(name = "새 건축 패널"): PanelProjectV1 {
  const now = new Date().toISOString();
  return { schemaVersion: "1.3", id: newId(), name, defaultDpi: 300, colorMode: "RGB", boards: [makeBoard()],
    elements: [], assets: [], fonts: [], contentBlocks: [], typographyStyles: structuredClone(DEFAULT_TYPOGRAPHY_STYLES),
    layoutProposals: [], presentationSpecs: [], htmlSources: [], psdSources: [], designStatementSpecs: [], designStatement: { projectInfo: {} }, createdAt: now, updatedAt: now };
}
export function migrateProject(input: unknown): PanelProjectV1 {
  const source = structuredClone(input) as Record<string, any>;
  if (!source || typeof source !== "object") throw new Error("프로젝트 데이터가 올바르지 않습니다.");
  const dpi = Number(source.defaultDpi) || 300;
  const project = source as unknown as PanelProjectV1;
  project.schemaVersion = "1.3"; project.defaultDpi = dpi; project.contentBlocks ??= [];
  project.typographyStyles ??= structuredClone(DEFAULT_TYPOGRAPHY_STYLES); project.layoutProposals ??= []; project.presentationSpecs ??= []; project.htmlSources ??= []; project.psdSources ??= []; project.designStatementSpecs ??= []; project.designStatement ??= { projectInfo: {} };
  project.boards = (project.boards ?? []).map((board) => ({ ...board, printProfile: board.printProfile ?? makePrintProfile(board.widthMm, board.heightMm, dpi) }));
  project.elements = (project.elements ?? []).map((element) => {
    const legacy = element as PanelElement & { flipX?: boolean; flipY?: boolean; transform?: TransformOptions };
    const transform = { ...DEFAULT_TRANSFORM, ...(legacy.transform ?? {}), flipX: legacy.transform?.flipX ?? legacy.flipX ?? false, flipY: legacy.transform?.flipY ?? legacy.flipY ?? false };
    const common = { ...element, transform, blendMode: element.blendMode ?? "normal" };
    if (element.type === "text") return { ...common, styleRole: element.styleRole ?? "body" };
    if (element.type === "image" || element.type === "pdf" || element.type === "psd_layer") return { ...common, mask: { ...DEFAULT_MASK, ...(element.mask ?? {}), operations: element.mask?.operations ?? [] }, adjustments: { ...DEFAULT_ADJUSTMENTS, ...(element.adjustments ?? {}) } };
    return common;
  }) as PanelElement[];
  return project;
}
