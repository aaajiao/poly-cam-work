import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import {
	injectScanRevealShader,
	type ScanRevealUniforms,
} from "@/shaders/scanRevealMesh";

interface SceneBounds {
	radius: number;
	center: [number, number, number];
}

interface ScanRevealGLBViewerProps {
	url: string;
	uniforms: ScanRevealUniforms;
	onBoundsReady?: (bounds: SceneBounds) => void;
}

function deepCloneScene(source: THREE.Group): THREE.Group {
	const clone = source.clone(true);
	clone.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.geometry = child.geometry.clone();
			child.material = Array.isArray(child.material)
				? child.material.map((m: THREE.Material) => m.clone())
				: child.material.clone();
		}
	});
	return clone;
}

function computeSceneBounds(root: THREE.Object3D): SceneBounds {
	const box = new THREE.Box3().setFromObject(root);
	const sphere = new THREE.Sphere();
	box.getBoundingSphere(sphere);
	return {
		radius: sphere.radius,
		center: [sphere.center.x, sphere.center.y, sphere.center.z],
	};
}

export function ScanRevealGLBViewer({
	url,
	uniforms,
	onBoundsReady,
}: ScanRevealGLBViewerProps) {
	const { scene: cached } = useGLTF(url);

	const scene = useMemo(() => deepCloneScene(cached), [cached]);

	useEffect(() => {
		if (onBoundsReady) {
			onBoundsReady(computeSceneBounds(scene));
		}
	}, [scene, onBoundsReady]);

	useEffect(() => {
		scene.traverse((child) => {
			if (child instanceof THREE.Mesh && child.material) {
				const mats = Array.isArray(child.material)
					? child.material
					: [child.material];
				for (const mat of mats) {
					injectScanRevealShader(mat, uniforms);
				}
			}
		});
	}, [scene, uniforms]);

	useEffect(() => {
		return () => {
			scene.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry.dispose();
					const mats = Array.isArray(child.material)
						? child.material
						: [child.material];
					for (const mat of mats) mat.dispose();
				}
			});
		};
	}, [scene]);

	return <primitive object={scene} />;
}
