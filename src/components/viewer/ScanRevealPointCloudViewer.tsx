import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { usePLYLoader } from "@/hooks/usePLYLoader";
import type { ScanRevealUniforms } from "@/shaders/scanRevealMesh";
import { createScanPointsMaterial } from "@/shaders/scanRevealPoints";
import { useViewerStore } from "@/store/viewerStore";

interface SceneBounds {
	radius: number;
	center: [number, number, number];
}

export function getPointCloudSceneBounds(
	geometry: THREE.BufferGeometry,
): SceneBounds | null {
	if (!geometry.boundingSphere) {
		geometry.computeBoundingSphere();
	}

	if (!geometry.boundingSphere) return null;

	const { center, radius } = geometry.boundingSphere;
	return {
		radius,
		center: [center.x, center.z, -center.y],
	};
}

interface ScanRevealPointCloudViewerProps {
	url: string;
	uniforms: ScanRevealUniforms;
	onBoundsReady?: (bounds: SceneBounds) => void;
}

export function ScanRevealPointCloudViewer({
	url,
	uniforms,
	onBoundsReady,
}: ScanRevealPointCloudViewerProps) {
	const { data } = usePLYLoader(url);
	const pointSize = useViewerStore((s) => s.pointSize);

	const geometry = useMemo(() => {
		if (!data) return null;
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
		geo.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
		geo.computeBoundingBox();
		geo.computeBoundingSphere();
		return geo;
	}, [data]);

	useEffect(() => {
		if (!geometry || !onBoundsReady) return;
		const bounds = getPointCloudSceneBounds(geometry);
		if (!bounds) return;
		onBoundsReady(bounds);
	}, [geometry, onBoundsReady]);

	const material = useMemo(
		() => createScanPointsMaterial(uniforms, pointSize),
		[uniforms, pointSize],
	);

	useEffect(() => {
		material.uniforms.uPointSize.value = pointSize;
	}, [material, pointSize]);

	useEffect(() => {
		return () => {
			geometry?.dispose();
			material.dispose();
		};
	}, [geometry, material]);

	if (!geometry) return null;

	return (
		<group rotation={[-Math.PI / 2, 0, 0]}>
			<points geometry={geometry} material={material} />
		</group>
	);
}
