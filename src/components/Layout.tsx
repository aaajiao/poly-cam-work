import { Eye, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useViewerStore } from "@/store/viewerStore";

interface LayoutProps {
	sidebar?: React.ReactNode;
	toolbar?: React.ReactNode;
	children?: React.ReactNode;
	statusBar?: React.ReactNode;
}

export function Layout({ sidebar, toolbar, children, statusBar }: LayoutProps) {
	const sidebarOpen = useViewerStore((s) => s.sidebarOpen);
	const setSidebarOpen = useViewerStore((s) => s.setSidebarOpen);
	const presentationMode = useViewerStore((s) => s.presentationMode);
	const setPresentationMode = useViewerStore((s) => s.setPresentationMode);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || !presentationMode) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setPresentationMode(false);
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [presentationMode, setPresentationMode]);

	return (
		<div className="flex h-screen w-screen bg-stage text-strong overflow-hidden">
			{!presentationMode && (
				<aside
					data-testid="sidebar"
					style={{ width: sidebarOpen ? "288px" : "48px" }}
					className="flex flex-col border-r border-subtle bg-shell flex-shrink-0 transition-all duration-200 z-10 relative"
				>
					<div
						className={`flex items-center p-2 border-b border-subtle ${sidebarOpen ? "justify-end" : "justify-center"}`}
					>
						<Button
							variant="ghost"
							size="icon"
							data-testid="sidebar-toggle"
							onClick={() => setSidebarOpen(!sidebarOpen)}
							className={`h-8 w-8 ${sidebarOpen ? "text-dim hover:text-strong" : "text-soft hover:text-strong bg-panel hover:bg-elevated"}`}
						>
							{sidebarOpen ? (
								<PanelLeftClose size={16} />
							) : (
								<PanelLeftOpen size={16} />
							)}
						</Button>
					</div>
					{sidebarOpen && (
						<div className="flex-1 overflow-y-auto">{sidebar}</div>
					)}
				</aside>
			)}

			<div className="flex flex-col flex-1 min-w-0">
				{!presentationMode && (
					<header
						data-testid="toolbar"
						className="h-12 border-b border-subtle bg-shell flex-shrink-0 flex items-center px-3 gap-2"
					>
						{toolbar}
					</header>
				)}

				<main
					data-testid="canvas-container"
					className="flex-1 relative overflow-hidden"
				>
					{children}
					{presentationMode && (
						<Button
							variant="ghost"
							size="sm"
							data-testid="presentation-exit-btn"
							aria-label="Exit presentation mode"
							onClick={() => setPresentationMode(false)}
							className="absolute right-3 top-3 z-20 h-9 w-9 rounded-full border border-subtle bg-panel p-0 text-dim opacity-75 backdrop-blur-sm transition-all duration-200 hover:border-strong hover:bg-elevated hover:text-strong hover:opacity-100"
							title="Exit presentation mode"
						>
							<Eye size={14} />
						</Button>
					)}
				</main>

				{!presentationMode && (
					<footer
						data-testid="statusbar"
						className="h-8 border-t border-subtle bg-shell flex-shrink-0 text-xs px-3 flex items-center text-faint gap-4"
					>
						{statusBar ?? <span>Ready</span>}
					</footer>
				)}
			</div>
		</div>
	);
}
