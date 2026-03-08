import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useViewerStore } from "@/store/viewerStore";
import {
	calculateDistance,
	formatDistance,
	getMidpoint,
} from "@/utils/measurement";
import { updatePointsThreshold } from "@/utils/raycasting";
import { resolveThemeVariableValue } from "@/utils/themeColors";

interface MeasurementPoint {
	position: THREE.Vector3;
	id: string;
}

interface CompletedMeasurement {
	id: string;
	p1: THREE.Vector3;
	p2: THREE.Vector3;
	distance: number;
}

export function MeasurementTool() {
	const toolMode = useViewerStore((s) => s.toolMode);
	const presentationMode = useViewerStore((s) => s.presentationMode);
	const addMeasurement = useViewerStore((s) => s.addMeasurement);
	const { camera, scene, gl } = useThree();
	const raycasterRef = useRef(new THREE.Raycaster());
	const mouseRef = useRef(new THREE.Vector2());

	const [pendingPoint, setPendingPoint] = useState<MeasurementPoint | null>(
		null,
	);
	const [completedMeasurements, setCompletedMeasurements] = useState<
		CompletedMeasurement[]
	>([]);
	const measurementColor = resolveThemeVariableValue("--measure-3d", "#17191d");

	const isActive = toolMode === "measure" && !presentationMode;

	useFrame(() => updatePointsThreshold(raycasterRef.current, camera));

	const handleClick = useCallback(
		(e: MouseEvent) => {
			if (!isActive) return;

			const rect = gl.domElement.getBoundingClientRect();
			mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

			raycasterRef.current.setFromCamera(mouseRef.current, camera);

			const targets: THREE.Object3D[] = [];
			scene.traverse((obj) => {
				if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
					targets.push(obj);
				}
			});

			const intersects = raycasterRef.current.intersectObjects(targets, false);
			if (intersects.length === 0) return;

			const hitPoint = intersects[0].point.clone();
			const id = `pt-${Date.now()}`;

			if (!pendingPoint) {
				setPendingPoint({ position: hitPoint, id });
			} else {
				const dist = calculateDistance(pendingPoint.position, hitPoint);
				const measurement: CompletedMeasurement = {
					id: `m-${Date.now()}`,
					p1: pendingPoint.position,
					p2: hitPoint,
					distance: dist,
				};
				setCompletedMeasurements((prev) => [...prev, measurement]);
				addMeasurement({
					id: measurement.id,
					type: "distance",
					points: [
						[
							pendingPoint.position.x,
							pendingPoint.position.y,
							pendingPoint.position.z,
						],
						[hitPoint.x, hitPoint.y, hitPoint.z],
					],
					value: dist,
					unit: "m",
				});
				setPendingPoint(null);
			}
		},
		[isActive, camera, scene, gl, pendingPoint, addMeasurement],
	);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if (e.key === "Escape") {
			setPendingPoint(null);
		}
	}, []);

	useEffect(() => {
		if (!isActive) {
			setPendingPoint(null);
			return;
		}
		gl.domElement.addEventListener("click", handleClick);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			gl.domElement.removeEventListener("click", handleClick);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isActive, handleClick, handleKeyDown, gl]);

	useEffect(() => {
		if (!isActive) {
			setCompletedMeasurements([]);
		}
	}, [isActive]);

	if (!isActive) return null;

	return (
		<>
			{pendingPoint && (
				<mesh position={pendingPoint.position}>
					<sphereGeometry args={[0.05, 8, 8]} />
					<meshBasicMaterial color={measurementColor} />
				</mesh>
			)}

			{completedMeasurements.map((m) => {
				const midpoint = getMidpoint(m.p1, m.p2);
				return (
					<group key={m.id}>
						<mesh position={m.p1}>
							<sphereGeometry args={[0.05, 8, 8]} />
							<meshBasicMaterial color={measurementColor} />
						</mesh>
						<mesh position={m.p2}>
							<sphereGeometry args={[0.05, 8, 8]} />
							<meshBasicMaterial color={measurementColor} />
						</mesh>
						<Line
							points={[m.p1, m.p2]}
							color={measurementColor}
							lineWidth={5}
							transparent
							opacity={0.24}
							toneMapped={false}
						/>
						<Line
							points={[m.p1, m.p2]}
							color={measurementColor}
							lineWidth={2.5}
							dashed
							dashSize={0.16}
							gapSize={0.08}
							toneMapped={false}
						/>
						<Html position={midpoint} center distanceFactor={10}>
							<div
								data-testid="measurement-label"
								className="whitespace-nowrap rounded border border-[color:var(--measure-3d)] bg-elevated px-2 py-1 text-xs text-strong pointer-events-none"
							>
								{formatDistance(m.distance)}
							</div>
						</Html>
					</group>
				);
			})}
		</>
	);
}
