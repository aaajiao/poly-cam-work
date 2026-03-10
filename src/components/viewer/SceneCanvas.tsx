import { Environment, OrbitControls, Stats } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
	type RefObject,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type * as THREE from "three";
import { AnnotationMarkers } from "@/components/tools/AnnotationMarkers";
import { AnnotationPanel } from "@/components/tools/AnnotationPanel";
import { AnnotationTool } from "@/components/tools/AnnotationTool";
import { ClippingPlaneController } from "@/components/tools/ClippingPlane";
import { MeasurementTool } from "@/components/tools/MeasurementTool";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { useScanStore } from "@/store/scanStore";
import { useActiveScene, useViewerStore } from "@/store/viewerStore";
import { GLBViewer } from "./GLBViewer";
import { PointCloudViewer } from "./PointCloudViewer";
import { PresentationGizmo } from "./PresentationGizmo";
import { ScanOrchestrator } from "./ScanOrchestrator";

function LoadingFallback() {
	return (
		<mesh>
			<boxGeometry args={[1, 1, 1]} />
			<meshBasicMaterial color="hsl(240 5% 28%)" wireframe />
		</mesh>
	);
}

function CameraController() {
	const { camera, controls } = useThree();
	const activeScene = useActiveScene();
	const prevSceneId = useRef<string | null>(null);

	useEffect(() => {
		if (!activeScene || activeScene.id === prevSceneId.current) return;
		prevSceneId.current = activeScene.id;

		camera.position.set(0, 5, 15);
		camera.lookAt(0, 0, 0);

		if (controls && "target" in controls) {
			(controls as { target: THREE.Vector3 }).target.set(0, 0, 0);
		}
	}, [activeScene, camera, controls]);

	return null;
}

function RuntimeCameraSync() {
	const { camera, controls } = useThree();
	const setRuntimeCamera = useViewerStore((s) => s.setRuntimeCamera);
	const lastSnapshotRef = useRef("");

	useFrame(() => {
		const target =
			controls && "target" in controls
				? [
						(controls as { target: THREE.Vector3 }).target.x,
						(controls as { target: THREE.Vector3 }).target.y,
						(controls as { target: THREE.Vector3 }).target.z,
					]
				: [0, 0, 0];
		const snapshot = {
			position: [camera.position.x, camera.position.y, camera.position.z] as [
				number,
				number,
				number,
			],
			target: target as [number, number, number],
			fov: "fov" in camera ? camera.fov : 50,
		};
		const nextKey = JSON.stringify([
			...snapshot.position.map((value) => Number(value.toFixed(4))),
			...snapshot.target.map((value) => Number(value.toFixed(4))),
			Number(snapshot.fov?.toFixed(2) ?? 50),
		]);

		if (nextKey === lastSnapshotRef.current) return;

		lastSnapshotRef.current = nextKey;
		setRuntimeCamera(snapshot);
	});

	return null;
}

function IntroPresetController({ sceneReady }: { sceneReady: boolean }) {
	const { camera, controls } = useThree();
	const activeScene = useActiveScene();
	const isAuthenticated = useViewerStore((s) => s.isAuthenticated);
	const introPreset = useViewerStore((s) => s.introPreset);
	const setViewMode = useViewerStore((s) => s.setViewMode);
	const clearAnnotationPanels = useViewerStore((s) => s.clearAnnotationPanels);
	const openAnnotationPanel = useViewerStore((s) => s.openAnnotationPanel);
	const selectAnnotation = useViewerStore((s) => s.selectAnnotation);
	const setIntroContinueVisible = useViewerStore(
		(s) => s.setIntroContinueVisible,
	);
	const appliedKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!activeScene) {
			appliedKeyRef.current = null;
		}
	}, [activeScene]);

	useEffect(() => {
		if (isAuthenticated) {
			setIntroContinueVisible(false);
		}
	}, [isAuthenticated, setIntroContinueVisible]);

	useEffect(() => {
		if (!sceneReady || !activeScene || isAuthenticated || !introPreset) return;
		if (introPreset.sceneId !== activeScene.id) return;

		const applyKey = `${activeScene.id}:${introPreset.updatedAt}`;
		if (appliedKeyRef.current === applyKey) return;

		let cancelled = false;
		let innerFrame = 0;
		const outerFrame = requestAnimationFrame(() => {
			innerFrame = requestAnimationFrame(() => {
				if (cancelled) return;

				camera.position.set(...introPreset.camera.position);
				if ("fov" in camera && typeof introPreset.camera.fov === "number") {
					camera.fov = introPreset.camera.fov;
					camera.updateProjectionMatrix();
				}

				if (controls && "target" in controls) {
					(controls as { target: THREE.Vector3 }).target.set(
						...introPreset.camera.target,
					);
					if ("update" in controls && typeof controls.update === "function") {
						controls.update();
					}
				} else {
					camera.lookAt(...introPreset.camera.target);
				}

				setViewMode(introPreset.viewer.viewMode);
				clearAnnotationPanels();
				useViewerStore.setState({
					annotationPanelOffsets: introPreset.annotations.panelOffsets ?? {},
					annotationMediaSizes: introPreset.annotations.mediaSizes ?? {},
				});
				selectAnnotation(introPreset.annotations.activeId);
				for (const id of introPreset.annotations.openIds) {
					openAnnotationPanel(id);
				}

				useScanStore.getState().applyIntroScanSnapshot(introPreset);
				setIntroContinueVisible(true);
				appliedKeyRef.current = applyKey;
			});
		});

		return () => {
			cancelled = true;
			cancelAnimationFrame(outerFrame);
			cancelAnimationFrame(innerFrame);
		};
	}, [
		activeScene,
		camera,
		clearAnnotationPanels,
		controls,
		introPreset,
		isAuthenticated,
		openAnnotationPanel,
		sceneReady,
		selectAnnotation,
		setIntroContinueVisible,
		setViewMode,
	]);

	return null;
}

