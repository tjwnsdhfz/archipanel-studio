import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, Archive, BoxSelect, ChevronDown, ChevronLeft, ChevronRight,
  Circle, Download, Eye, EyeOff, FileCode2, FileImage, FilePlus2, Hand, ImagePlus, Layers3,
  LayoutPanelTop, Lock, LockOpen, Minus, MousePointer2, Plus, Redo2, Ruler,
  Save, ScanSearch, Settings2, ShieldCheck, Square, TextCursorInput, Trash2, Undo2,
  Crop, Group, Ungroup, Upload, ZoomIn, ZoomOut, FlipHorizontal2, FlipVertical2, Grid3X3, RefreshCw, Copy, ClipboardPaste,
} from "lucide-react";
import { CanvasStudio } from "./CanvasStudio";
import { db, loadProjectRow, requestPersistentStorage, saveProject, storageStatus, type ProjectRow } from "./db";
import { fetchSystemFonts, inspectFontFile, installSystemFont, loadFontFace, refreshSystemFonts, restoreProjectFonts, type SystemFontDefinition } from "./fonts";
import { runPreflight } from "./preflight";
import { addAssetFile, analyzeImportFile, dataUrlToBlob, downloadFromEndpoint, inspectFile, loadDecomposedPanelDemo, openPackage, packageProject, safeName, type ImportAnalysis } from "./projectIO";
import { useStudio } from "./store";
import type { AssetRef, ContentLabel, PanelElement, Tool } from "./types";
import { BOARD_PRESETS, CONTENT_LABELS, DEFAULT_ADJUSTMENTS, DEFAULT_MASK, DEFAULT_TRANSFORM, makeBoard, newId, syncBoardPrintProfile } from "./types";
import { applyTransformPatch } from "./transform";
import { analyzeHtmlPanel, materializeHtmlPanel, type HtmlPanelAnalysis } from "./htmlImport";
import { DocumentSettingsModal, IntelligencePanel, TypographyRoleControl } from "./Studio11Panels";
import { recommendLayouts } from "./smartApi";
import { PsdImportModal, PsdRelinkModal } from "./PsdImportModal";

const TOOL_ITEMS: { id: Tool; label: string; key: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "선택", key: "V", icon: MousePointer2 },
  { id: "hand", label: "화면 이동", key: "H", icon: Hand },
  { id: "text", label: "텍스트", key: "T", icon: TextCursorInput },
  { id: "image", label: "이미지/PDF", key: "I", icon: ImagePlus },
  { id: "crop", label: "선택 영역 자르기", key: "C", icon: Crop },
  { id: "mask", label: "레이어 마스크", key: "M", icon: ScanSearch },
  { id: "rect", label: "사각형", key: "R", icon: Square },
  { id: "ellipse", label: "원", key: "O", icon: Circle },
  { id: "line", label: "선", key: "L", icon: Minus },
  { id: "guide", label: "세로 가이드", key: "G", icon: Ruler },
];

export function App() {
  const project = useStudio((s) => s.project);
  return project ? <Studio /> : <StartScreen />;
}

function StartScreen() {
  const [recent, setRecent] = useState<ProjectRow[]>([]);
  const [error, setError] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);
  const loadProject = useStudio((s) => s.loadProject);
  const createProject = useStudio((s) => s.createProject);
  const packageInput = useRef<HTMLInputElement>(null);
  useEffect(() => { void db.projects.orderBy("updatedAt").reverse().limit(8).toArray().then(setRecent); }, []);

  const openArchive = async (file?: File) => {
    if (!file) return;
    try { const project = await openPackage(file); await saveProject(project); loadProject(project); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "프로젝트를 열 수 없습니다."); }
  };
  const openDemo = async () => { setDemoBusy(true); setError(""); try { const payload = await loadDecomposedPanelDemo(); await saveProject(payload.project); loadProject(payload.project); } catch (reason) { setError(reason instanceof Error ? reason.message : "예시를 불러오지 못했습니다."); } finally { setDemoBusy(false); } };

  return (
    <main className="welcome">
      <div className="welcome-grid" aria-hidden="true" />
      <section className="welcome-copy">
        <div className="eyebrow"><span>LOCAL-FIRST</span><span>RGB / 300 DPI</span><span>MM-TRUE CANVAS</span></div>
        <h1>ARCHI<span>PANEL</span><br />STUDIO</h1>
        <p>도면, 렌더, 문장을 각각의 레이어로 조립하는<br />건축 패널 전용 로컬 편집기.</p>
        <div className="welcome-actions">
          <button className="primary large" onClick={() => createProject()}><FilePlus2 size={18} /> 새 패널 시작</button>
          <button className="ghost large" onClick={() => packageInput.current?.click()}><Archive size={18} /> 프로젝트 열기</button>
          <input ref={packageInput} hidden type="file" accept=".archipanel" onChange={(e) => void openArchive(e.target.files?.[0])} />
        </div>
        {error && <p className="error-line">{error}</p>}
      </section>
      <section className="recent-panel">
        <div className="section-label"><span>RECENT PROJECTS</span><span>{recent.length.toString().padStart(2, "0")}</span></div>
        <button className="demo-project-card" disabled={demoBusy} onClick={() => void openDemo()}>
          <img src="/api/demo/decomposed-panel/preview" alt="첨부 건축 패널 분해 예시 미리보기" />
          <span className="demo-card-overlay"><small>GUIDED EXAMPLE · 14 BLOCKS</small><strong>{demoBusy ? "원본 자산 준비 중…" : "첨부 패널 분해·자동 배치 예시"}</strong><em>원본 비교 + 독립 crop 레이어 + 3개 추천안</em></span>
        </button>
        {recent.length ? recent.map((row, index) => (
          <button className="recent-row" key={row.id} onClick={() => void loadProjectRow(row).then(loadProject).catch((reason) => setError(reason instanceof Error ? reason.message : "프로젝트를 열 수 없습니다."))}>
            <span className="recent-index">{String(index + 1).padStart(2, "0")}</span>
            <span><strong>{row.name}</strong><small>{row.project.boards.length} boards · {new Date(row.updatedAt).toLocaleDateString("ko-KR")}</small></span>
            <ChevronRight size={16} />
          </button>
        )) : <div className="recent-empty">아직 저장된 프로젝트가 없습니다.<br />첫 패널을 시작해 보세요.</div>}
        <div className="welcome-note"><ShieldCheck size={16} /><span>파일은 이 컴퓨터에만 저장됩니다.<br />로그인과 업로드가 없습니다.</span></div>
      </section>
      <footer className="welcome-footer"><span>ARCHIPANEL / 01</span><span>BUILT FOR ARCHITECTURE BOARDS</span></footer>
    </main>
  );
}

