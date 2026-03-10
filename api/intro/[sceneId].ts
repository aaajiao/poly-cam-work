import type { IntroPreset, LivePointer } from "../../src/types";
import { requireAuth } from "../_lib/auth.js";
import { readJsonBlob, writeJsonBlob } from "../_lib/blobStore.js";
import {
	badRequest,
	jsonResponse,
	methodNotAllowed,
	notFound,
	unauthorized,
} from "../_lib/http.js";

interface SaveIntroBody {
	preset?: IntroPreset;
}

const DEFAULT_MAX_RADIUS = 50;
const DEFAULT_DURATION = 15;

function extractSceneId(pathname: string) {
	const prefix = "/api/intro/";
	if (!pathname.startsWith(prefix)) return null;
	const value = pathname.slice(prefix.length);
	return decodeURIComponent(value);
}

function introDraftPath(sceneId: string) {
	return `scenes/${sceneId}/intro/draft.json`;
}

function introReleasePath(sceneId: string, version: number) {
	return `scenes/${sceneId}/intro/releases/${version}.json`;
}

function livePath(sceneId: string) {
	return `scenes/${sceneId}/live.json`;
}

function createEmptyIntroPreset(sceneId: string): IntroPreset {
	const now = Date.now();

	return {
		version: 1,
		sceneId,
		enabled: false,
		camera: {
			position: [0, 5, 15],
			target: [0, 0, 0],
			fov: 50,
		},
		viewer: {
			viewMode: "mesh",
		},
		scan: {
			progress: 0,
			radius: 0,
			phase: "origin",
			origin: [0, 0, 0],
			maxRadius: DEFAULT_MAX_RADIUS,
			duration: DEFAULT_DURATION,
		},
		annotations: {
			openIds: [],
			triggeredIds: [],
			activeId: null,
		},
		ui: {
			ctaLabel: "Continue Scan",
		},
		createdAt: now,
		updatedAt: now,
	};
}

function asVec3(value: unknown): [number, number, number] | null {
	if (!Array.isArray(value) || value.length !== 3) return null;

	const [x, y, z] = value;
	if (
		![x, y, z].every(
			(entry) => typeof entry === "number" && Number.isFinite(entry),
		)
	) {
		return null;
	}

	return [x, y, z];
}

