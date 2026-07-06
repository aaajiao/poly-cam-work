import { BlobPreconditionFailedError } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneDraft } from "@/types";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	readJsonBlob: vi.fn(),
	readJsonBlobWithEtag: vi.fn(),
	writeJsonBlobIfMatch: vi.fn(),
	mutateJsonBlob: vi.fn(),
	writeImmutableJsonBlob: vi.fn(),
	deleteBlobByPathname: vi.fn(),
	listBlobsByPrefix: vi.fn(),
	reconcileSceneImageAssets: vi.fn(),
	collectImagePathnamesFromDraft: vi.fn(),
}));

vi.mock("../../api/_lib/auth", () => ({
	requireAuth: mocks.requireAuth,
}));

vi.mock("../../api/_lib/blobStore", () => ({
	readJsonBlob: mocks.readJsonBlob,
	readJsonBlobWithEtag: mocks.readJsonBlobWithEtag,
	writeJsonBlobIfMatch: mocks.writeJsonBlobIfMatch,
	mutateJsonBlob: mocks.mutateJsonBlob,
	writeImmutableJsonBlob: mocks.writeImmutableJsonBlob,
	deleteBlobByPathname: mocks.deleteBlobByPathname,
	listBlobsByPrefix: mocks.listBlobsByPrefix,
}));

vi.mock("../../api/_lib/sceneAssetCleanup", () => ({
	reconcileSceneImageAssets: mocks.reconcileSceneImageAssets,
	collectImagePathnamesFromDraft: mocks.collectImagePathnamesFromDraft,
}));

import handlerModule from "../../api/publish/[sceneId]";

const handler = handlerModule.fetch;

// Captures every pointer value committed through mutateJsonBlob (live.json), so
// tests can assert on the persisted value without depending on the underlying
// compare-and-set primitive.
let writtenPointers: Array<{ path: string; value: unknown }> = [];