function Studio() {
  const state = useStudio();
  const { project, activeBoardId, selectedIds, tool, zoom } = state;
  const board = project!.boards.find((item) => item.id === activeBoardId)!;
  const selected = project!.elements.filter((element) => selectedIds.includes(element.id));
  const [tab, setTab] = useState<"properties" | "layers" | "assets" | "flow">(project!.layoutProposals.length ? "flow" : "properties");
  const [documentOpen, setDocumentOpen] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [htmlFiles, setHtmlFiles] = useState<File[]>([]);
  const [psdFile, setPsdFile] = useState<File>();
  const [relinkSourceId,setRelinkSourceId]=useState<string>(); const [relinkFile,setRelinkFile]=useState<File>();
  const [notice, setNotice] = useState("");
  const [storage, setStorage] = useState({ persisted: false, usage: 0, quota: 0 });
  const assetInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const htmlInput = useRef<HTMLInputElement>(null);
  const psdInput = useRef<HTMLInputElement>(null);
  const relinkInput=useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const issues = useMemo(() => runPreflight(project!), [project]);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const openDemo = async () => { setNotice("첨부 패널을 14개 편집 영역으로 준비 중…"); try { const payload = await loadDecomposedPanelDemo(); await saveProject(payload.project); state.loadProject(payload.project); setTab("flow"); setNotice(`${payload.regionCount}개 독립 레이어와 3개 자동 추천안을 열었습니다.`); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "예시를 불러오지 못했습니다."); } };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!state.dirty || !project) return;
      void saveProject(project).then((saved) => { useStudio.getState().markSaved(saved.updatedAt); void storageStatus().then(setStorage); });
    }, 700);
    return () => clearTimeout(timer);
  }, [project, state.dirty]);

  useEffect(() => { void storageStatus().then(setStorage); }, []);
  useEffect(() => { if (project) void restoreProjectFonts(project); }, [project?.id]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "Enter" && state.transformMode) { event.preventDefault(); state.completeTransform(); return; }
      if (event.key === "Escape" && state.transformMode) { event.preventDefault(); state.cancelTransform(); return; }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? state.redo() : state.undo(); return; }
      if (mod && event.key.toLowerCase() === "c") { event.preventDefault(); state.copySelected(); setNotice(`${selectedIds.length}개 레이어를 내부 클립보드에 복사했습니다.`); return; }
      if (mod && event.key.toLowerCase() === "v") { event.preventDefault(); state.pasteClipboard(event.shiftKey); setNotice(event.shiftKey ? "원래 mm 좌표에 붙여넣었습니다." : "현재 보드에 5mm 오프셋으로 붙여넣었습니다."); return; }
      if (mod && event.key.toLowerCase() === "d") { event.preventDefault(); state.duplicateSelected(); return; }
      if (mod && event.key.toLowerCase() === "t") { event.preventDefault(); state.beginTransform(); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); state.deleteSelected(); return; }
      const map: Record<string, Tool> = { v: "select", h: "hand", t: "text", c: "crop", m: "mask", r: "rect", o: "ellipse", l: "line" };
      if (map[event.key.toLowerCase()]) state.setTool(map[event.key.toLowerCase()]);
      if (event.key.startsWith("Arrow") && selectedIds.length) {
        event.preventDefault(); const step = event.shiftKey ? 10 : 1;
        state.commit((draft) => draft.elements.forEach((el) => { if (selectedIds.includes(el.id)) { if (event.key === "ArrowLeft") el.xMm -= step; if (event.key === "ArrowRight") el.xMm += step; if (event.key === "ArrowUp") el.yMm -= step; if (event.key === "ArrowDown") el.yMm += step; } }));
      }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [selectedIds, state.transformMode]);

  const importAsset = async (file: File | undefined, background = false) => {
    if (!file || !project || !board) return;
    setNotice(`${file.name} 검사 중…`);
    try {
      const inspected = await inspectFile(file);
      const thumbnail = await dataUrlToBlob(inspected.thumbnailDataUrl);
      const asset = await addAssetFile(project, file, thumbnail, inspected);
      state.addAsset(asset);
      const aspect = (asset.widthPx && asset.heightPx) ? asset.heightPx / asset.widthPx : 0.7;
      const width = background ? board.widthMm : Math.min(240, board.widthMm * 0.45);
      const height = background ? board.heightMm : width * aspect;
      const common = { id: newId(), boardId: board.id, name: background ? `배경 · ${file.name}` : file.name, xMm: background ? 0 : board.safeMarginMm, yMm: background ? 0 : board.safeMarginMm, widthMm: width, heightMm: height, rotationDeg: 0, opacity: 1, visible: true, locked: background, transform: structuredClone(DEFAULT_TRANSFORM) };
      const element: PanelElement = inspected.mime === "application/pdf"
        ? { ...common, type: "pdf", assetId: asset.id, pageIndex: 0, clipNormalized: { x: 0, y: 0, w: 1, h: 1 }, fit: "contain", mask: structuredClone(DEFAULT_MASK), adjustments: structuredClone(DEFAULT_ADJUSTMENTS) }
        : { ...common, type: "image", assetId: asset.id, cropNormalized: { x: 0, y: 0, w: 1, h: 1 }, fit: background ? "cover" : "contain", mask: structuredClone(DEFAULT_MASK), adjustments: structuredClone(DEFAULT_ADJUSTMENTS) };
      state.addElement(element); state.setSelection([element.id]); state.setTool("select"); setNotice(background ? "잠긴 배경으로 추가했습니다." : "자산과 레이어를 추가했습니다.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "파일을 가져오지 못했습니다."); }
  };

  const importFont = async (file?: File) => {
    if (!file || !project) return;
    let metadata: Awaited<ReturnType<typeof inspectFontFile>>;
    try { metadata = await inspectFontFile(file); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "글꼴 검사 실패"); return; }
    const duplicate = project.fonts.find((font) => font.fingerprintSha256 === metadata.fingerprintSha256); if (duplicate) { setNotice(`${duplicate.family} 글꼴은 이미 프로젝트에 있습니다.`); return; }
    const id = newId(); const family = metadata.family;
    await db.fonts.put({ id, projectId: project.id, blob: file, updatedAt: new Date().toISOString() });
    const policy = metadata.embeddingPolicy ?? "unknown"; const font = { id, family, style: metadata.style, subfamily: metadata.subfamily, postscriptName: metadata.postscriptName, weight: metadata.weight, italic: metadata.italic, assetId: id, embeddingAllowed: policy === "restricted" ? false : policy === "unknown" ? "unknown" as const : true, source: "project" as const, embeddingPolicy: policy, format: metadata.format, supportsKorean: metadata.supportsKorean, fingerprintSha256: metadata.fingerprintSha256 };
    try { await loadFontFace(font, file); } catch { /* backend preflight will report unusable fonts */ }
    state.commit((draft) => { draft.fonts.push(font); });
    setNotice(`${family} 글꼴을 프로젝트에 추가했습니다.`);
  };

  return (
    <main className="studio">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">AP</span><span>ARCHIPANEL <b>STUDIO</b></span></div>
        <div className="project-title"><input aria-label="프로젝트 이름" value={project!.name} onChange={(e) => state.commit((draft) => { draft.name = e.target.value; })} /><span className={state.dirty ? "save-dot dirty" : "save-dot"}>{state.dirty ? "저장 중" : "로컬 저장됨"}</span></div>
        <div className="top-actions">
          <button title="실행 취소" disabled={!state.past.length} onClick={state.undo}><Undo2 size={16} /></button>
          <button title="다시 실행" disabled={!state.future.length} onClick={state.redo}><Redo2 size={16} /></button>
          <span className="divider" />
          <button className="demo-top-button" title="첨부 패널 분해 예시 열기" onClick={() => void openDemo()}><LayoutPanelTop size={16} /> 분해 예시</button>
          <button className="document-button" title="보드 크기와 DPI" onClick={() => setDocumentOpen(true)}><Settings2 size={16} /> 문서 설정 <small>{board.widthMm}×{board.heightMm} · {board.printProfile.targetDpi}dpi</small></button>
          <button title="축소" onClick={() => state.setZoom(zoom - 0.1)}><ZoomOut size={16} /></button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button title="확대" onClick={() => state.setZoom(zoom + 0.1)}><ZoomIn size={16} /></button>
          <button className={errors ? "preflight has-error" : "preflight"} onClick={() => setPreflightOpen(true)}><ScanSearch size={16} /> 인쇄 검사 {errors ? <b>{errors}</b> : null}</button>
          <button className="primary" onClick={() => setExportOpen(true)}><Download size={16} /> 내보내기</button>
        </div>
      </header>
      {state.transformMode && <TransformBar selected={selected} />}
      <aside className="toolbar" aria-label="편집 도구">
        {TOOL_ITEMS.map((item) => <button key={item.id} className={tool === item.id ? "active" : ""} title={`${item.label} (${item.key})`} onClick={() => item.id === "image" ? assetInput.current?.click() : state.setTool(item.id)}><item.icon size={19} /><span>{item.key}</span></button>)}
        <span className="tool-divider" />
        <button title="배경 패널 불러오기" onClick={() => backgroundInput.current?.click()}><LayoutPanelTop size={19} /><span>BG</span></button>
        <button title="HTML 패널과 연결 자산 가져오기" onClick={() => htmlInput.current?.click()}><FileCode2 size={19} /><span>HTML</span></button>
        <button title="PSD/PSB 레이어 연결 가져오기" onClick={() => psdInput.current?.click()}><Layers3 size={19} /><span>PSD</span></button>
        <input ref={assetInput} hidden multiple type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => { setImportFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <input ref={backgroundInput} hidden type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => void importAsset(e.target.files?.[0], true)} />
        <input ref={htmlInput} hidden multiple type="file" accept=".html,.htm,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => { setHtmlFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <input ref={psdInput} hidden type="file" accept=".psd,.psb,image/vnd.adobe.photoshop" onChange={(e) => { setPsdFile(e.target.files?.[0]); e.target.value = ""; }} />
      </aside>
      <section className={`workspace tool-${tool}`}><CanvasStudio /></section>
      <aside className="inspector">
        <div className="tabs">
          <button className={tab === "properties" ? "active" : ""} onClick={() => setTab("properties")}><Settings2 size={14} /> 속성</button>
          <button className={tab === "layers" ? "active" : ""} onClick={() => setTab("layers")}><Layers3 size={14} /> 레이어</button>
          <button className={tab === "assets" ? "active" : ""} onClick={() => setTab("assets")}><FileImage size={14} /> 자산</button>
          <button className={tab === "flow" ? "active" : ""} onClick={() => setTab("flow")}><SparklesIcon /> 지능형</button>
        </div>
        {tab === "properties" && <PropertiesPanel board={board} selected={selected} />}
        {tab === "layers" && <LayersPanel board={board} />}
        {tab === "assets" && <AssetsPanel onAdd={() => assetInput.current?.click()} onFont={() => fontInput.current?.click()} onRelink={(sourceId)=>{setRelinkSourceId(sourceId);relinkInput.current?.click();}} />}
        {tab === "flow" && <IntelligencePanel setNotice={setNotice} />}
        <input ref={fontInput} hidden type="file" accept=".ttf,.otf,.ttc,.woff,.woff2" onChange={(e) => void importFont(e.target.files?.[0])} />
        <input ref={relinkInput} hidden type="file" accept=".psd,.psb,image/vnd.adobe.photoshop" onChange={e=>{setRelinkFile(e.target.files?.[0]);e.target.value="";}}/>
        <div className="storage-strip"><span className={storage.persisted ? "status-led ok" : "status-led"} /> <span>{storage.persisted ? "영구 저장 허용됨" : "임시 저장소"}</span><button onClick={() => void requestPersistentStorage().then(() => storageStatus().then(setStorage))}>보호</button></div>
      </aside>
      <footer className="board-strip">
        <div className="boards-label">BOARDS <b>{project!.boards.length}</b></div>
        <div className="board-list">{project!.boards.map((item, index) => <button key={item.id} className={item.id === activeBoardId ? "board-chip active" : "board-chip"} onClick={() => state.setActiveBoard(item.id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.name}</strong><small>{item.widthMm} × {item.heightMm}</small></button>)}</div>
        <button className="add-board" title="보드 추가" onClick={() => state.addBoard()}><Plus size={17} /></button>
        <button title="보드 복제" onClick={() => state.duplicateBoard(board.id)}><BoxSelect size={16} /></button>
        <button title="보드 앞으로" onClick={() => state.moveBoard(board.id, -1)}><ChevronLeft size={16} /></button>
        <button title="보드 뒤로" onClick={() => state.moveBoard(board.id, 1)}><ChevronRight size={16} /></button>
      </footer>
      {notice && <button className="toast" onClick={() => setNotice("")}>{notice}</button>}
      {preflightOpen && <PreflightModal issues={issues} onClose={() => setPreflightOpen(false)} />}
      {exportOpen && <ExportModal errors={errors} onClose={() => setExportOpen(false)} setNotice={setNotice} />}
      {documentOpen && <DocumentSettingsModal onClose={() => setDocumentOpen(false)} />}
      {importFiles.length > 0 && <ImportAssistant files={importFiles} onClose={() => setImportFiles([])} onDone={(message) => { setImportFiles([]); setTab("flow"); setNotice(message); }} />}
      {htmlFiles.length > 0 && <HtmlImportAssistant files={htmlFiles} onClose={() => setHtmlFiles([])} onDone={(message) => { setHtmlFiles([]); setTab("flow"); setNotice(message); }} />}
      {psdFile && <PsdImportModal file={psdFile} onClose={() => setPsdFile(undefined)} setNotice={setNotice} />}
      {relinkFile&&relinkSourceId&&<PsdRelinkModal file={relinkFile} sourceId={relinkSourceId} onClose={()=>{setRelinkFile(undefined);setRelinkSourceId(undefined)}} setNotice={setNotice}/>}
    </main>
  );
}

function ImportAssistant({ files, onClose, onDone }: { files: File[]; onClose: () => void; onDone: (message: string) => void }) {
  const state = useStudio(); const project = state.project!; const board = project.boards.find((item) => item.id === state.activeBoardId)!;
  const [analyses, setAnalyses] = useState<{ file: File; analysis: ImportAnalysis }[]>([]); const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(true); const [error, setError] = useState(""); const [approve, setApprove] = useState(true); const [autoRecommend, setAutoRecommend] = useState(true); const [matchBoard, setMatchBoard] = useState(board.elementIds.length === 0);
  useEffect(() => { let alive = true; setBusy(true); Promise.all(files.map(async (file) => ({ file, analysis: await analyzeImportFile(file) }))).then((items) => { if (!alive) return; setAnalyses(items); const next: Record<string, boolean> = {}; items.forEach(({ analysis }) => analysis.pages.forEach((page) => page.candidates.forEach((candidate) => { next[candidate.id] = true; }))); setSelected(next); }).catch((reason) => alive && setError(reason instanceof Error ? reason.message : String(reason))).finally(() => alive && setBusy(false)); return () => { alive = false; }; }, [files]);
  const candidates = analyses.flatMap((item) => item.analysis.pages.flatMap((page) => page.candidates.map((candidate) => ({ item, page, candidate })))).filter(({ candidate }) => selected[candidate.id]);
  const apply = async () => {
    if (!candidates.length) return; setBusy(true);
    try {
      const assetIds = new Map<File, string>(); const assets: AssetRef[] = [];
      for (const item of analyses) {
        const pageThumbnails = (await Promise.all(item.analysis.pages.map((page) => dataUrlToBlob(page.thumbnailDataUrl)))).filter((value): value is Blob => Boolean(value)); const thumb = pageThumbnails[0];
        const asset = await addAssetFile(project, item.file, thumb, { mime: item.analysis.mime, widthPx: item.analysis.widthPx ?? item.analysis.pages[0]?.widthPx, heightPx: item.analysis.heightPx ?? item.analysis.pages[0]?.heightPx, pageCount: item.analysis.pageCount, sha256: item.analysis.sha256, review: item.analysis.review }, pageThumbnails);
        assetIds.set(item.file, asset.id); assets.push(asset);
      }
      const firstPage = analyses[0]?.analysis.pages[0]; const sourceLandscape = firstPage ? firstPage.widthPx >= firstPage.heightPx : board.widthMm >= board.heightMm; const boardLandscape = board.widthMm >= board.heightMm;
      const targetWidth = matchBoard && sourceLandscape !== boardLandscape ? board.heightMm : board.widthMm; const targetHeight = matchBoard && sourceLandscape !== boardLandscape ? board.widthMm : board.heightMm;
      const safe = board.safeMarginMm; const innerW = targetWidth - safe * 2; const innerH = targetHeight - safe * 2;
      const gutter = Math.max(board.grid.sizeMm, 5); const pageEntries = candidates.filter(({ item, page }, index, all) => all.findIndex((entry) => entry.item.file === item.file && entry.page.pageIndex === page.pageIndex) === index);
      const pageColumns = Math.max(1, Math.ceil(Math.sqrt(pageEntries.length * innerW / Math.max(innerH, 1)))); const pageRows = Math.ceil(pageEntries.length / pageColumns);
      const pageCellW = (innerW - gutter * (pageColumns - 1)) / pageColumns; const pageCellH = (innerH - gutter * (pageRows - 1)) / pageRows;
      const pagePlacements = new Map<string, { x: number; y: number; w: number; h: number }>();
      pageEntries.forEach(({ item, page }, index) => { const aspect = page.widthPx / Math.max(1, page.heightPx); let w = pageCellW; let h = w / aspect; if (h > pageCellH) { h = pageCellH; w = h * aspect; } const column = index % pageColumns; const row = Math.floor(index / pageColumns); pagePlacements.set(`${item.file.name}:${item.file.size}:${page.pageIndex}`, { x: safe + column * (pageCellW + gutter) + (pageCellW - w) / 2, y: safe + row * (pageCellH + gutter) + (pageCellH - h) / 2, w, h }); });
      const elements: PanelElement[] = []; const records: { element: PanelElement; item: typeof candidates[number]["item"]; candidate: typeof candidates[number]["candidate"] }[] = [];
      candidates.forEach(({ item, page, candidate }) => {
        const assetId = assetIds.get(item.file)!; const pageBox = pagePlacements.get(`${item.file.name}:${item.file.size}:${page.pageIndex}`)!;
        const xMm = pageBox.x + candidate.bboxNormalized.x * pageBox.w; const yMm = pageBox.y + candidate.bboxNormalized.y * pageBox.h; const widthMm = Math.max(2, candidate.bboxNormalized.w * pageBox.w); const heightMm = Math.max(2, candidate.bboxNormalized.h * pageBox.h);
        const common = { id: newId(), boardId: board.id, name: candidate.title, xMm, yMm, widthMm, heightMm, rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: structuredClone(DEFAULT_TRANSFORM) };
        const element: PanelElement = candidate.kind === "text"
          ? { ...common, type: "text", text: candidate.text, fontFamily: "KoPubWorld Dotum_Pro", fontSizePt: Math.max(11, Math.min(32, heightMm * 1.2)), lineHeight: 1.28, letterSpacingPt: 0, align: "left", verticalAlign: "top", color: "#191a18", weight: candidate.label === "title" ? 700 : 400, italic: false, underline: false, autoSize: false, styleRole: candidate.label === "title" ? "title" : "body" }
          : item.analysis.mime === "application/pdf"
            ? { ...common, type: "pdf", assetId, pageIndex: candidate.pageIndex, clipNormalized: candidate.bboxNormalized, fit: "contain", mask: structuredClone(DEFAULT_MASK), adjustments: structuredClone(DEFAULT_ADJUSTMENTS) }
            : { ...common, type: "image", assetId, cropNormalized: candidate.bboxNormalized, fit: "contain", mask: structuredClone(DEFAULT_MASK), adjustments: structuredClone(DEFAULT_ADJUSTMENTS) };
        elements.push(element); records.push({ element, item, candidate });
      });
      const grouped = new Map<string, typeof records>(); records.forEach((record) => { const assetId = assetIds.get(record.item.file)!; const key = `${assetId}:${record.candidate.pageIndex}:${record.candidate.groupKey ?? record.candidate.id}`; grouped.set(key, [...(grouped.get(key) ?? []), record]); });
      const labelWeight = (label: string) => label === "title" ? 5 : label === "render" || label === "master_plan" ? 4 : 3;
      const blocks = [...grouped.values()].sort((left, right) => Math.min(...left.map((item) => item.element.yMm)) - Math.min(...right.map((item) => item.element.yMm)) || Math.min(...left.map((item) => item.element.xMm)) - Math.min(...right.map((item) => item.element.xMm))).map((group, index) => {
        const seed = [...group].sort((left, right) => labelWeight(right.candidate.label) - labelWeight(left.candidate.label) || right.candidate.confidence - left.candidate.confidence)[0]; const label = CONTENT_LABELS.includes(seed.candidate.label as ContentLabel) ? seed.candidate.label as ContentLabel : "diagram";
        const summaries = group.map((item) => item.candidate.text).filter(Boolean);
        return { id: newId(), boardId: board.id, elementIds: group.map((item) => item.element.id), label, title: seed.candidate.title, summary: summaries.join("\n"), readingOrder: index + 1, importance: labelWeight(label) as 1 | 2 | 3 | 4 | 5, confidence: Math.min(...group.map((item) => item.candidate.confidence)), status: approve ? "approved" as const : group.some((item) => item.candidate.status === "needs_review") ? "needs_review" as const : "suggested" as const, rationale: `${group.length}개 원본 객체 자동 연결 · ${seed.item.file.name} p.${seed.candidate.pageIndex + 1}` };
      });
      state.commit((draft) => { draft.assets.push(...assets); draft.elements.push(...elements); const target = draft.boards.find((entry) => entry.id === board.id)!; target.widthMm = targetWidth; target.heightMm = targetHeight; syncBoardPrintProfile(target); target.elementIds.push(...elements.map((element) => element.id)); draft.contentBlocks.push(...blocks); });
      if (approve && autoRecommend) { const current = useStudio.getState().project!; const proposals = await recommendLayouts(current, board.id, []); state.commit((draft) => { draft.layoutProposals = draft.layoutProposals.filter((item) => item.boardId !== board.id); draft.layoutProposals.push(...proposals); }); }
      onDone(`${assets.length}개 파일에서 ${elements.length}개 객체를 연결했습니다.${targetWidth !== board.widthMm ? " 보드 방향을 원본에 맞췄습니다." : ""}${approve && autoRecommend ? " 3개 추천안을 준비했습니다." : ""}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  };
  const total = analyses.reduce((sum, item) => sum + item.analysis.candidateCount, 0); const chosen = Object.values(selected).filter(Boolean).length;
  return <div className="modal-backdrop"><div className="modal import-assistant"><header><div><span className="modal-index">IMPORT / OBJECT LINK</span><h2>PDF·이미지 객체 연결</h2></div><button onClick={onClose}>닫기</button></header>{busy && !analyses.length ? <div className="import-loading"><RefreshCw size={22}/><b>페이지와 여백 구조 분석 중</b><span>원본은 브라우저 밖으로 전송하지 않습니다.</span></div> : <><div className="import-summary"><div><span>FILES</span><b>{analyses.length}</b></div><div><span>CANDIDATES</span><b>{total}</b></div><div><span>SELECTED</span><b>{chosen}</b></div></div><div className="import-pages">{analyses.map(({ file, analysis }) => <section key={`${file.name}-${file.size}`}><div className="import-file-head"><b>{file.name}</b><span>{analysis.pageCount} page · {analysis.candidateCount} objects</span></div>{analysis.pages.map((page) => <article className="import-page" key={page.pageIndex}><div className="import-map"><img src={page.thumbnailDataUrl} alt={`${file.name} ${page.pageIndex + 1}페이지`} />{page.candidates.map((candidate) => <button aria-label={candidate.title} title={`${candidate.title} · ${Math.round(candidate.confidence * 100)}%`} className={selected[candidate.id] ? "selected" : ""} key={candidate.id} style={{ left: `${candidate.bboxNormalized.x * 100}%`, top: `${candidate.bboxNormalized.y * 100}%`, width: `${candidate.bboxNormalized.w * 100}%`, height: `${candidate.bboxNormalized.h * 100}%` }} onClick={() => setSelected((current) => ({ ...current, [candidate.id]: !current[candidate.id] }))}><span>{candidate.label}</span></button>)}</div><div className="import-candidate-list"><b>PAGE {page.pageIndex + 1}</b>{page.candidates.map((candidate) => <label key={candidate.id} className={selected[candidate.id] ? "active" : ""}><input type="checkbox" checked={Boolean(selected[candidate.id])} onChange={() => setSelected((current) => ({ ...current, [candidate.id]: !current[candidate.id] }))}/><span><strong>{candidate.title}</strong><small>{candidate.label} · {Math.round(candidate.confidence * 100)}% · {candidate.status === "needs_review" ? "검토 필요" : "제안"}</small></span></label>)}</div></article>)}</section>)}</div><div className="import-options"><label><input type="checkbox" checked={matchBoard} onChange={(event) => setMatchBoard(event.target.checked)}/><span><b>빈 보드 방향 자동 맞춤</b><small>첫 페이지의 가로·세로 방향을 사용합니다.</small></span></label><label><input type="checkbox" checked={approve} onChange={(event) => setApprove(event.target.checked)}/><span><b>선택 객체의 라벨 승인</b><small>이 선택이 사용자 승인으로 기록됩니다.</small></span></label><label><input type="checkbox" checked={autoRecommend} disabled={!approve} onChange={(event) => setAutoRecommend(event.target.checked)}/><span><b>연결 후 3안 자동 추천</b><small>Narrative · Hero · Technical</small></span></label></div><div className="modal-actions"><button onClick={onClose}>취소</button><button className="primary" disabled={busy || !chosen} onClick={() => void apply()}>{busy ? "구성 중…" : `${chosen}개 객체 연결`}</button></div></>}{error && <p className="import-error">{error}</p>}</div></div>;
}

function HtmlImportAssistant({ files, onClose, onDone }: { files: File[]; onClose: () => void; onDone: (message: string) => void }) {
  const state = useStudio(); const project = state.project!; const board = project.boards.find((item) => item.id === state.activeBoardId)!;
  const [analysis, setAnalysis] = useState<HtmlPanelAnalysis>(); const [busy, setBusy] = useState(true); const [error, setError] = useState("");
  const [approved, setApproved] = useState(false); const [autoRecommend, setAutoRecommend] = useState(true);
  useEffect(() => { let alive = true; analyzeHtmlPanel(files).then((result) => alive && setAnalysis(result)).catch((reason) => alive && setError(reason instanceof Error ? reason.message : String(reason))).finally(() => alive && setBusy(false)); return () => { alive = false; }; }, [files]);
  const apply = async () => {
    if (!analysis) return; setBusy(true); setError("");
    try {
      const materialized = await materializeHtmlPanel(project, board.id, analysis, approved);
      state.commit((draft) => {
        draft.assets.push(...materialized.assets); draft.elements.push(...materialized.elements); draft.contentBlocks.push(...materialized.blocks); draft.htmlSources.push(materialized.htmlSource);
        const target = draft.boards.find((item) => item.id === board.id)!; target.widthMm = analysis.widthMm; target.heightMm = analysis.heightMm; target.elementIds.push(...materialized.elements.map((item) => item.id)); syncBoardPrintProfile(target);
      });
      if (approved && autoRecommend && materialized.blocks.length) {
        const current = useStudio.getState().project!; const proposals = await recommendLayouts(current, board.id, []);
        state.commit((draft) => { draft.layoutProposals = draft.layoutProposals.filter((item) => item.boardId !== board.id); draft.layoutProposals.push(...proposals); });
      }
      onDone(`HTML에서 ${materialized.elements.length}개 편집 요소와 ${materialized.blocks.length}개 콘텐츠 블록을 연결했습니다.${approved && autoRecommend ? " 레이아웃 3안도 준비했습니다." : ""}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  };
  return <div className="modal-backdrop"><div className="modal html-import-assistant"><header><div><span className="modal-index">HTML / SAFE DOM</span><h2>HTML 패널 요소 가져오기</h2></div><button onClick={onClose}>닫기</button></header>{busy&&!analysis?<div className="import-loading"><RefreshCw size={22}/><b>HTML을 격리 렌더링하는 중</b><span>script·iframe·외부 스타일은 실행하지 않습니다.</span></div>:analysis&&<><div className="html-import-flow"><span>HTML SOURCE</span><i>→</i><span>{analysis.candidates.length} ELEMENTS</span><i>→</i><span>CONTENT BLOCKS</span><i>→</i><span>AI STORYBOARD</span></div><div className="html-import-summary"><div><small>판형</small><b>{analysis.widthMm} × {analysis.heightMm}mm</b></div><div><small>텍스트</small><b>{analysis.candidates.filter((item)=>item.kind==="text").length}</b></div><div><small>이미지</small><b>{analysis.candidates.filter((item)=>item.kind==="image"&&item.imageFile).length}</b></div><div><small>검토</small><b>{analysis.reviewFlags.length+analysis.candidates.filter((item)=>item.reviewFlags.length).length}</b></div></div><div className="html-element-map" style={{aspectRatio:`${analysis.widthMm}/${analysis.heightMm}`}}>{analysis.candidates.map((item)=><i key={item.id} className={item.kind} title={`${item.label} · ${item.title}`} style={{left:`${item.bboxMm.x/analysis.widthMm*100}%`,top:`${item.bboxMm.y/analysis.heightMm*100}%`,width:`${item.bboxMm.w/analysis.widthMm*100}%`,height:`${item.bboxMm.h/analysis.heightMm*100}%`}}><span>{item.label}</span></i>)}</div><div className="html-element-list">{analysis.candidates.map((item)=><div key={item.id}><b>{item.kind==="text"?"T":"IMG"}</b><span><strong>{item.title}</strong><small>{item.label} · {Math.round(item.confidence*100)}% · {item.selector}</small></span>{item.reviewFlags.length>0&&<em>검토</em>}</div>)}</div>{analysis.reviewFlags.length>0&&<div className="html-review">{analysis.reviewFlags.map((flag)=><span key={flag}>{flag}</span>)}</div>}<div className="import-options"><label><input type="checkbox" checked={approved} onChange={(event)=>setApproved(event.target.checked)}/><span><b>HTML 요소·라벨을 사용자 승인</b><small>승인한 블록만 생성형 AI와 PPTX 근거로 사용됩니다.</small></span></label><label><input type="checkbox" checked={autoRecommend} disabled={!approved} onChange={(event)=>setAutoRecommend(event.target.checked)}/><span><b>가져온 뒤 3안 추천</b><small>원본 내용은 바꾸지 않고 위치와 크기만 제안합니다.</small></span></label></div><div className="modal-actions"><button onClick={onClose}>취소</button><button className="primary" disabled={busy||!analysis.candidates.length} onClick={()=>void apply()}>{busy?"구성 중…":`${analysis.candidates.length}개 요소 가져오기`}</button></div></>}{error&&<p className="import-error">{error}</p>}</div></div>;
}

function TransformBar({ selected }: { selected: PanelElement[] }) {
  const state = useStudio(); const element = selected.length === 1 ? selected[0] : null;
  const update = (patch: Parameters<typeof applyTransformPatch>[1]) => { if (!element) return; state.mutate((draft) => { const index = draft.elements.findIndex((item) => item.id === element.id); if (index >= 0) draft.elements[index] = applyTransformPatch(draft.elements[index], patch); }); };
  const field = (label: string, value: number, key: "xMm" | "yMm" | "widthMm" | "heightMm" | "rotationDeg" | "skewXDeg" | "skewYDeg") => <label><span>{label}</span><input type="number" value={Number(value.toFixed(2))} onChange={(e) => update({ [key]: Number(e.target.value) })} /></label>;
  return <div className="transform-bar"><strong>FREE TRANSFORM</strong>{element ? <>{field("X", element.xMm, "xMm")}{field("Y", element.yMm, "yMm")}{field("W", element.widthMm, "widthMm")}{field("H", element.heightMm, "heightMm")}<button className={element.transform.lockAspect ? "active" : ""} title="비율 잠금" onClick={() => update({ lockAspect: !element.transform.lockAspect })}>⛓</button>{field("R°", element.rotationDeg, "rotationDeg")}{field("Skew X", element.transform.skewXDeg, "skewXDeg")}{field("Skew Y", element.transform.skewYDeg, "skewYDeg")}<div className="origin-grid">{([0, .5, 1] as const).flatMap((y) => ([0, .5, 1] as const).map((x) => <button key={`${x}-${y}`} className={element.transform.originX === x && element.transform.originY === y ? "active" : ""} onClick={() => update({ originX: x, originY: y })} />))}</div><button title="좌우 반전" onClick={() => update({ flipX: !element.transform.flipX })}><FlipHorizontal2 size={15} /></button><button title="상하 반전" onClick={() => update({ flipY: !element.transform.flipY })}><FlipVertical2 size={15} /></button></> : <span>다중 선택은 캔버스 핸들로 변형하세요.</span>}<button className="primary" onClick={state.completeTransform}>확정 Enter</button><button onClick={state.cancelTransform}>취소 Esc</button></div>;
}

function PropertiesPanel({ board, selected }: { board: NonNullable<ReturnType<typeof useStudio.getState>["project"]>["boards"][number]; selected: PanelElement[] }) {
  const state = useStudio();
  const [systemFonts, setSystemFonts] = useState<SystemFontDefinition[]>([]);
  const [fontQuery, setFontQuery] = useState("");
  const element = selected.length === 1 ? selected[0] : null;
  const number = (label: string, value: number, apply: (value: number) => void, step = 1) => <label><span>{label}</span><input type="number" value={Number(value.toFixed(2))} step={step} onChange={(e) => apply(Number(e.target.value))} /></label>;
  useEffect(() => { void fetchSystemFonts().then(setSystemFonts); }, []);
  if (!element) return <div className="panel-scroll"><Section title="BOARD / 보드"><label><span>프리셋</span><select value="" onChange={(e) => { const preset = BOARD_PRESETS[Number(e.target.value)]; if (preset) state.commit((draft) => { const target = draft.boards.find((b) => b.id === board.id); if (target) { target.widthMm = preset.widthMm; target.heightMm = preset.heightMm; target.name = preset.label; } }); }}><option value="">사용자 지정</option>{BOARD_PRESETS.map((preset, index) => <option value={index} key={preset.label}>{preset.label}</option>)}</select></label><label><span>보드 이름</span><input value={board.name} onChange={(e) => state.commit((draft) => { const target = draft.boards.find((b) => b.id === board.id); if (target) target.name = e.target.value; })} /></label><div className="field-grid">{number("너비 mm", board.widthMm, (value) => state.commit((draft) => { const target = draft.boards.find((b) => b.id === board.id); if (target) target.widthMm = value; }))}{number("높이 mm", board.heightMm, (value) => state.commit((draft) => { const target = draft.boards.find((b) => b.id === board.id); if (target) target.heightMm = value; }))}{number("재단 mm", board.bleedMm, (value) => state.commit((draft) => { const target = draft.boards.find((b) => b.id === board.id); if (target) target.bleedMm = value; }), 0.5)}{number("안전 mm", board.safeMarginMm, (value) => state.commit((draft) => { const target = draft.boards.find((b) => b.id === board.id); if (target) target.safeMarginMm = value; }), 0.5)}</div><label className="switch-row"><span>5mm 그리드</span><input type="checkbox" checked={board.grid.enabled} onChange={(e) => state.commit((draft) => { const target = draft.boards.find((b) => b.id === board.id); if (target) target.grid.enabled = e.target.checked; })} /></label></Section><EmptySelection /></div>;
  const update = (patch: Partial<PanelElement>) => state.updateElement(element.id, patch);
  const chooseFont = async (value: string) => {
    if (element.type !== "text") return;
    if (value === "system") { update({ fontAssetId: undefined, fontFamily: "Malgun Gothic", weight: 400 }); return; }
    if (value.startsWith("catalog:")) {
      const definition = systemFonts.find((font) => `catalog:${font.id}` === value);
      if (!definition || !state.project) return;
      const font = await installSystemFont(state.project, definition);
      if (!state.project.fonts.some((item) => item.id === font.id)) state.commit((draft) => { draft.fonts.push(font); });
      update({ fontAssetId: font.id, fontFamily: font.family, weight: font.weight });
      return;
    }
    const font = state.project?.fonts.find((item) => item.id === value);
    if (font) update({ fontAssetId: font.id, fontFamily: font.family, weight: font.weight });
  };
  const currentCrop = element.type === "image" ? element.cropNormalized : element.type === "pdf" ? element.clipNormalized : null;
  return <div className="panel-scroll">
    <Section title={`LAYER / ${element.type.toUpperCase()}`}>
      <label><span>이름</span><input value={element.name} onChange={(e) => update({ name: e.target.value })} /></label>
      <div className="field-grid">{number("X mm", element.xMm, (xMm) => update({ xMm }))}{number("Y mm", element.yMm, (yMm) => update({ yMm }))}{number("W mm", element.widthMm, (widthMm) => update({ widthMm }))}{number("H mm", element.heightMm, (heightMm) => update({ heightMm }))}{number("회전 °", element.rotationDeg, (rotationDeg) => update({ rotationDeg }), 0.5)}{number("불투명 %", element.opacity * 100, (value) => update({ opacity: value / 100 }))}</div>
      <label><span>레이어 혼합</span><select value={element.blendMode ?? "normal"} onChange={(event) => update({ blendMode: event.target.value as PanelElement["blendMode"] })}><option value="normal">Normal · 기본</option><option value="multiply">Multiply · 흰 배경 도면</option><option value="screen">Screen · 검은 배경 제거</option><option value="overlay">Overlay · 재질 강조</option><option value="darken">Darken · 어두운 픽셀</option><option value="lighten">Lighten · 밝은 픽셀</option></select></label>
      <div className="field-grid">{number("기울기 X°", element.transform.skewXDeg, (skewXDeg) => update({ transform: { ...element.transform, skewXDeg: Math.max(-60, Math.min(60, skewXDeg)) } }), .5)}{number("기울기 Y°", element.transform.skewYDeg, (skewYDeg) => update({ transform: { ...element.transform, skewYDeg: Math.max(-60, Math.min(60, skewYDeg)) } }), .5)}</div>
      <div className="type-toggles"><button className={element.transform.flipX ? "active" : ""} onClick={() => update({ transform: { ...element.transform, flipX: !element.transform.flipX } })}><FlipHorizontal2 size={14} /> 좌우</button><button className={element.transform.flipY ? "active" : ""} onClick={() => update({ transform: { ...element.transform, flipY: !element.transform.flipY } })}><FlipVertical2 size={14} /> 상하</button><button className={element.transform.lockAspect ? "active" : ""} onClick={() => update({ transform: { ...element.transform, lockAspect: !element.transform.lockAspect } })}>비율 잠금</button></div>
    </Section>
    {element.type === "text" && <Section title="TYPOGRAPHY / 글자">
      <textarea rows={6} value={element.text} onChange={(e) => update({ text: e.target.value })} />
      <div className="font-search"><input placeholder="설치 글꼴 검색" value={fontQuery} onChange={(e) => setFontQuery(e.target.value)} /><button title="Windows 글꼴 다시 검색" onClick={() => void refreshSystemFonts().then(setSystemFonts)}><RefreshCw size={14} /></button></div>
      <label><span>글꼴</span><select value={element.fontAssetId ?? "system"} onChange={(e) => void chooseFont(e.target.value)}>
        <option value="system">맑은 고딕 · 시스템</option>
        {systemFonts.length > 0 && <optgroup label="이 PC의 설치 글꼴">{systemFonts.filter((font) => `${font.family} ${font.style}`.toLowerCase().includes(fontQuery.toLowerCase())).slice(0, 250).map((font) => <option key={font.id} value={`catalog:${font.id}`}>{font.family.replace("_Pro", "")} · {font.style}{font.supportsKorean === false ? " · 한글 미지원" : ""}</option>)}</optgroup>}
        {state.project?.fonts.length ? <optgroup label="프로젝트에 포함됨">{state.project.fonts.map((font) => <option key={font.id} value={font.id}>{font.family} · {font.style}</option>)}</optgroup> : null}
      </select></label>
      <TypographyRoleControl elementId={element.id} />
      <div className="field-grid">{number("크기 pt", element.fontSizePt, (fontSizePt) => update({ fontSizePt }), 0.5)}{number("행간", element.lineHeight, (lineHeight) => update({ lineHeight }), 0.05)}{number("자간 pt", element.letterSpacingPt, (letterSpacingPt) => update({ letterSpacingPt }), 0.1)}<label><span>굵기</span><select value={element.weight} onChange={(e) => update({ weight: Number(e.target.value) })}><option value={300}>Light</option><option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>SemiBold</option><option value={700}>Bold</option></select></label></div>
      <div className="type-toggles"><button className={element.italic ? "active" : ""} onClick={() => update({ italic: !element.italic })}><i>I</i> 기울임</button><button className={element.underline ? "active" : ""} onClick={() => update({ underline: !element.underline })}><u>U</u> 밑줄</button></div>
      <label><span>정렬</span><select value={element.align} onChange={(e) => update({ align: e.target.value as "left" })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option><option value="justify">양쪽</option></select></label>
      <label><span>글자색</span><input type="color" value={element.color} onChange={(e) => update({ color: e.target.value })} /></label>
    </Section>}
    {element.type === "shape" && <Section title="APPEARANCE / 모양"><label><span>채우기</span><input type="color" value={element.fill === "transparent" ? "#ffffff" : element.fill} onChange={(e) => update({ fill: e.target.value })} /></label><label><span>외곽선</span><input type="color" value={element.stroke} onChange={(e) => update({ stroke: e.target.value })} /></label>{number("선 두께 mm", element.strokeWidthMm, (strokeWidthMm) => update({ strokeWidthMm }), 0.1)}</Section>}
    {currentCrop && <Section title={`${element.type.toUpperCase()} / 선택 영역 자르기`}>
      <button className="crop-launch" disabled={element.rotationDeg % 360 !== 0} onClick={() => state.setTool("crop")}><Crop size={16} /> 캔버스에서 영역 선택</button>
      {element.rotationDeg % 360 !== 0 && <small className="property-note">자르기 전에 회전을 0°로 설정하세요.</small>}
      {element.type === "image" && <label><span>맞춤</span><select value={element.fit} onChange={(e) => update({ fit: e.target.value as "contain" })}><option value="contain">비율 맞춤</option><option value="cover">프레임 채움</option><option value="stretch">늘리기</option></select></label>}
      <div className="crop-readout"><span>X {Math.round(currentCrop.x * 100)}%</span><span>Y {Math.round(currentCrop.y * 100)}%</span><span>W {Math.round(currentCrop.w * 100)}%</span><span>H {Math.round(currentCrop.h * 100)}%</span></div>
      <button className="subtle-action" onClick={() => element.type === "image" ? update({ cropNormalized: { x: 0, y: 0, w: 1, h: 1 } }) : update({ clipNormalized: { x: 0, y: 0, w: 1, h: 1 } })}>원본 영역으로 초기화</button>
    </Section>}
    {(element.type === "image" || element.type === "pdf") && <Section title="MASK / 비파괴 마스크">
      <button className="crop-launch" onClick={() => state.setTool("mask")}><ScanSearch size={16} /> 캔버스에서 마스크 그리기</button>
      <label className="switch-row"><span>마스크 사용</span><input type="checkbox" checked={element.mask.enabled} onChange={(e) => update({ mask: { ...element.mask, enabled: e.target.checked } })} /></label>
      <label className="switch-row"><span>반전</span><input type="checkbox" checked={element.mask.invert} onChange={(e) => update({ mask: { ...element.mask, invert: e.target.checked } })} /></label>
      {number("페더 mm", element.mask.featherMm, (featherMm) => update({ mask: { ...element.mask, featherMm: Math.max(0, Math.min(20, featherMm)) } }), .5)}
      <div className="crop-readout"><span>연산 {element.mask.operations.length}개</span></div><button className="subtle-action" onClick={() => update({ mask: structuredClone(DEFAULT_MASK) })}>마스크 초기화</button>
    </Section>}
    {(element.type === "image" || element.type === "pdf") && <Section title="ADJUST / 인쇄 기본 보정">
      <div className="field-grid">{number("노출 EV", element.adjustments.exposureEv, (exposureEv) => update({ adjustments: { ...element.adjustments, exposureEv: Math.max(-5, Math.min(5, exposureEv)) } }), .1)}{number("밝기", element.adjustments.brightness, (brightness) => update({ adjustments: { ...element.adjustments, brightness: Math.max(-100, Math.min(100, brightness)) } }))}{number("대비", element.adjustments.contrast, (contrast) => update({ adjustments: { ...element.adjustments, contrast: Math.max(-100, Math.min(100, contrast)) } }))}{number("채도", element.adjustments.saturation, (saturation) => update({ adjustments: { ...element.adjustments, saturation: Math.max(-100, Math.min(100, saturation)) } }))}{number("색온도", element.adjustments.temperature, (temperature) => update({ adjustments: { ...element.adjustments, temperature: Math.max(-100, Math.min(100, temperature)) } }))}{number("흑백 %", element.adjustments.grayscale * 100, (grayscale) => update({ adjustments: { ...element.adjustments, grayscale: Math.max(0, Math.min(1, grayscale / 100)) } }))}</div>
      <button className="subtle-action" onClick={() => update({ adjustments: structuredClone(DEFAULT_ADJUSTMENTS) })}>보정 초기화</button>
    </Section>}
  </div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="property-section"><h3>{title}</h3>{children}</section>; }
function EmptySelection() { return <div className="empty-selection"><MousePointer2 size={26} /><strong>레이어를 선택하세요</strong><span>캔버스나 레이어 목록에서 선택하면<br />정확한 mm 속성을 편집할 수 있습니다.</span></div>; }

function LayersPanel({ board }: { board: NonNullable<ReturnType<typeof useStudio.getState>["project"]>["boards"][number] }) {
  const state = useStudio(); const elements = board.elementIds.map((id) => state.project?.elements.find((el) => el.id === id)).filter(Boolean) as PanelElement[];
  const [gap, setGap] = useState(10);
  return <div className="panel-scroll"><Section title="ALIGN / 자동 정렬"><label><span>기준</span><select value={state.alignmentReference} onChange={(e) => state.setAlignmentReference(e.target.value as "selection")}><option value="selection">선택 경계</option><option value="board">보드</option><option value="safe">안전 여백</option><option value="key">핵심 객체</option></select></label><div className="alignment-grid"><button title="왼쪽" onClick={() => state.alignSelected("left")}><AlignLeft /></button><button title="가로 중앙" onClick={() => state.alignSelected("hcenter")}><AlignCenter /></button><button title="오른쪽" onClick={() => state.alignSelected("right")}><AlignRight /></button><button title="위" onClick={() => state.alignSelected("top")}><AlignStartVertical /></button><button title="세로 중앙" onClick={() => state.alignSelected("vcenter")}><AlignCenterVertical /></button><button title="아래" onClick={() => state.alignSelected("bottom")}><AlignEndVertical /></button></div><div className="alignment-grid"><button title="수평 동일 간격" onClick={() => state.distributeSelected("h-gap")}>H↔</button><button title="수직 동일 간격" onClick={() => state.distributeSelected("v-gap")}>V↕</button><button title="수평 중심 분배" onClick={() => state.distributeSelected("h-center")}>H●</button><button title="수직 중심 분배" onClick={() => state.distributeSelected("v-center")}>V●</button></div><div className="tidy-row"><label><span>거터 mm</span><input type="number" min="0" value={gap} onChange={(e) => setGap(Number(e.target.value))} /></label><button onClick={() => state.tidySelected(gap)}><Grid3X3 size={15} /> Tidy Grid</button></div></Section><div className="clipboard-note"><b>BOARD CLIPBOARD</b><span>Ctrl+C · Ctrl+V 오프셋 · Ctrl+Shift+V 원위치</span></div><div className="layer-actions"><button title="그룹" onClick={state.groupSelected}><Group size={15} /></button><button title="그룹 해제" onClick={state.ungroupSelected}><Ungroup size={15} /></button><button title="복사" disabled={!state.selectedIds.length} onClick={state.copySelected}><Copy size={15} /></button><button title="붙여넣기" disabled={!state.clipboard} onClick={() => state.pasteClipboard()}><ClipboardPaste size={15} /></button><button title="복제" onClick={state.duplicateSelected}><BoxSelect size={15} /></button><button title="삭제" onClick={state.deleteSelected}><Trash2 size={15} /></button></div><div className="layer-list">{[...elements].reverse().map((element) => { const active = element.type === "group" ? element.childIds.some((id) => state.selectedIds.includes(id)) : state.selectedIds.includes(element.id); return <button key={element.id} className={active ? "layer-row active" : "layer-row"} onClick={(event) => { const ids = element.type === "group" ? element.childIds : [element.id]; state.setSelection(event.shiftKey ? Array.from(new Set([...state.selectedIds, ...ids])) : ids); }}><span className="layer-type">{element.type === "text" ? "T" : element.type === "shape" ? "◇" : element.type === "pdf" ? "P" : element.type === "group" ? "G" : "I"}</span><span className="layer-name">{element.name}</span><span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); state.updateElement(element.id, { visible: !element.visible }); }}>{element.visible ? <Eye size={14} /> : <EyeOff size={14} />}</span><span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); state.updateElement(element.id, { locked: !element.locked }); }}>{element.locked ? <Lock size={13} /> : <LockOpen size={13} />}</span></button>; })}</div></div>;
}

