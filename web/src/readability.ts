import type { PanelElement, PanelProjectV1, TextElement, TypographyRole } from "./types";

const MIN_PT: Record<TypographyRole, number> = { title: 48, section: 24, body: 16, caption: 10 };

function luminance(color: string) {
  const hex = color.replace("#", ""); const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

export function contrastRatio(foreground: string, background: string) {
  const a = luminance(foreground); const b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export function readabilityWarnings(element: TextElement, background = "#f7f4ed") {
  const warnings: string[] = [];
  if (element.fontSizePt < MIN_PT[element.styleRole]) warnings.push(`${element.styleRole} 최소 ${MIN_PT[element.styleRole]}pt 미만`);
  if (element.lineHeight < 1.1 || element.lineHeight > 1.8) warnings.push("행간 권장 범위 1.1–1.8 이탈");
  const longest = Math.max(...element.text.split("\n").map((line) => line.length), 0);
  if (longest > 55) warnings.push("한 줄 55자 초과");
  if (element.widthMm < 25) warnings.push("텍스트 상자가 지나치게 좁음");
  if (contrastRatio(element.color, background) < 4.5) warnings.push("본문 대비 4.5:1 미만");
  return warnings;
}

export function applyTypographyRole(project: PanelProjectV1, element: PanelElement, role: TypographyRole) {
  if (element.type !== "text") return;
  const style = project.typographyStyles.find((item) => item.role === role); if (!style) return;
  Object.assign(element, { styleRole: role, fontFamily: style.fontFamily, fontSizePt: style.fontSizePt, lineHeight: style.lineHeight, letterSpacingPt: style.letterSpacingPt, weight: style.weight, color: style.color });
}
