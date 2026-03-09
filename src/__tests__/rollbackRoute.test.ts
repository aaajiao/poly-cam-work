import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneDraft } from "@/types";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	readJsonBlob: vi.fn(),
	writeJsonBlob: vi.fn(),
	reconcileSceneImageAssets: vi.fn(),
}));

vi.mock("../../api/_lib/auth", () => ({
	requireAuth: mocks.requireAuth,
}));

vi.mock("../../api/_lib/blobStore", () => ({
	readJsonBlob: mocks.readJsonBlob,
	writeJsonBlob: mocks.writeJsonBlob,
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

import handlerModule from "../../api/rollback/[sceneId]";

const handler = handlerModule.fetch;

describe("rollback route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAuth.mockReturnValue(true);
		mocks.writeJsonBlob.mockResolvedValue(undefined);
		mocks.reconcileSceneImageAssets.mockResolvedValue({
			deletedPathnames: [],
			failedPathnames: [],
		});
	});

	it("passes rollback draft image pathnames as protected set during cleanup", async () => {
		const releaseDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 8,
			updatedAt: Date.now() - 1000,
			annotations: [
				{
					id: "ann-2",
					position: [0, 0, 0],
					title: "Release image",
					description: "",
					images: [
						{
							filename: "rollback.gif",
							url: "https://blob.example/scenes/scan-a/images/ann-2/rollback.gif",
						},
					],
					videoUrl: null,
					links: [],
					sceneId: "scan-a",
					createdAt: Date.now() - 1000,
				},
			],
		};

		const currentDraft: SceneDraft = {
			sceneId: "scan-a",
			revision: 9,
			updatedAt: Date.now(),
			annotations: [
				{
					id: "ann-1",
					position: [0, 0, 0],
					title: "Current image",
					description: "",
					images: [
						{
							filename: "current.png",
							url: "https://blob.example/scenes/scan-a/images/ann-1/current.png",
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
			if (pathname === "scenes/scan-a/releases/8.json") return releaseDraft;
			if (pathname === "scenes/scan-a/draft.json") return currentDraft;
			return null;
		});

		const request = new Request("http://localhost/api/rollback/scan-a", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ version: 8 }),
		});

		const response = await handler(request);
		expect(response.status).toBe(200);

		expect(mocks.reconcileSceneImageAssets).toHaveBeenCalledWith(
			"scan-a",
			["scenes/scan-a/images/ann-1/current.png"],
			["scenes/scan-a/images/ann-2/rollback.gif"],
		);
	});
});
