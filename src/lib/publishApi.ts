import type { SceneDraft } from "@/types";

interface SaveDraftResponse {
	ok: true;
	revision: number;
	etag: string;
}

interface SaveAndPublishDraftResponse extends SaveDraftResponse {
	version: number;
}

interface PublishResponse {
	ok: true;
	version: number;
}

interface PublishDraftInput {
	message?: string;
	expectedRevision?: number;
}

interface RollbackResponse {
	ok: true;
	version: number;
}

interface PublishedVersionsResponse {
	versions: number[];
	liveVersion: number | null;
}

interface DeleteVersionResponse extends PublishedVersionsResponse {
	ok: true;
}

interface SessionResponse {
	authenticated: boolean;
}

interface ApiErrorPayload {
	error?: string;
}

type DraftResponse = SceneDraft & { draftEtag?: string | null };

interface JsonResponse<T> {
	data: T;
	response: Response;
}

// JSON API calls should fail loudly rather than wedge a UI state (e.g.
// draftStatus stuck at 'saving') when a connection stalls. Default 30s,
// overridable by passing an explicit `signal` in init.
const DEFAULT_API_TIMEOUT_MS = 30_000;

function isApiRequest(input: RequestInfo): boolean {
	if (typeof input === "string") {
		return input.startsWith("/api/");
	}

	if (input instanceof URL) {
		return input.pathname.startsWith("/api/");
	}

	try {
		const pathname = new URL(input.url).pathname;
		return pathname.startsWith("/api/");
	} catch {
		return false;
	}
}

async function requestJsonResponse<T>(
	input: RequestInfo,
	init?: RequestInit,
): Promise<JsonResponse<T>> {
	// A stalled connection surfaces as a rejected fetch (TimeoutError) that
	// propagates through the same path as any other failure, so callers never
	// wedge (e.g. draftStatus stuck at 'saving'). Overridable via init.signal.
	const response = await fetch(input, {
		credentials: "include",
		...init,
		signal: init?.signal ?? AbortSignal.timeout(DEFAULT_API_TIMEOUT_MS),
	});

	if (!response.ok) {
		let message = `Request failed with status ${response.status}`;
		const payload = (await response
			.json()
			.catch(() => null)) as ApiErrorPayload | null;
		if (
			payload &&
			typeof payload.error === "string" &&
			payload.error.length > 0
		) {
			message = payload.error;
		} else if (response.status >= 500 && isApiRequest(input)) {
			message = import.meta.env.DEV
				? "API server unavailable. Start `bun run dev:api` or `vercel dev`."
				: "Service temporarily unavailable. Please try again later.";
		}

		const error = new Error(message);
		(error as Error & { status?: number }).status = response.status;
		throw error;
	}

	return {
		data: (await response.json()) as T,
		response,
	};
}

async function requestJson<T>(
	input: RequestInfo,
	init?: RequestInit,
): Promise<T> {
	return (await requestJsonResponse<T>(input, init)).data;
}

export async function login(password: string): Promise<void> {
	await requestJson<{ ok: true }>("/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ password }),
	});
}

export async function logout(): Promise<void> {
	await requestJson<{ ok: true }>("/api/auth/logout", {
		method: "POST",
	});
}

export async function getSession(): Promise<SessionResponse> {
	return requestJson<SessionResponse>("/api/auth/session");
}

export async function getDraft(sceneId: string): Promise<DraftResponse> {
	const { data, response } = await requestJsonResponse<SceneDraft>(
		`/api/draft/${encodeURIComponent(sceneId)}`,
	);
	const headerEtag = response.headers.get("X-Draft-ETag");
	return {
		...data,
		draftEtag:
			headerEtag === null
				? undefined
				: headerEtag.length > 0
					? headerEtag
					: null,
	};
}

export async function saveDraft(
	sceneId: string,
	draft: SceneDraft,
	expectedRevision: number,
	expectedEtag?: string | null,
): Promise<SaveDraftResponse> {
	const body: Record<string, unknown> = { draft, expectedRevision };
	if (expectedEtag !== undefined) {
		body.expectedEtag = expectedEtag;
	}

	return requestJson<SaveDraftResponse>(
		`/api/draft/${encodeURIComponent(sceneId)}`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

export async function saveAndPublishDraft(
	sceneId: string,
	draft: SceneDraft,
	expectedRevision: number,
	expectedEtag?: string | null,
	message?: string,
): Promise<SaveAndPublishDraftResponse> {
	const body: Record<string, unknown> = {
		draft,
		expectedRevision,
		publish: true,
		message,
	};
	if (expectedEtag !== undefined) {
		body.expectedEtag = expectedEtag;
	}

	return requestJson<SaveAndPublishDraftResponse>(
		`/api/draft/${encodeURIComponent(sceneId)}`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

export async function publishDraft(
	sceneId: string,
	input: PublishDraftInput = {},
): Promise<PublishResponse> {
	// The client never posts a draft body: the server publishes the draft it
	// already stored under CAS at `expectedRevision`. This keeps the published
	// content identical to what saveDraft just persisted and makes the server's
	// "Invalid draft" 400 an unreachable defensive backstop for this client.
	const body: PublishDraftInput = {};
	if (typeof input.message === "string") {
		body.message = input.message;
	}
	if (typeof input.expectedRevision === "number") {
		body.expectedRevision = input.expectedRevision;
	}

	return requestJson<PublishResponse>(
		`/api/publish/${encodeURIComponent(sceneId)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

export async function getPublishedVersions(
	sceneId: string,
): Promise<PublishedVersionsResponse> {
	return requestJson<PublishedVersionsResponse>(
		`/api/publish/${encodeURIComponent(sceneId)}`,
	);
}

export async function deletePublishedVersion(
	sceneId: string,
	version: number,
): Promise<DeleteVersionResponse> {
	return requestJson<DeleteVersionResponse>(
		`/api/publish/${encodeURIComponent(sceneId)}`,
		{
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ version }),
		},
	);
}

export async function getRelease(
	sceneId: string,
	version?: number,
): Promise<SceneDraft> {
	const query = typeof version === "number" ? `?version=${version}` : "";
	return requestJson<SceneDraft>(
		`/api/release/${encodeURIComponent(sceneId)}${query}`,
	);
}

export async function rollbackRelease(
	sceneId: string,
	version: number,
): Promise<RollbackResponse> {
	return requestJson<RollbackResponse>(
		`/api/rollback/${encodeURIComponent(sceneId)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ version }),
		},
	);
}