const DIALOG_WIDTH = 224; // w-56 = 14rem = 224px
const DIALOG_HEIGHT = 120; // approximate height

function AnnotationInputDialog() {
	const pendingAnnotationInput = useViewerStore(
		(s) => s.pendingAnnotationInput,
	);
	const presentationMode = useViewerStore((s) => s.presentationMode);
	const isAuthenticated = useViewerStore((s) => s.isAuthenticated);
	const setPendingAnnotationInput = useViewerStore(
		(s) => s.setPendingAnnotationInput,
	);
	const addAnnotation = useViewerStore((s) => s.addAnnotation);
	const openAnnotationPanel = useViewerStore((s) => s.openAnnotationPanel);
	const selectAnnotation = useViewerStore((s) => s.selectAnnotation);
	const activeSceneId = useViewerStore((s) => s.activeSceneId);
	const [inputText, setInputText] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (pendingAnnotationInput) {
			inputRef.current?.focus();
		}
	}, [pendingAnnotationInput]);

	const handleConfirm = useCallback(() => {
		if (
			presentationMode ||
			!pendingAnnotationInput ||
			!inputText.trim() ||
			!activeSceneId
		)
			return;
		const newId = `ann-${Date.now()}`;
		addAnnotation({
			id: newId,
			position: pendingAnnotationInput.worldPos,
			normal: pendingAnnotationInput.normal,
			title: inputText.trim(),
			description: "",
			images: [],
			videoUrl: null,
			links: [],
			sceneId: activeSceneId,
			createdAt: Date.now(),
		});
		openAnnotationPanel(newId);
		selectAnnotation(newId);
		setPendingAnnotationInput(null);
		setInputText("");
	}, [
		presentationMode,
		pendingAnnotationInput,
		inputText,
		activeSceneId,
		addAnnotation,
		openAnnotationPanel,
		selectAnnotation,
		setPendingAnnotationInput,
	]);

	const handleCancel = useCallback(() => {
		setPendingAnnotationInput(null);
		setInputText("");
	}, [setPendingAnnotationInput]);

	if (presentationMode || !isAuthenticated || !pendingAnnotationInput)
		return null;

	const clampedLeft = Math.min(
		Math.max(pendingAnnotationInput.screenPos.x + 10, 8),
		window.innerWidth - DIALOG_WIDTH - 8,
	);
	const clampedTop = Math.min(
		Math.max(pendingAnnotationInput.screenPos.y - 20, 8),
		window.innerHeight - DIALOG_HEIGHT - 8,
	);

	return (
		<div
			data-testid="annotation-input-dialog"
			className="fixed z-50 w-56 rounded-lg border border-strong bg-elevated p-3 shadow-panel"
			style={{ left: clampedLeft, top: clampedTop }}
		>
			<p className="mb-2 text-xs text-dim">Add annotation</p>
			<input
				ref={inputRef}
				value={inputText}
				onChange={(e) => setInputText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleConfirm();
					if (e.key === "Escape") handleCancel();
				}}
				placeholder="Enter label text..."
				className="mb-2 w-full rounded border border-subtle bg-field px-2 py-1.5 text-sm text-strong outline-none focus:border-[color:var(--accent-border)]"
				data-testid="annotation-text-input"
			/>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleConfirm}
					disabled={!inputText.trim()}
					className="ui-hover-emphasis flex-1 rounded bg-primary py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					data-testid="annotation-confirm-btn"
				>
					Add
				</button>
				<button
					type="button"
					onClick={handleCancel}
					className="ui-hover-emphasis flex-1 rounded bg-field py-1.5 text-xs text-dim transition-colors hover:bg-field-hover hover:text-soft"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}

