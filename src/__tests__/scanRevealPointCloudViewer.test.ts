import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { getPointCloudSceneBounds } from "@/components/viewer/ScanRevealPointCloudViewer";

describe("getPointCloudSceneBounds", () => {
	it("transforms PLY bounding sphere center from Z-up into scene Y-up space", () => {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(new Float32Array([2, 3, 4]), 3),
		);

		const bounds = getPointCloudSceneBounds(geometry);

		expect(bounds).toEqual({
			radius: 0,
			center: [2, 4, -3],
		});
	});

	it("computes a bounding sphere when one is not already present", () => {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(new Float32Array([-1, -1, -1, 1, 1, 1]), 3),
		);

		expect(geometry.boundingSphere).toBeNull();

		const bounds = getPointCloudSceneBounds(geometry);

		expect(bounds).not.toBeNull();
		expect(bounds?.center[0]).toBeCloseTo(0);
		expect(bounds?.center[1]).toBeCloseTo(0);
		expect(bounds?.center[2]).toBeCloseTo(0);
		expect(bounds?.radius).toBeCloseTo(Math.sqrt(3));
	});
});
