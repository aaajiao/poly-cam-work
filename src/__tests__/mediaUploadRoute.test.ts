import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLOB_READ_WRITE_TOKEN_ENV_NAME } from "../../api/_lib/blobToken";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	handleUpload: vi.fn(),
}));

vi.mock("../../api/_lib/auth", () => ({
	requireAuth: mocks.requireAuth,
}));

vi.mock("@vercel/blob/client", () => ({
	handleUpload: mocks.handleUpload,
}));

import handler from "../../api/media/upload";

const originalBlobToken = process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME];

describe("media upload route auth behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.handleUpload.mockResolvedValue({ ok: true });
		process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME] = "test-blob-token";
	});

	afterEach(() => {
		if (originalBlobToken === undefined) {
			delete process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME];
			return;
		}

		process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME] = originalBlobToken;
	});

	it("requires auth for client token generation", async () => {
		mocks.requireAuth.mockReturnValue(false);

		const request = new Request("http://localhost/api/media/upload", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type: "blob.generate-client-token",
				payload: {
					pathname: "scenes/scan-a/images/ann-1/test.gif",
					clientPayload: JSON.stringify({
						sceneId: "scan-a",
						annotationId: "ann-1",
					}),
				},
			}),
		});

		const response = await handler(request);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body).toEqual({ error: "Unauthorized" });
		expect(mocks.handleUpload).not.toHaveBeenCalled();
	});

	it("allows upload completed callback without auth cookie", async () => {
		mocks.requireAuth.mockReturnValue(false);

		const request = new Request("http://localhost/api/media/upload", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type: "blob.upload-completed",
				payload: {
					pathname: "scenes/scan-a/images/ann-1/test.gif",
					url: "https://blob.example/scenes/scan-a/images/ann-1/test.gif",
				},
			}),
		});

		const response = await handler(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ ok: true });
		expect(mocks.handleUpload).toHaveBeenCalledTimes(1);
	});
});
