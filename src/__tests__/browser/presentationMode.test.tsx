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

	test("continue scan CTA appears when introContinueVisible is true", async () => {
		const screen = await render(
			<Layout>
				<div>Content</div>
			</Layout>,
		);

		useViewerStore.setState({
			presentationMode: true,
			introContinueVisible: true,
		});

		const cta = screen.getByTestId("continue-scan-cta");
		await expect.element(cta).toBeVisible();
		await expect.element(cta).toHaveClass("rounded-full");
		await expect.element(cta).toHaveClass("bg-panel");
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
