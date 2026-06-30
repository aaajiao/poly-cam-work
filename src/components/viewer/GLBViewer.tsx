import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

interface GLBViewerProps {
	url: string;
}

export function deepCloneScene(source: THREE.Group): THREE.Group {
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

export function GLBViewer({ url }: GLBViewerProps) {
	const { scene: cached } = useGLTF(url);

	// Clone the cached scene so disposing on unmount never corrupts drei's
	// process-wide GLTF cache (the cached object is shared across mounts).
	const scene = useMemo(() => deepCloneScene(cached), [cached]);

	// Ensure materials are double-sided when needed (clipping support)
	useEffect(() => {
		scene.traverse((child) => {
			if (child instanceof THREE.Mesh && child.material) {
				const mats = Array.isArray(child.material)
					? child.material
					: [child.material];
				mats.forEach((mat) => {
					// Store original side for restoration
					if (
						(mat as THREE.Material & { _originalSide?: THREE.Side })
							._originalSide === undefined
					) {
						(
							mat as THREE.Material & { _originalSide?: THREE.Side }
						)._originalSide = mat.side;
					}
				});
			}
		});
	}, [scene]);

	useEffect(() => {
		return () => {
			scene.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry.dispose();
					const mats = Array.isArray(child.material)
						? child.material
						: [child.material];
					mats.forEach((mat) => mat.dispose());
				}
			});
		};
	}, [scene]);

	return <primitive object={scene} />;
}