export function SceneCanvas() {
	const activeScene = useActiveScene();
	const cloudScenesLoaded = useViewerStore((s) => s.cloudScenesLoaded);
	const viewMode = useViewerStore((s) => s.viewMode);
	const presentationMode = useViewerStore((s) => s.presentationMode);
	const isLoading = useViewerStore((s) => s.isLoading);
	const loadingProgress = useViewerStore((s) => s.loadingProgress);
	const loadingMessage = useViewerStore((s) => s.loadingMessage);
	const toolMode = useViewerStore((s) => s.toolMode);
	const cameraControlsEnabled = useViewerStore((s) => s.cameraControlsEnabled);
	const selectedAnnotationId = useViewerStore((s) => s.selectedAnnotationId);
	const selectAnnotation = useViewerStore((s) => s.selectAnnotation);
	const isScanRevealVisible = useScanStore((s) => s.isScanRevealVisible);
	const [statsHost, setStatsHost] = useState<HTMLElement | null>(null);
	const [gizmoInteractionActive, setGizmoInteractionActive] = useState(false);

	// In production, wait for cloud scene URLs before rendering viewers
	// to avoid loading local /models/ paths that don't exist on Vercel
	const sceneReady = import.meta.env.DEV || cloudScenesLoaded;

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		if (presentationMode) return;
		const host = document.getElementById("fps-toolbar-slot");
		if (host instanceof HTMLElement) {
			setStatsHost(host);
		}
	}, [presentationMode]);

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "\\") {
				e.preventDefault();
				const store = useScanStore.getState();
				if (store.isScanning) {
					store.stopScan();
				} else {
					store.startScan(50, 15);
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	const handlePointerMissed = useCallback(() => {
		if (toolMode !== "annotate" && selectedAnnotationId) {
			selectAnnotation(null);
		}
	}, [toolMode, selectedAnnotationId, selectAnnotation]);

	const handleGizmoInteractionStart = useCallback(() => {
		setGizmoInteractionActive(true);
	}, []);

	const handleGizmoInteractionEnd = useCallback(() => {
		setGizmoInteractionActive(false);
	}, []);

	return (
		<div className="w-full h-full relative" data-testid="scene-canvas">
			<Canvas
				camera={{ position: [0, 5, 15], fov: 50, near: 0.01, far: 1000 }}
				gl={{
					antialias: true,
					toneMapping: 3,
					toneMappingExposure: 1,
				}}
				shadows
				onPointerMissed={handlePointerMissed}
			>
				<ambientLight intensity={0.6} />
				<directionalLight
					position={[10, 20, 10]}
					intensity={1.2}
					castShadow
					shadow-mapSize={[2048, 2048]}
				/>
				<directionalLight position={[-10, 10, -10]} intensity={0.4} />

				<Environment preset="city" />

				{activeScene && sceneReady && isScanRevealVisible && (
					<ScanOrchestrator
						glbUrl={activeScene.glbUrl}
						plyUrl={activeScene.plyUrl}
					/>
				)}

				<Suspense fallback={<LoadingFallback />}>
					{activeScene &&
						sceneReady &&
						!isScanRevealVisible &&
						(viewMode === "mesh" || viewMode === "both") && (
							<GLBViewer url={activeScene.glbUrl} />
						)}
					{activeScene &&
						sceneReady &&
						!isScanRevealVisible &&
						(viewMode === "pointcloud" || viewMode === "both") && (
							<PointCloudViewer url={activeScene.plyUrl} />
						)}
				</Suspense>

				<OrbitControls
					makeDefault
					enabled={cameraControlsEnabled}
					enableDamping
					dampingFactor={0.05}
					minDistance={0.5}
					maxDistance={200}
					onStart={handleGizmoInteractionStart}
					onEnd={handleGizmoInteractionEnd}
				/>

				<CameraController />
				<RuntimeCameraSync />
				<IntroPresetController sceneReady={sceneReady} />

				<MeasurementTool />
				<ClippingPlaneController />
				<AnnotationTool />
				<AnnotationMarkers />
				<AnnotationPanel />

				<PresentationGizmo
					presentationMode={presentationMode}
					interactionActive={gizmoInteractionActive}
					onInteractionStart={handleGizmoInteractionStart}
					onInteractionEnd={handleGizmoInteractionEnd}
				/>

				{import.meta.env.DEV && statsHost && (
					<Stats
						className="stats-panel-inline"
						parent={{ current: statsHost } as RefObject<HTMLElement>}
						showPanel={0}
					/>
				)}
			</Canvas>

			<LoadingOverlay
				visible={isLoading}
				progress={loadingProgress}
				message={loadingMessage}
			/>

			<AnnotationInputDialog />
		</div>
	);
}
