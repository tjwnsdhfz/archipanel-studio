import type { PanelProjectV1, PreflightIssue, TextElement } from "./types";
import { effectiveDpi, ptToMm } from "./units";
import { readabilityWarnings } from "./readability";

export function estimateTextOverflow(el: TextElement) {
  const lineHeightMm = ptToMm(el.fontSizePt) * el.lineHeight;
  const lines = el.text.split("\n");
  const charsPerLine = Math.max(1, Math.floor(el.widthMm / Math.max(0.1, ptToMm(el.fontSizePt) * 0.53)));
  const wrappedLines = lines.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return wrappedLines * lineHeightMm > el.heightMm + 0.5;
}

export function runPreflight(project: PanelProjectV1): PreflightIssue[] {
  const issues: PreflightIssue[] = [{ severity: "info", code: "rgb-output", message: "출력 색상은 RGB입니다. 인쇄소의 변환 조건을 확인하세요." }];
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const fonts = new Map(project.fonts.map((font) => [font.id, font]));
  for (const board of project.boards) {
    const boardElements = project.elements.filter((el) => el.boardId === board.id);
    for (const el of boardElements) {
      if (el.blendMode && el.blendMode !== "normal") issues.push({ severity: "info", code: "blend-board-rasterized", message: `${el.name}: ${el.blendMode} 혼합 때문에 이 보드는 목표 DPI의 단일 이미지로 PDF에 합성됩니다.`, boardId: board.id, elementId: el.id });
      if (el.xMm < 0 || el.yMm < 0 || el.xMm + el.widthMm > board.widthMm || el.yMm + el.heightMm > board.heightMm) {
        issues.push({ severity: "error", code: "outside-board", message: `${el.name}: 보드 밖으로 나갔습니다.`, boardId: board.id, elementId: el.id });
      }
      if (el.type === "text") {
        if (!el.autoSize && estimateTextOverflow(el)) issues.push({ severity: "error", code: "text-overflow", message: `${el.name}: 텍스트가 상자를 넘습니다.`, boardId: board.id, elementId: el.id });
        if (el.fontAssetId) {
          const font = fonts.get(el.fontAssetId);
          if (!font) issues.push({ severity: "error", code: "missing-font", message: `${el.name}: 글꼴 파일이 없습니다.`, boardId: board.id, elementId: el.id });
          else if (font.embeddingAllowed === false) issues.push({ severity: "error", code: "font-embedding", message: `${font.family}: 임베딩이 허용되지 않았습니다.`, elementId: el.id });
          else if (font.embeddingAllowed === "unknown") issues.push({ severity: "warning", code: "font-license", message: `${font.family}: 글꼴 임베딩 권한을 확인하세요.`, elementId: el.id });
          if (font?.supportsKorean === false && /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(el.text)) issues.push({ severity: "error", code: "font-korean-missing", message: `${font.family}: 한글 글리프가 없어 대체 글꼴이 사용될 수 있습니다.`, elementId: el.id });
          if (font?.format === "ttc") issues.push({ severity: "warning", code: "font-ttc-portability", message: `${font.family}: TTC 글꼴 face의 다른 PC 재현성을 확인하세요.`, elementId: el.id });
        }
        if (el.transform.skewXDeg || el.transform.skewYDeg || el.rotationDeg % 90 !== 0) issues.push({ severity: "warning", code: "text-outlined", message: `${el.name}: 임의 회전·기울기 텍스트는 PDF에서 벡터 윤곽선 또는 고해상도 합성으로 출력됩니다.`, elementId: el.id });
        for (const warning of readabilityWarnings(el, board.backgroundColor)) issues.push({ severity: "warning", code: "readability", message: `${el.name}: ${warning}`, boardId: board.id, elementId: el.id });
      }
      if (el.type === "image" || el.type === "pdf") {
        const asset = assets.get(el.assetId);
        if (!asset) issues.push({ severity: "error", code: "missing-asset", message: `${el.name}: 원본 자산이 없습니다.`, boardId: board.id, elementId: el.id });
        if (asset?.review?.length) issues.push({ severity: "warning", code: "asset-review", message: `${el.name}: ${asset.review.join(", ")}`, elementId: el.id });
        if (el.type === "image" && asset?.widthPx) {
          const dpi = effectiveDpi(asset.widthPx * el.cropNormalized.w, el.widthMm);
          if (dpi < 150) issues.push({ severity: "warning", code: "dpi-critical", message: `${el.name}: 유효 해상도 ${Math.round(dpi)}dpi (심각)`, elementId: el.id });
          else if (dpi < board.printProfile.targetDpi) issues.push({ severity: "warning", code: "dpi-low", message: `${el.name}: 유효 해상도 ${Math.round(dpi)}dpi / 목표 ${board.printProfile.targetDpi}dpi`, elementId: el.id });
        }
        if (el.mask.enabled && el.mask.operations.length) issues.push({ severity: "info", code: "mask-rasterized", message: `${el.name}: 비정형 마스크로 해당 레이어가 ${board.printProfile.targetDpi}dpi에서 합성됩니다.`, elementId: el.id });
        if (Object.values(el.adjustments).some((value) => Math.abs(value) > .0001)) issues.push({ severity: "info", code: "adjustment-rasterized", message: `${el.name}: 이미지 보정이 원본을 보존한 채 출력에 적용됩니다.`, elementId: el.id });
      }
      if(el.type==="psd_layer"){
        const asset=assets.get(el.previewAssetId);const source=project.psdSources.find(item=>item.id===el.sourceId);
        if(!asset)issues.push({severity:"error",code:"missing-psd-preview",message:`${el.name}: PSD 레이어 미리보기가 없습니다.`,boardId:board.id,elementId:el.id});
        if(!source)issues.push({severity:"error",code:"missing-psd-source",message:`${el.name}: 연결 PSD 원본 참조가 없습니다.`,boardId:board.id,elementId:el.id});
        else if(source.reviewStatus==="manual_verification_required")issues.push({severity:"warning",code:"psd-manual-verification",message:`${source.name}: Photoshop 합성 대조가 필요합니다.`,elementId:el.id});
        if(el.reviewFlags.length)issues.push({severity:"warning",code:"psd-layer-review",message:`${el.name}: ${el.reviewFlags.join(", ")}`,elementId:el.id});
      }
    }
    const touchesBleed = boardElements.some((el) => el.xMm <= 0 && el.yMm <= 0 && el.xMm + el.widthMm >= board.widthMm && el.yMm + el.heightMm >= board.heightMm);
    if (!touchesBleed && board.bleedMm > 0) issues.push({ severity: "warning", code: "bleed-empty", message: `${board.name}: 재단 여백까지 채운 배경이 없습니다.`, boardId: board.id });
  }
  return issues;
}
