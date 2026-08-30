import { useEffect, useRef, useState } from "react";
import { ActiveSelection, Canvas, Ellipse, FabricImage, IText, Line, Rect, type FabricObject } from "fabric";
import { db } from "./db";
import { composeCrop, cropFrame, FULL_CROP, normalizedDrag, type NormalizedRect } from "./crop";
import { useStudio } from "./store";
import type { ImageElement, MaskOperation, PanelElement, PdfElement, PsdLayerElement, ShapeElement, TextElement } from "./types";
import { DEFAULT_TRANSFORM, newId } from "./types";
import { ptToMm, roundMm } from "./units";

type TaggedObject = FabricObject & { elementId?: string };

export function CanvasStudio() {
  const canvasNode = useRef<HTMLCanvasElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [scale, setScale] = useState(1);
  const [smartReadout, setSmartReadout] = useState("");
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const project = useStudio((s) => s.project);
  const boardId = useStudio((s) => s.activeBoardId);
  const tool = useStudio((s) => s.tool);
  const zoom = useStudio((s) => s.zoom);
  const selectedIds = useStudio((s) => s.selectedIds);
  const setSelection = useStudio((s) => s.setSelection);
  const addElement = useStudio((s) => s.addElement);
  const updateElement = useStudio((s) => s.updateElement);
  const setTool = useStudio((s) => s.setTool);
  const board = project?.boards.find((candidate) => candidate.id === boardId);
  const cropTarget = tool === "crop" && selectedIds.length === 1 ? project?.elements.find((element): element is ImageElement | PdfElement | PsdLayerElement => element.id === selectedIds[0] && (element.type === "image" || element.type === "pdf" || element.type === "psd_layer")) : undefined;
  const maskTarget = tool === "mask" && selectedIds.length === 1 ? project?.elements.find((element): element is ImageElement | PdfElement | PsdLayerElement => element.id === selectedIds[0] && (element.type === "image" || element.type === "pdf" || element.type === "psd_layer")) : undefined;

  useEffect(() => {
    if (!shell.current || !board) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.max(0.08, Math.min((width - 120) / board.widthMm, (height - 120) / board.heightMm)) * zoom);
    });
    observer.observe(shell.current);
    return () => observer.disconnect();
  }, [board?.id, board?.widthMm, board?.heightMm, zoom]);

  useEffect(() => {
    if (!canvasNode.current || !board || !project || scale <= 0) return;
    fabricRef.current?.dispose();
    const canvas = new Canvas(canvasNode.current, {
      width: Math.round(board.widthMm * scale), height: Math.round(board.heightMm * scale),
      backgroundColor: board.backgroundColor, preserveObjectStacking: true, selection: tool === "select",
    });
    fabricRef.current = canvas;
    const urls: string[] = [];

    const addObject = (element: PanelElement, object: TaggedObject) => {
      object.set({
        left: element.xMm * scale, top: element.yMm * scale,
        angle: element.rotationDeg, skewX: element.transform.skewXDeg, skewY: element.transform.skewYDeg,
        flipX: element.transform.flipX, flipY: element.transform.flipY, opacity: element.opacity, visible: element.visible,
        globalCompositeOperation: element.blendMode === "normal" || !element.blendMode ? "source-over" : element.blendMode,
        selectable: !element.locked && tool === "select", evented: !element.locked,
        elementId: element.id, borderColor: "#c85d32", cornerColor: "#f4efe3", cornerStrokeColor: "#c85d32",
        transparentCorners: false, cornerSize: 9,
      });
      canvas.add(object);
    };

    const render = async () => {
      for (const elementId of board.elementIds) {
        const element = project.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.type === "group") continue;
        if (element.type === "text") {
          const object = new IText(element.text, {
            width: element.widthMm * scale, height: element.heightMm * scale,
            fontFamily: element.fontFamily, fontSize: ptToMm(element.fontSizePt) * scale,
            lineHeight: element.lineHeight, charSpacing: element.letterSpacingPt * 50,
            textAlign: element.align, fill: element.color, fontWeight: String(element.weight),
            fontStyle: element.italic ? "italic" : "normal", underline: element.underline,
          });
          addObject(element, object);
        } else if (element.type === "shape") {
          const common = { width: element.widthMm * scale, height: element.heightMm * scale, fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidthMm * scale, strokeDashArray: element.dash.map((n) => n * scale) };
          const object = element.shape === "ellipse" ? new Ellipse({ ...common, rx: common.width / 2, ry: common.height / 2 }) : element.shape === "line" ? new Line([0, 0, common.width, common.height], common) : new Rect(common);
          addObject(element, object);
        } else {
          const row = await db.assets.get(element.type === "psd_layer" ? element.previewAssetId : element.assetId);
          if (!row) continue;
          const blob = (element.type === "pdf" ? row.pageThumbnails?.[element.pageIndex] : undefined) ?? row.thumbnail ?? row.blob;
          if (element.type === "pdf" && !row.thumbnail) {
            addObject(element, new Rect({ width: element.widthMm * scale, height: element.heightMm * scale, fill: "#e9e4d9", stroke: "#7f817b", strokeDashArray: [5, 4] }));
            continue;
          }
          const url = URL.createObjectURL(blob); urls.push(url);
          try {
            const image = await FabricImage.fromURL(url);
            const crop = element.type === "pdf" ? element.clipNormalized : element.cropNormalized;
            const sourceWidth = Math.max(1, image.width); const sourceHeight = Math.max(1, image.height);
            const croppedWidth = Math.max(1, sourceWidth * crop.w); const croppedHeight = Math.max(1, sourceHeight * crop.h);
            image.set({ cropX: sourceWidth * crop.x, cropY: sourceHeight * crop.y, width: croppedWidth, height: croppedHeight, scaleX: (element.widthMm * scale) / croppedWidth, scaleY: (element.heightMm * scale) / croppedHeight });
            addObject(element, image);
          } catch { addObject(element, new Rect({ width: element.widthMm * scale, height: element.heightMm * scale, fill: "#d8d1c4", stroke: "#c85d32" })); }
        }
      }
      for (const guide of board.guides) {
        const position = guide.positionMm * scale;
        const line = guide.axis === "x" ? new Line([position, 0, position, board.heightMm * scale]) : new Line([0, position, board.widthMm * scale, position]);
        line.set({ stroke: "#26a6b8", strokeWidth: 1, selectable: false, evented: false, excludeFromExport: true });
        canvas.add(line);
      }
      const selected = canvas.getObjects().filter((object) => {
        const id = (object as TaggedObject).elementId;
        return Boolean(id && selectedIds.includes(id));
      });
      if (selected.length === 1) canvas.setActiveObject(selected[0]);
      else if (selected.length > 1) canvas.setActiveObject(new ActiveSelection(selected, { canvas }));
      canvas.renderAll();
    };
    void render();

    canvas.on("selection:created", (event) => setSelection(event.selected?.map((o) => (o as TaggedObject).elementId).filter(Boolean) as string[] ?? []));
    canvas.on("selection:updated", (event) => setSelection(event.selected?.map((o) => (o as TaggedObject).elementId).filter(Boolean) as string[] ?? []));
    canvas.on("selection:cleared", () => setSelection([]));
    canvas.on("object:modified", (event) => {
      setSmartReadout("");
      const object = event.target as TaggedObject;
      if (!object.elementId && "getObjects" in object) {
        const children = (object as ActiveSelection).getObjects() as TaggedObject[];
        useStudio.getState().commit((draft) => {
          for (const child of children) {
            if (!child.elementId) continue;
            const bounds = child.getBoundingRect();
            const element = draft.elements.find((candidate) => candidate.id === child.elementId);
            if (element) { element.xMm = roundMm(bounds.left / scale); element.yMm = roundMm(bounds.top / scale); element.widthMm = roundMm(bounds.width / scale); element.heightMm = roundMm(bounds.height / scale); }
          }
        });
        return;
      }
      if (!object.elementId) return;
      const width = (object.width ?? 0) * (object.scaleX ?? 1) / scale;
      const height = (object.height ?? 0) * (object.scaleY ?? 1) / scale;
      const current = project.elements.find((candidate) => candidate.id === object.elementId);
      const patch: Partial<PanelElement> & { fontSizePt?: number } = { xMm: roundMm((object.left ?? 0) / scale), yMm: roundMm((object.top ?? 0) / scale), widthMm: roundMm(width), heightMm: roundMm(height), rotationDeg: roundMm(object.angle ?? 0), transform: { ...(current?.transform ?? DEFAULT_TRANSFORM), skewXDeg: roundMm(object.skewX ?? 0), skewYDeg: roundMm(object.skewY ?? 0), flipX: Boolean(object.flipX), flipY: Boolean(object.flipY) } };
      if (current?.type === "text" && useStudio.getState().transformMode) patch.fontSizePt = roundMm(current.fontSizePt * Math.min(width / Math.max(.001, current.widthMm), height / Math.max(.001, current.heightMm)));
      updateElement(object.elementId, patch, !useStudio.getState().transformMode);
    });
    canvas.on("object:moving", (event) => {
      const object = event.target as TaggedObject;
      if (!object.elementId || (event.e as MouseEvent).ctrlKey) return;
      const objectWidth = object.getScaledWidth(), objectHeight = object.getScaledHeight();
      const xs = [0, board.safeMarginMm * scale, board.widthMm * scale / 2, (board.widthMm - board.safeMarginMm) * scale, board.widthMm * scale];
      const ys = [0, board.safeMarginMm * scale, board.heightMm * scale / 2, (board.heightMm - board.safeMarginMm) * scale, board.heightMm * scale];
      board.guides.forEach((guide) => (guide.axis === "x" ? xs : ys).push(guide.positionMm * scale));
      canvas.getObjects().forEach((candidate) => { const tagged = candidate as TaggedObject; if (!tagged.elementId || tagged.elementId === object.elementId) return; const bounds = candidate.getBoundingRect(); xs.push(bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width); ys.push(bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height); });
      const anchorsX = [object.left ?? 0, (object.left ?? 0) + objectWidth / 2, (object.left ?? 0) + objectWidth]; const anchorsY = [object.top ?? 0, (object.top ?? 0) + objectHeight / 2, (object.top ?? 0) + objectHeight];
      const nearest = (anchors: number[], targets: number[]) => { let best = { delta: Infinity, target: 0 }; for (const anchor of anchors) for (const target of targets) if (Math.abs(target - anchor) < Math.abs(best.delta)) best = { delta: target - anchor, target }; return best; };
      const snapX = nearest(anchorsX, xs), snapY = nearest(anchorsY, ys); let left = object.left ?? 0, top = object.top ?? 0; const labels: string[] = [];
      if (Math.abs(snapX.delta) <= 8) { left += snapX.delta; labels.push(`X ${roundMm(snapX.target / scale)}mm`); }
      else if (board.grid.enabled) { const grid = board.grid.sizeMm * scale; left = Math.round(left / grid) * grid; }
      if (Math.abs(snapY.delta) <= 8) { top += snapY.delta; labels.push(`Y ${roundMm(snapY.target / scale)}mm`); }
      else if (board.grid.enabled) { const grid = board.grid.sizeMm * scale; top = Math.round(top / grid) * grid; }
      object.set({ left, top }); setSmartReadout(labels.join(" · "));
    });
    canvas.on("text:changed", (event) => {
      const object = event.target as IText & TaggedObject;
      if (object.elementId) updateElement(object.elementId, { text: object.text ?? "" }, false);
    });
    canvas.on("mouse:down", (event) => {
      if (event.target || tool === "select" || tool === "hand" || tool === "image") return;
      const pointer = canvas.getScenePoint(event.e);
      const xMm = roundMm(pointer.x / scale); const yMm = roundMm(pointer.y / scale);
      let element: PanelElement | null = null;
      if (tool === "text") element = makeText(board.id, xMm, yMm);
      if (["rect", "ellipse", "line"].includes(tool)) element = makeShape(board.id, tool as "rect" | "ellipse" | "line", xMm, yMm);
      if (tool === "guide") {
        useStudio.getState().commit((draft) => { draft.boards.find((b) => b.id === board.id)?.guides.push({ axis: "x", positionMm: xMm, locked: false }); });
      }
      if (element) { addElement(element); setSelection([element.id]); }
      setTool("select");
    });

    return () => { urls.forEach(URL.revokeObjectURL); canvas.dispose(); if (fabricRef.current === canvas) fabricRef.current = null; };
  }, [board?.id, board?.widthMm, board?.heightMm, board?.backgroundColor, board?.elementIds, board?.guides, project?.elements, project?.assets, scale, tool]);

  if (!board) return <div className="canvas-empty">보드를 선택하세요.</div>;
  const ticks = Array.from({ length: Math.floor(board.widthMm / 50) + 1 }, (_, index) => index * 50);
  return (
    <div className="canvas-shell" ref={shell} data-testid="canvas-shell"
      onPointerDown={(event) => { if (tool === "hand" && shell.current) { pan.current = { x: event.clientX, y: event.clientY, left: shell.current.scrollLeft, top: shell.current.scrollTop }; shell.current.setPointerCapture(event.pointerId); } }}
      onPointerMove={(event) => { if (pan.current && shell.current) { shell.current.scrollLeft = pan.current.left - (event.clientX - pan.current.x); shell.current.scrollTop = pan.current.top - (event.clientY - pan.current.y); } }}
      onPointerUp={(event) => { pan.current = null; if (shell.current?.hasPointerCapture(event.pointerId)) shell.current.releasePointerCapture(event.pointerId); }}>
      <div className="board-measure">{board.widthMm} × {board.heightMm} mm · {Math.round(zoom * 100)}%</div>
      {smartReadout && <div className="smart-readout">SMART GUIDE · {smartReadout}</div>}
      <div className="ruler ruler-x">{ticks.map((tick) => <span key={tick} style={{ left: tick * scale }}>{tick}</span>)}</div>
      <div className="canvas-frame" style={{ width: board.widthMm * scale, height: board.heightMm * scale }}>
        <canvas ref={canvasNode} />
        {board.grid.enabled && <div className="grid-overlay" style={{ backgroundSize: `${board.grid.sizeMm * scale}px ${board.grid.sizeMm * scale}px` }} />}
        <div className="safe-area" style={{ inset: board.safeMarginMm * scale }} />
        {cropTarget && cropTarget.rotationDeg % 360 === 0 && <CropOverlay element={cropTarget} scale={scale} />}
        {maskTarget && maskTarget.rotationDeg % 360 === 0 && <MaskOverlay element={maskTarget} scale={scale} />}
      </div>
    </div>
  );
}

