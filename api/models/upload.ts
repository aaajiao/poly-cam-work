import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { requireAuth } from "../_lib/auth.js";
import { getBlobReadWriteToken } from "../_lib/blobToken.js";
import { badRequest, methodNotAllowed, unauthorized } from "../_lib/http.js";

const ALLOWED_MODEL_CONTENT_TYPES = [
	"model/gltf-binary",
	"model/gltf+json",
	"application/octet-stream",
	"application/gltf-buffer",
	"text/plain",
];

// Cap the token so it cannot authorize an unbounded blob upload.
const MAX_MODEL_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

interface ModelUploadPayload {
	kind?: "glb" | "ply";
	sceneKey?: string;
}

function sanitizeSegment(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function parseClientPayload(payload: string | null | undefined): {
	kind: "glb" | "ply";
	sceneKey: string;
} {
	if (!payload) {
		throw new Error("Missing upload metadata");
	}

	const parsed = JSON.parse(payload) as ModelUploadPayload;
	const kind = parsed.kind;
	const sceneKey =
		typeof parsed.sceneKey === "string" ? sanitizeSegment(parsed.sceneKey) : "";

	if ((kind !== "glb" && kind !== "ply") || !sceneKey) {
		throw new Error("Invalid upload metadata");
	}

	return {
		kind,
		sceneKey,
	};
}

async function handler(request: Request) {
	if (request.method !== "POST") {
		return methodNotAllowed(["POST"]);
	}

	const body = (await request
		.json()
		.catch(() => null)) as HandleUploadBody | null;
	if (!body) {
		return badRequest("Invalid upload body");
	}

	// Only client-token generation is user-initiated and must be authenticated.
	// The blob.upload-completed callback is a server-to-server request from
	// Vercel that carries no session cookie, so gating the whole handler on auth
	// would 401 that callback.
	if (body.type === "blob.generate-client-token" && !requireAuth(request)) {
		return unauthorized();
	}

	let response: Awaited<ReturnType<typeof handleUpload>>;
	try {
		response = await handleUpload({
			body,
			request,
			token: getBlobReadWriteToken(),
			onBeforeGenerateToken: async (pathname, clientPayload) => {
				const { kind, sceneKey } = parseClientPayload(clientPayload);
				const expectedPrefix = `scenes/${sceneKey}/models/${kind}-`;
				if (!pathname.startsWith(expectedPrefix)) {
					throw new Error("Invalid upload path");
				}

				return {
					allowedContentTypes: ALLOWED_MODEL_CONTENT_TYPES,
					addRandomSuffix: false,
					maximumSizeInBytes: MAX_MODEL_UPLOAD_BYTES,
				};
			},
			onUploadCompleted: async () => {
				return;
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to create upload token";
		return badRequest(message);
	}

	return new Response(JSON.stringify(response), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});
}

export default { fetch: handler };
