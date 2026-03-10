import { create } from "zustand";

import type { IntroPreset } from "@/types";

export type ScanPhase = "idle" | "origin" | "expansion" | "complete";

interface ScanState {
	// Lifecycle
	isScanning: boolean;
	isScanRevealVisible: boolean;
	scanPhase: ScanPhase;
	scanT: number; // normalized 0→1 progress
	hasCompletedScan: boolean;

	// Scan parameters
	scanOrigin: [number, number, number];
	scanRadius: number;
	maxRadius: number;
	duration: number; // seconds

	// Annotation trigger tracking
	triggeredAnnotationIds: string[];
	activeAnnotationId: string | null;

	// Actions
	startScan: (maxRadius?: number, duration?: number) => void;
	pauseScan: () => void;
	stopScan: () => void;
	resetScan: () => void;
	applyIntroScanSnapshot: (preset: IntroPreset) => void;
	resumeScanFromPreset: (preset: IntroPreset) => void;
	setScanProgress: (
		scanT: number,
		scanRadius: number,
		phase: ScanPhase,
	) => void;
	triggerAnnotation: (id: string) => void;
	setActiveAnnotation: (id: string | null) => void;
}

const DEFAULT_MAX_RADIUS = 50;
const DEFAULT_DURATION = 15;

export const useScanStore = create<ScanState>()((set) => ({
	isScanning: false,
	isScanRevealVisible: false,
	scanPhase: "idle",
	scanT: 0,
	hasCompletedScan: false,

	scanOrigin: [0, 0, 0],
	scanRadius: 0,
	maxRadius: DEFAULT_MAX_RADIUS,
	duration: DEFAULT_DURATION,

	triggeredAnnotationIds: [],
	activeAnnotationId: null,

	startScan: (maxRadius, duration) =>
		set({
			isScanning: true,
			isScanRevealVisible: true,
			scanPhase: "origin",
			scanT: 0,
			hasCompletedScan: false,
			scanRadius: 0,
			maxRadius: maxRadius ?? DEFAULT_MAX_RADIUS,
			duration: duration ?? DEFAULT_DURATION,
			triggeredAnnotationIds: [],
			activeAnnotationId: null,
		}),

	pauseScan: () =>
		set((state) => ({
			isScanning: false,
			isScanRevealVisible: state.isScanRevealVisible || state.scanT > 0,
			hasCompletedScan:
				state.hasCompletedScan || state.scanPhase === "complete",
		})),

	stopScan: () =>
		set((state) => ({
			isScanning: false,
			isScanRevealVisible: false,
			scanPhase: "idle",
			scanT: 0,
			hasCompletedScan:
				state.hasCompletedScan || state.scanPhase === "complete",
			scanRadius: 0,
			triggeredAnnotationIds: [],
			activeAnnotationId: null,
		})),

	resetScan: () =>
		set({
			isScanning: false,
			isScanRevealVisible: false,
			scanPhase: "idle",
			scanT: 0,
			hasCompletedScan: false,
			scanRadius: 0,
			triggeredAnnotationIds: [],
			activeAnnotationId: null,
		}),

	applyIntroScanSnapshot: (preset) =>
		set({
			isScanning: false,
			isScanRevealVisible: true,
			scanPhase: preset.scan.phase,
			scanT: preset.scan.progress,
			hasCompletedScan: preset.scan.phase === "complete",
			scanOrigin: preset.scan.origin,
			scanRadius: preset.scan.radius,
			maxRadius: preset.scan.maxRadius,
			duration: preset.scan.duration,
			triggeredAnnotationIds: [...preset.annotations.triggeredIds],
			activeAnnotationId: preset.annotations.activeId,
		}),

	resumeScanFromPreset: (preset) =>
		set({
			isScanning: true,
			isScanRevealVisible: true,
			scanPhase: preset.scan.phase,
			scanT: preset.scan.progress,
			hasCompletedScan: preset.scan.phase === "complete",
			scanOrigin: preset.scan.origin,
			scanRadius: preset.scan.radius,
			maxRadius: preset.scan.maxRadius,
			duration: preset.scan.duration,
			triggeredAnnotationIds: [...preset.annotations.triggeredIds],
			activeAnnotationId: preset.annotations.activeId,
		}),

	setScanProgress: (scanT, scanRadius, phase) =>
		set((state) => ({
			scanT,
			scanRadius,
			scanPhase: phase,
			isScanRevealVisible: true,
			hasCompletedScan: phase === "complete" ? true : state.hasCompletedScan,
		})),

	triggerAnnotation: (id) =>
		set((state) => {
			if (state.triggeredAnnotationIds.includes(id)) return state;
			return {
				triggeredAnnotationIds: [...state.triggeredAnnotationIds, id],
			};
		}),

	setActiveAnnotation: (id) => set({ activeAnnotationId: id }),
}));
