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

export default async function handler(request: Request) {
	if (request.method !== "POST") {
		return methodNotAllowed(["POST"]);
	}

	if (!requireAuth(request)) {
		return unauthorized();
	}

	const body = (await request
		.json()
		.catch(() => null)) as HandleUploadBody | null;
	if (!body) {
		return badRequest("Invalid upload body");
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
