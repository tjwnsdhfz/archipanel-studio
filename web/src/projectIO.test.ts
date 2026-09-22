import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { makeProject } from "./types";
import { buildLocalPackage, downloadFromEndpoint, openPackage } from "./projectIO";

const database = vi.hoisted(() => ({
  assets: { get: vi.fn(), put: vi.fn() },
  fonts: { get: vi.fn(), put: vi.fn() },
}));
vi.mock("./db", () => ({ db: database }));
beforeEach(() => { vi.clearAllMocks(); });
describe("portable project recovery", () => {
  it.each(["1.0", "1.1", "1.2", "1.3", "1.4"])("reopens schema %s and preserves board content", async version => {
    const project = { ...makeProject("제출용 보드"), schemaVersion: version };
    const zip = new JSZip().file("manifest.json", JSON.stringify(project));
    const input = await zip.generateAsync({ type: "uint8array" });
    const reopened = await openPackage(input as unknown as File);
    expect(reopened.schemaVersion).toBe("1.4");
    expect(reopened.name).toBe(project.name);
    expect(reopened.id).not.toBe(project.id);
    expect(reopened.boards[0].id).toBe(project.boards[0].id);
  });
  it("rejects future schemas without writing local assets", async () => {
    const zip = new JSZip().file("manifest.json", JSON.stringify({ ...makeProject(), schemaVersion: "9.0" }));
    await expect(openPackage(await zip.generateAsync({ type: "uint8array" }) as unknown as File)).rejects.toThrow("지원하지 않는 스키마");
    expect(database.assets.put).not.toHaveBeenCalled();
  });
  it("blocks incomplete exports instead of silently omitting the original", async () => {
    const project = makeProject();
    project.assets.push({ id: "missing", name: "도면.png", mime: "image/png", sizeBytes: 100, review: [] });
    database.assets.get.mockResolvedValue(undefined);
    await expect(downloadFromEndpoint(project, "/api/export/pdf", "board.pdf")).rejects.toThrow("도면.png");
  });
  it("backs up original bytes without requesting a server and reopens the package", async () => {
    const project = makeProject("내 이미지 패널");
    project.assets.push({id:"image-1",name:"도면.png",mime:"image/png",sizeBytes:3,review:[]});
    database.assets.get.mockResolvedValue({blob:new Blob([new Uint8Array([1,2,3])],{type:"image/png"})});
    const archive = await buildLocalPackage(project);
    const bytes = await archive.arrayBuffer();
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file("assets/image-1.bin")!.async("uint8array")).toEqual(new Uint8Array([1,2,3]));
    const reopened = await openPackage(bytes as unknown as File);
    expect(reopened.name).toBe(project.name);
    expect(reopened.id).not.toBe(project.id);
    expect(reopened.assets[0].archivePath).toBe("assets/image-1.bin");
    expect(reopened.assets[0].id).not.toBe("image-1");
    expect(database.assets.put.mock.calls[0][0].id).toBe(reopened.assets[0].id);
  });
  it("keeps missing originals from becoming incomplete browser backups", async () => {
    const project=makeProject(); project.assets.push({id:"lost",name:"lost.png",mime:"image/png",sizeBytes:1,review:[]});
    database.assets.get.mockResolvedValue(undefined);
    await expect(buildLocalPackage(project)).rejects.toThrow("lost.png");
  });
});
