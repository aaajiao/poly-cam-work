import { readFileSync } from "node:fs";
import path from "node:path";

export interface DiscoveredScene {
	id: string;
	name: string;
	glbUrl: string;
	plyUrl: string;
}

export interface DiscoveryValidationError {
	code: string;
	basename: string;
	message: string;
}

export interface DiscoveryResult {
	scenes: DiscoveredScene[];
	errors: DiscoveryValidationError[];
}

export interface DiscoveryInput {
	entries: string[];
	modelsDir: string;
	validateFiles?: boolean;
}

export function slugToName(slug: string): string {
	return slug
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export function isValidGLBFile(filePath: string): boolean {
	try {
		const buffer = readFileSync(filePath);
		if (buffer.length < 4) return false;
		const magic = new Uint8Array(buffer, 0, 4);
		return (
			magic[0] === 0x67 &&
			magic[1] === 0x6c &&
			magic[2] === 0x54 &&
			magic[3] === 0x46
		);
	} catch {
		return false;
	}
}

export function isValidPLYFile(filePath: string): boolean {
	try {
		const buffer = readFileSync(filePath, { flag: "r" });
		if (buffer.length < 3) return false;
		const header = new TextDecoder("ascii").decode(
			new Uint8Array(buffer, 0, Math.min(20, buffer.length)),
		);
		return header.startsWith("ply");
	} catch {
		return false;
	}
}

export function discoverScenes(input: DiscoveryInput): DiscoveryResult {
	const { entries, modelsDir, validateFiles = true } = input;

	const glbFiles = new Map<string, string[]>();
	const plyFiles = new Map<string, string[]>();
	const errors: DiscoveryValidationError[] = [];

	for (const entry of entries) {
		const lower = entry.toLowerCase();
		if (lower.endsWith(".glb")) {
			const basename = entry.slice(0, -4);
			if (!glbFiles.has(basename)) {
				glbFiles.set(basename, []);
			}
			glbFiles.get(basename)!.push(entry);
		} else if (lower.endsWith(".ply")) {
			const basename = entry.slice(0, -4);
			if (!plyFiles.has(basename)) {
				plyFiles.set(basename, []);
			}
			plyFiles.get(basename)!.push(entry);
		}
	}

	const completePairs: string[] = [];

	for (const basename of glbFiles.keys()) {
		const glbList = glbFiles.get(basename)!;
		const plyList = plyFiles.get(basename) || [];

		if (glbList.length > 1) {
			errors.push({
				code: "duplicate-basename",
				basename,
				message: `Duplicate GLB files: "${basename}" has ${glbList.length} GLB files`,
			});
		} else if (plyList.length > 1) {
			errors.push({
				code: "duplicate-basename",
				basename,
				message: `Duplicate PLY files: "${basename}" has ${plyList.length} PLY files`,
			});
		} else if (plyList.length === 1) {
			if (validateFiles) {
				const glbPath = path.join(modelsDir, glbList[0]);
				const plyPath = path.join(modelsDir, plyList[0]);

				if (!isValidGLBFile(glbPath)) {
					errors.push({
						code: "malformed-glb",
						basename,
						message: `Malformed GLB file: "${basename}.glb" has invalid GLB header`,
					});
				} else if (!isValidPLYFile(plyPath)) {
					errors.push({
						code: "malformed-ply",
						basename,
						message: `Malformed PLY file: "${basename}.ply" has invalid PLY header`,
					});
				} else {
					completePairs.push(basename);
				}
			} else {
				completePairs.push(basename);
			}
		} else {
			errors.push({
				code: "orphan-glb",
				basename,
				message: `Orphan GLB file: "${basename}.glb" has no matching PLY file`,
			});
		}
	}

	for (const basename of plyFiles.keys()) {
		if (!glbFiles.has(basename)) {
			errors.push({
				code: "orphan-ply",
				basename,
				message: `Orphan PLY file: "${basename}.ply" has no matching GLB file`,
			});
		}
	}

	completePairs.sort((a, b) => a.localeCompare(b));

	const scenes: DiscoveredScene[] = completePairs.map((basename) => ({
		id: basename,
		name: slugToName(basename),
		glbUrl: `/models/${basename}.glb`,
		plyUrl: `/models/${basename}.ply`,
	}));

	return { scenes, errors };
}
