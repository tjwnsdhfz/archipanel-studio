type Exporter = () => Promise<Blob>;
let current: Exporter | undefined;

export function registerBoardExporter(exporter: Exporter) {
  current = exporter;
  return () => { if (current === exporter) current = undefined; };
}

export async function exportBoardPng() {
  if (!current) throw new Error("패널을 먼저 열어 주세요.");
  return current();
}

export function shareMultiplier(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("패널 크기를 확인해 주세요.");
  return 2400 / Math.max(width, height);
}
