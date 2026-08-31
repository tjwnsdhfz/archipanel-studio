import type {
  CritiqueResultV1, CritiqueWarning, DesignFeatureVector, GazePathNode, HierarchyItem,
  LayoutProposalV1, LocalTasteProfileV1, PanelBoard, PanelElement, PanelProjectV1,
} from "./types";

const GRID = 40 as const;
export const FEATURE_KEYS: (keyof DesignFeatureVector)[] = [
  "hierarchySeparation", "focalAreaRatio", "whitespaceContinuity", "densityBalance",
  "gridAlignment", "spacingConsistency", "readingFlowCoherence",
];
export const FEATURE_LABELS: Record<keyof DesignFeatureVector, string> = {
  hierarchySeparation: "위계 분리", focalAreaRatio: "주초점 비율", whitespaceContinuity: "백색 공간",
  densityBalance: "밀도 균형", gridAlignment: "격자 정렬", spacingConsistency: "간격 리듬", readingFlowCoherence: "읽기 흐름",
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const center = (element: PanelElement) => ({ x: element.xMm + element.widthMm / 2, y: element.yMm + element.heightMm / 2 });
const normalizeHex = (value: string | undefined) => /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : "#777777";
const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
const contrast = (foreground: string, background: string) => {
  const a = luminance(normalizeHex(foreground)); const b = luminance(normalizeHex(background));
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function boardRevisionHash(project: PanelProjectV1, boardId: string) {
  const board = project.boards.find((item) => item.id === boardId);
  const elements = project.elements.filter((item) => item.boardId === boardId).sort((a, b) => a.id.localeCompare(b.id)).map((item) => ({
    id: item.id, type: item.type, x: round(item.xMm, 3), y: round(item.yMm, 3), w: round(item.widthMm, 3), h: round(item.heightMm, 3),
    r: round(item.rotationDeg, 2), o: round(item.opacity, 3), v: item.visible, l: item.locked,
    text: item.type === "text" ? { size: item.fontSizePt, weight: item.weight, role: item.styleRole, color: item.color } : undefined,
  }));
  const blocks = project.contentBlocks.filter((item) => item.boardId === boardId).map((item) => ({ id: item.id, e: [...item.elementIds].sort(), order: item.readingOrder, importance: item.importance, status: item.status }));
  return stableHash(JSON.stringify({ board: board && [board.widthMm, board.heightMm, board.safeMarginMm, board.backgroundColor, board.grid], elements, blocks }));
}

function visualWeight(element: PanelElement, board: PanelBoard, project: PanelProjectV1) {
  const boardArea = Math.max(1, board.widthMm * board.heightMm);
  const areaRatio = clamp(element.widthMm * element.heightMm / boardArea, 0, 1);
  const block = project.contentBlocks.find((item) => item.boardId === board.id && item.status === "approved" && item.elementIds.includes(element.id));
  const semantic = block ? .82 + block.importance * .105 : .88;
  const type = element.type === "image" || element.type === "psd_layer" ? 1.18 : element.type === "pdf" ? 1.08 : element.type === "text" ? 1 : .72;
  let text = 1; let reason = `${element.type} · 보드 면적 ${round(areaRatio * 100, 1)}%`;
  if (element.type === "text") {
    const size = clamp(element.fontSizePt / 64, .2, 1.8); const role = { title: 1.35, section: 1.15, body: .88, caption: .68 }[element.styleRole];
    const colorContrast = clamp(contrast(element.color, board.backgroundColor) / 7, .35, 1.25);
    text = size * role * colorContrast * clamp(element.weight / 500, .7, 1.5);
    reason = `${element.styleRole} ${round(element.fontSizePt, 1)}pt · 대비 ${round(contrast(element.color, board.backgroundColor), 1)}:1`;
  }
  const position = center(element); const positionBias = 1.08 - .08 * ((position.x / board.widthMm) + (position.y / board.heightMm)) / 2;
  return { weight: Math.sqrt(Math.max(.0001, areaRatio)) * type * text * semantic * positionBias * element.opacity, areaRatio, reason };
}

function densityAnalysis(elements: PanelElement[], weights: Map<string, number>, board: PanelBoard) {
  const cells = Array<number>(GRID * GRID).fill(0);
  for (const element of elements) {
    const x0 = Math.max(0, Math.floor(element.xMm / board.widthMm * GRID)); const y0 = Math.max(0, Math.floor(element.yMm / board.heightMm * GRID));
    const x1 = Math.min(GRID - 1, Math.ceil((element.xMm + element.widthMm) / board.widthMm * GRID) - 1); const y1 = Math.min(GRID - 1, Math.ceil((element.yMm + element.heightMm) / board.heightMm * GRID) - 1);
    const contribution = clamp((weights.get(element.id) ?? .2) * 1.9, .12, 1.15) * element.opacity;
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) cells[y * GRID + x] += contribution;
  }
  const whitespace = cells.map((value) => value < .055); const visited = Array<boolean>(cells.length).fill(false); const clusters: { indices: number[] }[] = [];
  for (let start = 0; start < cells.length; start += 1) {
    if (!whitespace[start] || visited[start]) continue;
    const queue = [start]; const indices: number[] = []; visited[start] = true;
    while (queue.length) {
      const index = queue.shift()!; indices.push(index); const x = index % GRID; const y = Math.floor(index / GRID);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue; const next = ny * GRID + nx;
        if (whitespace[next] && !visited[next]) { visited[next] = true; queue.push(next); }
      }
    }
    clusters.push({ indices });
  }
  const whiteCount = whitespace.filter(Boolean).length; const largest = Math.max(0, ...clusters.map((item) => item.indices.length));
  const densitySum = [0, 0, 0, 0]; cells.forEach((value, index) => { const x = index % GRID; const y = Math.floor(index / GRID); densitySum[(y >= GRID / 2 ? 2 : 0) + (x >= GRID / 2 ? 1 : 0)] += Math.min(value, 1.5); });
  const average = densitySum.reduce((sum, value) => sum + value, 0) / 4; const balance = average <= .001 ? 0 : clamp(100 - densitySum.reduce((sum, value) => sum + Math.abs(value - average), 0) / (average * 4) * 100);
  return {
    gridSize: GRID, cells: cells.map((value) => round(value, 3)), whitespaceRatio: round(whiteCount / cells.length * 100),
    continuityScore: round(whiteCount ? largest / whiteCount * 100 : 0), balanceScore: round(balance), overcrowdedCellCount: cells.filter((value) => value > 1.05).length,
    clusters: clusters.sort((a, b) => b.indices.length - a.indices.length).slice(0, 8).map((cluster) => { const xs = cluster.indices.map((index) => index % GRID); const ys = cluster.indices.map((index) => Math.floor(index / GRID)); const cellCount = cluster.indices.length; return { kind: cellCount >= cells.length * .035 ? "intentional" as const : "isolated" as const, cellCount, bbox: { x: Math.min(...xs) / GRID, y: Math.min(...ys) / GRID, w: (Math.max(...xs) - Math.min(...xs) + 1) / GRID, h: (Math.max(...ys) - Math.min(...ys) + 1) / GRID } }; }),
    scope: "element-layout-only" as const,
  };
}

