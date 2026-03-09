import type { LivePointer, SceneDraft } from "../../src/types";
import { readJsonBlob } from "../_lib/blobStore.js";
import {
	badRequest,
	jsonResponse,
	methodNotAllowed,
	notFound,
} from "../_lib/http.js";

function extractSceneId(pathname: string) {
	const prefix = "/api/release/";
	if (!pathname.startsWith(prefix)) return null;
	const value = pathname.slice(prefix.length);
	return decodeURIComponent(value);
}

function livePath(sceneId: string) {
	return `scenes/${sceneId}/live.json`;
}

function releasePath(sceneId: string, version: number) {
	return `scenes/${sceneId}/releases/${version}.json`;
}

async function handler(request: Request) {
	if (request.method !== "GET") {
		return methodNotAllowed(["GET"]);
	}

	const url = new URL(request.url);
	const sceneId = extractSceneId(url.pathname);
	if (!sceneId) {
		return badRequest("Invalid scene id");
	}

	const requestedVersion = url.searchParams.get("version");
	let version = requestedVersion
		? Number.parseInt(requestedVersion, 10)
		: Number.NaN;

	if (!Number.isFinite(version)) {
		const live = await readJsonBlob<LivePointer>(livePath(sceneId));
		version = live?.version ?? Number.NaN;
	}

	if (!Number.isFinite(version) || version <= 0) {
		return notFound("Release not found");
	}

	const release = await readJsonBlob<SceneDraft>(releasePath(sceneId, version));
	if (!release) {
		return notFound("Release not found");
	}

	return jsonResponse(release);
}

export default { fetch: handler };
