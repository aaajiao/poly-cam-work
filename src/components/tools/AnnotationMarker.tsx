import { Html, useCursor } from "@react-three/drei";
import { type CSSProperties, useMemo, useState } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useViewerStore } from "@/store/viewerStore";
import type { Annotation } from "@/types";

interface AnnotationMarkerProps {
	annotation: Annotation;
	isActive: boolean;
	onSelect: () => void;
}

export function AnnotationMarker({
	annotation,
	isActive,
	onSelect,
}: AnnotationMarkerProps) {
	const [isHovered, setIsHovered] = useState(false);
	const setHoveredAnnotation = useViewerStore((s) => s.setHoveredAnnotation);
	useCursor(isHovered);

	const pulseProfile = useMemo(() => {
		let hash = 2166136261;
		for (let i = 0; i < annotation.id.length; i++) {
			hash ^= annotation.id.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		const seed = (hash >>> 0) / 0xffffffff;
		return {
			duration: 0.78 + seed * 0.42,
			scale: 1.16 + seed * 0.13,
			brightness: 1.2 + seed * 0.22,
		};
	}, [annotation.id]);

	const nodePulseStyle = useMemo(() => {
		if (!isActive || !isHovered) return undefined;
		return {
			"--node-pulse-duration": `${pulseProfile.duration.toFixed(2)}s`,
			"--node-pulse-scale": pulseProfile.scale.toFixed(3),
			"--node-pulse-brightness": pulseProfile.brightness.toFixed(3),
		} as CSSProperties & Record<string, string>;
	}, [isActive, isHovered, pulseProfile]);

	const position = new THREE.Vector3(...annotation.position);

	return (
		<Html
			position={position}
			distanceFactor={8}
			transform
			sprite
			occlude={false}
		>
			<button
				type="button"
				data-testid={`annotation-marker-${annotation.id}`}
				aria-label={annotation.title || "Open annotation"}
				className="relative cursor-pointer select-none border-0 bg-transparent p-0"
				style={{ pointerEvents: "auto" }}
				onClick={(e) => {
					e.stopPropagation();
					onSelect();
				}}
				onMouseEnter={() => {
					setIsHovered(true);
					if (isActive) {
						setHoveredAnnotation(annotation.id);
					}
				}}
				onMouseLeave={() => {
					setIsHovered(false);
					if (isActive) {
						setHoveredAnnotation(null);
					}
				}}
			>
				<div
					className={cn(
						"relative flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150",
						isActive ? "scale-110" : isHovered ? "scale-105" : "scale-100",
						!isActive && !isHovered && "annotation-breathe",
					)}
				>
					<div
						className={cn(
							"absolute inset-0 rounded-full border-2 transition-all duration-150",
							isActive
								? "border-[color:var(--signal-ring)] shadow-[0_0_28px_color-mix(in_oklab,var(--signal-halo-open)_100%,transparent)] ring-2 ring-[color:color-mix(in_oklab,var(--signal-open)_36%,transparent)]"
								: isHovered
									? "border-[color:var(--signal-ring)] shadow-[0_0_20px_color-mix(in_oklab,var(--signal-halo-hover)_100%,transparent)] ring-2 ring-[color:color-mix(in_oklab,var(--signal-hover)_24%,transparent)]"
									: "border-[color:var(--signal-ring-soft)] shadow-[0_0_14px_color-mix(in_oklab,var(--signal-halo-closed)_100%,transparent)] ring-1 ring-[color:color-mix(in_oklab,var(--signal-ring)_22%,transparent)] opacity-95",
							isActive && isHovered && "annotation-node-pulse",
						)}
						style={nodePulseStyle}
					/>
					<div
						className={cn(
							"h-3 w-3 rounded-full transition-all duration-150 shadow-[0_0_14px_color-mix(in_oklab,var(--signal-halo-closed)_100%,transparent)]",
							isActive
								? "bg-[var(--signal-open)] shadow-[0_0_18px_color-mix(in_oklab,var(--signal-halo-open)_100%,transparent)]"
								: isHovered
									? "bg-[var(--signal-hover)] shadow-[0_0_16px_color-mix(in_oklab,var(--signal-halo-hover)_100%,transparent)]"
									: "bg-[var(--signal-closed)]",
						)}
					/>
				</div>
				{isHovered && !isActive && (
					<div className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded border border-subtle bg-elevated px-1.5 py-0 shadow-panel">
						<span className="text-[10px] font-medium text-soft">
							{annotation.title}
						</span>
					</div>
				)}
			</button>
		</Html>
	);
}
