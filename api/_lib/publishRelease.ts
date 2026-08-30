import { BlobPreconditionFailedError } from "@vercel/blob";
import type {
	IntroPreset,
	LivePointer,
	SceneDraft,
} from "../../src/types/index.js";
import {
	deleteBlobByPathname,
	listBlobsByPrefix,
	mutateJsonBlob,
	readJsonBlob,
	writeImmutableJsonBlob,
} from "./blobStore.js";
import {
	collectImagePathnamesFromDraft,
	reconcileSceneImageAssets,
} from "./sceneAssetCleanup.js";

interface CreateSceneReleaseInput {
	sceneId: string;
	draft: SceneDraft;
	message?: string;
}

export interface CreateSceneReleaseResult {
	version: number;
}

export class ReleaseVersionConflictError extends Error {
	constructor() {
		super("Release version conflict, please retry");
		this.name = "ReleaseVersionConflictError";
	}
}

function livePath(sceneId: string) {
	return `scenes/${sceneId}/live.json`;
}

function releasePath(sceneId: string, version: number) {
	return `scenes/${sceneId}/releases/${version}.json`;
}

function introDraftPath(sceneId: string) {
	return `scenes/${sceneId}/intro/draft.json`;
}

function introReleasePath(sceneId: string, version: number) {
	return `scenes/${sceneId}/intro/releases/${version}.json`;
}

function releasesPrefix(sceneId: string) {
	return `scenes/${sceneId}/releases/`;
}

function releaseVersionFromPath(pathname: string): number | null {
	const match = pathname.match(/\/releases\/(\d+)\.json$/);
	if (!match) return null;

	const version = Number.parseInt(match[1], 10);
	return Number.isFinite(version) && version > 0 ? version : null;
}

async function listReleaseVersions(sceneId: string): Promise<number[]> {
	const blobs = await listBlobsByPrefix(releasesPrefix(sceneId));
	const versions = blobs
		.map((blob) => releaseVersionFromPath(blob.pathname))
		.filter((version): version is number => version !== null);

	return Array.from(new Set(versions)).sort((a, b) => b - a);
}

export async function createSceneRelease({
	sceneId,
	draft,
	message,
}: CreateSceneReleaseInput): Promise<CreateSceneReleaseResult> {
	const live = await readJsonBlob<LivePointer>(livePath(sceneId));
	// The live pointer can lag behind the highest existing release (e.g. after a
	// rollback moved live to an older version), so derive the next version from
	// BOTH the live pointer and the max release on disk. Using live alone would
	// collide with an existing immutable release blob and 500 forever.
	const maxExistingVersion = (await listReleaseVersions(sceneId))[0] ?? 0;
	const nextVersion = Math.max(maxExistingVersion, live?.version ?? 0) + 1;

	const release: SceneDraft = {
		...draft,
		publishedAt: Date.now(),
		publishedBy: "admin",
		message: typeof message === "string" ? message : undefined,
	};
	const introDraft = await readJsonBlob<IntroPreset>(introDraftPath(sceneId));

	try {
		await writeImmutableJsonBlob(releasePath(sceneId, nextVersion), release);
		if (introDraft) {
			await writeImmutableJsonBlob(
				introReleasePath(sceneId, nextVersion),
				introDraft,
			);
		}
	} catch (error) {
		// A concurrent publish may have claimed this version between our read and
		// write. Surface a retryable conflict instead of an uncaught server error.
		if (error instanceof BlobPreconditionFailedError) {
			throw new ReleaseVersionConflictError();
		}
		throw error;
	}

	// Immutable release blob(s) are now written. If the live pointer write fails,
	// best-effort delete them so a dangling, unreferenced release is not leaked
	// forever, then rethrow.
	try {
		await mutateJsonBlob(livePath(sceneId), () => ({
			value: { version: nextVersion },
			result: undefined,
		}));
	} catch (error) {
		try {
			await deleteBlobByPathname(releasePath(sceneId, nextVersion));
			if (introDraft) {
				await deleteBlobByPathname(
					introReleasePath(sceneId, nextVersion),
				);
			}
		} catch (cleanupError) {
			console.error(
				"Failed to clean up release blobs after live pointer write failure",
				cleanupError,
			);
		}
		throw error;
	}

	try {
		await reconcileSceneImageAssets(
			sceneId,
			[],
			collectImagePathnamesFromDraft(release),
		);
	} catch (error) {
		console.error("Failed to reconcile scene images after publish", error);
	}

	return { version: nextVersion };
}
