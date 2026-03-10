import type { IntroPreset } from "@/types";

interface ApiErrorPayload {
	error?: string;
}

async function requestJson<T>(
	input: RequestInfo,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(input, {
		credentials: "include",
		...init,
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
		}

		const error = new Error(message);
		(error as Error & { status?: number }).status = response.status;
		throw error;
	}

	return (await response.json()) as T;
}

export async function getIntroDraft(sceneId: string): Promise<IntroPreset> {
	return requestJson<IntroPreset>(`/api/intro/${encodeURIComponent(sceneId)}`);
}

export async function saveIntroDraft(
	sceneId: string,
	preset: IntroPreset,
): Promise<IntroPreset> {
	return requestJson<IntroPreset>(`/api/intro/${encodeURIComponent(sceneId)}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ preset }),
	});
}

export async function getIntroRelease(
	sceneId: string,
	version: number | "live",
): Promise<IntroPreset> {
	return requestJson<IntroPreset>(
		`/api/intro/${encodeURIComponent(sceneId)}?version=${encodeURIComponent(String(version))}`,
	);
}
