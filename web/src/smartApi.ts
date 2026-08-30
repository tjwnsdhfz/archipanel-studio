import type { LayoutProposalV1, PanelContentBlock, PanelProjectV1, ReferenceLayoutV1, StudioPresentationSpecV1 } from "./types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.detail === "string" ? payload.detail : payload?.detail?.message ?? "요청을 처리하지 못했습니다.");
  }
  return response.json() as Promise<T>;
}

export async function suggestBlocks(project: PanelProjectV1, boardId: string) {
  return (await post<{ blocks: PanelContentBlock[] }>("/api/content/suggest-labels", { project, boardId })).blocks;
}

export async function recommendLayouts(project: PanelProjectV1, boardId: string, referenceLayouts: ReferenceLayoutV1[]) {
  return (await post<{ proposals: LayoutProposalV1[] }>("/api/layout/recommend", { project, boardId, referenceLayouts })).proposals;
}

export async function validateProposal(project: PanelProjectV1, proposal: LayoutProposalV1) {
  return post<{ valid: boolean; errors: string[] }>("/api/layout/validate", { project, proposal });
}

export async function makeStoryboard(project: PanelProjectV1, durationMinutes: number, slideCount: number, audience: string) {
  return (await post<{ spec: StudioPresentationSpecV1 }>("/api/presentation/storyboard", { project, durationMinutes, slideCount, audience })).spec;
}
