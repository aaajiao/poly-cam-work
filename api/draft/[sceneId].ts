import type { SceneDraft } from "../../src/types";
import { requireAuth } from "../_lib/auth.js";
import { readJsonBlob, writeJsonBlob } from "../_lib/blobStore.js";
import {
	badRequest,
	conflict,
	jsonResponse,
	methodNotAllowed,
	unauthorized,
} from "../_lib/http.js";
import {
	collectImagePathnamesFromDraft,
	reconcileSceneImageAssets,
} from "../_lib/sceneAssetCleanup.js";

interface SaveDraftBody {
	draft?: SceneDraft;
	expectedRevision?: number;
}

function extractSceneId(pathname: string) {
	const prefix = "/api/draft/";
	if (!pathname.startsWith(prefix)) return null;
	const value = pathname.slice(prefix.length);
	return decodeURIComponent(value);
}

function draftPath(sceneId: string) {
	return `scenes/${sceneId}/draft.json`;
}

function createEmptyDraft(sceneId: string): SceneDraft {
	return {
		sceneId,
		revision: 0,
		annotations: [],
		updatedAt: Date.now(),
	};
}

export default async function handler(request: Request) {
	if (request.method !== "GET" && request.method !== "PUT") {
		return methodNotAllowed(["GET", "PUT"]);
	}

	if (!requireAuth(request)) {
		return unauthorized();
	}

	const sceneId = extractSceneId(new URL(request.url).pathname);
	if (!sceneId) {
		return badRequest("Invalid scene id");
	}

	if (request.method === "GET") {
		const draft = await readJsonBlob<SceneDraft>(draftPath(sceneId));
		return jsonResponse(draft ?? createEmptyDraft(sceneId));
	}

	const body = (await request.json().catch(() => null)) as SaveDraftBody | null;
	if (!body || typeof body.expectedRevision !== "number" || !body.draft) {
		return badRequest("draft and expectedRevision are required");
	}

	const currentDraft =
		(await readJsonBlob<SceneDraft>(draftPath(sceneId))) ??
		createEmptyDraft(sceneId);
	if (body.expectedRevision !== currentDraft.revision) {
		return conflict("Revision mismatch");
	}

	const previousImagePathnames = collectImagePathnamesFromDraft(currentDraft);

	const nextRevision = currentDraft.revision + 1;
	const nextDraft: SceneDraft = {
		...body.draft,
		sceneId,
		revision: nextRevision,
		updatedAt: Date.now(),
	};
	const nextImagePathnames = collectImagePathnamesFromDraft(nextDraft);

	await writeJsonBlob(draftPath(sceneId), nextDraft);

	try {
		await reconcileSceneImageAssets(
			sceneId,
			previousImagePathnames,
			nextImagePathnames,
		);
	} catch (error) {
		console.error("Failed to reconcile scene images after draft save", error);
	}

	return jsonResponse({ ok: true, revision: nextRevision });
}
