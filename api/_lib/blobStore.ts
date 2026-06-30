import {
	BlobNotFoundError,
	BlobPreconditionFailedError,
	del,
	head,
	list,
	put,
} from "@vercel/blob";
import { getBlobReadWriteToken } from "./blobToken.js";

interface BlobItem {
	url: string;
	pathname: string;
}

export interface JsonBlobWithEtag<T> {
	value: T | null;
	etag: string | null;
}

export async function listBlobsByPrefix(prefix: string): Promise<BlobItem[]> {
	const blobs: BlobItem[] = [];
	let cursor: string | undefined;
	const token = getBlobReadWriteToken();

	do {
		const page = await list({
			prefix,
			limit: 1000,
			cursor,
			token,
		});

		blobs.push(
			...page.blobs.map((blob) => ({
				url: blob.url,
				pathname: blob.pathname,
			})),
		);

		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor);

	return blobs;
}

export async function deleteBlobByPathname(pathname: string): Promise<boolean> {
	const blobs = await listBlobsByPrefix(pathname);
	const target = blobs.find((blob) => blob.pathname === pathname);
	if (!target) return false;

	await del(target.url, { token: getBlobReadWriteToken() });
	return true;
}

async function getBlobUrlByPath(pathname: string) {
	const token = getBlobReadWriteToken();
	const { blobs } = await list({
		prefix: pathname,
		limit: 100,
		token,
	});

	const exact = blobs.find((blob) => blob.pathname === pathname);
	return exact?.url ?? null;
}

async function fetchJsonFromUrl<T>(url: string): Promise<T | null> {
	const cacheBypassUrl = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
	const response = await fetch(cacheBypassUrl, {
		cache: "no-store",
		headers: {
			"Cache-Control": "no-cache, no-store, max-age=0",
		},
	});
	if (!response.ok) return null;
	return (await response.json()) as T;
}

export async function readJsonBlob<T>(pathname: string): Promise<T | null> {
	const url = await getBlobUrlByPath(pathname);
	if (!url) return null;
	return fetchJsonFromUrl<T>(url);
}

/**
 * Reads a JSON blob together with its current ETag so the value can be written
 * back with an optimistic-concurrency precondition (ifMatch). The ETag is read
 * via head() BEFORE the body is fetched, so the ETag is never newer than the
 * body it accompanies — this keeps compare-and-set safe even under CDN lag.
 */
export async function readJsonBlobWithEtag<T>(
	pathname: string,
): Promise<JsonBlobWithEtag<T>> {
	const token = getBlobReadWriteToken();

	let meta: Awaited<ReturnType<typeof head>>;
	try {
		meta = await head(pathname, { token });
	} catch (error) {
		if (error instanceof BlobNotFoundError) {
			return { value: null, etag: null };
		}
		throw error;
	}

	const value = await fetchJsonFromUrl<T>(meta.url);
	return { value, etag: meta.etag };
}

export async function writeJsonBlob(pathname: string, value: unknown) {
	const token = getBlobReadWriteToken();
	await put(pathname, JSON.stringify(value), {
		access: "public",
		addRandomSuffix: false,
		allowOverwrite: true,
		contentType: "application/json",
		token,
	});
}

/**
 * Conditional write: when `etag` is provided the put only succeeds if the blob
 * still matches that ETag (throws BlobPreconditionFailedError otherwise); when
 * `etag` is null the put is create-only (allowOverwrite:false) and throws if
 * the blob already exists. Both are the building blocks of compare-and-set.
 */
export async function writeJsonBlobIfMatch(
	pathname: string,
	value: unknown,
	etag: string | null,
) {
	const token = getBlobReadWriteToken();
	await put(pathname, JSON.stringify(value), {
		access: "public",
		addRandomSuffix: false,
		allowOverwrite: etag !== null,
		ifMatch: etag ?? undefined,
		contentType: "application/json",
		token,
	});
}

export async function writeImmutableJsonBlob(pathname: string, value: unknown) {
	const token = getBlobReadWriteToken();
	await put(pathname, JSON.stringify(value), {
		access: "public",
		addRandomSuffix: false,
		allowOverwrite: false,
		contentType: "application/json",
		token,
	});
}

/**
 * Generic read-modify-write against a JSON blob with real compare-and-set.
 *
 * Reads the current value + ETag, applies `mutator`, then writes with an
 * ifMatch precondition (or create-only when the blob does not yet exist). If a
 * concurrent writer changed the blob in between, the put throws
 * BlobPreconditionFailedError and we re-read + re-apply the mutator, up to
 * `retries` times. Any error thrown by the mutator itself propagates
 * immediately (it is a caller-level rejection, not a concurrency conflict).
 */
export async function mutateJsonBlob<TCurrent, TResult>(
	pathname: string,
	mutator: (current: TCurrent | null) => { value: unknown; result: TResult },
	options?: { retries?: number },
): Promise<TResult> {
	const retries = options?.retries ?? 4;
	let lastError: unknown;

	for (let attempt = 0; attempt < retries; attempt += 1) {
		const { value: current, etag } =
			await readJsonBlobWithEtag<TCurrent>(pathname);
		const { value, result } = mutator(current);

		try {
			await writeJsonBlobIfMatch(pathname, value, etag);
			return result;
		} catch (error) {
			if (error instanceof BlobPreconditionFailedError) {
				lastError = error;
				continue;
			}
			throw error;
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Failed to persist blob update after concurrent retries");
}
