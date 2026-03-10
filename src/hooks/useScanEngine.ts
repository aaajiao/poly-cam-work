import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";

import {
	createScanRevealUniforms,
	type ScanRevealUniforms,
} from "@/shaders/scanRevealMesh";
import type { ScanPhase } from "@/store/scanStore";
import { useScanStore } from "@/store/scanStore";

function scanEasing(t: number): number {
	return t;
}

const ORIGIN_PHASE_END = 0.05;
const FLASH_DURATION = 1.5;
const FLASH_PEAK = 0.3;
const INITIAL_RADIUS_FRACTION = 0.1;

export function useScanEngine() {
	const uniformsRef = useRef<ScanRevealUniforms>(createScanRevealUniforms());

	const progressRef = useRef(0);
	const elapsedRef = useRef(0);
	const durationRef = useRef(12);
	const maxRadiusRef = useRef(20);

	const scanStateRef = useRef({
		isScanning: false,
		maxRadius: 20,
		duration: 12,
	});

	useEffect(() => {
		const syncOrigin = (origin: [number, number, number]) => {
			uniformsRef.current.uScanOrigin.value.set(
				origin[0],
				origin[1],
				origin[2],
			);
		};

		const unsub = useScanStore.subscribe((state) => {
			scanStateRef.current.isScanning = state.isScanning;
			scanStateRef.current.maxRadius = state.maxRadius;
			scanStateRef.current.duration = state.duration;

			syncOrigin(state.scanOrigin);

			if (state.isScanning && progressRef.current === 0) {
				maxRadiusRef.current = state.maxRadius;
				durationRef.current = state.duration;
			}

			if (!state.isScanning) {
				progressRef.current = 0;
				elapsedRef.current = 0;
				uniformsRef.current.uScanRadius.value = 0;
				uniformsRef.current.uScanTime.value = 0;
				uniformsRef.current.uOriginFlash.value = 0;
			}
		});

		const initial = useScanStore.getState();
		scanStateRef.current.isScanning = initial.isScanning;
		scanStateRef.current.maxRadius = initial.maxRadius;
		scanStateRef.current.duration = initial.duration;
		syncOrigin(initial.scanOrigin);
		if (initial.isScanning) {
			maxRadiusRef.current = initial.maxRadius;
			durationRef.current = initial.duration;
		}

		return unsub;
	}, []);

	useFrame((_, delta) => {
		if (!scanStateRef.current.isScanning) return;

		elapsedRef.current += delta;
		const elapsed = elapsedRef.current;
		uniformsRef.current.uScanTime.value = elapsed;

		const flashT = Math.min(elapsed / FLASH_DURATION, 1);
		const flash =
			flashT < FLASH_PEAK
				? flashT / FLASH_PEAK
				: 1 - (flashT - FLASH_PEAK) / (1 - FLASH_PEAK);
		uniformsRef.current.uOriginFlash.value = Math.max(flash, 0);

		const prev = progressRef.current;
		const next = Math.min(prev + delta / durationRef.current, 1);
		progressRef.current = next;

		const base = INITIAL_RADIUS_FRACTION * maxRadiusRef.current;
		const radius = base + scanEasing(next) * (maxRadiusRef.current - base);
		uniformsRef.current.uScanRadius.value = radius;

		let phase: ScanPhase = "expansion";
		if (next < ORIGIN_PHASE_END) phase = "origin";
		else if (next >= 1) phase = "complete";

		useScanStore.getState().setScanProgress(next, radius, phase);
	});

	const getUniforms = useCallback(() => uniformsRef.current, []);

	return { uniformsRef, getUniforms };
}