function AssetsPanel({ onAdd, onFont,onRelink }: { onAdd: () => void; onFont: () => void;onRelink:(sourceId:string)=>void }) {
  const state = useStudio();
  return <div className="panel-scroll"><div className="asset-buttons"><button className="primary" onClick={onAdd}><Upload size={15} /> 자산 추가</button><button onClick={onFont}><TextCursorInput size={15} /> 글꼴 추가</button></div>{state.project?.psdSources.length?<Section title="LINKED PSD / PSB">{state.project.psdSources.map(source=><div className="font-row" key={source.id}><span>{source.name}<small>{source.format} · {source.layers.length} layers · {source.reviewStatus}</small></span><button onClick={()=>onRelink(source.id)}><RefreshCw size={12}/> 재연결</button></div>)}</Section>:null}<div className="asset-list">{state.project?.assets.map((asset) => <div className="asset-row" key={asset.id}><div className="asset-icon">{asset.mime === "application/pdf" ? "PDF" : "IMG"}</div><div><strong>{asset.name}</strong><small>{asset.widthPx && asset.heightPx ? `${asset.widthPx} × ${asset.heightPx}px` : asset.pageCount ? `${asset.pageCount} pages` : `${Math.round(asset.sizeBytes / 1024)} KB`}</small></div></div>)}</div>{state.project?.fonts.length ? <Section title="PROJECT FONTS">{state.project.fonts.map((font) => <div className="font-row" key={font.id}><span style={{ fontFamily: font.family }}>{font.family}</span><small>{font.embeddingAllowed === "unknown" ? "권한 확인 필요" : "임베딩 허용"}</small></div>)}</Section> : null}</div>;
}

