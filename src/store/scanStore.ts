import { create } from "zustand";

export type ScanPhase = "idle" | "origin" | "expansion" | "complete";

interface ScanState {
	// Lifecycle
	isScanning: boolean;
	scanPhase: ScanPhase;
	scanT: number; // normalized 0→1 progress

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
	stopScan: () => void;
	resetScan: () => void;
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
	scanPhase: "idle",
	scanT: 0,

	scanOrigin: [0, 0, 0],
	scanRadius: 0,
	maxRadius: DEFAULT_MAX_RADIUS,
	duration: DEFAULT_DURATION,

	triggeredAnnotationIds: [],
	activeAnnotationId: null,

	startScan: (maxRadius, duration) =>
		set({
			isScanning: true,
			scanPhase: "origin",
			scanT: 0,
			scanRadius: 0,
			maxRadius: maxRadius ?? DEFAULT_MAX_RADIUS,
			duration: duration ?? DEFAULT_DURATION,
			triggeredAnnotationIds: [],
			activeAnnotationId: null,
		}),

	stopScan: () =>
		set({
			isScanning: false,
			scanPhase: "idle",
			scanT: 0,
			scanRadius: 0,
			triggeredAnnotationIds: [],
			activeAnnotationId: null,
		}),

	resetScan: () =>
		set({
			isScanning: false,
			scanPhase: "idle",
			scanT: 0,
			scanRadius: 0,
			triggeredAnnotationIds: [],
			activeAnnotationId: null,
		}),

	setScanProgress: (scanT, scanRadius, phase) =>
		set({ scanT, scanRadius, scanPhase: phase }),

	triggerAnnotation: (id) =>
		set((state) => {
			if (state.triggeredAnnotationIds.includes(id)) return state;
			return {
				triggeredAnnotationIds: [...state.triggeredAnnotationIds, id],
			};
		}),

	setActiveAnnotation: (id) => set({ activeAnnotationId: id }),
}));
