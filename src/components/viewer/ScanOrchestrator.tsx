import { Suspense, useCallback, useEffect, useRef } from "react";

import { useScanAnnotationTrigger } from "@/hooks/useScanAnnotationTrigger";
import { useScanEngine } from "@/hooks/useScanEngine";
import { useScanStore } from "@/store/scanStore";
import { useViewerStore } from "@/store/viewerStore";

import { ScanRevealGLBViewer } from "./ScanRevealGLBViewer";
import { ScanRevealPointCloudViewer } from "./ScanRevealPointCloudViewer";

interface ScanOrchestratorProps {
	glbUrl: string;
	plyUrl: string;
}

interface SceneBounds {
	radius: number;
	center: [number, number, number];
}

// Smallest sphere enclosing both input spheres. Both bounds arrive in the same
// scene (Y-up) space — the GLB viewer reports world bounds directly and the PLY
// viewer transforms its bounds into scene space — so the union is well defined.
function unionBounds(a: SceneBounds, b: SceneBounds): SceneBounds {
	const dx = b.center[0] - a.center[0];
	const dy = b.center[1] - a.center[1];
	const dz = b.center[2] - a.center[2];
	const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

	if (d + b.radius <= a.radius) return a; // b fully inside a
	if (d + a.radius <= b.radius) return b; // a fully inside b
	if (d === 0) {
		return { radius: Math.max(a.radius, b.radius), center: a.center };
	}

	const radius = (a.radius + b.radius + d) / 2;
	const t = (radius - a.radius) / d; // walk from a's center toward b's center
	return {
		radius,
		center: [
			a.center[0] + dx * t,
			a.center[1] + dy * t,
			a.center[2] + dz * t,
		],
	};
}

export function ScanOrchestrator({ glbUrl, plyUrl }: ScanOrchestratorProps) {
	const { uniformsRef } = useScanEngine();
	useScanAnnotationTrigger();
	const viewMode = useViewerStore((s) => s.viewMode);
	const activeSceneId = useViewerStore((s) => s.activeSceneId);

	// Latest bounds per source for the current scene. Reset on scene change so a
	// previous scene's origin/maxRadius never latches into the new scene.
	const boundsRef = useRef<{ glb: SceneBounds | null; ply: SceneBounds | null }>(
		{ glb: null, ply: null },
	);

	useEffect(() => {
		boundsRef.current = { glb: null, ply: null };
	}, [activeSceneId]);

	// Deterministic across resolution order: in "both" mode the applied bounds are
	// always the union of whichever sources have resolved, so whichever viewer
	// reports first the final result is identical once both are known.
	const applyBounds = useCallback(() => {
		const { glb, ply } = boundsRef.current;
		let effective: SceneBounds | null;
		if (viewMode === "mesh") {
			effective = glb;
		} else if (viewMode === "pointcloud") {
			effective = ply;
		} else if (glb && ply) {
			effective = unionBounds(glb, ply);
		} else {
			effective = glb ?? ply;
		}

		if (!effective) return;
		useScanStore.setState({
			maxRadius: effective.radius * 1.15,
			scanOrigin: effective.center,
		});
	}, [viewMode]);

	const handleGlbBounds = useCallback(
		(bounds: SceneBounds) => {
			boundsRef.current.glb = bounds;
			applyBounds();
		},
		[applyBounds],
	);

	const handlePointCloudBounds = useCallback(
		(bounds: SceneBounds) => {
			boundsRef.current.ply = bounds;
			applyBounds();
		},
		[applyBounds],
	);

	return (
		<Suspense fallback={null}>
			{(viewMode === "mesh" || viewMode === "both") && (
				<ScanRevealGLBViewer
					url={glbUrl}
					uniforms={uniformsRef.current}
					onBoundsReady={handleGlbBounds}
				/>
			)}
			{(viewMode === "pointcloud" || viewMode === "both") && (
				<ScanRevealPointCloudViewer
					url={plyUrl}
					uniforms={uniformsRef.current}
					onBoundsReady={handlePointCloudBounds}
				/>
			)}
		</Suspense>
	);
}
