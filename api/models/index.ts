import type { ScanScene } from "../../src/types";
import { requireAuth } from "../_lib/auth.js";
import {
	badRequest,
	conflict,
	jsonResponse,
	methodNotAllowed,
	unauthorized,
} from "../_lib/http.js";
import {
	createModelCreateOnlyWithRetry,
	createModelWithRetry,
	readModelRegistry,
	replaceModelsWithRetry,
	upsertModelByIdWithRetry,
} from "../_lib/modelRegistry.js";
import { isValidAssetUrl, sanitizeSceneId } from "../_lib/modelValidation.js";

interface CreateModelBody {
	id?: string;
	name?: string;
	glbUrl?: string;
	plyUrl?: string;
	mergeById?: boolean;
	createOnly?: boolean;
}

interface ReplaceModelInput {
	id: string;
	name: string;
	glbUrl: string;
	plyUrl: string;
}

interface ReplaceModelsBody {
	replace: true;
	models: ReplaceModelInput[];
}

function isReplaceModelsBody(value: unknown): value is ReplaceModelsBody {
	if (!value || typeof value !== "object") return false;

	const candidate = value as { replace?: unknown; models?: unknown };
	return candidate.replace === true && Array.isArray(candidate.models);
}

export default async function handler(request: Request) {
	if (request.method !== "GET" && request.method !== "POST") {
		return methodNotAllowed(["GET", "POST"]);
	}

	if (request.method === "GET") {
		const registry = await readModelRegistry();
		return jsonResponse({ models: registry.models });
	}

	if (!requireAuth(request)) {
		return unauthorized();
	}

	const body = (await request.json().catch(() => null)) as unknown;

	if (isReplaceModelsBody(body)) {
		if (body.models.length === 0) {
			return badRequest("models must contain at least one item");
		}

		const normalizedModels: ReplaceModelInput[] = [];
		const seenIds = new Set<string>();

		for (const model of body.models) {
			if (!model || typeof model !== "object") {
				return badRequest("models must contain valid objects");
			}

			const input = model as Partial<ReplaceModelInput>;
			if (
				typeof input.id !== "string" ||
				typeof input.name !== "string" ||
				typeof input.glbUrl !== "string" ||
				typeof input.plyUrl !== "string"
			) {
				return badRequest("each model requires id, name, glbUrl, and plyUrl");
			}

			const id = sanitizeSceneId(input.id);
			const name = input.name.trim();
			const glbUrl = input.glbUrl.trim();
			const plyUrl = input.plyUrl.trim();
			if (!id || !name || !glbUrl || !plyUrl) {
				return badRequest("model fields must be non-empty");
			}

			if (!isValidAssetUrl(glbUrl) || !isValidAssetUrl(plyUrl)) {
				return badRequest("glbUrl and plyUrl must be valid HTTP(S) asset URLs");
			}

			if (seenIds.has(id)) {
				return badRequest("models must contain unique ids");
			}

			seenIds.add(id);
			normalizedModels.push({
				id,
				name,
				glbUrl,
				plyUrl,
			});
		}

		const models = await replaceModelsWithRetry(normalizedModels);
		return jsonResponse({ ok: true, models });
	}

	const createBody = body as CreateModelBody | null;
	if (
		!createBody ||
		typeof createBody.name !== "string" ||
		typeof createBody.glbUrl !== "string" ||
		typeof createBody.plyUrl !== "string"
	) {
		return badRequest("name, glbUrl, and plyUrl are required");
	}

	const name = createBody.name.trim();
	const glbUrl = createBody.glbUrl.trim();
	const plyUrl = createBody.plyUrl.trim();
	if (!name || !glbUrl || !plyUrl) {
		return badRequest("name, glbUrl, and plyUrl must be non-empty");
	}

	const requestedId =
		typeof createBody.id === "string" ? sanitizeSceneId(createBody.id) : "";
	if (createBody.mergeById && !requestedId) {
		return badRequest("id is required when mergeById is true");
	}
	if (createBody.createOnly && !requestedId) {
		return badRequest("id is required when createOnly is true");
	}

	if (!isValidAssetUrl(glbUrl) || !isValidAssetUrl(plyUrl)) {
		return badRequest("glbUrl and plyUrl must be valid HTTP(S) asset URLs");
	}

	let model: ScanScene;
	try {
		if (createBody.createOnly) {
			model = await createModelCreateOnlyWithRetry({
				requestedId,
				name,
				glbUrl,
				plyUrl,
			});
		} else if (createBody.mergeById) {
			model = await upsertModelByIdWithRetry({
				id: requestedId,
				name,
				glbUrl,
				plyUrl,
			});
		} else {
			model = await createModelWithRetry({
				requestedId,
				name,
				glbUrl,
				plyUrl,
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		if (
			error instanceof Error &&
			error.message.includes("already exists in registry")
		) {
			return conflict(message);
		}

		return jsonResponse({ error: message }, 500);
	}

	return jsonResponse({ ok: true, model });
}
