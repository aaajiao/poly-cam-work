import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock at the @vercel/blob (and global fetch) boundary — NOT blobStore itself —
// so the compare-and-set / strict-read semantics of blobStore run for real.
const mocks = vi.hoisted(() => {
	class BlobNotFoundError extends Error {}
	class BlobPreconditionFailedError extends Error {}
	return {
		head: vi.fn(),
		put: vi.fn(),
		list: vi.fn(),
		del: vi.fn(),
		BlobNotFoundError,
		BlobPreconditionFailedError,
	};
});

vi.mock("@vercel/blob", () => ({
	head: mocks.head,
	put: mocks.put,
	list: mocks.list,
	del: mocks.del,
	BlobNotFoundError: mocks.BlobNotFoundError,
	BlobPreconditionFailedError: mocks.BlobPreconditionFailedError,
}));

import {
	mutateJsonBlob,
	readJsonBlob,
	readJsonBlobStrict,
	readJsonBlobWithEtag,
	writeImmutableJsonBlob,
	writeJsonBlobIfMatch,
} from "../../api/_lib/blobStore";

function jsonResponse(
	body: unknown,
	ok = true,
	status = 200,
	etag: string | null = "etag-body",
) {
	return {
		ok,
		status,
		headers: {
			get: (name: string) =>
				name.toLowerCase() === "etag" ? etag : null,
		},
		json: async () => body,
	} as unknown as Response;
}

function putResult(etag: string) {
	return {
		url: "https://blob.example/scenes/x/draft.json",
		downloadUrl: "https://blob.example/scenes/x/draft.json?download=1",
		pathname: "scenes/x/draft.json",
		contentType: "application/json",
		contentDisposition: 'inline; filename="draft.json"',
		etag,
	};
}

const fetchMock = vi.fn();

