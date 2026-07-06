import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneDraft } from "@/types";

const mocks = vi.hoisted(() => ({
	readJsonBlob: vi.fn(),
}));

vi.mock("../../api/_lib/blobStore", () => ({
	readJsonBlob: mocks.readJsonBlob,
}));

import handlerModule from "../../api/release/[sceneId]";

const handler = handlerModule.fetch;

function makeDraft(version: number): SceneDraft {
	return {
		sceneId: "scan-a",
		revision: version,
		updatedAt: 123,
		annotations: [],
	};
}

describe("release route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("resolves the live pointer when no version is requested", async () => {
		const release = makeDraft(7);
		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname === "scenes/scan-a/live.json") return { version: 7 };
			if (pathname === "scenes/scan-a/releases/7.json") return release;
			return null;
		});

		const response = await handler(
			new Request("http://localhost/api/release/scan-a"),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual(release);
	});

	it("serves an explicitly requested version without consulting the live pointer", async () => {
		const release = makeDraft(3);
		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname === "scenes/scan-a/releases/3.json") return release;
			return null;
		});

		const response = await handler(
			new Request("http://localhost/api/release/scan-a?version=3"),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual(release);
		expect(mocks.readJsonBlob).not.toHaveBeenCalledWith("scenes/scan-a/live.json");
	});

	it("falls back to the live pointer when the version param is not a number", async () => {
		const release = makeDraft(5);
		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname === "scenes/scan-a/live.json") return { version: 5 };
			if (pathname === "scenes/scan-a/releases/5.json") return release;
			return null;
		});

		const response = await handler(
			new Request("http://localhost/api/release/scan-a?version=latest"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(release);
	});

	it("returns 404 when the live pointer is missing", async () => {
		mocks.readJsonBlob.mockResolvedValue(null);

		const response = await handler(
			new Request("http://localhost/api/release/scan-a"),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Release not found" });
	});

	it("returns 404 when the release blob is missing", async () => {
		mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
			if (pathname === "scenes/scan-a/live.json") return { version: 9 };
			return null;
		});

		const response = await handler(
			new Request("http://localhost/api/release/scan-a"),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Release not found" });
	});

	it("returns 404 for a non-positive requested version", async () => {
		const response = await handler(
			new Request("http://localhost/api/release/scan-a?version=0"),
		);

		expect(response.status).toBe(404);
		expect(mocks.readJsonBlob).not.toHaveBeenCalled();
	});

	it("returns 400 for an invalid scene id path", async () => {
		const response = await handler(
			new Request("http://localhost/api/not-release/scan-a"),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid scene id" });
	});

	it("rejects non-GET methods with 405", async () => {
		const response = await handler(
			new Request("http://localhost/api/release/scan-a", { method: "POST" }),
		);

		expect(response.status).toBe(405);
	});
});
