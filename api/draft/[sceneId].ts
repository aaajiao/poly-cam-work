import { BlobPreconditionFailedError } from "@vercel/blob";
import type { SceneDraft } from "../../src/types/index.js";
import { requireAuth } from "../_lib/auth.js";
import {
	readJsonBlobWithEtag,
	writeJsonBlobIfMatch,
} from "../_lib/blobStore.js";
import {
	badRequest,
	conflict,
	jsonResponse,
	methodNotAllowed,
	unauthorized,
} from "../_lib/http.js";
import {
	createSceneRelease,
	ReleaseVersionConflictError,
} from "../_lib/publishRelease.js";
import {
	collectImagePathnamesFromDraft,
	reconcileSceneImageAssets,
} from "../_lib/sceneAssetCleanup.js";

interface SaveDraftBody {
	draft?: SceneDraft;
	expectedRevision?: number;
	expectedEtag?: string | null;
	publish?: boolean;
	message?: string;
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

async function handler(request: Request) {
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
		const { value: draft, etag } =
			await readJsonBlobWithEtag<SceneDraft>(draftPath(sceneId));
		return jsonResponse(draft ?? createEmptyDraft(sceneId), 200, {
			"Cache-Control": "no-store",
			"X-Draft-ETag": etag ?? "",
		});
	}

	const body = (await request.json().catch(() => null)) as SaveDraftBody | null;
	if (!body || typeof body.expectedRevision !== "number" || !body.draft) {
		return badRequest("draft and expectedRevision are required");
	}

	const hasExpectedEtag = Object.prototype.hasOwnProperty.call(
		body,
		"expectedEtag",
	);
	if (
		hasExpectedEtag &&
		body.expectedEtag !== null &&
		(typeof body.expectedEtag !== "string" || body.expectedEtag.length === 0)
	) {
		return badRequest("expectedEtag must be a non-empty string or null");
	}

	let etag: string | null;
	let nextRevision: number;
	let previousImagePathnames: string[];
	if (hasExpectedEtag) {
		if (body.draft.revision !== body.expectedRevision) {
			return conflict("Revision mismatch");
		}
		// A prior GET/PUT returned this ETag together with its revision (null means
		// the GET confirmed no draft exists). Carry the pair forward and write
		// directly under CAS so an immediate save never needs a stale public body.
		etag = body.expectedEtag as string | null;
		nextRevision = body.expectedRevision + 1;
		previousImagePathnames = [];
	} else {
		// Backward-compatible path for clients that do not yet carry ETags. The
		// helper pairs the body with that same response's ETag, never head()'s ETag.
		const persisted = await readJsonBlobWithEtag<SceneDraft>(draftPath(sceneId));
		const currentDraft = persisted.value ?? createEmptyDraft(sceneId);
		if (body.expectedRevision !== currentDraft.revision) {
			return conflict("Revision mismatch");
		}

		etag = persisted.etag;
		nextRevision = currentDraft.revision + 1;
		previousImagePathnames = collectImagePathnamesFromDraft(currentDraft);
	}

	const nextDraft: SceneDraft = {
		...body.draft,
		sceneId,
		revision: nextRevision,
		updatedAt: Date.now(),
	};
	const nextImagePathnames = collectImagePathnamesFromDraft(nextDraft);

	// The legacy revision check is TOCTOU: two concurrent same-revision PUTs can
	// both pass it. The carried-ETag path intentionally skips that read, but both
	// paths write under ifMatch, so only one concurrent write can land.
	let nextEtag: string;
	try {
		const writeResult = await writeJsonBlobIfMatch(
			draftPath(sceneId),
			nextDraft,
			etag,
		);
		if (typeof writeResult.etag !== "string" || writeResult.etag.length === 0) {
			throw new Error("Draft write response did not include an ETag");
		}
		nextEtag = writeResult.etag;
	} catch (error) {
		if (error instanceof BlobPreconditionFailedError) {
			return conflict("Revision mismatch");
		}
		throw error;
	}

	try {
		await reconcileSceneImageAssets(
			sceneId,
			previousImagePathnames,
			nextImagePathnames,
		);
	} catch (error) {
		console.error("Failed to reconcile scene images after draft save", error);
	}

	if (body.publish === true) {
		try {
			const { version } = await createSceneRelease({
				sceneId,
				draft: nextDraft,
				message: body.message,
			});
			return jsonResponse({
				ok: true,
				revision: nextRevision,
				etag: nextEtag,
				version,
			});
		} catch (error) {
			if (error instanceof ReleaseVersionConflictError) {
				return conflict(error.message);
			}
			throw error;
		}
	}

	return jsonResponse({ ok: true, revision: nextRevision, etag: nextEtag });
}

export default { fetch: handler };