function gridAlignment(elements: PanelElement[], board: PanelBoard) {
  if (!elements.length) return 0; const step = Math.max(.1, board.grid.sizeMm || 5);
  const scores = elements.flatMap((item) => [item.xMm, item.yMm, item.xMm + item.widthMm, item.yMm + item.heightMm]).map((value) => 1 - Math.min(1, Math.abs(value / step - Math.round(value / step))));
  return clamp(scores.reduce((sum, value) => sum + value, 0) / scores.length * 100);
}

function spacingConsistency(elements: PanelElement[], board: PanelBoard) {
  if (elements.length < 3) return 100; const gaps: number[] = [];
  const sortedX = [...elements].sort((a, b) => a.xMm - b.xMm); const sortedY = [...elements].sort((a, b) => a.yMm - b.yMm);
  for (let index = 1; index < elements.length; index += 1) {
    const xGap = sortedX[index].xMm - (sortedX[index - 1].xMm + sortedX[index - 1].widthMm); if (xGap >= 0) gaps.push(xGap / board.widthMm);
    const yGap = sortedY[index].yMm - (sortedY[index - 1].yMm + sortedY[index - 1].heightMm); if (yGap >= 0) gaps.push(yGap / board.heightMm);
  }
  if (gaps.length < 2) return 75; const mean = gaps.reduce((sum, value) => sum + value, 0) / gaps.length; const variance = gaps.reduce((sum, value) => sum + (value - mean) ** 2, 0) / gaps.length;
  return clamp(100 - Math.sqrt(variance) * 650);
}

