import { beforeEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Layout } from "@/components/Layout";
import { useScanStore } from "@/store/scanStore";
import { useViewerStore } from "@/store/viewerStore";

function resetStore() {
	localStorage.removeItem("polycam-viewer-state");
	useViewerStore.setState({
		presentationMode: false,
		sidebarOpen: true,
		introContinueVisible: false,
		introPreset: null,
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

describe("browser presentation mode layout", () => {
	beforeEach(() => {
		resetStore();
	});

	test("presentation mode hides chrome and shows exit affordance", async () => {
		useViewerStore.setState({ presentationMode: true });
		const screen = await render(
			<Layout
				sidebar={<div>Sidebar</div>}
				toolbar={<div>Toolbar</div>}
				statusBar={<div>Status</div>}
			>
				<div data-testid="presentation-content">Content</div>
			</Layout>,
		);

		await expect.element(screen.getByTestId("canvas-container")).toBeVisible();
		await expect
			.element(screen.getByTestId("presentation-content"))
			.toBeVisible();
		await expect
			.element(screen.getByTestId("presentation-exit-btn"))
			.toBeVisible();
		await expect.element(screen.getByTestId("sidebar")).not.toBeInTheDocument();
		await expect.element(screen.getByTestId("toolbar")).not.toBeInTheDocument();
		await expect
			.element(screen.getByTestId("statusbar"))
			.not.toBeInTheDocument();
	});

	test("scan trigger button handles intro continuation", async () => {
		const screen = await render(
			<Layout>
				<div>Content</div>
			</Layout>,
		);

		useScanStore.setState({
			isScanRevealVisible: true,
			isScanning: false,
			hasCompletedScan: false,
			scanPhase: "expansion",
			scanT: 0.56,
			scanRadius: 5.1,
			scanOrigin: [0, 0, 0],
			maxRadius: 8.4,
			duration: 15,
		});
		useViewerStore.setState({
			presentationMode: true,
			introPreset: {
				version: 1,
				sceneId: "scan-a",
				enabled: true,
				camera: { position: [0, 0, 0], target: [0, 0, 0], fov: 50 },
				viewer: { viewMode: "mesh" },
				scan: {
					progress: 0.56,
					radius: 5.1,
					phase: "expansion",
					origin: [0, 0, 0],
					maxRadius: 8.4,
					duration: 15,
				},
				annotations: { openIds: [], triggeredIds: [], activeId: null },
				ui: { ctaLabel: "Continue Scan" },
				createdAt: 0,
				updatedAt: 0,
			},
		});

		const btn = screen.getByTestId("scan-trigger-btn");
		await expect.element(btn).toBeVisible();
		await expect.element(btn).toHaveClass("border-accent-soft");
		await expect.element(btn).toHaveClass("text-accent");
		expect(
			document.querySelector('[data-testid="continue-scan-cta"]'),
		).toBeNull();

		await btn.click();

		expect(useScanStore.getState().isScanning).toBe(true);
	});

	test("escape exits presentation mode without clearing open annotation panels", async () => {
		useViewerStore.setState({
			presentationMode: true,
			openAnnotationPanelIds: ["ann-1"],
		});
		await render(
			<Layout
				sidebar={<div>Sidebar</div>}
				toolbar={<div>Toolbar</div>}
				statusBar={<div>Status</div>}
			>
				<div>Content</div>
			</Layout>,
		);

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

		expect(useViewerStore.getState().presentationMode).toBe(false);
		expect(useViewerStore.getState().openAnnotationPanelIds).toEqual(["ann-1"]);
	});
});