describe("blobStore", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.POLYCAM_BLOB_READ_WRITE_TOKEN = "test-token";
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("pairs a stale public body with that response's ETag, not a newer head ETag", async () => {
		mocks.head.mockResolvedValue({
			url: "https://blob.example/scenes/x/draft.json",
			etag: "etag-head-new",
		});
		fetchMock.mockResolvedValue(
			jsonResponse({ revision: 1 }, true, 200, "etag-body-old"),
		);

		const { value, etag } = await readJsonBlobWithEtag<{ revision: number }>(
			"scenes/x/draft.json",
		);

		expect(value).toEqual({ revision: 1 });
		expect(etag).toBe("etag-body-old");
		// head() locates the Blob, but its newer ETag is never paired with the
		// stale body returned by the public URL.
		expect(mocks.head).toHaveBeenCalledWith("scenes/x/draft.json", {
			token: "test-token",
		});

		mocks.put.mockResolvedValue(putResult("etag-write-new"));
		const writeResult = await writeJsonBlobIfMatch(
			"scenes/x/draft.json",
			{ revision: 2 },
			etag,
		);

		expect(mocks.put).toHaveBeenCalledWith(
			"scenes/x/draft.json",
			JSON.stringify({ revision: 2 }),
			expect.objectContaining({
				allowOverwrite: true,
				ifMatch: "etag-body-old",
			}),
		);
		expect(writeResult).toEqual(putResult("etag-write-new"));
	});

	it("throws when the body fetch fails or omits its ETag", async () => {
		mocks.head.mockResolvedValue({
			url: "https://blob.example/scenes/x/draft.json",
			etag: "etag-head",
		});
		fetchMock.mockResolvedValueOnce(jsonResponse(null, false, 503));

		await expect(
			readJsonBlobWithEtag("scenes/x/draft.json"),
		).rejects.toThrow(/HTTP 503/);

		fetchMock.mockResolvedValueOnce(
			jsonResponse({ revision: 1 }, true, 200, null),
		);
		await expect(
			readJsonBlobWithEtag("scenes/x/draft.json"),
		).rejects.toThrow(/missing an ETag/);
	});

	it("returns null etag when the blob does not exist (BlobNotFoundError)", async () => {
		mocks.head.mockRejectedValue(new mocks.BlobNotFoundError());

		const result = await readJsonBlobWithEtag("scenes/x/draft.json");

		expect(result).toEqual({ value: null, etag: null });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does a create-only write (allowOverwrite:false) when etag is null", async () => {
		mocks.put.mockResolvedValue(putResult("etag-created"));

		const result = await writeJsonBlobIfMatch(
			"scenes/x/draft.json",
			{ revision: 1 },
			null,
		);

		expect(mocks.put).toHaveBeenCalledWith(
			"scenes/x/draft.json",
			JSON.stringify({ revision: 1 }),
			expect.objectContaining({
				allowOverwrite: false,
				ifMatch: undefined,
			}),
		);
		expect(result.etag).toBe("etag-created");
	});

	describe("mutateJsonBlob", () => {
		it("retries after a precondition failure and then succeeds", async () => {
			mocks.head
				.mockResolvedValueOnce({ url: "https://blob.example/a", etag: "e1" })
				.mockResolvedValueOnce({ url: "https://blob.example/a", etag: "e2" });
			fetchMock
				.mockResolvedValueOnce(jsonResponse({ count: 1 }, true, 200, "e1"))
				.mockResolvedValueOnce(jsonResponse({ count: 2 }, true, 200, "e2"));
			mocks.put
				.mockRejectedValueOnce(new mocks.BlobPreconditionFailedError())
				.mockResolvedValueOnce(putResult("e3"));

			const result = await mutateJsonBlob<{ count: number }, number>(
				"scenes/x/live.json",
				(current) => {
					const next = (current?.count ?? 0) + 1;
					return { value: { count: next }, result: next };
				},
			);

			// Second read saw count:2, so the mutator produced count:3.
			expect(result).toBe(3);
			expect(mocks.put).toHaveBeenCalledTimes(2);
			// The winning write carried the freshly re-read ETag.
			expect(mocks.put).toHaveBeenLastCalledWith(
				"scenes/x/live.json",
				JSON.stringify({ count: 3 }),
				expect.objectContaining({ ifMatch: "e2" }),
			);
		});

		it("throws once retries are exhausted by repeated precondition failures", async () => {
			mocks.head.mockResolvedValue({ url: "https://blob.example/a", etag: "e" });
			fetchMock.mockResolvedValue(jsonResponse({ count: 0 }));
			const preconditionError = new mocks.BlobPreconditionFailedError();
			mocks.put.mockRejectedValue(preconditionError);

			await expect(
				mutateJsonBlob(
					"scenes/x/live.json",
					() => ({ value: { count: 1 }, result: 1 }),
					{ retries: 2 },
				),
			).rejects.toBe(preconditionError);

			expect(mocks.put).toHaveBeenCalledTimes(2);
		});

		it("propagates a non-precondition error without retrying", async () => {
			mocks.head.mockResolvedValue({ url: "https://blob.example/a", etag: "e" });
			fetchMock.mockResolvedValue(jsonResponse({ count: 0 }));
			mocks.put.mockRejectedValue(new Error("network down"));

			await expect(
				mutateJsonBlob("scenes/x/live.json", () => ({
					value: { count: 1 },
					result: 1,
				})),
			).rejects.toThrow("network down");

			expect(mocks.put).toHaveBeenCalledTimes(1);
		});
	});

	it("writeImmutableJsonBlob refuses to overwrite an existing blob", async () => {
		mocks.put.mockResolvedValue(undefined);

		await writeImmutableJsonBlob("scenes/x/releases/1.json", { version: 1 });

		const options = mocks.put.mock.calls[0][2];
		expect(options.allowOverwrite).toBe(false);
		expect(options.ifMatch).toBeUndefined();

		// A collision on an existing immutable release must propagate.
		mocks.put.mockRejectedValueOnce(new mocks.BlobPreconditionFailedError());
		await expect(
			writeImmutableJsonBlob("scenes/x/releases/1.json", { version: 1 }),
		).rejects.toBeInstanceOf(mocks.BlobPreconditionFailedError);
	});

	describe("strict read", () => {
		it("throws when a listed blob's body cannot be fetched (transient 5xx)", async () => {
			mocks.list.mockResolvedValue({
				blobs: [
					{
						url: "https://blob.example/scenes/x/draft.json",
						pathname: "scenes/x/draft.json",
					},
				],
			});
			fetchMock.mockResolvedValue(jsonResponse(null, false, 503));

			await expect(
				readJsonBlobStrict("scenes/x/draft.json"),
			).rejects.toThrow(/HTTP 503/);
		});

		it("returns null when the blob is genuinely absent from the listing", async () => {
			mocks.list.mockResolvedValue({ blobs: [] });

			await expect(readJsonBlobStrict("scenes/x/draft.json")).resolves.toBeNull();
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("non-strict readJsonBlob collapses a failed body fetch to null", async () => {
			mocks.list.mockResolvedValue({
				blobs: [
					{
						url: "https://blob.example/scenes/x/draft.json",
						pathname: "scenes/x/draft.json",
					},
				],
			});
			fetchMock.mockResolvedValue(jsonResponse(null, false, 500));

			await expect(readJsonBlob("scenes/x/draft.json")).resolves.toBeNull();
		});
	});
});
