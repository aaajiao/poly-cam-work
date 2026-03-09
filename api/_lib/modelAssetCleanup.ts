import type { ScanScene } from "../../src/types";
import { deleteBlobByPathname } from "./blobStore.js";

function blobPathnameFromUrl(value: string): string | null {
	try {
		const parsed = new URL(value);
		return decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
	} catch {
		return null;
	}
}

function isManagedModelPathname(pathname: string) {
	if (pathname.startsWith("models/")) return true;
	return /^scenes\/[^/]+\/models\//.test(pathname);
}

export async function cleanupStaleModelAssets(
	previousModels: ScanScene[],
	nextModels: ScanScene[],
) {
	const keepUrls = new Set(
		nextModels.flatMap((model) => [model.glbUrl, model.plyUrl]),
	);
	const stalePathnames = previousModels
		.flatMap((model) => [model.glbUrl, model.plyUrl])
		.filter((url) => !keepUrls.has(url))
		.map((url) => blobPathnameFromUrl(url))
		.filter(
			(pathname): pathname is string =>
				pathname !== null && isManagedModelPathname(pathname),
		);

	await Promise.allSettled(
		stalePathnames.map((pathname) => deleteBlobByPathname(pathname)),
	);
}
