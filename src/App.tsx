import "./index.css";
import { useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { StatusBar } from "@/components/ui/StatusBar";
import { SceneCanvas } from "@/components/viewer/SceneCanvas";
import { useScanStore } from "@/store/scanStore";
import { useViewerStore } from "@/store/viewerStore";

export default function App() {
	const activeSceneId = useViewerStore((state) => state.activeSceneId);
	const annotations = useViewerStore((state) => state.annotations);
	const draftDirtyByScene = useViewerStore((state) => state.draftDirtyByScene);
	const draftRevisionSourceByScene = useViewerStore(
		(state) => state.draftRevisionSourceByScene,
	);
	const sceneMutationVersion = useViewerStore(
		(state) => state.sceneMutationVersion,
	);
	const loadDraft = useViewerStore((state) => state.loadDraft);
	const loadCloudScenes = useViewerStore((state) => state.loadCloudScenes);
	const loadDiscoveredScenes = useViewerStore(
		(state) => state.loadDiscoveredScenes,
	);
	const refreshAuthSession = useViewerStore(
		(state) => state.refreshAuthSession,
	);
	const isAuthenticated = useViewerStore((state) => state.isAuthenticated);
	const loadIntroPreset = useViewerStore((state) => state.loadIntroPreset);
	const attemptedSceneLoadsRef = useRef<Set<string>>(new Set());
	const activeSceneMutationVersion = activeSceneId
		? (sceneMutationVersion[activeSceneId] ?? 0)
		: 0;

	useEffect(() => {
		void refreshAuthSession();
	}, [refreshAuthSession]);

	useEffect(() => {
		void loadCloudScenes();
	}, [loadCloudScenes]);

	useEffect(() => {
		void loadDiscoveredScenes();
	}, [loadDiscoveredScenes]);

	useEffect(() => {
		if (!activeSceneId) return;

		const isSceneDirty = draftDirtyByScene[activeSceneId] ?? false;
		if (isSceneDirty) return;

		// After logging in on a scene whose content was loaded from a release
		// (anonymous fallback), we must still fetch the server draft so a later
		// save does not silently overwrite it. The dirty guard above keeps us
		// from clobbering local edits.
		const revisionSource = draftRevisionSourceByScene[activeSceneId];
		const shouldReloadReleaseAfterAuth =
			isAuthenticated && revisionSource === "release";

		const hasLocalSceneAnnotations = annotations.some(
			(annotation) => annotation.sceneId === activeSceneId,
		);
		if (hasLocalSceneAnnotations && !shouldReloadReleaseAfterAuth) return;

		const authMode = isAuthenticated ? "auth" : "anon";
		const loadKey = `${activeSceneId}:${authMode}:${activeSceneMutationVersion}`;
		if (attemptedSceneLoadsRef.current.has(loadKey)) return;
		attemptedSceneLoadsRef.current.add(loadKey);

		void loadDraft(activeSceneId);
	}, [
		activeSceneId,
		activeSceneMutationVersion,
		annotations,
		draftDirtyByScene,
		draftRevisionSourceByScene,
		isAuthenticated,
		loadDraft,
	]);

	useEffect(() => {
		if (!activeSceneId) return;

		if (isAuthenticated) {
			useScanStore.getState().resetScan();
			return;
		}

		void loadIntroPreset(activeSceneId, "live");
	}, [activeSceneId, isAuthenticated, loadIntroPreset]);

	return (
		<>
			<Layout
				sidebar={
					<ErrorBoundary
						fallback={
							<div className="p-4 text-xs text-faint">Sidebar unavailable.</div>
						}
					>
						<Sidebar />
					</ErrorBoundary>
				}
				toolbar={
					<ErrorBoundary
						fallback={
							<div className="px-2 text-xs text-faint">Toolbar unavailable.</div>
						}
					>
						<Toolbar />
					</ErrorBoundary>
				}
				statusBar={<StatusBar />}
			>
				<ErrorBoundary>
					<SceneCanvas />
				</ErrorBoundary>
			</Layout>
		</>
	);
}
