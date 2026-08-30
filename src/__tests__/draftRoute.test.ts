import { BlobPreconditionFailedError } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneDraft } from "@/types";

const mocks = vi.hoisted(() => {
	class MockReleaseVersionConflictError extends Error {}

	return {
		requireAuth: vi.fn(),
		readJsonBlobWithEtag: vi.fn(),
		writeJsonBlobIfMatch: vi.fn(),
		reconcileSceneImageAssets: vi.fn(),
		createSceneRelease: vi.fn(),
		ReleaseVersionConflictError: MockReleaseVersionConflictError,
	};
});

vi.mock("../../api/_lib/auth", () => ({
	requireAuth: mocks.requireAuth,
}));

vi.mock("../../api/_lib/blobStore", () => ({
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

vi.mock("../../api/_lib/publishRelease", () => ({
	createSceneRelease: mocks.createSceneRelease,
	ReleaseVersionConflictError: mocks.ReleaseVersionConflictError,
}));

import handlerModule from "../../api/draft/[sceneId]";

const handler = handlerModule.fetch;

function draftWriteResult(etag: string) {
	return {
		url: "https://blob.example/scenes/scan-a/draft.json",
		downloadUrl:
			"https://blob.example/scenes/scan-a/draft.json?download=1",
		pathname: "scenes/scan-a/draft.json",
		contentType: "application/json",
		contentDisposition: 'inline; filename="draft.json"',
		etag,
	};
}

describe("draft route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAuth.mockReturnValue(true);
		mocks.writeJsonBlobIfMatch.mockResolvedValue(
			draftWriteResult("etag-next"),
		);
		mocks.reconcileSceneImageAssets.mockResolvedValue({
			deletedPathnames: [],
			failedPathnames: [],
		});
		mocks.createSceneRelease.mockResolvedValue({ version: 4 });
	});

	it("returns the ETag paired with the GET body and disables response caching", async () => {
		const draft: SceneDraft = {
			sceneId: "scan-b",
			revision: 3,
			updatedAt: Date.now(),
			annotations: [],
		};
		mocks.readJsonBlobWithEtag.mockResolvedValue({
			value: draft,
			etag: "etag-body-3",
		});

		const response = await handler(
			new Request("http://localhost/api/draft/scan-b"),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(draft);
		expect(response.headers.get("X-Draft-ETag")).toBe("etag-body-3");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("returns an empty draft ETag header when no draft blob exists", async () => {
		mocks.readJsonBlobWithEtag.mockResolvedValue({ value: null, etag: null });

		const response = await handler(
			new Request("http://localhost/api/draft/scan-c"),
		);
		const json = await response.json();

		expect(json).toEqual(
			expect.objectContaining({ sceneId: "scan-c", revision: 0 }),
		);
		expect(response.headers.get("X-Draft-ETag")).toBe("");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
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
		expect(mocks.createSceneRelease).not.toHaveBeenCalled();
	});

	it("publishes the exact next draft snapshot in the same PUT and returns its version", async () => {
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

		mocks.readJsonBlobWithEtag.mockResolvedValue({
			value: currentDraft,
			etag: "etag-current",
		});

		const response = await handler(
			new Request("http://localhost/api/draft/scan-a", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					expectedRevision: 2,
					draft: bodyDraft,
					publish: true,
					message: "Version 4",
				}),
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({
			ok: true,
			revision: 3,
			etag: "etag-next",
			version: 4,
		});
		expect(mocks.writeJsonBlobIfMatch).toHaveBeenCalledTimes(1);
		const persistedNextDraft = mocks.writeJsonBlobIfMatch.mock.calls[0][1];
		expect(persistedNextDraft).toEqual(
			expect.objectContaining({
				sceneId: "scan-a",
				revision: 3,
				annotations: bodyDraft.annotations,
			}),
		);
		expect(mocks.createSceneRelease).toHaveBeenCalledWith({
			sceneId: "scan-a",
			draft: persistedNextDraft,
			message: "Version 4",
		});
		expect(mocks.createSceneRelease.mock.calls[0][0].draft).toBe(
			persistedNextDraft,
		);
	});

	it("uses the first PUT ETag for an immediate second publish without rereading the public body", async () => {
		const firstDraft: SceneDraft = {
			sceneId: "scan-b",
			revision: 0,
			updatedAt: Date.now(),
			annotations: [],
		};
		const secondDraft: SceneDraft = {
			...firstDraft,
			revision: 1,
		};
		mocks.readJsonBlobWithEtag.mockResolvedValue({ value: null, etag: null });
		mocks.writeJsonBlobIfMatch
			.mockResolvedValueOnce(draftWriteResult("etag-1"))
			.mockResolvedValueOnce(draftWriteResult("etag-2"));
		mocks.createSceneRelease
			.mockResolvedValueOnce({ version: 1 })
			.mockResolvedValueOnce({ version: 2 });

		const firstResponse = await handler(
			new Request("http://localhost/api/draft/scan-b", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					expectedRevision: 0,
					expectedEtag: null,
					draft: firstDraft,
					publish: true,
				}),
			}),
		);
		const firstJson = await firstResponse.json();

		const secondResponse = await handler(
			new Request("http://localhost/api/draft/scan-b", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					expectedRevision: firstJson.revision,
					expectedEtag: firstJson.etag,
					draft: secondDraft,
					publish: true,
				}),
			}),
		);

		expect(firstJson).toEqual({
			ok: true,
			revision: 1,
			etag: "etag-1",
			version: 1,
		});
		await expect(secondResponse.json()).resolves.toEqual({
			ok: true,
			revision: 2,
			etag: "etag-2",
			version: 2,
		});
		expect(mocks.readJsonBlobWithEtag).not.toHaveBeenCalled();
		expect(mocks.writeJsonBlobIfMatch).toHaveBeenNthCalledWith(
			1,
			"scenes/scan-b/draft.json",
			expect.objectContaining({ sceneId: "scan-b", revision: 1 }),
			null,
		);
		expect(mocks.writeJsonBlobIfMatch).toHaveBeenNthCalledWith(
			2,
			"scenes/scan-b/draft.json",
			expect.objectContaining({ sceneId: "scan-b", revision: 2 }),
			"etag-1",
		);
		expect(mocks.createSceneRelease.mock.calls[1][0].draft).toEqual(
			expect.objectContaining({ sceneId: "scan-b", revision: 2 }),
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
		expect(mocks.createSceneRelease).not.toHaveBeenCalled();
	});

	it("returns 409 for a stale carried ETag without reading or publishing", async () => {
		const bodyDraft: SceneDraft = {
			sceneId: "scan-c",
			revision: 7,
			updatedAt: Date.now(),
			annotations: [],
		};
		mocks.writeJsonBlobIfMatch.mockRejectedValueOnce(
			new BlobPreconditionFailedError(),
		);

		const response = await handler(
			new Request("http://localhost/api/draft/scan-c", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					expectedRevision: 7,
					expectedEtag: "etag-stale",
					draft: bodyDraft,
					publish: true,
				}),
			}),
		);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({
			error: "Revision mismatch",
		});
		expect(mocks.readJsonBlobWithEtag).not.toHaveBeenCalled();
		expect(mocks.writeJsonBlobIfMatch).toHaveBeenCalledWith(
			"scenes/scan-c/draft.json",
			expect.objectContaining({ sceneId: "scan-c", revision: 8 }),
			"etag-stale",
		);
		expect(mocks.reconcileSceneImageAssets).not.toHaveBeenCalled();
		expect(mocks.createSceneRelease).not.toHaveBeenCalled();
	});
});
