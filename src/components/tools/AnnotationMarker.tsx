import { Html, useCursor } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
	type CSSProperties,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Video } from "lucide-react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useViewerStore } from "@/store/viewerStore";
import type { Annotation } from "@/types";
import { getAnnotationMarkerVisualScale } from "@/utils/annotationMarkerScale";

const BASE_MARKER_SIZE_PX = 24;
const BASE_LABEL_SIZE_PX = 12;
const TOOLTIP_GAP_PX = 6;
const TOOLTIP_VIEWPORT_MARGIN_PX = 8;

type AnnotationMarkerStyle = CSSProperties & {
	"--annotation-marker-scale": string;
	"--annotation-label-size": string;
};

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
	const [isFocused, setIsFocused] = useState(false);
	const setHoveredAnnotation = useViewerStore((s) => s.setHoveredAnnotation);
	const { camera, size } = useThree();
	const markerRootRef = useRef<HTMLButtonElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const cameraSpacePositionRef = useRef(new THREE.Vector3());
	const lastMarkerPxRef = useRef(BASE_MARKER_SIZE_PX);
	const lastLabelPxRef = useRef(BASE_LABEL_SIZE_PX);
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
		if (!isActive || (!isHovered && !isFocused)) return undefined;
		return {
			"--node-pulse-duration": `${pulseProfile.duration.toFixed(2)}s`,
			"--node-pulse-scale": pulseProfile.scale.toFixed(3),
			"--node-pulse-brightness": pulseProfile.brightness.toFixed(3),
		} as CSSProperties & Record<string, string>;
	}, [isActive, isFocused, isHovered, pulseProfile]);

	const position = useMemo(
		() => new THREE.Vector3(...annotation.position),
		[annotation.position],
	);
	const showTooltip = (isHovered || isFocused) && !isActive;

	const syncTooltipPosition = useCallback(() => {
		const root = markerRootRef.current;
		const tooltip = tooltipRef.current;
		if (!root || !tooltip) return;

		const markerRect = root.getBoundingClientRect();
		const tooltipRect = tooltip.getBoundingClientRect();
		const markerRadius = lastMarkerPxRef.current * 0.5;
		const sideOffset = markerRadius + TOOLTIP_GAP_PX;
		const markerCenterX = markerRect.left + markerRect.width * 0.5;
		const markerCenterY = markerRect.top + markerRect.height * 0.5;
		const spaceOnRight = window.innerWidth - markerCenterX - sideOffset;
		const spaceOnLeft = markerCenterX - sideOffset;
		const placeOnLeft =
			spaceOnRight < tooltipRect.width + TOOLTIP_VIEWPORT_MARGIN_PX &&
			spaceOnLeft >= tooltipRect.width + TOOLTIP_VIEWPORT_MARGIN_PX;
		const desiredTop = markerCenterY - tooltipRect.height * 0.5;
		const minimumTop = TOOLTIP_VIEWPORT_MARGIN_PX;
		const maximumTop = Math.max(
			minimumTop,
			window.innerHeight - TOOLTIP_VIEWPORT_MARGIN_PX - tooltipRect.height,
		);
		const verticalOffset =
			THREE.MathUtils.clamp(desiredTop, minimumTop, maximumTop) - desiredTop;

		// All layout reads happen above; batch style writes below to avoid reflow loops.
		if (placeOnLeft) {
			tooltip.style.left = "auto";
			tooltip.style.right = `calc(50% + ${sideOffset}px)`;
		} else {
			tooltip.style.left = `calc(50% + ${sideOffset}px)`;
			tooltip.style.right = "auto";
		}

		tooltip.style.setProperty(
			"--annotation-tooltip-y",
			`${verticalOffset}px`,
		);
	}, []);

	useLayoutEffect(() => {
		if (!showTooltip) return;

		const frame = requestAnimationFrame(syncTooltipPosition);
		window.addEventListener("resize", syncTooltipPosition);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("resize", syncTooltipPosition);
		};
	}, [showTooltip, annotation.title, syncTooltipPosition]);

	useFrame(() => {
		const root = markerRootRef.current;
		if (!root) return;

		let markerPx = BASE_MARKER_SIZE_PX;
		let labelPx = BASE_LABEL_SIZE_PX;
		if (camera instanceof THREE.PerspectiveCamera) {
			const cameraSpaceDepth = -cameraSpacePositionRef.current
				.copy(position)
				.applyMatrix4(camera.matrixWorldInverse).z;
			const visualScale = getAnnotationMarkerVisualScale({
				cameraSpaceDepth,
				verticalFovDegrees: camera.fov,
				viewportHeight: size.height,
			});
			markerPx = visualScale.markerPx;
			labelPx = visualScale.labelPx;
		}

		if (
			Math.abs(markerPx - lastMarkerPxRef.current) < 0.05 &&
			Math.abs(labelPx - lastLabelPxRef.current) < 0.05
		) {
			if (tooltipRef.current) syncTooltipPosition();
			return;
		}

		lastMarkerPxRef.current = markerPx;
		lastLabelPxRef.current = labelPx;
		root.style.setProperty(
			"--annotation-marker-scale",
			(markerPx / BASE_MARKER_SIZE_PX).toFixed(4),
		);
		root.style.setProperty(
			"--annotation-label-size",
			`${labelPx.toFixed(2)}px`,
		);
		if (tooltipRef.current) syncTooltipPosition();
	});

	const markerStyle: AnnotationMarkerStyle = {
		alignItems: "center",
		background: "transparent",
		border: 0,
		boxSizing: "border-box",
		display: "flex",
		height: "44px",
		justifyContent: "center",
		padding: 0,
		pointerEvents: "auto",
		position: "relative",
		width: "44px",
		"--annotation-marker-scale": "1",
		"--annotation-label-size": `${BASE_LABEL_SIZE_PX}px`,
	};

	return (
		<Html position={position} center occlude={false}>
			<button
				ref={markerRootRef}
				type="button"
				data-testid={`annotation-marker-${annotation.id}`}
				aria-label={annotation.title || "Open annotation"}
				className="relative flex h-11 w-11 cursor-pointer select-none items-center justify-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--signal-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
				style={markerStyle}
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
					if (isActive && !isFocused) {
						setHoveredAnnotation(null);
					}
				}}
				onFocus={() => {
					setIsFocused(true);
					if (isActive) {
						setHoveredAnnotation(annotation.id);
					}
				}}
				onBlur={() => {
					setIsFocused(false);
					if (isActive && !isHovered) {
						setHoveredAnnotation(null);
					}
				}}
			>
				<div
					data-testid={`annotation-marker-visual-${annotation.id}`}
					className="pointer-events-none relative flex h-6 w-6 items-center justify-center rounded-full"
					style={{
						alignItems: "center",
						display: "flex",
						height: `${BASE_MARKER_SIZE_PX}px`,
						justifyContent: "center",
						position: "relative",
						transform: "scale(var(--annotation-marker-scale, 1))",
						transformOrigin: "center",
						width: `${BASE_MARKER_SIZE_PX}px`,
					}}
				>
					<div
						className={cn(
							"relative flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150",
							isActive
								? "scale-110"
								: isHovered || isFocused
									? "scale-105"
									: "scale-100",
							!isActive && !isHovered && !isFocused && "annotation-breathe",
						)}
					>
						<div
							className={cn(
								"absolute inset-0 rounded-full border-2 transition-all duration-150",
								isActive
									? "border-[color:var(--signal-ring)] shadow-[0_0_28px_color-mix(in_oklab,var(--signal-halo-open)_100%,transparent)] ring-2 ring-[color:color-mix(in_oklab,var(--signal-open)_36%,transparent)]"
									: isHovered || isFocused
										? "border-[color:var(--signal-ring)] shadow-[0_0_20px_color-mix(in_oklab,var(--signal-halo-hover)_100%,transparent)] ring-2 ring-[color:color-mix(in_oklab,var(--signal-hover)_24%,transparent)]"
										: "border-[color:var(--signal-ring-soft)] shadow-[0_0_14px_color-mix(in_oklab,var(--signal-halo-closed)_100%,transparent)] ring-1 ring-[color:color-mix(in_oklab,var(--signal-ring)_22%,transparent)] opacity-95",
								isActive && (isHovered || isFocused) && "annotation-node-pulse",
							)}
							style={nodePulseStyle}
						/>
						<div
							className={cn(
								"flex h-3 w-3 items-center justify-center rounded-full transition-all duration-150 shadow-[0_0_14px_color-mix(in_oklab,var(--signal-halo-closed)_100%,transparent)]",
								isActive
									? "bg-[var(--signal-open)] shadow-[0_0_18px_color-mix(in_oklab,var(--signal-halo-open)_100%,transparent)]"
									: isHovered || isFocused
										? "bg-[var(--signal-hover)] shadow-[0_0_16px_color-mix(in_oklab,var(--signal-halo-hover)_100%,transparent)]"
										: "bg-[var(--signal-closed)]",
							)}
						>
							{annotation.videoUrl && (
								<Video
									data-testid={`annotation-marker-video-icon-${annotation.id}`}
									aria-hidden="true"
									size={9}
									strokeWidth={2.5}
									className={cn(
										"shrink-0",
										isActive
											? "text-[color:var(--signal-closed)]"
											: "text-[color:var(--signal-ring)]",
									)}
								/>
							)}
						</div>
					</div>
				</div>
				{showTooltip && (
					<div
						ref={tooltipRef}
						data-testid={`annotation-marker-tooltip-${annotation.id}`}
						className="pointer-events-none absolute top-1/2 z-10 w-max max-w-60 rounded border border-subtle bg-elevated px-2 py-1 text-left leading-tight shadow-panel"
						style={{
							boxSizing: "border-box",
							fontSize: "var(--annotation-label-size, 12px)",
							left: `calc(50% + ${BASE_MARKER_SIZE_PX / 2 + TOOLTIP_GAP_PX}px)`,
							lineHeight: 1.25,
							maxWidth: "240px",
							overflowWrap: "anywhere",
							position: "absolute",
							top: "50%",
							transform:
								"translateY(calc(-50% + var(--annotation-tooltip-y, 0px)))",
							width: "max-content",
						}}
					>
						<span className="break-words font-medium text-soft">
							{annotation.title}
						</span>
					</div>
				)}
			</button>
		</Html>
	);
}
