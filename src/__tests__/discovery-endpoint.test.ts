import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverScenes } from "../../api/_lib/discovery";

describe("discovery endpoint validation", () => {
	it("accepts a normal same-basename GLB+PLY pair", () => {
		const result = discoverScenes({
			entries: ["scan-a.glb", "scan-a.ply"],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(1);
		expect(result.scenes[0].id).toBe("scan-a");
		expect(result.scenes[0].glbUrl).toBe("/models/scan-a.glb");
		expect(result.scenes[0].plyUrl).toBe("/models/scan-a.ply");
		expect(result.errors).toHaveLength(0);
	});

	it("accepts multiple valid pairs", () => {
		const result = discoverScenes({
			entries: [
				"scan-a.glb",
				"scan-a.ply",
				"scan-b.glb",
				"scan-b.ply",
				"scan-c.glb",
				"scan-c.ply",
			],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(3);
		expect(result.scenes.map((s) => s.id)).toEqual([
			"scan-a",
			"scan-b",
			"scan-c",
		]);
		expect(result.errors).toHaveLength(0);
	});

	it("rejects orphan GLB file", () => {
		const result = discoverScenes({
			entries: ["orphan.glb"],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("orphan-glb");
		expect(result.errors[0].basename).toBe("orphan");
	});

	it("rejects orphan PLY file", () => {
		const result = discoverScenes({
			entries: ["orphan.ply"],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("orphan-ply");
		expect(result.errors[0].basename).toBe("orphan");
	});

	it("rejects duplicate GLB files with exact same basename", () => {
		const result = discoverScenes({
			entries: ["scan-a.glb", "scan-a.GLB", "scan-a.ply"],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("duplicate-basename");
		expect(result.errors[0].basename).toBe("scan-a");
	});

	it("rejects duplicate PLY files with exact same basename", () => {
		const result = discoverScenes({
			entries: ["scan-a.glb", "scan-a.ply", "scan-a.PLY"],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("duplicate-basename");
		expect(result.errors[0].basename).toBe("scan-a");
	});

	it("handles mixed valid and invalid cases", () => {
		const result = discoverScenes({
			entries: [
				"scan-a.glb",
				"scan-a.ply",
				"orphan-glb.glb",
				"orphan-ply.ply",
				"scan-b.glb",
				"scan-b.ply",
			],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(2);
		expect(result.scenes.map((s) => s.id)).toEqual(["scan-a", "scan-b"]);
		expect(result.errors).toHaveLength(2);
		expect(result.errors.map((e) => e.code)).toEqual([
			"orphan-glb",
			"orphan-ply",
		]);
	});

	it("ignores non-model files", () => {
		const result = discoverScenes({
			entries: [
				"scan-a.glb",
				"scan-a.ply",
				"readme.txt",
				".DS_Store",
				"config.json",
			],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(1);
		expect(result.scenes[0].id).toBe("scan-a");
		expect(result.errors).toHaveLength(0);
	});

	it("handles case-insensitive file extensions", () => {
		const result = discoverScenes({
			entries: ["scan-a.GLB", "scan-a.PLY"],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(1);
		expect(result.scenes[0].id).toBe("scan-a");
		expect(result.errors).toHaveLength(0);
	});

	it("handles mixed case file extensions", () => {
		const result = discoverScenes({
			entries: ["scan-a.Glb", "scan-a.Ply"],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes).toHaveLength(1);
		expect(result.scenes[0].id).toBe("scan-a");
		expect(result.errors).toHaveLength(0);
	});

	it("sorts scenes alphabetically", () => {
		const result = discoverScenes({
			entries: [
				"zebra.glb",
				"zebra.ply",
				"apple.glb",
				"apple.ply",
				"middle.glb",
				"middle.ply",
			],
			modelsDir: "",
			validateFiles: false,
		});
		expect(result.scenes.map((s) => s.id)).toEqual([
			"apple",
			"middle",
			"zebra",
		]);
	});
});

describe("discovery endpoint malformed-file validation", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(path.join("/tmp", "discovery-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("rejects malformed GLB file with invalid header", () => {
		writeFileSync(path.join(tempDir, "bad.glb"), "not-a-glb-file");
		writeFileSync(
			path.join(tempDir, "bad.ply"),
			"ply\nformat ascii 1.0\nend_header\n",
		);

		const result = discoverScenes({
			entries: ["bad.glb", "bad.ply"],
			modelsDir: tempDir,
			validateFiles: true,
		});

		expect(result.scenes).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("malformed-glb");
		expect(result.errors[0].basename).toBe("bad");
		expect(result.errors[0].message).toContain("invalid GLB header");
	});

	it("rejects malformed PLY file with invalid header", () => {
		writeFileSync(
			path.join(tempDir, "bad.glb"),
			Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x00, 0x00, 0x00, 0x00]),
		);
		writeFileSync(path.join(tempDir, "bad.ply"), "not-a-ply-file");

		const result = discoverScenes({
			entries: ["bad.glb", "bad.ply"],
			modelsDir: tempDir,
			validateFiles: true,
		});

		expect(result.scenes).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("malformed-ply");
		expect(result.errors[0].basename).toBe("bad");
		expect(result.errors[0].message).toContain("invalid PLY header");
	});

	it("accepts valid GLB+PLY pair with correct headers", () => {
		writeFileSync(
			path.join(tempDir, "good.glb"),
			Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x00, 0x00, 0x00, 0x00]),
		);
		writeFileSync(
			path.join(tempDir, "good.ply"),
			"ply\nformat ascii 1.0\nend_header\n",
		);

		const result = discoverScenes({
			entries: ["good.glb", "good.ply"],
			modelsDir: tempDir,
			validateFiles: true,
		});

		expect(result.scenes).toHaveLength(1);
		expect(result.scenes[0].id).toBe("good");
		expect(result.errors).toHaveLength(0);
	});

	it("rejects GLB file that is too small", () => {
		writeFileSync(path.join(tempDir, "tiny.glb"), Buffer.from([0x67, 0x6c]));
		writeFileSync(
			path.join(tempDir, "tiny.ply"),
			"ply\nformat ascii 1.0\nend_header\n",
		);

		const result = discoverScenes({
			entries: ["tiny.glb", "tiny.ply"],
			modelsDir: tempDir,
			validateFiles: true,
		});

		expect(result.scenes).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("malformed-glb");
	});

	it("rejects PLY file that is too small", () => {
		writeFileSync(
			path.join(tempDir, "tiny.glb"),
			Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x00, 0x00, 0x00, 0x00]),
		);
		writeFileSync(path.join(tempDir, "tiny.ply"), Buffer.from([0x70, 0x6c]));

		const result = discoverScenes({
			entries: ["tiny.glb", "tiny.ply"],
			modelsDir: tempDir,
			validateFiles: true,
		});

		expect(result.scenes).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("malformed-ply");
	});

	it("handles mixed valid and malformed pairs", () => {
		writeFileSync(
			path.join(tempDir, "good.glb"),
			Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x00, 0x00, 0x00, 0x00]),
		);
		writeFileSync(
			path.join(tempDir, "good.ply"),
			"ply\nformat ascii 1.0\nend_header\n",
		);
		writeFileSync(path.join(tempDir, "bad.glb"), "not-a-glb");
		writeFileSync(
			path.join(tempDir, "bad.ply"),
			"ply\nformat ascii 1.0\nend_header\n",
		);

		const result = discoverScenes({
			entries: ["good.glb", "good.ply", "bad.glb", "bad.ply"],
			modelsDir: tempDir,
			validateFiles: true,
		});

		expect(result.scenes).toHaveLength(1);
		expect(result.scenes[0].id).toBe("good");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("malformed-glb");
		expect(result.errors[0].basename).toBe("bad");
	});
});
