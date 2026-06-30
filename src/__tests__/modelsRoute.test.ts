import { beforeEach, describe, expect, it, vi } from "vitest";

interface MutatorResult<T> {
	value: unknown;
	result: T;
}

const mocks = vi.hoisted(() => ({
	readJsonBlob: vi.fn(),
	mutateJsonBlob: vi.fn(),
	deleteBlobByPathname: vi.fn(),
	requireAuth: vi.fn(),
}));

// Captures every registry document the code commits through mutateJsonBlob, so
// tests can assert on the persisted value without depending on the underlying
// blob write primitive.
let writtenRegistries: unknown[] = [];

vi.mock("../../api/_lib/blobStore", () => ({
	readJsonBlob: mocks.readJsonBlob,
	mutateJsonBlob: mocks.mutateJsonBlob,
	deleteBlobByPathname: mocks.deleteBlobByPathname,
}));

vi.mock("../../api/_lib/auth", () => ({
	requireAuth: mocks.requireAuth,
}));

import handlerModule from "../../api/models";

const handler = handlerModule.fetch;

function postRequest(body: unknown) {
	return new Request("http://localhost/api/models", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function emptyRegistry() {
	return { version: 1, models: [] };
}

function registryWith(models: Array<{ id: string; name: string }>) {
	return {
		version: 1,
		models: models.map((m) => ({
			...m,
			glbUrl: `https://blob.vercel-storage.com/${m.id}.glb`,
			plyUrl: `https://blob.vercel-storage.com/${m.id}.ply`,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})),
	};
}

describe("models route - create-only append contract", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writtenRegistries = [];
		mocks.requireAuth.mockReturnValue(true);
		// Realistic compare-and-set stand-in: read the mocked current registry,
		// apply the mutator, capture what would be written, and return the result.
		mocks.mutateJsonBlob.mockImplementation(
			async (
				pathname: string,
				mutator: (current: unknown) => MutatorResult<unknown>,
			) => {
				const current = await mocks.readJsonBlob(pathname);
				const { value, result } = mutator(current);
				writtenRegistries.push(value);
				return result;
			},
		);
	});

	it("appends one scene to an empty registry", async () => {
		mocks.readJsonBlob.mockResolvedValueOnce(emptyRegistry());

		const response = await handler(
			postRequest({
				id: "official-scene-1",
				name: "Official Scene 1",
				glbUrl: "https://blob.vercel-storage.com/official-1.glb",
				plyUrl: "https://blob.vercel-storage.com/official-1.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.ok).toBe(true);
		expect(json.model.id).toBe("official-scene-1");
		expect(json.model.name).toBe("Official Scene 1");
		expect(json.model.glbUrl).toBe(
			"https://blob.vercel-storage.com/official-1.glb",
		);
		expect(json.model.plyUrl).toBe(
			"https://blob.vercel-storage.com/official-1.ply",
		);
		expect(typeof json.model.createdAt).toBe("number");
		expect(typeof json.model.updatedAt).toBe("number");

		expect(mocks.mutateJsonBlob).toHaveBeenCalledWith(
			"models/index.json",
			expect.any(Function),
		);
		expect(writtenRegistries[writtenRegistries.length - 1]).toEqual(
			expect.objectContaining({
				version: 1,
				models: [expect.objectContaining({ id: "official-scene-1" })],
			}),
		);
	});

	it("preserves exact sceneId without cloud- prefix or suffix", async () => {
		mocks.readJsonBlob.mockResolvedValueOnce(emptyRegistry());

		const response = await handler(
			postRequest({
				id: "scan-d",
				name: "Scan D",
				glbUrl: "https://blob.vercel-storage.com/scan-d.glb",
				plyUrl: "https://blob.vercel-storage.com/scan-d.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.model.id).toBe("scan-d");
	});

	it("leaves existing registry entries untouched when appending", async () => {
		const existingModels = [
			{ id: "scan-a", name: "Scan A" },
			{ id: "scan-b", name: "Scan B" },
		];
		mocks.readJsonBlob.mockResolvedValueOnce(registryWith(existingModels));

		const response = await handler(
			postRequest({
				id: "scan-c",
				name: "Scan C",
				glbUrl: "https://blob.vercel-storage.com/scan-c.glb",
				plyUrl: "https://blob.vercel-storage.com/scan-c.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.model.id).toBe("scan-c");

		const writtenRegistry = writtenRegistries[0] as {
			models: Array<{ id: string }>;
		};
		expect(writtenRegistry.models).toHaveLength(3);
		const ids = writtenRegistry.models.map((m) => m.id);
		expect(ids).toContain("scan-a");
		expect(ids).toContain("scan-b");
		expect(ids).toContain("scan-c");
	});

	it("returns 409 on duplicate sceneId with no write", async () => {
		mocks.readJsonBlob.mockResolvedValueOnce(
			registryWith([{ id: "collision-test", name: "Existing Scene" }]),
		);

		const response = await handler(
			postRequest({
				id: "collision-test",
				name: "Collision Attempt",
				glbUrl: "https://blob.vercel-storage.com/collision.glb",
				plyUrl: "https://blob.vercel-storage.com/collision.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(409);
		expect(json.error).toContain("already exists in registry");
		expect(writtenRegistries).toHaveLength(0);
	});

	it("does not mutate any existing entries on collision", async () => {
		const existingModel = {
			id: "immutable-test",
			name: "Existing Scene",
			glbUrl: "https://blob.vercel-storage.com/existing.glb",
			plyUrl: "https://blob.vercel-storage.com/existing.ply",
			createdAt: 1000,
			updatedAt: 2000,
		};

		mocks.readJsonBlob.mockResolvedValueOnce({
			version: 1,
			models: [existingModel],
		});

		const response = await handler(
			postRequest({
				id: "immutable-test",
				name: "Collision Attempt",
				glbUrl: "https://blob.vercel-storage.com/collision.glb",
				plyUrl: "https://blob.vercel-storage.com/collision.ply",
				createOnly: true,
			}),
		);

		expect(response.status).toBe(409);
		expect(writtenRegistries).toHaveLength(0);
	});

	it("returns 401 when not authenticated", async () => {
		mocks.requireAuth.mockReturnValue(false);

		const response = await handler(
			postRequest({
				id: "auth-test",
				name: "Auth Test",
				glbUrl: "https://blob.vercel-storage.com/auth.glb",
				plyUrl: "https://blob.vercel-storage.com/auth.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(401);
		expect(json.error).toBe("Unauthorized");
		expect(mocks.readJsonBlob).not.toHaveBeenCalled();
		expect(mocks.mutateJsonBlob).not.toHaveBeenCalled();
	});

	it("returns 400 when id is missing with createOnly", async () => {
		const response = await handler(
			postRequest({
				name: "Missing ID",
				glbUrl: "https://blob.vercel-storage.com/missing-id.glb",
				plyUrl: "https://blob.vercel-storage.com/missing-id.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.error).toContain("id is required when createOnly is true");
	});

	it("returns 400 when name is missing", async () => {
		const response = await handler(
			postRequest({
				id: "valid-id",
				glbUrl: "https://blob.vercel-storage.com/test.glb",
				plyUrl: "https://blob.vercel-storage.com/test.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.error).toContain("name, glbUrl, and plyUrl are required");
	});

	it("returns 400 when URLs are invalid", async () => {
		const response = await handler(
			postRequest({
				id: "valid-id",
				name: "Valid Name",
				glbUrl: "not-a-url",
				plyUrl: "https://blob.vercel-storage.com/test.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.error).toContain("valid HTTP(S) asset URLs");
	});

	it("returns 400 when URLs use placeholder hosts", async () => {
		const response = await handler(
			postRequest({
				id: "valid-id",
				name: "Valid Name",
				glbUrl: "https://example.com/test.glb",
				plyUrl: "https://blob.vercel-storage.com/test.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.error).toContain("valid HTTP(S) asset URLs");
	});

	it("delegates persistence to the compare-and-set helper, not a blind overwrite", async () => {
		mocks.readJsonBlob.mockResolvedValueOnce(
			registryWith([{ id: "scan-a", name: "Scan A" }]),
		);

		const response = await handler(
			postRequest({
				id: "scan-new",
				name: "Scan New",
				glbUrl: "https://blob.vercel-storage.com/scan-new.glb",
				plyUrl: "https://blob.vercel-storage.com/scan-new.ply",
				createOnly: true,
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.model.id).toBe("scan-new");
		// Persistence MUST go through mutateJsonBlob (which carries the ifMatch
		// precondition); a plain writeJsonBlob would lose concurrent updates.
		expect(mocks.mutateJsonBlob).toHaveBeenCalledTimes(1);
		expect(mocks.mutateJsonBlob).toHaveBeenCalledWith(
			"models/index.json",
			expect.any(Function),
		);
		const written = writtenRegistries[0] as { models: Array<{ id: string }> };
		expect(written.models.map((m) => m.id)).toEqual(
			expect.arrayContaining(["scan-a", "scan-new"]),
		);
	});
});

describe("models route - legacy behavior preserved", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writtenRegistries = [];
		mocks.requireAuth.mockReturnValue(true);
		mocks.mutateJsonBlob.mockImplementation(
			async (
				pathname: string,
				mutator: (current: unknown) => MutatorResult<unknown>,
			) => {
				const current = await mocks.readJsonBlob(pathname);
				const { value, result } = mutator(current);
				writtenRegistries.push(value);
				return result;
			},
		);
	});

	it("legacy create (no createOnly) still auto-generates cloud- prefixed id", async () => {
		mocks.readJsonBlob.mockResolvedValueOnce(emptyRegistry());

		const response = await handler(
			postRequest({
				name: "Legacy Scene",
				glbUrl: "https://blob.vercel-storage.com/legacy.glb",
				plyUrl: "https://blob.vercel-storage.com/legacy.ply",
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.ok).toBe(true);
		expect(json.model.id).toMatch(/^cloud-/);
	});

	it("replace: true bulk sync still works for official scenes path", async () => {
		mocks.readJsonBlob.mockResolvedValueOnce(emptyRegistry());
		mocks.deleteBlobByPathname.mockResolvedValueOnce(undefined);

		const response = await handler(
			new Request("http://localhost/api/models", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					replace: true,
					models: [
						{
							id: "scan-a",
							name: "Scan A",
							glbUrl: "https://blob.vercel-storage.com/a.glb",
							plyUrl: "https://blob.vercel-storage.com/a.ply",
						},
						{
							id: "scan-b",
							name: "Scan B",
							glbUrl: "https://blob.vercel-storage.com/b.glb",
							plyUrl: "https://blob.vercel-storage.com/b.ply",
						},
					],
				}),
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.ok).toBe(true);
		expect(json.models).toHaveLength(2);
	});
});
