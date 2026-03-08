import { useCursor } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useViewerStore } from "@/store/viewerStore";
import type { Annotation } from "@/types";
import { resolveThemeColor } from "@/utils/themeColors";
import { AnnotationMarker } from "./AnnotationMarker";

const MAX_HTML_MARKERS = 15;
// Must match ClippingPlane.tsx SCENE_HALF — both must agree on the world-space mapping
const CLIP_SCENE_HALF = 15;
const NOOP_RAYCAST: THREE.Object3D["raycast"] = () => {};

export function AnnotationMarkers() {
	const annotations = useViewerStore((s) => s.annotations);
	const activeSceneId = useViewerStore((s) => s.activeSceneId);
	const selectedAnnotationId = useViewerStore((s) => s.selectedAnnotationId);
	const openAnnotationPanelIds = useViewerStore(
		(s) => s.openAnnotationPanelIds,
	);
	const annotationsVisible = useViewerStore((s) => s.annotationsVisible);
	const clipPlane = useViewerStore((s) => s.clipPlane);
	const selectAnnotation = useViewerStore((s) => s.selectAnnotation);
	const openAnnotationPanel = useViewerStore((s) => s.openAnnotationPanel);
	const closeAnnotationPanel = useViewerStore((s) => s.closeAnnotationPanel);
	const { camera } = useThree();

	const [closeMarkerIds, setCloseMarkerIds] = useState<string[]>([]);

	const sceneAnnotations = useMemo(
		() => annotations.filter((a) => a.sceneId === activeSceneId),
		[annotations, activeSceneId],
	);

	const visibleAnnotations = useMemo(() => {
		if (!clipPlane.enabled) return sceneAnnotations;
		const worldPos = (clipPlane.position - 0.5) * 2 * CLIP_SCENE_HALF;
		const axisIndex =
			clipPlane.axis === "x" ? 0 : clipPlane.axis === "y" ? 1 : 2;
		return sceneAnnotations.filter((a) => {
			const axisValue = a.position[axisIndex];
			return clipPlane.flipped ? axisValue <= worldPos : axisValue >= worldPos;
		});
	}, [sceneAnnotations, clipPlane]);

	const farCoreRef = useRef<THREE.InstancedMesh>(null);
	const farHaloRef = useRef<THREE.InstancedMesh>(null);
	const farGeometry = useMemo(() => new THREE.SphereGeometry(0.12, 8, 8), []);
	const farCoreMaterial = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				color: resolveThemeColor("--signal-closed", "#1d4ed8"),
				transparent: true,
				opacity: 0.98,
				depthTest: false,
				depthWrite: false,
				vertexColors: true,
				toneMapped: false,
			}),
		[],
	);
	const farHaloMaterial = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				color: resolveThemeColor("--signal-ring", "#ffffff"),
				transparent: true,
				opacity: 0.54,
				depthTest: false,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				vertexColors: true,
				toneMapped: false,
			}),
		[],
	);

	// Maps instancedMesh instance index → annotation, kept in sync each frame.
	const farAnnotationsRef = useRef<Annotation[]>([]);
	const closeMarkerKeyRef = useRef("");
	const openPanelIdSet = useMemo(
		() => new Set(openAnnotationPanelIds),
		[openAnnotationPanelIds],
	);
	const [hoveredFarId, setHoveredFarId] = useState<string | null>(null);

	useCursor(hoveredFarId !== null);

	useEffect(() => {
		if (!hoveredFarId) return;
		if (
			!visibleAnnotations.some((annotation) => annotation.id === hoveredFarId)
		) {
			setHoveredFarId(null);
		}
	}, [hoveredFarId, visibleAnnotations]);

	const setCloseIdsIfChanged = useCallback((ids: string[]) => {
		const key = ids.join("|");
		if (key === closeMarkerKeyRef.current) return;
		closeMarkerKeyRef.current = key;
		setCloseMarkerIds(ids);
	}, []);

	const handlePanelToggle = useCallback(
		(id: string) => {
			if (openPanelIdSet.has(id)) {
				closeAnnotationPanel(id);
				if (selectedAnnotationId === id) {
					selectAnnotation(null);
				}
				return;
			}

			openAnnotationPanel(id);
			selectAnnotation(id);
		},
		[
			openPanelIdSet,
			closeAnnotationPanel,
			selectedAnnotationId,
			selectAnnotation,
			openAnnotationPanel,
		],
	);

	useFrame(({ clock }) => {
		if (!annotationsVisible) return;

		const coreMesh = farCoreRef.current;
		const haloMesh = farHaloRef.current;

		if (visibleAnnotations.length === 0) {
			if (coreMesh && coreMesh.count > 0) {
				coreMesh.count = 0;
				coreMesh.instanceMatrix.needsUpdate = true;
			}
			if (haloMesh && haloMesh.count > 0) {
				haloMesh.count = 0;
				haloMesh.instanceMatrix.needsUpdate = true;
			}
			farAnnotationsRef.current = [];
			setCloseIdsIfChanged([]);
			if (hoveredFarId) setHoveredFarId(null);
			return;
		}

		const withDist = visibleAnnotations.map((a: Annotation) => {
			const pos = new THREE.Vector3(...a.position);
			const dist = camera.position.distanceTo(pos);
			return { annotation: a, dist };
		});

		withDist.sort((a, b) => a.dist - b.dist);

		const newLod = new Map<string, "far" | "close">();
		const nextCloseIds: string[] = [];
		let htmlCount = 0;
		for (const { annotation } of withDist) {
			const forceClose = openPanelIdSet.has(annotation.id);
			if (forceClose || htmlCount < MAX_HTML_MARKERS) {
				newLod.set(annotation.id, "close");
				nextCloseIds.push(annotation.id);
				htmlCount++;
			} else {
				newLod.set(annotation.id, "far");
			}
		}
		setCloseIdsIfChanged(nextCloseIds);

		if (!coreMesh || !haloMesh) return;

		const farAnnotations = withDist.filter(
			(d) => newLod.get(d.annotation.id) === "far",
		);
		farAnnotationsRef.current = farAnnotations.map((d) => d.annotation);
		coreMesh.count = farAnnotations.length;
		haloMesh.count = farAnnotations.length;

		if (
			hoveredFarId &&
			!farAnnotations.some((d) => d.annotation.id === hoveredFarId)
		) {
			setHoveredFarId(null);
		}

		const matrix = new THREE.Matrix4();
		const haloMatrix = new THREE.Matrix4();
		const pulse = 1 + Math.sin(clock.elapsedTime * 2) * 0.15;
		const activeColor = new THREE.Color(
			resolveThemeColor("--signal-open", "#8fd8ff"),
		);
		const hoverColor = new THREE.Color(
			resolveThemeColor("--signal-hover", "#3b82f6"),
		);
		const idleColor = new THREE.Color(
			resolveThemeColor("--signal-closed", "#1d4ed8"),
		);
		const ringColor = new THREE.Color(
			resolveThemeColor("--signal-ring", "#ffffff"),
		);

		farAnnotations.forEach(({ annotation, dist }, i) => {
			const pos = new THREE.Vector3(...annotation.position);
			const isActive = openPanelIdSet.has(annotation.id);
			const isHovered = hoveredFarId === annotation.id;
			const distanceScale = THREE.MathUtils.clamp(dist / 12, 1.05, 4.2);

			const coreScale =
				pulse *
				distanceScale *
				(isActive ? (isHovered ? 1.42 : 1.28) : isHovered ? 1.18 : 1);
			const haloScale =
				pulse * distanceScale * (isActive ? 2.85 : isHovered ? 2.15 : 1.72);
			const markerColor = isActive
				? activeColor
				: isHovered
					? hoverColor
					: idleColor;
			const haloColor = isActive
				? activeColor
				: isHovered
					? hoverColor
					: ringColor;

			matrix.makeScale(coreScale, coreScale, coreScale);
			matrix.setPosition(pos);
			coreMesh.setMatrixAt(i, matrix);
			coreMesh.setColorAt(i, markerColor);

			haloMatrix.makeScale(haloScale, haloScale, haloScale);
			haloMatrix.setPosition(pos);
			haloMesh.setMatrixAt(i, haloMatrix);
			haloMesh.setColorAt(i, haloColor);
		});
		coreMesh.instanceMatrix.needsUpdate = true;
		haloMesh.instanceMatrix.needsUpdate = true;
		if (coreMesh.instanceColor) coreMesh.instanceColor.needsUpdate = true;
		if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
	});

	const handleInstancePointerMove = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			e.stopPropagation();
			const idx = e.instanceId;
			if (idx !== undefined && farAnnotationsRef.current[idx]) {
				const nextId = farAnnotationsRef.current[idx].id;
				setHoveredFarId((prev) => (prev === nextId ? prev : nextId));
				return;
			}

			setHoveredFarId((prev) => (prev === null ? prev : null));
		},
		[],
	);

	const handleInstancePointerOut = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			e.stopPropagation();
			setHoveredFarId((prev) => (prev === null ? prev : null));
		},
		[],
	);

	const handleInstanceClick = useCallback(
		(e: ThreeEvent<MouseEvent>) => {
			e.stopPropagation();
			const idx = e.instanceId;
			if (idx !== undefined && farAnnotationsRef.current[idx]) {
				handlePanelToggle(farAnnotationsRef.current[idx].id);
			}
		},
		[handlePanelToggle],
	);

	const visibleAnnotationById = useMemo(
		() =>
			new Map(
				visibleAnnotations.map(
					(annotation) => [annotation.id, annotation] as const,
				),
			),
		[visibleAnnotations],
	);

	const closeAnnotations = useMemo(
		() =>
			closeMarkerIds
				.map((id) => visibleAnnotationById.get(id))
				.filter(
					(annotation): annotation is Annotation => annotation !== undefined,
				),
		[closeMarkerIds, visibleAnnotationById],
	);

	if (!annotationsVisible) return null;

	const instanceCapacity = Math.max(sceneAnnotations.length, 1);

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: React Three Fiber instanced meshes are scene objects, not DOM nodes. */}
			<instancedMesh
				key={`far-core-${activeSceneId}-${instanceCapacity}`}
				ref={farCoreRef}
				args={[farGeometry, farCoreMaterial, instanceCapacity]}
				onPointerMove={handleInstancePointerMove}
				onPointerOut={handleInstancePointerOut}
				onClick={handleInstanceClick}
			/>
			<instancedMesh
				key={`far-halo-${activeSceneId}-${instanceCapacity}`}
				ref={farHaloRef}
				args={[farGeometry, farHaloMaterial, instanceCapacity]}
				raycast={NOOP_RAYCAST}
			/>

			{closeAnnotations.slice(0, MAX_HTML_MARKERS).map((annotation) => (
				<AnnotationMarker
					key={annotation.id}
					annotation={annotation}
					isActive={openPanelIdSet.has(annotation.id)}
					onSelect={() => handlePanelToggle(annotation.id)}
				/>
			))}
		</>
	);
}
