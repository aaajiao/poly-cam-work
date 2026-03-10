import { Play, RotateCcw, Square } from "lucide-react";

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
	const hasCompletedScan = useScanStore((s) => s.hasCompletedScan);
	const activeSceneId = useViewerStore((s) => s.activeSceneId);
	const isLoading = useViewerStore((s) => s.isLoading);
	const cloudScenesLoaded = useViewerStore((s) => s.cloudScenesLoaded);

	const ready =
		!!activeSceneId && !isLoading && (import.meta.env.DEV || cloudScenesLoaded);

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
			: "Start scan";

	const handleClick = () => {
		const store = useScanStore.getState();
		if (store.isScanning) {
			store.stopScan();
			return;
		}
		store.startScan(50, 15);
	};

	return (
		<TooltipProvider delayDuration={300}>
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
		</TooltipProvider>
	);
}