function PreflightModal({ issues, onClose }: { issues: ReturnType<typeof runPreflight>; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><header><div><span className="modal-index">PRINT / 01</span><h2>인쇄 전 검사</h2></div><button onClick={onClose}>닫기</button></header><div className="issue-summary"><div><b>{issues.filter((i) => i.severity === "error").length}</b><span>차단 오류</span></div><div><b>{issues.filter((i) => i.severity === "warning").length}</b><span>확인 경고</span></div><div><b>{issues.filter((i) => i.severity === "info").length}</b><span>안내</span></div></div><div className="issue-list">{issues.map((issue, index) => <div className={`issue ${issue.severity}`} key={`${issue.code}-${index}`}><span>{issue.severity === "error" ? "ERR" : issue.severity === "warning" ? "REV" : "INF"}</span><div><strong>{issue.code}</strong><p>{issue.message}</p></div></div>)}</div></div></div>;
}

function ExportModal({ errors, onClose, setNotice }: { errors: number; onClose: () => void; setNotice: (value: string) => void }) {
  const project = useStudio((s) => s.project)!; const [busy, setBusy] = useState(""); const [dpi, setDpi] = useState(project.boards[0].printProfile.targetDpi); const [reviewed, setReviewed] = useState(false); const [portablePsd,setPortablePsd]=useState(false);
  const run = async (kind: "project" | "pdf" | "png" | "jpg") => { if (errors && kind !== "project") return; setBusy(kind); try { if (kind === "project") await packageProject(project,portablePsd); else if (kind === "pdf") await downloadFromEndpoint(project, "/api/export/pdf", `${safeName(project.name)}.pdf`, { boardIds: project.boards.map((b) => b.id), includeBleed: true, cropMarks: false }); else await downloadFromEndpoint(project, "/api/export/raster", `${safeName(project.name)}-${project.boards[0].name}.${kind}`, { boardId: project.boards[0].id, format: kind, dpi, quality: 92, includeBleed: false }); setNotice(`${kind.toUpperCase()} 내보내기가 완료되었습니다.`); onClose(); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "내보내기 실패"); } finally { setBusy(""); } };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal export-modal" onMouseDown={(e) => e.stopPropagation()}><header><div><span className="modal-index">EXPORT / 02</span><h2>인쇄 파일 내보내기</h2></div><button onClick={onClose}>닫기</button></header>{errors ? <div className="export-blocked"><ShieldCheck size={22} /><div><strong>PDF·이미지 출력이 잠겼습니다.</strong><p>인쇄 검사의 차단 오류 {errors}개를 먼저 해결하세요. 프로젝트 원본은 계속 저장할 수 있습니다.</p></div></div> : <label className="review-check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /><span>RGB 출력과 경고 항목을 검토했습니다.</span></label>}<div className="export-grid"><button onClick={() => void run("project")}><Archive /><strong>.ARCHIPANEL</strong><span>{portablePsd?"PSD/PSB 포함 ZIP64":"PSD/PSB 링크 모드"}</span></button><button disabled={Boolean(errors) || !reviewed} onClick={() => void run("pdf")}><FileImage /><strong>PRINT PDF</strong><span>벡터 텍스트 · 실제 mm</span></button><button disabled={Boolean(errors) || !reviewed} onClick={() => void run("png")}><Download /><strong>PNG</strong><span>무손실 래스터</span></button><button disabled={Boolean(errors) || !reviewed} onClick={() => void run("jpg")}><Download /><strong>JPG</strong><span>공유용 고화질</span></button></div>{project.psdSources.length>0&&<label className="review-check"><input type="checkbox" checked={portablePsd} onChange={e=>setPortablePsd(e.target.checked)}/><span>portable ZIP64에 원본 PSD/PSB 포함</span></label>}<label className="dpi-field"><span>래스터 해상도</span><select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}><option value={150}>150 dpi</option><option value={300}>300 dpi</option><option value={600}>600 dpi</option></select></label>{busy && <div className="export-progress">{busy.toUpperCase()} 생성 중… 대형 패널은 시간이 걸릴 수 있습니다.</div>}</div></div>;
}

function SparklesIcon() { return <span aria-hidden="true" style={{ color: "#c85d32", fontSize: 12 }}>✦</span>; }