function normalizeIntroPreset(
	sceneId: string,
	value: unknown,
): IntroPreset | null {
	if (!value || typeof value !== "object") return null;

	const candidate = value as Partial<IntroPreset>;
	const position = asVec3(candidate.camera?.position);
	const target = asVec3(candidate.camera?.target);
	const origin = asVec3(candidate.scan?.origin);

	if (candidate.sceneId !== sceneId) return null;
	if (candidate.version !== 1) return null;
	if (typeof candidate.enabled !== "boolean") return null;
	if (!position || !target || !origin) return null;
	if (
		!candidate.viewer ||
		!["mesh", "pointcloud", "both"].includes(
			candidate.viewer.viewMode as string,
		)
	) {
		return null;
	}
	if (!candidate.scan) return null;
	if (
		typeof candidate.scan.progress !== "number" ||
		candidate.scan.progress < 0 ||
		candidate.scan.progress > 1 ||
		typeof candidate.scan.radius !== "number" ||
		!Number.isFinite(candidate.scan.radius) ||
		!["origin", "expansion", "complete"].includes(
			candidate.scan.phase as string,
		) ||
		typeof candidate.scan.maxRadius !== "number" ||
		!Number.isFinite(candidate.scan.maxRadius) ||
		typeof candidate.scan.duration !== "number" ||
		!Number.isFinite(candidate.scan.duration)
	) {
		return null;
	}
	if (
		!candidate.annotations ||
		!Array.isArray(candidate.annotations.openIds) ||
		!Array.isArray(candidate.annotations.triggeredIds) ||
		(candidate.annotations.activeId !== null &&
			typeof candidate.annotations.activeId !== "string")
	) {
		return null;
	}

	const createdAt =
		typeof candidate.createdAt === "number" &&
		Number.isFinite(candidate.createdAt)
			? candidate.createdAt
			: Date.now();
	const updatedAt =
		typeof candidate.updatedAt === "number" &&
		Number.isFinite(candidate.updatedAt)
			? candidate.updatedAt
			: createdAt;

	const panelOffsets =
		candidate.annotations.panelOffsets &&
		typeof candidate.annotations.panelOffsets === "object"
			? (candidate.annotations.panelOffsets as Record<
					string,
					{ x: number; y: number }
				>)
			: undefined;

	const mediaSizes =
		candidate.annotations.mediaSizes &&
		typeof candidate.annotations.mediaSizes === "object"
			? (candidate.annotations.mediaSizes as Record<
					string,
					{ width?: number; height?: number }
				>)
			: undefined;

	return {
		version: 1,
		sceneId,
		enabled: candidate.enabled,
		camera: {
			position,
			target,
			fov:
				typeof candidate.camera?.fov === "number" &&
				Number.isFinite(candidate.camera.fov)
					? candidate.camera.fov
					: undefined,
		},
		viewer: {
			viewMode: candidate.viewer.viewMode,
		},
		scan: {
			progress: candidate.scan.progress,
			radius: candidate.scan.radius,
			phase: candidate.scan.phase,
			origin,
			maxRadius: candidate.scan.maxRadius,
			duration: candidate.scan.duration,
		},
		annotations: {
			openIds: candidate.annotations.openIds.filter(
				(id): id is string => typeof id === "string",
			),
			triggeredIds: candidate.annotations.triggeredIds.filter(
				(id): id is string => typeof id === "string",
			),
			activeId: candidate.annotations.activeId ?? null,
			...(panelOffsets && { panelOffsets }),
			...(mediaSizes && { mediaSizes }),
		},
		ui: {
			ctaLabel:
				typeof candidate.ui?.ctaLabel === "string" &&
				candidate.ui.ctaLabel.length > 0
					? candidate.ui.ctaLabel
					: "Continue Scan",
		},
		createdAt,
		updatedAt,
	};
}

async function resolveRequestedVersion(
	sceneId: string,
	rawVersion: string | null,
) {
	if (rawVersion === "live") {
		const live = await readJsonBlob<LivePointer>(livePath(sceneId));
		return live?.version ?? null;
	}

	if (!rawVersion) return null;

	const version = Number.parseInt(rawVersion, 10);
	return Number.isFinite(version) && version > 0 ? version : null;
}

async function handler(request: Request) {
	if (request.method !== "GET" && request.method !== "PUT") {
		return methodNotAllowed(["GET", "PUT"]);
	}

	const url = new URL(request.url);
	const sceneId = extractSceneId(url.pathname);
	if (!sceneId) {
		return badRequest("Invalid scene id");
	}

	if (request.method === "GET") {
		const requestedVersionParam = url.searchParams.get("version");
		const requestedVersion = await resolveRequestedVersion(
			sceneId,
			requestedVersionParam,
		);

		if (requestedVersion !== null) {
			const introRelease = await readJsonBlob<IntroPreset>(
				introReleasePath(sceneId, requestedVersion),
			);
			if (!introRelease) {
				return notFound("Intro preset not found");
			}

			return jsonResponse(introRelease);
		}

		if (requestedVersionParam) {
			return notFound("Intro preset not found");
		}

		if (!requireAuth(request)) {
			return unauthorized();
		}

		const draft = await readJsonBlob<IntroPreset>(introDraftPath(sceneId));
		return jsonResponse(draft ?? createEmptyIntroPreset(sceneId));
	}

	if (!requireAuth(request)) {
		return unauthorized();
	}

	const body = (await request.json().catch(() => null)) as SaveIntroBody | null;
	const preset = normalizeIntroPreset(sceneId, body?.preset);
	if (!preset) {
		return badRequest("A valid intro preset is required");
	}

	const nextPreset: IntroPreset = {
		...preset,
		updatedAt: Date.now(),
	};

	await writeJsonBlob(introDraftPath(sceneId), nextPreset);

	return jsonResponse(nextPreset);
}

export default { fetch: handler };
