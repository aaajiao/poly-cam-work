import { requestJson } from "@/lib/publishApi";
import type { IntroPreset } from "@/types";

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
