import type { SceneDraft } from "../../src/types";
import { requireAuth } from "../_lib/auth.js";
import { readJsonBlob, writeJsonBlob } from "../_lib/blobStore.js";
import {
	badRequest,
	jsonResponse,
	methodNotAllowed,
	notFound,
	unauthorized,
} from "../_lib/http.js";
import {
	collectImagePathnamesFromDraft,
	reconcileSceneImageAssets,
} from "../_lib/sceneAssetCleanup.js";

interface RollbackBody {
	version?: number;
}

function extractSceneId(pathname: string) {
	const prefix = "/api/rollback/";
	if (!pathname.startsWith(prefix)) return null;
	const value = pathname.slice(prefix.length);
	return decodeURIComponent(value);
}

function livePath(sceneId: string) {
	return `scenes/${sceneId}/live.json`;
}

function draftPath(sceneId: string) {
	return `scenes/${sceneId}/draft.json`;
}

function releasePath(sceneId: string, version: number) {
	return `scenes/${sceneId}/releases/${version}.json`;
}

export default async function handler(request: Request) {
	if (request.method !== "POST") {
		return methodNotAllowed(["POST"]);
	}

	if (!requireAuth(request)) {
		return unauthorized();
	}

	const sceneId = extractSceneId(new URL(request.url).pathname);
	if (!sceneId) {
		return badRequest("Invalid scene id");
	}

	const body = (await request.json().catch(() => null)) as RollbackBody | null;
	const version = body?.version;
	if (!Number.isFinite(version) || !version || version <= 0) {
		return badRequest("version must be a positive number");
	}

	const release = await readJsonBlob<SceneDraft>(releasePath(sceneId, version));
	if (!release) {
		return notFound("Release not found");
	}

	const currentDraft = await readJsonBlob<SceneDraft>(draftPath(sceneId));
	const previousImagePathnames = currentDraft
		? collectImagePathnamesFromDraft(currentDraft)
		: [];
	const nextDraft: SceneDraft = {
		...release,
		revision: (currentDraft?.revision ?? release.revision) + 1,
		updatedAt: Date.now(),
	};
	const nextImagePathnames = collectImagePathnamesFromDraft(nextDraft);

	await writeJsonBlob(livePath(sceneId), { version });
	await writeJsonBlob(draftPath(sceneId), nextDraft);

	try {
		await reconcileSceneImageAssets(
			sceneId,
			previousImagePathnames,
			nextImagePathnames,
		);
	} catch (error) {
		console.error("Failed to reconcile scene images after rollback", error);
	}

	return jsonResponse({ ok: true, version });
}