function MaskOverlay({ element, scale }: { element: ImageElement | PdfElement | PsdLayerElement; scale: number }) {
  const [kind, setKind] = useState<MaskOperation["kind"]>("rect"); const [op, setOp] = useState<MaskOperation["op"]>("add");
  const [selection, setSelection] = useState<NormalizedRect>(FULL_CROP); const [points, setPoints] = useState<{ x: number; y: number }[]>([]); const start = useRef<{ x: number; y: number } | null>(null);
  const state = useStudio();
  const point = (event: React.PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; };
  const commitMask = () => { const operation: MaskOperation = { id: newId(), op, kind, ...(kind === "rect" || kind === "ellipse" ? { rect: selection } : { points }), ...(kind === "brush" ? { radiusNormalized: .025, hardness: .8 } : {}) }; if ((operation.rect && operation.rect.w < .005) || (operation.points && operation.points.length < 2)) return; state.updateElement(element.id, { mask: { ...element.mask, enabled: true, operations: [...element.mask.operations, operation] } }); state.setTool("select"); };
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); commitMask(); } if (event.key === "Escape") { event.preventDefault(); state.setTool("select"); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); });
  return <div className="crop-layer mask-layer" style={{ left: element.xMm * scale, top: element.yMm * scale, width: element.widthMm * scale, height: element.heightMm * scale }}><div className="crop-toolbar"><strong>MASK</strong>{(["rect", "ellipse", "polygon", "brush"] as const).map((value) => <button className={kind === value ? "active" : ""} key={value} onClick={() => { setKind(value); setPoints([]); }}>{value === "rect" ? "사각" : value === "ellipse" ? "타원" : value === "polygon" ? "다각형" : "브러시"}</button>)}<button className={op === "add" ? "active" : ""} onClick={() => setOp("add")}>더하기</button><button className={op === "subtract" ? "active" : ""} onClick={() => setOp("subtract")}>빼기</button><button className="primary" onClick={commitMask}>적용</button><button onClick={() => state.setTool("select")}>취소</button></div><div className="crop-hit" onPointerDown={(event) => { const p = point(event); if (kind === "polygon") { setPoints((current) => [...current, p]); return; } start.current = p; setSelection({ ...p, w: 0, h: 0 }); setPoints([p]); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!start.current) return; const p = point(event); if (kind === "brush") setPoints((current) => [...current, p]); else setSelection(normalizedDrag(start.current, p)); }} onPointerUp={(event) => { if (start.current && kind !== "brush") setSelection(normalizedDrag(start.current, point(event))); start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}><div className={`mask-preview ${kind}`} style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.w * 100}%`, height: `${selection.h * 100}%` }} />{points.map((p, index) => <i className="mask-point" key={index} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />)}</div></div>;
}

function CropOverlay({ element, scale }: { element: ImageElement | Extract<PanelElement, { type: "pdf" | "psd_layer" }>; scale: number }) {
  const [selection, setSelection] = useState<NormalizedRect>(FULL_CROP);
  const [ratio, setRatio] = useState("free");
  const [customRatio, setCustomRatio] = useState({ w: 3, h: 2 });
  const start = useRef<{ x: number; y: number } | null>(null);
  const updateElement = useStudio((state) => state.updateElement);
  const setTool = useStudio((state) => state.setTool);
  const current = element.type === "pdf" ? element.clipNormalized : element.cropNormalized;
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };
  const apply = (trimFrame: boolean) => {
    if (selection.w < .01 || selection.h < .01) return;
    const crop = composeCrop(current, selection);
    const sourcePatch = element.type === "pdf" ? { clipNormalized: crop } : { cropNormalized: crop };
    updateElement(element.id, { ...sourcePatch, ...(trimFrame ? cropFrame(element, selection) : {}) } as Partial<PanelElement>);
    setTool("select");
  };
  const reset = () => {
    updateElement(element.id, element.type === "pdf" ? { clipNormalized: FULL_CROP } : { cropNormalized: FULL_CROP });
    setTool("select");
  };
  const ratioValue = (value: string) => value === "1:1" ? 1 : value === "4:3" ? 4 / 3 : value === "16:9" ? 16 / 9 : customRatio.w / Math.max(.01, customRatio.h);
  const chooseRatio = (value: string) => { setRatio(value); if (value === "free" || value === "original") { setSelection(FULL_CROP); return; } const target = ratioValue(value); const frameRatio = element.widthMm / element.heightMm; if (target >= frameRatio) { const h = frameRatio / target; setSelection({ x: 0, y: (1 - h) / 2, w: 1, h }); } else { const w = target / frameRatio; setSelection({ x: (1 - w) / 2, y: 0, w, h: 1 }); } };
  const constrained = (value: NormalizedRect) => { if (ratio === "free" || ratio === "original") return value; const normalizedRatio = ratioValue(ratio) / (element.widthMm / element.heightMm); const h = Math.min(1 - value.y, value.w / normalizedRatio); return { ...value, h, w: Math.min(1 - value.x, h * normalizedRatio) }; };
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); apply(false); } if (event.key === "Escape") { event.preventDefault(); setTool("select"); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); });
  return <div className="crop-layer" style={{ left: element.xMm * scale, top: element.yMm * scale, width: element.widthMm * scale, height: element.heightMm * scale }}>
    <div className="crop-toolbar">
      <span><CropIcon /> 영역을 드래그하세요</span>
      <select value={ratio} onChange={(event) => chooseRatio(event.target.value)}><option value="free">자유</option><option value="original">원본</option><option value="1:1">1:1</option><option value="4:3">4:3</option><option value="16:9">16:9</option><option value="custom">사용자 W:H</option></select>{ratio === "custom" && <span className="crop-ratio-input"><input type="number" min=".1" value={customRatio.w} onChange={(e) => setCustomRatio({ ...customRatio, w: Number(e.target.value) })} />:<input type="number" min=".1" value={customRatio.h} onChange={(e) => setCustomRatio({ ...customRatio, h: Number(e.target.value) })} /></span>}
      <button className="primary" disabled={selection.w < .01 || selection.h < .01} onClick={() => apply(false)}>내용 자르기</button>
      <button disabled={selection.w < .01 || selection.h < .01} onClick={() => apply(true)}>프레임까지</button>
      <button onClick={reset}>초기화</button>
      <button onClick={() => setTool("select")}>취소</button>
    </div>
    <div className="crop-hit" onPointerDown={(event) => { start.current = point(event); setSelection({ ...start.current, w: 0, h: 0 }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (start.current) setSelection(constrained(normalizedDrag(start.current, point(event)))); }} onPointerUp={(event) => { if (start.current) setSelection(constrained(normalizedDrag(start.current, point(event)))); start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
      <div className="crop-selection" style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.w * 100}%`, height: `${selection.h * 100}%` }}>
        <i className="crop-third vertical a" /><i className="crop-third vertical b" /><i className="crop-third horizontal a" /><i className="crop-third horizontal b" />
        <b>{Math.round(selection.w * 100)} × {Math.round(selection.h * 100)}%</b>
      </div>
    </div>
  </div>;
}

