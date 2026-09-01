import { useCursor } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useViewerStore } from "@/store/viewerStore";
import type { Annotation } from "@/types";
import { selectHtmlAnnotationMarkerIds } from "@/utils/annotationMarkerLod";
import { getAnnotationMarkerVisualScale } from "@/utils/annotationMarkerScale";
import { getWorldScaleForProjectedPixelRadius } from "@/utils/projectedPixelScale";
import { CLIP_SCENE_HALF } from "@/utils/sceneConstants";
import { resolveThemeColor } from "@/utils/themeColors";
import { AnnotationMarker } from "./AnnotationMarker";

const MAX_HTML_MARKERS = 15;
const FAR_MARKER_GEOMETRY_RADIUS = 0.12;
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
	const farCoreMatrixRef = useRef(new THREE.Matrix4());
	const farHaloMatrixRef = useRef(new THREE.Matrix4());
	const annotationPositionRef = useRef(new THREE.Vector3());
	const cameraSpacePositionRef = useRef(new THREE.Vector3());
	const farGeometry = useMemo(
		() => new THREE.SphereGeometry(FAR_MARKER_GEOMETRY_RADIUS, 8, 8),
		[],
	);
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
	const farMarkerColors = useMemo(
		() => ({
			active: new THREE.Color(
				resolveThemeColor("--signal-open", "#8fd8ff"),
			),
			hover: new THREE.Color(
				resolveThemeColor("--signal-hover", "#3b82f6"),
			),
			idle: new THREE.Color(
				resolveThemeColor("--signal-closed", "#1d4ed8"),
			),
			ring: new THREE.Color(
				resolveThemeColor("--signal-ring", "#ffffff"),
			),
		}),
		[],
	);

	// Maps instancedMesh instance index → annotation, kept in sync each frame.
	const farAnnotationsRef = useRef<Annotation[]>([]);
	const closeMarkerIdsRef = useRef<string[]>([]);
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
		const currentIds = closeMarkerIdsRef.current;
		if (
			ids.length === currentIds.length &&
			ids.every((id, index) => id === currentIds[index])
		) {
			return;
		}
		closeMarkerIdsRef.current = ids;
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

	useFrame(({ clock, size }) => {
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

		const withDist = visibleAnnotations.map((a: Annotation, sourceIndex) => {
			const dx = a.position[0] - camera.position.x;
			const dy = a.position[1] - camera.position.y;
			const dz = a.position[2] - camera.position.z;
			return {
				annotation: a,
				id: a.id,
				distance: Math.hypot(dx, dy, dz),
				sourceIndex,
			};
		});

		const nextCloseIds = selectHtmlAnnotationMarkerIds(
			withDist,
			openAnnotationPanelIds,
			selectedAnnotationId,
			MAX_HTML_MARKERS,
		);
		setCloseIdsIfChanged(nextCloseIds);

		if (!coreMesh || !haloMesh) return;

		const closeIdSet = new Set(nextCloseIds);
		const farAnnotations = withDist.filter(
			({ annotation }) => !closeIdSet.has(annotation.id),
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

		const matrix = farCoreMatrixRef.current;
		const haloMatrix = farHaloMatrixRef.current;
		const pulse = 1 + Math.sin(clock.elapsedTime * 2) * 0.15;
		const verticalFovDegrees =
			camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
		camera.updateMatrixWorld(false);

		farAnnotations.forEach(({ annotation }, i) => {
			const pos = annotationPositionRef.current.set(...annotation.position);
			const isActive = openPanelIdSet.has(annotation.id);
			const isHovered = hoveredFarId === annotation.id;
			const cameraSpaceDepth = -cameraSpacePositionRef.current
				.copy(pos)
				.applyMatrix4(camera.matrixWorldInverse).z;
			const { markerPx } = getAnnotationMarkerVisualScale({
				cameraSpaceDepth,
				verticalFovDegrees,
				viewportHeight: size.height,
			});
			const geometryScalePerPixel = getWorldScaleForProjectedPixelRadius(
				pos,
				1,
				camera,
				size,
				FAR_MARKER_GEOMETRY_RADIUS,
			);
			const interactionScale = isActive
				? isHovered
					? 1.12
					: 1.1
				: isHovered
					? 1.05
					: 1;
			const coreScale =
				geometryScalePerPixel *
				(markerPx / 4) *
				pulse *
				interactionScale;
			const haloScale =
				geometryScalePerPixel *
				(markerPx / 2) *
				pulse *
				interactionScale;
			const markerColor = isActive
				? farMarkerColors.active
				: isHovered
					? farMarkerColors.hover
					: farMarkerColors.idle;
			const haloColor = isActive
				? farMarkerColors.active
				: isHovered
					? farMarkerColors.hover
					: farMarkerColors.ring;

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

			{closeAnnotations.map((annotation) => (
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
