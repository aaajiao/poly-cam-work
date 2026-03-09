import { del, list, put } from "@vercel/blob";
import { getBlobReadWriteToken } from "./blobToken.js";

interface BlobItem {
	url: string;
	pathname: string;
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

export async function readJsonBlob<T>(pathname: string): Promise<T | null> {
	const url = await getBlobUrlByPath(pathname);
	if (!url) return null;

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
