import { Suspense, useCallback, useRef } from "react";

import { useScanEngine } from "@/hooks/useScanEngine";
import { useScanStore } from "@/store/scanStore";
import { useViewerStore } from "@/store/viewerStore";

import { ScanRevealGLBViewer } from "./ScanRevealGLBViewer";

interface ScanOrchestratorProps {
	glbUrl: string;
	plyUrl: string;
}

export function ScanOrchestrator({
	glbUrl,
	plyUrl: _plyUrl,
}: ScanOrchestratorProps) {
	const { uniformsRef } = useScanEngine();
	const viewMode = useViewerStore((s) => s.viewMode);
	const boundsApplied = useRef(false);

	const handleBoundsReady = useCallback(
		(bounds: { radius: number; center: [number, number, number] }) => {
			if (boundsApplied.current) return;
			boundsApplied.current = true;
			useScanStore.setState({
				maxRadius: bounds.radius * 1.15,
				scanOrigin: bounds.center,
			});
		},
		[],
	);

	return (
		<Suspense fallback={null}>
			{(viewMode === "mesh" || viewMode === "both") && (
				<ScanRevealGLBViewer
					url={glbUrl}
					uniforms={uniformsRef.current}
					onBoundsReady={handleBoundsReady}
				/>
			)}
		</Suspense>
	);
}
