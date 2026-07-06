import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { requireAuth } from "../_lib/auth.js";
import { getBlobReadWriteToken } from "../_lib/blobToken.js";
import { badRequest, methodNotAllowed, unauthorized } from "../_lib/http.js";

export const ALLOWED_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
];

// Cap the token so it cannot authorize an unbounded blob upload.
const MAX_MEDIA_UPLOAD_BYTES = 25 * 1024 * 1024;

interface MediaUploadPayload {
	sceneId?: string;
	annotationId?: string;
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
	sceneId: string;
	annotationId: string;
} {
	if (!payload) {
		throw new Error("Missing upload metadata");
	}

	const parsed = JSON.parse(payload) as MediaUploadPayload;
	const sceneId =
		typeof parsed.sceneId === "string" ? sanitizeSegment(parsed.sceneId) : "";
	const annotationId =
		typeof parsed.annotationId === "string"
			? sanitizeSegment(parsed.annotationId)
			: "";

	if (!sceneId || !annotationId) {
		throw new Error("Invalid upload metadata");
	}

	return { sceneId, annotationId };
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
				const { sceneId, annotationId } = parseClientPayload(clientPayload);
				const expectedPrefix = `scenes/${sceneId}/images/${annotationId}/`;
				if (!pathname.startsWith(expectedPrefix)) {
					throw new Error("Invalid upload path");
				}

				return {
					allowedContentTypes: ALLOWED_CONTENT_TYPES,
					addRandomSuffix: false,
					maximumSizeInBytes: MAX_MEDIA_UPLOAD_BYTES,
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