function gazePath(project: PanelProjectV1, board: PanelBoard, elements: PanelElement[], weights: Map<string, number>) {
  const blocks = project.contentBlocks.filter((item) => item.boardId === board.id && item.status === "approved").sort((a, b) => a.readingOrder - b.readingOrder);
  let ordered: PanelElement[] = []; let source: GazePathNode["source"] = "approved-reading-order"; let confidence = .88;
  if (blocks.length) {
    ordered = blocks.map((block) => block.elementIds.map((id) => elements.find((item) => item.id === id)).filter(Boolean) as PanelElement[])
      .map((items) => items.sort((a, b) => (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0))[0]).filter(Boolean);
  } else {
    source = "heuristic"; confidence = .42; ordered = [...elements].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm).slice(0, 12);
    const strongest = [...ordered].sort((a, b) => (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0))[0]; if (strongest) ordered = [strongest, ...ordered.filter((item) => item.id !== strongest.id)];
  }
  const seen = new Set<string>(); ordered = ordered.filter((item) => !seen.has(item.id) && seen.add(item.id));
  const nodes = ordered.map((element, index) => { const point = center(element); return { elementId: element.id, order: index + 1, x: point.x / board.widthMm, y: point.y / board.heightMm, confidence, source }; });
  if (nodes.length < 2) return { nodes, coherence: nodes.length ? 70 : 0 };
  let penalty = 0;
  for (let index = 1; index < nodes.length; index += 1) { const dx = nodes[index].x - nodes[index - 1].x; const dy = nodes[index].y - nodes[index - 1].y; penalty += Math.max(0, Math.hypot(dx, dy) - .42) * 55 + Math.max(0, -dy - .2) * 30; }
  return { nodes, coherence: clamp(100 - penalty / (nodes.length - 1)) };
}

export function analyzeBoard(project: PanelProjectV1, boardId: string): CritiqueResultV1 {
  const board = project.boards.find((item) => item.id === boardId); if (!board) throw new Error("진단할 보드를 찾을 수 없습니다.");
  const elements = project.elements.filter((item) => item.boardId === boardId && item.visible && item.type !== "group");
  const raw = elements.map((element) => ({ element, ...visualWeight(element, board, project) })).sort((a, b) => b.weight - a.weight || a.element.id.localeCompare(b.element.id));
  const maxWeight = Math.max(.0001, raw[0]?.weight ?? 1); const normalized = new Map(raw.map((item) => [item.element.id, item.weight / maxWeight]));
  const hierarchyItems: HierarchyItem[] = raw.map((item, index) => ({ elementId: item.element.id, tier: index === 0 ? "primary" : index < Math.min(5, Math.max(2, Math.ceil(raw.length * .3))) ? "secondary" : "tertiary", weight: round(item.weight / maxWeight * 100), reason: item.reason, bounds: { x: item.element.xMm / board.widthMm, y: item.element.yMm / board.heightMm, w: item.element.widthMm / board.widthMm, h: item.element.heightMm / board.heightMm } }));
  const first = raw[0]?.weight ?? 0; const second = raw[1]?.weight ?? 0; const primaryClarity = first ? clamp((first - second) / first * 170 + 45) : 0;
  const primaryAvg = hierarchyItems.filter((item) => item.tier === "primary").reduce((sum, item) => sum + item.weight, 0) || 0;
  const secondary = hierarchyItems.filter((item) => item.tier === "secondary"); const secondaryAvg = secondary.length ? secondary.reduce((sum, item) => sum + item.weight, 0) / secondary.length : 0;
  const tertiary = hierarchyItems.filter((item) => item.tier === "tertiary"); const tertiaryAvg = tertiary.length ? tertiary.reduce((sum, item) => sum + item.weight, 0) / tertiary.length : 0;
  const tierSeparation = clamp((primaryAvg - secondaryAvg) * 1.25 + (secondaryAvg - tertiaryAvg) * .75 + 35);
  const secondaryCompetition = clamp(100 - secondary.filter((item) => item.weight > 82).length * 22);
  const title = raw.find((item) => item.element.type === "text" && item.element.styleRole === "title"); const primary = raw[0];
  const titleVisualRelationship = title && primary ? clamp(100 - Math.hypot(center(title.element).x / board.widthMm - center(primary.element).x / board.widthMm, center(title.element).y / board.heightMm - center(primary.element).y / board.heightMm) * 75) : 45;
  const density = densityAnalysis(elements, normalized, board); const detailDensity = clamp(100 - density.overcrowdedCellCount / (GRID * GRID) * 450);
  const gaze = gazePath(project, board, elements, normalized);
  const focalRatio = (raw[0]?.areaRatio ?? 0) * 100; const focalAreaScore = clamp(100 - Math.abs(focalRatio - 30) * 2.6);
  const hierarchyScore = clamp((primaryClarity + tierSeparation + secondaryCompetition + titleVisualRelationship + detailDensity) / 5);
  const features: DesignFeatureVector = { hierarchySeparation: round(hierarchyScore), focalAreaRatio: round(focalAreaScore), whitespaceContinuity: density.continuityScore, densityBalance: density.balanceScore, gridAlignment: round(gridAlignment(elements, board)), spacingConsistency: round(spacingConsistency(elements, board)), readingFlowCoherence: round(gaze.coherence) };
  const warnings: CritiqueWarning[] = [];
  if (!elements.length) warnings.push({ code: "empty-board", severity: "info", message: "분석할 요소가 없습니다.", suggestion: "패널 요소를 배치한 뒤 다시 진단하세요.", elementIds: [] });
  if (raw.length > 1 && second / Math.max(first, .001) > .82) warnings.push({ code: "competing-focus", severity: "warning", message: "주초점 후보가 서로 경쟁합니다.", suggestion: "하나의 크기·대비를 높이거나 보조 요소를 줄여 보세요.", elementIds: raw.slice(0, 2).map((item) => item.element.id) });
  if (density.overcrowdedCellCount > GRID * GRID * .12) warnings.push({ code: "overcrowded", severity: "warning", message: "일부 영역의 정보 밀도가 높습니다.", suggestion: "거터를 확보하거나 세부 증거를 다른 영역으로 분산하세요.", elementIds: [] });
  if (density.continuityScore < 48) warnings.push({ code: "fragmented-whitespace", severity: "warning", message: "백색 공간이 작은 빈틈으로 분절됩니다.", suggestion: "빈틈을 합쳐 읽기 쉬는 여백 축을 만드세요.", elementIds: [] });
  if (gaze.nodes.some((node) => node.source === "heuristic")) warnings.push({ code: "heuristic-flow", severity: "info", message: "승인된 읽기 순서가 없어 임시 경로를 표시합니다.", suggestion: "콘텐츠 블록을 승인하고 읽기 순서를 확인하세요.", elementIds: gaze.nodes.map((node) => node.elementId) });
  const overallScore = round(FEATURE_KEYS.reduce((sum, key) => sum + features[key], 0) / FEATURE_KEYS.length);
  return { id: `critique-${boardId}-${boardRevisionHash(project, boardId)}`, projectId: project.id, boardId, boardRevisionHash: boardRevisionHash(project, boardId), overallScore, hierarchy: { score: round(hierarchyScore), primaryClarity: round(primaryClarity), tierSeparation: round(tierSeparation), secondaryCompetition: round(secondaryCompetition), titleVisualRelationship: round(titleVisualRelationship), detailDensity: round(detailDensity), items: hierarchyItems }, density, gazePath: gaze.nodes, featureVector: features, warnings, confidence: blocksConfidence(project, boardId, elements.length), generatedAt: new Date().toISOString() };
}

