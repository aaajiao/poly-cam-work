import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { useScanStore } from "@/store/scanStore";
import { useViewerStore } from "@/store/viewerStore";

function resetStore() {
	localStorage.removeItem("polycam-viewer-state");
	useViewerStore.setState({
		activeSceneId: "scan-a",
		toolMode: "orbit",
		annotationsVisible: true,
		openAnnotationPanelIds: [],
		annotationsPanelOpen: false,
		sidebarOpen: false,
		presentationMode: false,
		cameraControlsEnabled: true,
		cloudScenesLoaded: true,
		isLoading: false,
		isAuthenticated: false,
		introPreset: null,
		introPresetStatus: "idle",
		introPresetError: null,
		clipPlane: { enabled: false, axis: "y", position: 0.5, flipped: false },
	});
	useScanStore.setState({
		isScanning: false,
		isScanRevealVisible: false,
		scanPhase: "idle",
		scanT: 0,
		hasCompletedScan: false,
		scanOrigin: [0, 0, 0],
		scanRadius: 0,
		maxRadius: 50,
		duration: 15,
		triggeredAnnotationIds: [],
		activeAnnotationId: null,
	});
}

describe("browser toolbar tools", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		resetStore();
	});

	test("orbit tool is active by default and measure can be activated", async () => {
		const screen = await render(<Toolbar />);

		await expect
			.element(screen.getByTestId("tool-orbit"))
			.toHaveClass("bg-accent-soft");
		await screen.getByTestId("tool-measure").click();

		await expect
			.element(screen.getByTestId("tool-measure"))
			.toHaveClass("bg-accent-soft");
		await expect
			.element(screen.getByTestId("tool-orbit"))
			.not.toHaveClass("bg-accent-soft");
		expect(useViewerStore.getState().toolMode).toBe("measure");
	});

	test("clip toggle enables and disables clipping without changing tool mode", async () => {
		const screen = await render(<Toolbar />);

		await screen.getByTestId("clip-toggle").click();
		await expect
			.element(screen.getByTestId("clip-toggle"))
			.toHaveClass("bg-accent-soft");
		expect(useViewerStore.getState().clipPlane.enabled).toBe(true);
		expect(useViewerStore.getState().toolMode).toBe("orbit");

		await screen.getByTestId("clip-toggle").click();
		await expect
			.element(screen.getByTestId("clip-toggle"))
			.not.toHaveClass("bg-accent-soft");
		expect(useViewerStore.getState().clipPlane.enabled).toBe(false);
		expect(useViewerStore.getState().toolMode).toBe("orbit");
	});

	test("annotate tool activates and opens annotation panel", async () => {
		const screen = await render(<Toolbar />);

		await screen.getByTestId("tool-annotate").click();

		await expect
			.element(screen.getByTestId("tool-annotate"))
			.toHaveClass("bg-accent-soft");
		expect(useViewerStore.getState().toolMode).toBe("annotate");
		expect(useViewerStore.getState().annotationsPanelOpen).toBe(true);
	});

	test("annotation visibility toggle reflects hidden/visible state", async () => {
		const screen = await render(<Toolbar />);

		const toggle = screen.getByTestId("toggle-annotations-btn");
		await expect.element(toggle).toHaveClass("bg-accent-soft");

		await toggle.click();
		await expect.element(toggle).toHaveClass("bg-panel");
		expect(useViewerStore.getState().annotationsVisible).toBe(false);

		await toggle.click();
		await expect.element(toggle).toHaveClass("bg-accent-soft");
		expect(useViewerStore.getState().annotationsVisible).toBe(true);
	});

	test("presentation button toggles presentation mode", async () => {
		const screen = await render(<Toolbar />);

		await expect
			.element(screen.getByTestId("presentation-mode-btn"))
			.toBeVisible();
		await screen.getByTestId("presentation-mode-btn").click();
		expect(useViewerStore.getState().presentationMode).toBe(true);
	});

	test("scan control starts and stops scan playback", async () => {
		const screen = await render(<Toolbar />);

		const scanButton = screen.getByTestId("scan-trigger-btn");
		await expect.element(scanButton).toBeEnabled();

		await scanButton.click();
		expect(useScanStore.getState().isScanning).toBe(true);
		expect(useScanStore.getState().scanPhase).toBe("origin");

		await scanButton.click();
		expect(useScanStore.getState().isScanning).toBe(false);
		expect(useScanStore.getState().scanPhase).toBe("idle");
	});

	test("scan control reflects replay state after a completed scan", async () => {
		useScanStore.setState({ hasCompletedScan: true });
		const screen = await render(<Toolbar />);

		await expect.element(screen.getByText("Replay")).toBeVisible();
	});

	test("toolbar controls do not activate editing while presentation mode is on", async () => {
		useViewerStore.setState({
			presentationMode: true,
			toolMode: "orbit",
			clipPlane: { enabled: false, axis: "y", position: 0.5, flipped: false },
		});
		const screen = await render(<Toolbar />);

		await expect.element(screen.getByTestId("tool-annotate")).toBeDisabled();
		await expect.element(screen.getByTestId("clip-toggle")).toBeDisabled();

		expect(useViewerStore.getState().toolMode).toBe("orbit");
		expect(useViewerStore.getState().clipPlane.enabled).toBe(false);
	});

	test("capture intro button stays disabled after a preset exists", async () => {
		useViewerStore.setState({
			isAuthenticated: true,
			introPreset: {
				version: 1,
				sceneId: "scan-a",
				enabled: true,
				camera: {
					position: [0, 5, 15],
					target: [0, 0, 0],
					fov: 50,
				},
				viewer: { viewMode: "mesh" },
				scan: {
					progress: 0,
					radius: 0,
					phase: "origin",
					origin: [0, 0, 0],
					maxRadius: 50,
					duration: 15,
				},
				annotations: {
					openIds: [],
					triggeredIds: [],
					activeId: null,
				},
				ui: { ctaLabel: "Continue Scan" },
				createdAt: 1,
				updatedAt: 2,
			},
		});

		const screen = await render(<Toolbar />);

		await expect
			.element(screen.getByTestId("capture-intro-btn"))
			.toBeDisabled();
		await expect.element(screen.getByTestId("clear-intro-btn")).toBeEnabled();
	});

	test("intro capture errors are shown in the toolbar", async () => {
		useViewerStore.setState({
			isAuthenticated: true,
			introPresetError: "Failed to capture intro preset",
		});

		const screen = await render(<Toolbar />);

		await expect
			.element(screen.getByTestId("intro-preset-error"))
			.toHaveTextContent("Failed to capture intro preset");
	});
});
