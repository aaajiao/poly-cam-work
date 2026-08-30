import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneDraft } from "@/types";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	readJsonBlob: vi.fn(),
	readJsonBlobWithEtag: vi.fn(),
	writeJsonBlobIfMatch: vi.fn(),
	listBlobsByPrefix: vi.fn(),
	writeImmutableJsonBlob: vi.fn(),
	mutateJsonBlob: vi.fn(),
	deleteBlobByPathname: vi.fn(),
	reconcileSceneImageAssets: vi.fn(),
	releases: new Map<string, unknown>(),
	liveVersion: 0,
}));

vi.mock("../../api/_lib/auth", () => ({
	requireAuth: mocks.requireAuth,
}));

vi.mock("../../api/_lib/blobStore", () => ({
	readJsonBlob: mocks.readJsonBlob,
	readJsonBlobWithEtag: mocks.readJsonBlobWithEtag,
	writeJsonBlobIfMatch: mocks.writeJsonBlobIfMatch,
	listBlobsByPrefix: mocks.listBlobsByPrefix,
	writeImmutableJsonBlob: mocks.writeImmutableJsonBlob,
	mutateJsonBlob: mocks.mutateJsonBlob,
	deleteBlobByPathname: mocks.deleteBlobByPathname,
}));

vi.mock("../../api/_lib/sceneAssetCleanup", async (importOriginal) => {
	const actual = await importOriginal<
		typeof import("../../api/_lib/sceneAssetCleanup")
	>();
	return {
		...actual,
		reconcileSceneImageAssets: mocks.reconcileSceneImageAssets,
	};
});

import handlerModule from "../../api/draft/[sceneId]";

const handler = handlerModule.fetch;

function draftWriteResult(etag: string) {
	return {
		url: "https://blob.example/scenes/scan-b/draft.json",
		downloadUrl:
			"https://blob.example/scenes/scan-b/draft.json?download=1",
		pathname: "scenes/scan-b/draft.json",
		contentType: "application/json",
		contentDisposition: 'inline; filename="draft.json"',
		etag,
	};
}

function publishRequest(
	expectedRevision: number,
	expectedEtag: string | null,
) {
	const draft: SceneDraft = {
		sceneId: "scan-b",
		revision: expectedRevision,
		annotations: [],
		updatedAt: Date.now(),
	};

	return new Request("http://localhost/api/draft/scan-b", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			draft,
			expectedRevision,
			expectedEtag,
			publish: true,
		}),
	});
}

describe("draft save-and-publish integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.releases.clear();
		mocks.liveVersion = 0;
		mocks.requireAuth.mockReturnValue(true);
		mocks.writeJsonBlobIfMatch
			.mockResolvedValueOnce(draftWriteResult("etag-1"))
			.mockResolvedValueOnce(draftWriteResult("etag-2"));
		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname.endsWith("/live.json")) {
				return mocks.liveVersion > 0
					? { version: mocks.liveVersion }
					: null;
			}
			return null;
		});
		mocks.listBlobsByPrefix.mockImplementation(async (prefix: string) =>
			Array.from(mocks.releases.keys())
				.filter((pathname) => pathname.startsWith(prefix))
				.map((pathname) => ({
					pathname,
					url: `https://blob.example/${pathname}`,
				})),
		);
		mocks.writeImmutableJsonBlob.mockImplementation(
			async (pathname: string, value: unknown) => {
				mocks.releases.set(pathname, value);
			},
		);
		mocks.mutateJsonBlob.mockImplementation(
			async (
				_pathname: string,
				mutator: (current: { version: number } | null) => {
					value: unknown;
					result: unknown;
				},
			) => {
				const { value, result } = mutator(
					mocks.liveVersion > 0 ? { version: mocks.liveVersion } : null,
				);
				if (!value || typeof value !== "object") {
					throw new Error("Invalid live pointer");
				}
				const nextVersion = (value as { version?: unknown }).version;
				if (typeof nextVersion !== "number") {
					throw new Error("Invalid live version");
				}
				mocks.liveVersion = nextVersion;
				return result;
			},
		);
		mocks.reconcileSceneImageAssets.mockResolvedValue({
			deletedPathnames: [],
			failedPathnames: [],
		});
	});

	it("creates releases 1 and 2 and advances live when the same scene publishes twice", async () => {
		const firstResponse = await handler(publishRequest(0, null));
		const secondResponse = await handler(publishRequest(1, "etag-1"));

		await expect(firstResponse.json()).resolves.toEqual({
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
		expect(mocks.liveVersion).toBe(2);
		expect(
			mocks.releases.get("scenes/scan-b/releases/1.json"),
		).toEqual(expect.objectContaining({ sceneId: "scan-b", revision: 1 }));
		expect(
			mocks.releases.get("scenes/scan-b/releases/2.json"),
		).toEqual(expect.objectContaining({ sceneId: "scan-b", revision: 2 }));
		expect(mocks.readJsonBlobWithEtag).not.toHaveBeenCalled();
	});
});
