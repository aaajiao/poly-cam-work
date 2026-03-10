import { Camera, Pause, Play, RotateCcw, Square, X } from "lucide-react";

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useScanStore } from "@/store/scanStore";
import { useViewerStore } from "@/store/viewerStore";

interface ScanControlsProps {
	compact?: boolean;
}

export function ScanControls({ compact = false }: ScanControlsProps) {
	const isScanning = useScanStore((s) => s.isScanning);
	const isScanRevealVisible = useScanStore((s) => s.isScanRevealVisible);
	const hasCompletedScan = useScanStore((s) => s.hasCompletedScan);
	const pauseScan = useScanStore((s) => s.pauseScan);

	const activeSceneId = useViewerStore((s) => s.activeSceneId);
	const isLoading = useViewerStore((s) => s.isLoading);
	const cloudScenesLoaded = useViewerStore((s) => s.cloudScenesLoaded);
	const isAuthenticated = useViewerStore((s) => s.isAuthenticated);
	const captureIntroPreset = useViewerStore((s) => s.captureIntroPreset);
	const clearIntroPreset = useViewerStore((s) => s.clearIntroPreset);
	const introPresetStatus = useViewerStore((s) => s.introPresetStatus);
	const introPreset = useViewerStore((s) => s.introPreset);
	const introPresetError = useViewerStore((s) => s.introPresetError);
	const continueIntroScan = useViewerStore((s) => s.continueIntroScan);

	const ready =
		!!activeSceneId && !isLoading && (import.meta.env.DEV || cloudScenesLoaded);

	const isSaving = introPresetStatus === "saving";
	const hasSavedIntroPreset =
		introPreset?.sceneId === activeSceneId && introPreset.enabled;
	const isAwaitingIntroContinue =
		compact &&
		!isAuthenticated &&
		hasSavedIntroPreset &&
		isScanRevealVisible &&
		!isScanning &&
		!hasCompletedScan;

	const icon = isScanning ? (
		<Square size={14} />
	) : hasCompletedScan ? (
		<RotateCcw size={14} />
	) : (
		<Play size={14} />
	);

	const label = isScanning ? "Stop" : hasCompletedScan ? "Replay" : "Scan";
	const tooltip = isScanning
		? "Stop scan"
		: hasCompletedScan
			? "Replay scan"
			: isAwaitingIntroContinue
				? "Continue scan"
				: "Start scan";

	const handleClick = () => {
		if (isAwaitingIntroContinue) {
			continueIntroScan();
			return;
		}
		const store = useScanStore.getState();
		if (store.isScanning) {
			store.stopScan();
			return;
		}
		store.startScan(50, 15);
	};

	const handlePause = () => {
		pauseScan();
	};

	const handleCapture = async () => {
		if (!activeSceneId) return;

		try {
			await captureIntroPreset(activeSceneId);
		} catch (error) {
			console.error("Failed to capture intro preset", error);
		}
	};

	const handleClear = async () => {
		if (!activeSceneId) return;

		try {
			await clearIntroPreset(activeSceneId);
		} catch (error) {
			console.error("Failed to clear intro preset", error);
		}
	};

	return (
		<div className="flex flex-col items-start gap-1">
			<TooltipProvider delayDuration={300}>
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								data-testid="scan-trigger-btn"
								disabled={!ready}
								onClick={handleClick}
								className={cn(
									"ui-hover-emphasis flex items-center gap-1.5 border transition-colors",
									compact
										? "h-9 w-9 justify-center rounded-full bg-panel p-0 text-dim opacity-75 backdrop-blur-sm hover:opacity-100"
										: "rounded-md px-3 py-1.5 text-xs",
									!ready &&
										"cursor-not-allowed border-subtle text-faint hover:bg-panel hover:text-faint",
									ready &&
										(isScanning
											? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
											: hasCompletedScan
												? "border-accent-soft bg-accent-soft text-accent hover:bg-accent-soft"
												: isAwaitingIntroContinue
													? "h-10 w-10 border-accent-soft bg-[color:color-mix(in_oklab,var(--accent)_18%,var(--panel))] text-accent opacity-100 shadow-[0_12px_32px_color-mix(in_oklab,var(--accent)_20%,transparent)] ring-1 ring-[color:color-mix(in_oklab,var(--accent)_24%,transparent)] hover:border-strong hover:bg-[color:color-mix(in_oklab,var(--accent)_24%,var(--panel))] hover:text-strong"
													: "border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft"),
								)}
							>
								{icon}
								{!compact && <span className="hidden md:inline">{label}</span>}
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="text-xs">
							{tooltip}
						</TooltipContent>
					</Tooltip>

					{!compact && isAuthenticated && isScanning && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									data-testid="scan-pause-btn"
									onClick={handlePause}
									className="ui-hover-emphasis flex items-center justify-center h-8 w-8 rounded-md border border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft"
								>
									<Pause size={14} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="text-xs">
								Pause scan
							</TooltipContent>
						</Tooltip>
					)}

					{!compact && isAuthenticated && (
						<>
							<div className="mx-1 h-4 w-px bg-border" />

							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										data-testid="capture-intro-btn"
										disabled={isSaving || hasSavedIntroPreset || !ready}
										onClick={() => {
											void handleCapture();
										}}
										className={cn(
											"ui-hover-emphasis flex items-center justify-center h-8 w-8 rounded-md border border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft disabled:opacity-50",
											hasSavedIntroPreset &&
												"border-accent-soft bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
										)}
									>
										<Camera size={14} />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom" className="text-xs">
									{hasSavedIntroPreset
										? "Intro preset captured"
										: "Capture intro preset"}
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										data-testid="clear-intro-btn"
										disabled={isSaving || !hasSavedIntroPreset || !ready}
										onClick={() => {
											void handleClear();
										}}
										className="ui-hover-emphasis flex items-center justify-center h-8 w-8 rounded-md border border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft disabled:opacity-50"
									>
										<X size={14} />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom" className="text-xs">
									Clear intro preset
								</TooltipContent>
							</Tooltip>
						</>
					)}
				</div>
			</TooltipProvider>
			{!compact && isAuthenticated && introPresetError && (
				<p
					className="max-w-52 pl-11 text-[11px] leading-tight text-danger"
					data-testid="intro-preset-error"
				>
					{introPresetError}
				</p>
			)}
		</div>
	);
}
