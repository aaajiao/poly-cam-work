import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { deepCloneScene } from "@/components/viewer/GLBViewer";

describe("deepCloneScene", () => {
	it("clones geometry and material so disposing the clone leaves the cached scene intact", () => {
		const cached = new THREE.Group();
		const geometry = new THREE.BoxGeometry(1, 1, 1);
		const material = new THREE.MeshStandardMaterial();
		const mesh = new THREE.Mesh(geometry, material);
		cached.add(mesh);

		const clone = deepCloneScene(cached);
		const clonedMesh = clone.children[0] as THREE.Mesh;

		// distinct instances, not the shared cached resources
		expect(clonedMesh.geometry).not.toBe(geometry);
		expect(clonedMesh.material).not.toBe(material);

		// simulate the viewer's unmount disposal on the clone
		clonedMesh.geometry.dispose();
		(clonedMesh.material as THREE.Material).dispose();

		// the cached scene's resources remain usable for the next mount
		expect(geometry.attributes.position).toBeDefined();
		expect((material as THREE.MeshStandardMaterial).isMaterial).toBe(true);
	});

	it("clones every material in a multi-material mesh", () => {
		const cached = new THREE.Group();
		const geometry = new THREE.BoxGeometry(1, 1, 1);
		const matA = new THREE.MeshStandardMaterial();
		const matB = new THREE.MeshStandardMaterial();
		const mesh = new THREE.Mesh(geometry, [matA, matB]);
		cached.add(mesh);

		const clone = deepCloneScene(cached);
		const clonedMesh = clone.children[0] as THREE.Mesh;
		const mats = clonedMesh.material as THREE.Material[];

		expect(mats[0]).not.toBe(matA);
		expect(mats[1]).not.toBe(matB);
	});
});