describe("publish route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writtenPointers = [];
		mocks.requireAuth.mockReturnValue(true);
		mocks.listBlobsByPrefix.mockResolvedValue([]);
		mocks.readJsonBlobWithEtag.mockResolvedValue({ value: null, etag: null });
		mocks.writeJsonBlobIfMatch.mockResolvedValue(undefined);
		mocks.writeImmutableJsonBlob.mockResolvedValue(undefined);
		mocks.deleteBlobByPathname.mockResolvedValue(true);
		mocks.mutateJsonBlob.mockImplementation(
			async (
				path: string,
				mutator: (current: unknown) => { value: unknown; result: unknown },
			) => {
				const { value, result } = mutator(null);
				writtenPointers.push({ path, value });
				return result;
			},
		);
		mocks.reconcileSceneImageAssets.mockResolvedValue({
			deletedPathnames: [],
			failedPathnames: [],
		});
	});

	it("publishes using body draft snapshot and protects its image pathnames", async () => {
		const oldDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 16,
			updatedAt: Date.now() - 1000,
			annotations: [],
		};

		const newDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 17,
			updatedAt: Date.now(),
			annotations: [
				{
					id: "ann-1",
					position: [0, 0, 0],
					title: "New",
					description: "",
					images: [
						{
							filename: "new.gif",
							url: "https://blob.example/scenes/scan-a/images/ann-1/new.gif",
						},
					],
					videoUrl: null,
					links: [],
					sceneId: "scan-a",
					createdAt: Date.now(),
				},
			],
		};

		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname === "scenes/scan-a/live.json") return { version: 10 };
			return null;
		});
		// The posted draft is persisted through compare-and-set; the current draft
		// blob is read with its ETag.
		mocks.readJsonBlobWithEtag.mockResolvedValue({
			value: oldDraft,
			etag: "etag-1",
		});
		mocks.collectImagePathnamesFromDraft.mockReturnValue([
			"scenes/scan-a/images/ann-1/new.gif",
		]);

		const request = new Request("http://localhost/api/publish/scan-a", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				draft: newDraft,
				expectedRevision: 17,
			}),
		});

		const response = await handler(request);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({ ok: true, version: 11 });

		// Draft persisted via compare-and-set (ifMatch etag), never a blind write.
		expect(mocks.writeJsonBlobIfMatch).toHaveBeenCalledWith(
			"scenes/scan-a/draft.json",
			newDraft,
			"etag-1",
		);
		expect(mocks.writeImmutableJsonBlob).toHaveBeenCalledWith(
			"scenes/scan-a/releases/11.json",
			expect.objectContaining({
				sceneId: "scan-a",
				revision: 17,
				annotations: newDraft.annotations,
			}),
		);
		// Live pointer advanced through compare-and-set.
		expect(writtenPointers).toContainEqual({
			path: "scenes/scan-a/live.json",
			value: { version: 11 },
		});

		expect(mocks.reconcileSceneImageAssets).toHaveBeenCalledWith(
			"scan-a",
			[],
			["scenes/scan-a/images/ann-1/new.gif"],
		);
	});

	it("returns 400 when a posted draft body fails validation instead of publishing stale stored content", async () => {
		// A malformed draft body must not silently fall back to the stored draft.
		mocks.readJsonBlob.mockResolvedValue({
			sceneId: "scan-a",
			revision: 3,
			updatedAt: Date.now(),
			annotations: [],
		} satisfies SceneDraft);

		const request = new Request("http://localhost/api/publish/scan-a", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				draft: { sceneId: "scan-a" },
				expectedRevision: 3,
			}),
		});

		const response = await handler(request);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json).toEqual({ error: "Invalid draft" });
		expect(mocks.writeImmutableJsonBlob).not.toHaveBeenCalled();
		expect(mocks.writeJsonBlobIfMatch).not.toHaveBeenCalled();
		expect(writtenPointers).toEqual([]);
	});

	it("returns conflict when persisted draft revision is newer than expected", async () => {
		const newDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 17,
			updatedAt: Date.now(),
			annotations: [],
		};

		mocks.readJsonBlobWithEtag.mockResolvedValue({
			value: {
				sceneId: "scan-a",
				revision: 18,
				updatedAt: Date.now(),
				annotations: [],
			} satisfies SceneDraft,
			etag: "etag-stale",
		});

		const request = new Request("http://localhost/api/publish/scan-a", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				draft: newDraft,
				expectedRevision: 17,
			}),
		});

		const response = await handler(request);
		const json = await response.json();

		expect(response.status).toBe(409);
		expect(json).toEqual({ error: "Revision mismatch" });
		expect(mocks.writeImmutableJsonBlob).not.toHaveBeenCalled();
		expect(mocks.writeJsonBlobIfMatch).not.toHaveBeenCalled();
		expect(mocks.reconcileSceneImageAssets).not.toHaveBeenCalled();
	});

	it("returns conflict when the draft blob is clobbered concurrently (ifMatch precondition fails)", async () => {
		const newDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 17,
			updatedAt: Date.now(),
			annotations: [],
		};

		mocks.readJsonBlobWithEtag.mockResolvedValue({
			value: {
				sceneId: "scan-a",
				revision: 16,
				updatedAt: Date.now(),
				annotations: [],
			} satisfies SceneDraft,
			etag: "etag-1",
		});
		mocks.writeJsonBlobIfMatch.mockRejectedValueOnce(
			new BlobPreconditionFailedError(),
		);

		const request = new Request("http://localhost/api/publish/scan-a", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				draft: newDraft,
				expectedRevision: 17,
			}),
		});

		const response = await handler(request);
		const json = await response.json();

		expect(response.status).toBe(409);
		expect(json).toEqual({ error: "Revision mismatch" });
		expect(mocks.writeImmutableJsonBlob).not.toHaveBeenCalled();
		expect(writtenPointers).toEqual([]);
	});

	it("publishes above the max existing release after a rollback to an older version", async () => {
		const draft: SceneDraft = {
			sceneId: "scan-a",
			revision: 5,
			updatedAt: Date.now(),
			annotations: [],
		};

		// Releases 1..3 exist on disk, but live was rolled back to version 2.
		// The next version must clear the max existing release (3), not just
		// live+1 (which would collide with releases/3.json and 500 forever).
		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname === "scenes/scan-a/draft.json") return draft;
			if (pathname === "scenes/scan-a/live.json") return { version: 2 };
			return null;
		});
		mocks.listBlobsByPrefix.mockResolvedValue([
			{ url: "u1", pathname: "scenes/scan-a/releases/1.json" },
			{ url: "u2", pathname: "scenes/scan-a/releases/2.json" },
			{ url: "u3", pathname: "scenes/scan-a/releases/3.json" },
		]);

		const request = new Request("http://localhost/api/publish/scan-a", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});

		const response = await handler(request);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({ ok: true, version: 4 });
		expect(mocks.writeImmutableJsonBlob).toHaveBeenCalledWith(
			"scenes/scan-a/releases/4.json",
			expect.objectContaining({ sceneId: "scan-a", revision: 5 }),
		);
		expect(writtenPointers).toContainEqual({
			path: "scenes/scan-a/live.json",
			value: { version: 4 },
		});
	});

	it("surfaces a 409 instead of an uncaught 500 when a release version is claimed concurrently", async () => {
		const draft: SceneDraft = {
			sceneId: "scan-a",
			revision: 5,
			updatedAt: Date.now(),
			annotations: [],
		};

		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname === "scenes/scan-a/draft.json") return draft;
			if (pathname === "scenes/scan-a/live.json") return { version: 0 };
			return null;
		});
		mocks.writeImmutableJsonBlob.mockRejectedValueOnce(
			new BlobPreconditionFailedError(),
		);

		const request = new Request("http://localhost/api/publish/scan-a", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});

		const response = await handler(request);

		expect(response.status).toBe(409);
		// The live pointer must NOT advance on a conflicted release write.
		expect(writtenPointers).toEqual([]);
	});

	it("deletes the dangling release blob when the live pointer write fails", async () => {
		const draft: SceneDraft = {
			sceneId: "scan-a",
			revision: 5,
			updatedAt: Date.now(),
			annotations: [],
		};

		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname === "scenes/scan-a/draft.json") return draft;
			if (pathname === "scenes/scan-a/live.json") return { version: 0 };
			return null;
		});
		// Release blob write succeeds, but the live pointer update throws a
		// non-precondition error -> the release must be cleaned up before rethrow.
		mocks.mutateJsonBlob.mockRejectedValueOnce(new Error("network down"));

		const request = new Request("http://localhost/api/publish/scan-a", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});

		await expect(handler(request)).rejects.toThrow("network down");
		expect(mocks.writeImmutableJsonBlob).toHaveBeenCalledWith(
			"scenes/scan-a/releases/1.json",
			expect.anything(),
		);
		expect(mocks.deleteBlobByPathname).toHaveBeenCalledWith(
			"scenes/scan-a/releases/1.json",
		);
	});
});
