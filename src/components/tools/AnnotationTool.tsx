import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { useViewerStore } from "@/store/viewerStore";
import { raycastScene } from "@/utils/raycasting";

export function AnnotationTool() {
	const toolMode = useViewerStore((s) => s.toolMode);
	const presentationMode = useViewerStore((s) => s.presentationMode);
	const setPendingAnnotationInput = useViewerStore(
		(s) => s.setPendingAnnotationInput,
	);
	const pendingAnnotationInput = useViewerStore(
		(s) => s.pendingAnnotationInput,
	);
	const selectedAnnotationId = useViewerStore((s) => s.selectedAnnotationId);
	const removeAnnotation = useViewerStore((s) => s.removeAnnotation);
	const selectAnnotation = useViewerStore((s) => s.selectAnnotation);
	const { camera, scene, gl } = useThree();
	const raycasterRef = useRef(new THREE.Raycaster());
	const mouseRef = useRef(new THREE.Vector2());

	const isAuthenticated = useViewerStore((s) => s.isAuthenticated);
	const isActive =
		toolMode === "annotate" && !presentationMode && isAuthenticated;

	const handleClick = useCallback(
		(e: MouseEvent) => {
			if (!isActive || pendingAnnotationInput) return;

			const rect = gl.domElement.getBoundingClientRect();
			mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

			raycasterRef.current.setFromCamera(mouseRef.current, camera);

			const intersects = raycastScene(raycasterRef.current, scene, camera);
			if (intersects.length === 0) return;

			const hit = intersects[0];
			const hitPoint = hit.point.clone();

			const normal = hit.face?.normal
				? hit.face.normal.clone()
				: camera.position
						.clone()
						.sub(new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z))
						.normalize();

			setPendingAnnotationInput({
				screenPos: { x: e.clientX, y: e.clientY },
				worldPos: [hitPoint.x, hitPoint.y, hitPoint.z],
				normal: [normal.x, normal.y, normal.z],
			});
		},
		[
			isActive,
			pendingAnnotationInput,
			camera,
			scene,
			gl,
			setPendingAnnotationInput,
		],
	);

	useEffect(() => {
		if (!isActive) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			if (
				(e.key === "Delete" || e.key === "Backspace") &&
				selectedAnnotationId
			) {
				if (window.confirm("Delete this annotation?")) {
					removeAnnotation(selectedAnnotationId);
					selectAnnotation(null);
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isActive, selectedAnnotationId, removeAnnotation, selectAnnotation]);

	useEffect(() => {
		if (!isActive) {
			setPendingAnnotationInput(null);
			return;
		}
		gl.domElement.addEventListener("click", handleClick);
		return () => gl.domElement.removeEventListener("click", handleClick);
	}, [isActive, handleClick, setPendingAnnotationInput, gl]);

	return null;
}
