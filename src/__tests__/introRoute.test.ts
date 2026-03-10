import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntroPreset } from "@/types";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	readJsonBlob: vi.fn(),
	writeJsonBlob: vi.fn(),
}));

vi.mock("../../api/_lib/auth", () => ({
	requireAuth: mocks.requireAuth,
}));

vi.mock("../../api/_lib/blobStore", () => ({
	readJsonBlob: mocks.readJsonBlob,
	writeJsonBlob: mocks.writeJsonBlob,
}));

import handlerModule from "../../api/intro/[sceneId]";

const handler = handlerModule.fetch;

function makePreset(overrides: Partial<IntroPreset> = {}): IntroPreset {
	return {
		version: 1,
		sceneId: "scan-a",
		enabled: true,
		camera: {
			position: [0, 5, 15],
			target: [0, 0, 0],
			fov: 50,
		},
		viewer: { viewMode: "mesh" },
		scan: {
			progress: 0.5,
			radius: 18,
			phase: "expansion",
			origin: [1, 2, 3],
			maxRadius: 40,
			duration: 10,
		},
		annotations: {
			openIds: ["ann-1"],
			triggeredIds: ["ann-1"],
			activeId: "ann-1",
		},
		ui: { ctaLabel: "Continue Scan" },
		createdAt: 1000,
		updatedAt: 2000,
		...overrides,
	};
}

describe("intro route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAuth.mockReturnValue(true);
		mocks.writeJsonBlob.mockResolvedValue(undefined);
	});

	it("returns 401 for unauthenticated PUT", async () => {
		mocks.requireAuth.mockReturnValue(false);

		const res = await handler(
			new Request("http://localhost/api/intro/scan-a", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ preset: makePreset() }),
			}),
		);

		expect(res.status).toBe(401);
	});

	it("preserves panelOffsets and mediaSizes through normalizer", async () => {
		const preset = makePreset({
			annotations: {
				openIds: ["ann-1"],
				triggeredIds: ["ann-1"],
				activeId: "ann-1",
				panelOffsets: { "ann-1": { x: 50, y: -20 } },
				mediaSizes: {
					"ann-1:image": { width: 400 },
					"ann-1:video": { width: 300, height: 180 },
				},
			},
		});

		const res = await handler(
			new Request("http://localhost/api/intro/scan-a", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ preset }),
			}),
		);

		expect(res.status).toBe(200);
		const saved = (await res.json()) as IntroPreset;

		expect(saved.annotations.panelOffsets).toEqual({
			"ann-1": { x: 50, y: -20 },
		});
		expect(saved.annotations.mediaSizes).toEqual({
			"ann-1:image": { width: 400 },
			"ann-1:video": { width: 300, height: 180 },
		});
	});

	it("omits panelOffsets and mediaSizes when not provided", async () => {
		const preset = makePreset();

		const res = await handler(
			new Request("http://localhost/api/intro/scan-a", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ preset }),
			}),
		);

		expect(res.status).toBe(200);
		const saved = (await res.json()) as IntroPreset;

		expect(saved.annotations.panelOffsets).toBeUndefined();
		expect(saved.annotations.mediaSizes).toBeUndefined();
	});

	it("returns saved draft blob on GET for authenticated user", async () => {
		const stored = makePreset();
		mocks.readJsonBlob.mockResolvedValue(stored);

		const res = await handler(new Request("http://localhost/api/intro/scan-a"));

		expect(res.status).toBe(200);
		const body = (await res.json()) as IntroPreset;
		expect(body.sceneId).toBe("scan-a");
		expect(body.annotations.openIds).toEqual(["ann-1"]);
	});
});