function CropIcon() { return <span className="crop-glyph" aria-hidden="true">⌗</span>; }

function common(boardId: string, name: string, xMm: number, yMm: number, widthMm: number, heightMm: number) {
  return { id: newId(), boardId, name, xMm, yMm, widthMm, heightMm, rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: structuredClone(DEFAULT_TRANSFORM) };
}

function makeText(boardId: string, xMm: number, yMm: number): TextElement {
  return { ...common(boardId, "새 텍스트", xMm, yMm, 120, 30), type: "text", text: "건축 패널 텍스트", fontFamily: "KoPubWorld Dotum_Pro", fontSizePt: 18, lineHeight: 1.35, letterSpacingPt: 0, align: "left", verticalAlign: "top", color: "#191a18", weight: 400, italic: false, underline: false, autoSize: false, styleRole: "body" };
}

function makeShape(boardId: string, shape: "rect" | "ellipse" | "line", xMm: number, yMm: number): ShapeElement {
  return { ...common(boardId, shape === "rect" ? "사각형" : shape === "ellipse" ? "원" : "선", xMm, yMm, 80, shape === "line" ? 0.5 : 60), type: "shape", shape, fill: shape === "line" ? "transparent" : "#d6d0c3", stroke: "#242522", strokeWidthMm: 0.5, dash: [] };
}