function blocksConfidence(project: PanelProjectV1, boardId: string, elementCount: number) {
  const blocks = project.contentBlocks.filter((item) => item.boardId === boardId && item.status === "approved");
  if (!elementCount) return 0; const covered = new Set(blocks.flatMap((item) => item.elementIds));
  return round(clamp(.42 + covered.size / elementCount * .48, 0, .95), 2);
}

export function projectWithProposal(project: PanelProjectV1, proposal: LayoutProposalV1) {
  const clone = structuredClone(project); const placements = new Map(proposal.placements.map((item) => [item.elementId, item]));
  clone.elements.forEach((element) => { const placement = placements.get(element.id); if (placement && !element.locked) Object.assign(element, placement); });
  return clone;
}

export function defaultTasteProfile(): LocalTasteProfileV1 {
  return { id: "default", weights: Object.fromEntries(FEATURE_KEYS.map((key) => [key, 1])) as LocalTasteProfileV1["weights"], sampleCount: 0, confidence: 0, projectAdjustments: {}, updatedAt: new Date().toISOString() };
}

export function tasteMatch(features: DesignFeatureVector, profile: LocalTasteProfileV1, projectId?: string) {
  const adjustment = projectId ? profile.projectAdjustments[projectId] ?? {} : {}; let weighted = 0; let total = 0;
  for (const key of FEATURE_KEYS) { const weight = profile.weights[key]; const value = clamp(features[key] + Number(adjustment[key] ?? 0)); weighted += value * weight; total += weight; }
  return round(total ? weighted / total : 0);
}

export function learnTaste(profile: LocalTasteProfileV1, selected: DesignFeatureVector, rejected: DesignFeatureVector[], final?: DesignFeatureVector, projectId?: string) {
  const next = structuredClone(profile); const averages = Object.fromEntries(FEATURE_KEYS.map((key) => [key, rejected.length ? rejected.reduce((sum, item) => sum + item[key], 0) / rejected.length : selected[key]])) as DesignFeatureVector;
  for (const key of FEATURE_KEYS) { const choiceDelta = (selected[key] - averages[key]) / 100; const manualDelta = final ? (final[key] - selected[key]) / 100 : 0; next.weights[key] = round(clamp(next.weights[key] + .08 * choiceDelta + .04 * manualDelta, .4, 2), 4); }
  next.sampleCount += 1; next.confidence = round(Math.min(1, next.sampleCount / 20), 2); next.updatedAt = new Date().toISOString();
  if (projectId && final) next.projectAdjustments[projectId] = Object.fromEntries(FEATURE_KEYS.map((key) => [key, round(clamp((final[key] - selected[key]) * .15, -12, 12), 2)]));
  return next;
}
