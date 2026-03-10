import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScanAnnotationTrigger } from "@/hooks/useScanAnnotationTrigger";
import { useScanStore } from "@/store/scanStore";
import { useViewerStore } from "@/store/viewerStore";
import type { Annotation } from "@/types";

type FrameCallback = (state: unknown, delta: number) => void;

const frameCallbacks: FrameCallback[] = [];

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@react-three/fiber", () => ({
	useFrame: (callback: FrameCallback) => {
		frameCallbacks.push(callback);
	},
}));

function Harness() {
	useScanAnnotationTrigger();
	return null;
}

function makeAnnotation(
	id: string,
	position: [number, number, number],
	sceneId = "scan-a",
): Annotation {
	return {
		id,
		position,
		title: id,
		description: "",
		images: [],
		videoUrl: null,
		links: [],
		sceneId,
		createdAt: 1709600000000,
	};
}

function resetStores() {
	localStorage.removeItem("polycam-viewer-state");
	useViewerStore.setState({
		activeSceneId: "scan-a",
		annotations: [],
		selectedAnnotationId: null,
		openAnnotationPanelIds: [],
		annotationsVisible: true,
		annotationsPanelOpen: false,
		presentationMode: false,
		cameraControlsEnabled: true,
		toolMode: "orbit",
		clipPlane: { enabled: false, axis: "y", position: 0.5, flipped: false },
	});
	useScanStore.setState({
		isScanning: false,
		scanPhase: "idle",
		scanT: 0,
		scanOrigin: [0, 0, 0],
		scanRadius: 0,
		maxRadius: 50,
		duration: 15,
		triggeredAnnotationIds: [],
		activeAnnotationId: null,
	});
}

describe("useScanAnnotationTrigger", () => {
	let container: HTMLDivElement;
	let root: Root;
	let now = 0;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.restoreAllMocks();
		frameCallbacks.length = 0;
		resetStores();
		now = 0;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => {
			root.render(createElement(Harness));
		});
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		vi.useRealTimers();
	});

	function runFrame(advanceMs: number, delta = 0.016) {
		now += advanceMs;
		act(() => {
			for (const callback of frameCallbacks) {
				callback({}, delta);
			}
		});
	}

	it("opens nearest annotations in scan order and accumulates panels", () => {
		useViewerStore.setState({
			annotations: [
				makeAnnotation("ann-near", [1, 0, 0]),
				makeAnnotation("ann-far", [3, 0, 0]),
				makeAnnotation("ann-other-scene", [0.5, 0, 0], "scan-b"),
			],
		});
		useScanStore.setState({
			isScanning: true,
			scanPhase: "expansion",
			scanOrigin: [0, 0, 0],
			scanRadius: 1.5,
		});

		runFrame(1300);

		expect(useScanStore.getState().triggeredAnnotationIds).toEqual([
			"ann-near",
		]);
		expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([
			"ann-near",
		]);
		expect(useViewerStore.getState().selectedAnnotationId).toBe("ann-near");
		expect(useScanStore.getState().activeAnnotationId).toBe("ann-near");

		useScanStore.setState({ scanRadius: 3.5 });
		runFrame(1201);

		expect(useScanStore.getState().triggeredAnnotationIds).toEqual([
			"ann-near",
			"ann-far",
		]);
		expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([
			"ann-near",
			"ann-far",
		]);
		expect(useViewerStore.getState().selectedAnnotationId).toBe("ann-far");
	});

	it("closes triggered panels sequentially and stops scan after complete", () => {
		useViewerStore.setState({
			annotations: [
				makeAnnotation("ann-a", [1, 0, 0]),
				makeAnnotation("ann-b", [3, 0, 0]),
			],
		});
		useScanStore.setState({
			isScanning: true,
			scanPhase: "expansion",
			scanOrigin: [0, 0, 0],
			scanRadius: 4,
		});

		runFrame(1300);
		runFrame(1201);

		expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([
			"ann-a",
			"ann-b",
		]);

		act(() => {
			useScanStore.getState().setScanProgress(1, 4, "complete");
		});

		act(() => {
			vi.advanceTimersByTime(2999);
		});
		expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([
			"ann-a",
			"ann-b",
		]);

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(useViewerStore.getState().openAnnotationPanelIds).toEqual(["ann-b"]);
		expect(useScanStore.getState().isScanning).toBe(true);

		act(() => {
			vi.advanceTimersByTime(1499);
		});
		expect(useViewerStore.getState().openAnnotationPanelIds).toEqual(["ann-b"]);

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([]);
		expect(useViewerStore.getState().selectedAnnotationId).toBeNull();
		expect(useScanStore.getState().activeAnnotationId).toBeNull();
		expect(useScanStore.getState().isScanning).toBe(false);
		expect(useScanStore.getState().scanPhase).toBe("idle");
	});
});
