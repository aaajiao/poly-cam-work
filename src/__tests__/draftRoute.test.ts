import { BlobPreconditionFailedError } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneDraft } from "@/types";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	readJsonBlob: vi.fn(),
	readJsonBlobWithEtag: vi.fn(),
	writeJsonBlobIfMatch: vi.fn(),
	reconcileSceneImageAssets: vi.fn(),
}));

vi.mock("../../api/_lib/auth", () => ({
	requireAuth: mocks.requireAuth,
}));

vi.mock("../../api/_lib/blobStore", () => ({
	readJsonBlob: mocks.readJsonBlob,
	readJsonBlobWithEtag: mocks.readJsonBlobWithEtag,
	writeJsonBlobIfMatch: mocks.writeJsonBlobIfMatch,
}));

vi.mock("../../api/_lib/sceneAssetCleanup", async () => {
	const actual = await vi.importActual<
		typeof import("../../api/_lib/sceneAssetCleanup")
	>("../../api/_lib/sceneAssetCleanup");
	return {
		...actual,
		reconcileSceneImageAssets: mocks.reconcileSceneImageAssets,
	};
});

import handlerModule from "../../api/draft/[sceneId]";

const handler = handlerModule.fetch;

describe("draft route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAuth.mockReturnValue(true);
		mocks.writeJsonBlobIfMatch.mockResolvedValue(undefined);
		mocks.reconcileSceneImageAssets.mockResolvedValue({
			deletedPathnames: [],
			failedPathnames: [],
		});
	});

	it("passes next draft image pathnames as protected set during cleanup", async () => {
		const currentDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 2,
			updatedAt: Date.now() - 1000,
			annotations: [
				{
					id: "ann-1",
					position: [0, 0, 0],
					title: "Old",
					description: "",
					images: [
						{
							filename: "old.png",
							url: "https://blob.example/scenes/scan-a/images/ann-1/old.png",
						},
					],
					videoUrl: null,
					links: [],
					sceneId: "scan-a",
					createdAt: Date.now() - 1000,
				},
			],
		};

		const bodyDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 2,
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

		mocks.readJsonBlobWithEtag.mockResolvedValue({
			value: currentDraft,
			etag: "etag-current",
		});

		const request = new Request("http://localhost/api/draft/scan-a", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				expectedRevision: 2,
				draft: bodyDraft,
			}),
		});

		const response = await handler(request);
		expect(response.status).toBe(200);

		// The write must carry the ETag we read so concurrent writers conflict.
		expect(mocks.writeJsonBlobIfMatch).toHaveBeenCalledWith(
			"scenes/scan-a/draft.json",
			expect.objectContaining({ sceneId: "scan-a", revision: 3 }),
			"etag-current",
		);

		expect(mocks.reconcileSceneImageAssets).toHaveBeenCalledWith(
			"scan-a",
			["scenes/scan-a/images/ann-1/old.png"],
			["scenes/scan-a/images/ann-1/new.gif"],
		);
	});

	it("returns 409 when a concurrent same-revision write changed the blob", async () => {
		const currentDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 2,
			updatedAt: Date.now() - 1000,
			annotations: [],
		};

		const bodyDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 2,
			updatedAt: Date.now(),
			annotations: [],
		};

		// Revision check passes (both see revision 2), but the underlying blob
		// changed since we read its ETag -> precondition failure must surface 409.
		mocks.readJsonBlobWithEtag.mockResolvedValue({
			value: currentDraft,
			etag: "stale-etag",
		});
		mocks.writeJsonBlobIfMatch.mockRejectedValueOnce(
			new BlobPreconditionFailedError(),
		);

		const request = new Request("http://localhost/api/draft/scan-a", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				expectedRevision: 2,
				draft: bodyDraft,
			}),
		});

		const response = await handler(request);
		const json = await response.json();

		expect(response.status).toBe(409);
		expect(json).toEqual({ error: "Revision mismatch" });
		expect(mocks.reconcileSceneImageAssets).not.toHaveBeenCalled();
	});
});
