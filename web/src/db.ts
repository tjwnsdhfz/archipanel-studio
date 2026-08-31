import Dexie, { type EntityTable } from "dexie";
import type { CritiqueResultV1, DesignStatementSpecV1, LayoutDecisionRecordV1, LocalTasteProfileV1, PanelProjectV1, ReferenceLayoutV1, StudioPresentationSpecV1 } from "./types";
import { migrateProject, newId } from "./types";

export type AssetBlob = { id: string; projectId: string; blob: Blob; thumbnail?: Blob; pageThumbnails?: Blob[]; updatedAt: string };
export type ProjectRow = { id: string; name: string; project: PanelProjectV1; updatedAt: string };

class ArchiPanelDB extends Dexie {
  projects!: EntityTable<ProjectRow, "id">;
  assets!: EntityTable<AssetBlob, "id">;
  fonts!: EntityTable<AssetBlob, "id">;
  snapshots!: EntityTable<{ id: string; projectId: string; project: unknown; createdAt: string; name?: string }, "id">;
  referenceLayouts!: EntityTable<ReferenceLayoutV1, "id">;
  referenceAssets!: EntityTable<AssetBlob, "id">;
  recommendationRuns!: EntityTable<{ id: string; projectId: string; boardId: string; createdAt: string; proposalIds: string[] }, "id">;
  presentationSpecs!: EntityTable<StudioPresentationSpecV1, "id">;
  designStatementSpecs!: EntityTable<DesignStatementSpecV1, "id">;
  critiqueResults!: EntityTable<CritiqueResultV1, "id">;
  layoutDecisions!: EntityTable<LayoutDecisionRecordV1, "id">;
  tasteProfiles!: EntityTable<LocalTasteProfileV1, "id">;

  constructor() {
    super("archipanel-studio");
    this.version(1).stores({
      projects: "id, updatedAt, name",
      assets: "id, projectId, updatedAt",
      fonts: "id, projectId, updatedAt",
      snapshots: "id, projectId, createdAt",
    });
    this.version(2).stores({
      projects: "id, updatedAt, name",
      assets: "id, projectId, updatedAt",
      fonts: "id, projectId, updatedAt",
      snapshots: "id, projectId, createdAt, name",
      referenceLayouts: "id, approvalStatus, createdAt, [approvalStatus+createdAt]",
      referenceAssets: "id, projectId, updatedAt",
      recommendationRuns: "id, projectId, boardId, createdAt",
      presentationSpecs: "id, projectId, approvalStatus, updatedAt",
    });
    this.version(3).stores({
      projects: "id, updatedAt, name", assets: "id, projectId, updatedAt", fonts: "id, projectId, updatedAt",
      snapshots: "id, projectId, createdAt, name", referenceLayouts: "id, approvalStatus, createdAt, [approvalStatus+createdAt]",
      referenceAssets: "id, projectId, updatedAt", recommendationRuns: "id, projectId, boardId, createdAt",
      presentationSpecs: "id, projectId, approvalStatus, updatedAt", designStatementSpecs: "id, projectId, approvalStatus, updatedAt",
    });
    this.version(4).stores({
      projects: "id, updatedAt, name", assets: "id, projectId, updatedAt", fonts: "id, projectId, updatedAt",
      snapshots: "id, projectId, createdAt, name", referenceLayouts: "id, approvalStatus, createdAt, [approvalStatus+createdAt]",
      referenceAssets: "id, projectId, updatedAt", recommendationRuns: "id, projectId, boardId, createdAt",
      presentationSpecs: "id, projectId, approvalStatus, updatedAt", designStatementSpecs: "id, projectId, approvalStatus, updatedAt",
      critiqueResults: "id, projectId, boardId, boardRevisionHash, generatedAt, [projectId+boardId+boardRevisionHash]",
      layoutDecisions: "id, projectId, boardId, createdAt, [projectId+boardId]", tasteProfiles: "id, updatedAt",
    });
  }
}

export const db = new ArchiPanelDB();

export async function saveProject(project: PanelProjectV1) {
  const saved = { ...project, updatedAt: new Date().toISOString() };
  await db.projects.put({ id: saved.id, name: saved.name, project: saved, updatedAt: saved.updatedAt });
  return saved;
}

export async function loadProjectRow(row: ProjectRow) {
  const source = row.project as unknown as { schemaVersion?: string };
  if (source.schemaVersion !== "1.4") {
    await db.snapshots.put({ id: newId(), projectId: row.id, project: structuredClone(row.project), createdAt: new Date().toISOString(), name: `${source.schemaVersion ?? "legacy"} → 1.4 자동 마이그레이션 백업` });
  }
  const migrated = migrateProject(row.project);
  if (source.schemaVersion !== "1.4") await saveProject(migrated);
  return migrated;
}

export async function storageStatus() {
  const estimate = await navigator.storage?.estimate?.();
  const persisted = await navigator.storage?.persisted?.();
  return { persisted: Boolean(persisted), usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 };
}

export async function requestPersistentStorage() {
  return Boolean(await navigator.storage?.persist?.());
}
