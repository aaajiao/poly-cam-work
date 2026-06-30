import type { ScanScene } from "../../src/types";
import { mutateJsonBlob, readJsonBlob } from "./blobStore.js";
import { cleanupStaleModelAssets } from "./modelAssetCleanup.js";
import {
	dedupeModelsById,
	generateUniqueId,
	normalizeModel,
} from "./modelValidation.js";

interface ModelRegistryDocument {
	version: number;
	models: ScanScene[];
}

type RawModelRegistry = ModelRegistryDocument | ScanScene[];

const MODEL_REGISTRY_PATH = "models/index.json";

function normalizeRegistryModels(raw: RawModelRegistry | null): ScanScene[] {
	if (!raw) return [];

	const source = Array.isArray(raw)
		? raw
		: Array.isArray(raw.models)
			? raw.models
			: [];

	return dedupeModelsById(
		source
			.map((model) => normalizeModel(model))
			.filter((model): model is ScanScene => model !== null),
	);
}

function registryDocument(models: ScanScene[]): ModelRegistryDocument {
	return { version: 1, models };
}

export async function readModelRegistry() {
	const raw = await readJsonBlob<RawModelRegistry>(MODEL_REGISTRY_PATH);
	return { version: 1, models: normalizeRegistryModels(raw) };
}

function persistFailure(prefix: string, error: unknown): Error {
	return new Error(
		`${prefix}${
			error instanceof Error && error.message ? `: ${error.message}` : ""
		}`,
	);
}

export async function createModelWithRetry(input: {
	requestedId: string;
	name: string;
	glbUrl: string;
	plyUrl: string;
}) {
	try {
		return await mutateJsonBlob<RawModelRegistry, ScanScene>(
			MODEL_REGISTRY_PATH,
			(raw) => {
				const models = normalizeRegistryModels(raw);
				const existingIds = new Set(models.map((model) => model.id));
				const id = generateUniqueId(
					input.requestedId || input.name,
					existingIds,
				);

				const now = Date.now();
				const model: ScanScene = {
					id,
					name: input.name,
					glbUrl: input.glbUrl,
					plyUrl: input.plyUrl,
					createdAt: now,
					updatedAt: now,
				};

				return {
					value: registryDocument([model, ...models]),
					result: model,
				};
			},
		);
	} catch (error) {
		throw persistFailure("Failed to persist model registration", error);
	}
}

export async function createModelCreateOnlyWithRetry(input: {
	requestedId: string;
	name: string;
	glbUrl: string;
	plyUrl: string;
}) {
	try {
		return await mutateJsonBlob<RawModelRegistry, ScanScene>(
			MODEL_REGISTRY_PATH,
			(raw) => {
				const models = normalizeRegistryModels(raw);
				const existingIds = new Set(models.map((model) => model.id));

				if (existingIds.has(input.requestedId)) {
					throw new Error(
						`Scene ID "${input.requestedId}" already exists in registry`,
					);
				}

				const now = Date.now();
				const model: ScanScene = {
					id: input.requestedId,
					name: input.name,
					glbUrl: input.glbUrl,
					plyUrl: input.plyUrl,
					createdAt: now,
					updatedAt: now,
				};

				return {
					value: registryDocument([model, ...models]),
					result: model,
				};
			},
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("already exists in registry")
		) {
			throw error;
		}
		throw persistFailure("Failed to persist model registration", error);
	}
}

export async function upsertModelByIdWithRetry(input: {
	id: string;
	name: string;
	glbUrl: string;
	plyUrl: string;
}) {
	try {
		const { merged, previousModels, nextModels } = await mutateJsonBlob<
			RawModelRegistry,
			{
				merged: ScanScene;
				previousModels: ScanScene[];
				nextModels: ScanScene[];
			}
		>(MODEL_REGISTRY_PATH, (raw) => {
			const previousModels = normalizeRegistryModels(raw);
			const now = Date.now();
			const existing = previousModels.find((model) => model.id === input.id);

			const merged: ScanScene = {
				id: input.id,
				name: input.name,
				glbUrl: input.glbUrl,
				plyUrl: input.plyUrl,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now,
			};

			const nextModels = [
				merged,
				...previousModels.filter((model) => model.id !== input.id),
			];

			return {
				value: registryDocument(nextModels),
				result: { merged, previousModels, nextModels },
			};
		});

		await cleanupStaleModelAssets(previousModels, nextModels);
		return merged;
	} catch (error) {
		throw persistFailure("Failed to merge model registration", error);
	}
}

export async function replaceModelsWithRetry(
	inputModels: Array<{
		id: string;
		name: string;
		glbUrl: string;
		plyUrl: string;
	}>,
) {
	try {
		const { previousModels, nextModels } = await mutateJsonBlob<
			RawModelRegistry,
			{ previousModels: ScanScene[]; nextModels: ScanScene[] }
		>(MODEL_REGISTRY_PATH, (raw) => {
			const previousModels = normalizeRegistryModels(raw);
			const existingById = new Map(
				previousModels.map((model) => [model.id, model] as const),
			);
			const now = Date.now();

			const nextModels: ScanScene[] = inputModels.map((model) => {
				const existing = existingById.get(model.id);
				return {
					id: model.id,
					name: model.name,
					glbUrl: model.glbUrl,
					plyUrl: model.plyUrl,
					source: "cloud",
					createdAt: existing?.createdAt ?? now,
					updatedAt: now,
				};
			});

			return {
				value: registryDocument(nextModels),
				result: { previousModels, nextModels },
			};
		});

		await cleanupStaleModelAssets(previousModels, nextModels);
		return nextModels;
	} catch (error) {
		throw persistFailure("Failed to replace model registry", error);
	}
}
