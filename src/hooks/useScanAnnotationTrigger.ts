import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import { useScanStore } from "@/store/scanStore";
import { useViewerStore } from "@/store/viewerStore";
import type { Annotation } from "@/types";

const TRIGGER_DELAY_MS = 1200;
const COMPLETE_LINGER_MS = 3000;
const CLOSE_INTERVAL_MS = 1500;

export function useScanAnnotationTrigger() {
	const triggeredOrder = useRef<string[]>([]);
	const triggeredSet = useRef<Set<string>>(new Set());
	const lastTriggerTimeRef = useRef(0);
	const pendingQueue = useRef<string[]>([]);
	const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

	useEffect(() => {
		const unsub = useScanStore.subscribe((state, prev) => {
			if (state.scanPhase === "complete" && prev.scanPhase !== "complete") {
				const ids = [...triggeredOrder.current];
				ids.forEach((id, i) => {
					const timer = setTimeout(
						() => {
							useViewerStore.getState().closeAnnotationPanel(id);
							if (i === ids.length - 1) {
								useViewerStore.getState().selectAnnotation(null);
								useScanStore.getState().setActiveAnnotation(null);
								useScanStore.getState().stopScan();
							}
						},
						COMPLETE_LINGER_MS + i * CLOSE_INTERVAL_MS,
					);
					timersRef.current.push(timer);
				});
				if (ids.length === 0) {
					const timer = setTimeout(() => {
						useScanStore.getState().stopScan();
					}, COMPLETE_LINGER_MS);
					timersRef.current.push(timer);
				}
			}

			if (!state.isScanRevealVisible && prev.isScanRevealVisible) {
				for (const t of timersRef.current) clearTimeout(t);
				timersRef.current = [];
				const store = useViewerStore.getState();
				for (const id of triggeredSet.current) {
					store.closeAnnotationPanel(id);
				}
				store.selectAnnotation(null);
				useScanStore.getState().setActiveAnnotation(null);
				triggeredSet.current.clear();
				triggeredOrder.current = [];
				lastTriggerTimeRef.current = 0;
				pendingQueue.current = [];
			}
		});
		return () => {
			unsub();
			for (const t of timersRef.current) clearTimeout(t);
			timersRef.current = [];
		};
	}, []);

	useFrame(() => {
		const scan = useScanStore.getState();
		if (
			!scan.isScanning ||
			scan.scanPhase === "idle" ||
			scan.scanPhase === "complete"
		)
			return;

		const viewer = useViewerStore.getState();
		const activeSceneId = viewer.activeSceneId;
		if (!activeSceneId) return;

		const sceneAnnotations = viewer.annotations.filter(
			(a: Annotation) => a.sceneId === activeSceneId,
		);
		if (sceneAnnotations.length === 0) return;

		const origin = scan.scanOrigin;
		const radius = scan.scanRadius;

		let nearest: Annotation | null = null;
		let nearestDist = Infinity;

		for (const annotation of sceneAnnotations) {
			if (triggeredSet.current.has(annotation.id)) continue;

			const [ax, ay, az] = annotation.position;
			const dx = ax - origin[0];
			const dy = ay - origin[1];
			const dz = az - origin[2];
			const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

			if (dist <= radius && dist < nearestDist) {
				nearest = annotation;
				nearestDist = dist;
			}
		}

		if (!nearest) return;

		triggeredSet.current.add(nearest.id);
		triggeredOrder.current.push(nearest.id);
		useScanStore.getState().triggerAnnotation(nearest.id);
		pendingQueue.current.push(nearest.id);
	});

	useFrame(() => {
		if (pendingQueue.current.length === 0) return;
		const now = performance.now();
		if (now - lastTriggerTimeRef.current < TRIGGER_DELAY_MS) return;

		const nextId = pendingQueue.current.shift();
		if (!nextId) return;

		const store = useViewerStore.getState();
		store.selectAnnotation(nextId);
		store.openAnnotationPanel(nextId);
		useScanStore.getState().setActiveAnnotation(nextId);
		lastTriggerTimeRef.current = now;
	});
}
