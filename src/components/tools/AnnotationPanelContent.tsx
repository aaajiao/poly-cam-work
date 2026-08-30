import { ExternalLink } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { VimeoEmbed } from "@/components/ui/VimeoEmbed";
import { cn } from "@/lib/utils";
import { imageStorage } from "@/storage/imageStorage";
import { useViewerStore } from "@/store/viewerStore";
import type { Annotation, AnnotationImage } from "@/types";
import { extractVimeoId } from "@/utils/vimeo";

const DESCRIPTION_TEXT_SHADOW = "var(--text-shadow-strong)";

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

interface ResizableMediaProps {
	children: ReactNode;
	defaultWidth?: number;
	defaultHeight?: number;
	minWidth?: number;
	maxWidth?: number;
	minHeight?: number;
	maxHeight?: number;
	maintainAspectRatio?: boolean;
	showHandleAlways?: boolean;
	onSizeChange?: (size: { width?: number; height?: number }) => void;
}

function ResizableMedia({
	children,
	defaultWidth,
	defaultHeight,
	minWidth = 100,
	maxWidth = 600,
	minHeight = 60,
	maxHeight = 400,
	maintainAspectRatio = false,
	showHandleAlways = false,
	onSizeChange,
}: ResizableMediaProps) {
	const acquireCameraControlsLock = useViewerStore(
		(s) => s.acquireCameraControlsLock,
	);
	const releaseCameraControlsLock = useViewerStore(
		(s) => s.releaseCameraControlsLock,
	);
	const [size, setSize] = useState({
		width: defaultWidth,
		height: defaultHeight,
	});
	const isDragging = useRef(false);
	const startPos = useRef({ x: 0, y: 0 });
	const startSize = useRef({
		width: defaultWidth ?? 0,
		height: defaultHeight ?? 0,
	});
	const detachListenersRef = useRef<(() => void) | null>(null);
	const sizeRef = useRef(size);
	sizeRef.current = size;
	const onSizeChangeRef = useRef(onSizeChange);
	onSizeChangeRef.current = onSizeChange;
	// Guards exactly-one release per acquire on the ref-counted camera lock.
	const cameraLockHeldRef = useRef(false);
	const acquireCameraLock = () => {
		if (cameraLockHeldRef.current) return;
		cameraLockHeldRef.current = true;
		acquireCameraControlsLock();
	};
	const releaseCameraLock = () => {
		if (!cameraLockHeldRef.current) return;
		cameraLockHeldRef.current = false;
		releaseCameraControlsLock();
	};

	// Apply store-driven size (preset apply/restore) even after a manual resize.
	// Skip while actively dragging and no-op when unchanged to avoid a feedback
	// loop with the onSizeChange write-back.
	useEffect(() => {
		if (isDragging.current) return;
		const nextWidth = defaultWidth;
		const nextHeight = maintainAspectRatio ? undefined : defaultHeight;
		setSize((prev) =>
			prev.width === nextWidth && prev.height === nextHeight
				? prev
				: { width: nextWidth, height: nextHeight },
		);
	}, [defaultWidth, defaultHeight, maintainAspectRatio]);

	useEffect(() => {
		return () => {
			detachListenersRef.current?.();
			detachListenersRef.current = null;
			releaseCameraLock();
		};
	}, []);

	const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		detachListenersRef.current?.();
		detachListenersRef.current = null;

		const target = e.currentTarget;
		const pointerId = e.pointerId;
		if (!target.hasPointerCapture(pointerId)) {
			target.setPointerCapture(pointerId);
		}

		isDragging.current = true;
		acquireCameraLock();
		startPos.current = { x: e.clientX, y: e.clientY };
		startSize.current = {
			width: size.width ?? defaultWidth ?? 200,
			height: size.height ?? defaultHeight ?? 100,
		};

		const handlePointerMove = (event: PointerEvent) => {
			if (!isDragging.current) return;

			const dx = event.clientX - startPos.current.x;
			const dy = event.clientY - startPos.current.y;

			if (maintainAspectRatio) {
				const newWidth = Math.min(
					maxWidth,
					Math.max(minWidth, startSize.current.width + dx),
				);
				setSize({ width: newWidth, height: undefined });
				return;
			}

			const newWidth =
				defaultWidth !== undefined
					? Math.min(maxWidth, Math.max(minWidth, startSize.current.width + dx))
					: undefined;
			const newHeight =
				defaultHeight !== undefined
					? Math.min(
							maxHeight,
							Math.max(minHeight, startSize.current.height + dy),
						)
					: undefined;

			setSize({ width: newWidth, height: newHeight });
		};

		const stopResizing = () => {
			if (!isDragging.current) return;
			isDragging.current = false;
			releaseCameraLock();
			onSizeChangeRef.current?.({ ...sizeRef.current });
			if (target.hasPointerCapture(pointerId)) {
				target.releasePointerCapture(pointerId);
			}
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", stopResizing);
			window.removeEventListener("pointercancel", stopResizing);
			window.removeEventListener("blur", stopResizing);
			detachListenersRef.current = null;
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", stopResizing);
		window.addEventListener("pointercancel", stopResizing);
		window.addEventListener("blur", stopResizing);
		detachListenersRef.current = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", stopResizing);
			window.removeEventListener("pointercancel", stopResizing);
			window.removeEventListener("blur", stopResizing);
			if (target.hasPointerCapture(pointerId)) {
				target.releasePointerCapture(pointerId);
			}
		};
	};

	return (
		<div
			className="group relative"
			style={{
				width: size.width !== undefined ? `${size.width}px` : undefined,
				height: size.height !== undefined ? `${size.height}px` : undefined,
			}}
		>
			{children}
			<button
				type="button"
				className={cn(
					"absolute bottom-1 right-1 z-20 flex h-5 w-5 items-center justify-center rounded-sm border border-subtle bg-elevated text-strong transition-opacity",
					showHandleAlways
						? "opacity-90 hover:opacity-100"
						: "opacity-0 group-hover:opacity-100 hover:opacity-100",
				)}
				style={{
					cursor: "nwse-resize",
					pointerEvents: "auto",
					touchAction: "none",
				}}
				onPointerDown={handlePointerDown}
				aria-label="Resize media"
			>
				<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
					<title>Resize media</title>
					<path
						d="M9 3L3 9M9 6L6 9M9 9H9"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</svg>
			</button>
		</div>
	);
}

function readImageAspectRatio(url: string): Promise<number> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => {
			if (img.naturalWidth > 0 && img.naturalHeight > 0) {
				resolve(img.naturalWidth / img.naturalHeight);
				return;
			}
			resolve(4 / 3);
		};
		img.onerror = () => resolve(4 / 3);
		img.src = url;
	});
}

interface ImageThumbnailsProps {
	images: AnnotationImage[];
	onPrimaryAspectRatioChange: (aspectRatio: number) => void;
}

interface LoadedThumb {
	sourceUrl: string;
	aspectRatio: number;
}

function isRemoteImage(
	image: AnnotationImage,
): image is Extract<AnnotationImage, { url: string }> {
	return (
		"url" in image && typeof image.url === "string" && image.url.length > 0
	);
}

function isLocalImage(
	image: AnnotationImage,
): image is Extract<AnnotationImage, { localId: string }> {
	return (
		"localId" in image &&
		typeof image.localId === "string" &&
		image.localId.length > 0
	);
}

function imageKey(image: AnnotationImage): string {
	return isRemoteImage(image)
		? `remote:${image.url}`
		: `local:${image.localId}`;
}

function ImageThumbnails({
	images,
	onPrimaryAspectRatioChange,
}: ImageThumbnailsProps) {
	const [thumbs, setThumbs] = useState<Record<string, LoadedThumb>>({});

	useEffect(() => {
		let active = true;
		const objectUrls = new Set<string>();
		const revokeObjectUrls = () => {
			for (const objectUrl of objectUrls) {
				URL.revokeObjectURL(objectUrl);
			}
			objectUrls.clear();
		};

		const load = async () => {
			const nextThumbs: Record<string, LoadedThumb> = {};
			for (const img of images) {
				if (!active) break;
				const key = imageKey(img);
				let localObjectUrl: string | null = null;

				try {
					if (isRemoteImage(img)) {
						const aspectRatio = await readImageAspectRatio(img.url);
						if (!active) break;
						nextThumbs[key] = {
							sourceUrl: img.url,
							aspectRatio: clamp(aspectRatio, 0.55, 2.4),
						};
						continue;
					}

					if (!isLocalImage(img)) continue;
					// The floating panel can be resized to 560 CSS px and may render on a
					// high-DPI screen. Its 200px IndexedDB thumbnail belongs only in the
					// sidebar grid; using it here makes the local editing state visibly
					// softer than the same image after publish.
					const sourceBlob = await imageStorage.get(img.localId);
					if (!active) break;
					if (!sourceBlob) continue;

					localObjectUrl = URL.createObjectURL(sourceBlob);
					objectUrls.add(localObjectUrl);
					const aspectRatio = await readImageAspectRatio(localObjectUrl);
					if (!active) break;
					nextThumbs[key] = {
						sourceUrl: localObjectUrl,
						aspectRatio: clamp(aspectRatio, 0.55, 2.4),
					};
				} catch (error) {
					if (localObjectUrl) {
						URL.revokeObjectURL(localObjectUrl);
						objectUrls.delete(localObjectUrl);
					}
					if (active) {
						console.error(
							`Failed to load annotation image: ${img.filename}`,
							error,
						);
					}
				}
			}

			if (!active) {
				revokeObjectUrls();
				return;
			}

			setThumbs(nextThumbs);
		};

		void load();

		return () => {
			active = false;
			revokeObjectUrls();
		};
	}, [images]);

	useEffect(() => {
		const first = images[0];
		if (!first) return;
		const firstThumb = thumbs[imageKey(first)];
		if (!firstThumb) return;
		onPrimaryAspectRatioChange(firstThumb.aspectRatio);
	}, [images, thumbs, onPrimaryAspectRatioChange]);

	if (images.length === 1) {
		const single = images[0];
		const singleThumb = thumbs[imageKey(single)];
		return (
			<div
				className="overflow-hidden rounded bg-field"
				style={{ aspectRatio: singleThumb?.aspectRatio ?? 4 / 3 }}
			>
				{singleThumb ? (
					<img
						src={singleThumb.sourceUrl}
						alt={single.filename}
						decoding="async"
						className="h-full w-full object-contain"
					/>
				) : (
					<div className="h-full w-full animate-pulse bg-field" />
				)}
			</div>
		);
	}

	const gridCols = images.length === 2 ? "grid-cols-2" : "grid-cols-3";

	return (
		<div className={cn("grid gap-1", gridCols)}>
			{images.map((img) => {
				const thumb = thumbs[imageKey(img)];
				return (
					<div key={imageKey(img)} className="overflow-hidden rounded bg-field">
						{thumb ? (
							<img
								src={thumb.sourceUrl}
								alt={img.filename}
								decoding="async"
								className="block h-auto w-full object-contain"
							/>
						) : (
							<div className="h-full w-full animate-pulse bg-field" />
						)}
					</div>
				);
			})}
		</div>
	);
}

export interface AnnotationPanelContentProps {
	annotation: Annotation;
	primaryImageAspectRatio: number;
	onPrimaryAspectRatioChange: (aspectRatio: number) => void;
}

export function AnnotationPanelContent({
	annotation,
	primaryImageAspectRatio,
	onPrimaryAspectRatioChange,
}: AnnotationPanelContentProps) {
	const setAnnotationMediaSize = useViewerStore(
		(s) => s.setAnnotationMediaSize,
	);
	const storedImageSize = useViewerStore(
		(s) => s.annotationMediaSizes[`${annotation.id}:image`],
	);
	const storedVideoSize = useViewerStore(
		(s) => s.annotationMediaSizes[`${annotation.id}:video`],
	);
	const vimeoId = annotation.videoUrl
		? extractVimeoId(annotation.videoUrl)
		: null;
	const hasMedia = annotation.images.length > 0 || Boolean(vimeoId);
	const singleImage = annotation.images.length === 1;
	const defaultImageWidth = clamp(
		Math.round(190 * primaryImageAspectRatio),
		240,
		420,
	);
	const minImageWidth = clamp(Math.round(defaultImageWidth * 0.7), 180, 280);
	const linkKeys = useMemo(() => {
		const counts = new Map<string, number>();

		return annotation.links.map((link) => {
			const trimmedUrl = link.url.trim();
			const trimmedLabel = link.label.trim();
			const base =
				trimmedUrl === "" && trimmedLabel === ""
					? "empty-link"
					: `${trimmedUrl}::${trimmedLabel}`;
			const count = counts.get(base) ?? 0;
			counts.set(base, count + 1);
			return `${annotation.id}:${base}:${count}`;
		});
	}, [annotation.id, annotation.links]);

	return (
		<div className="space-y-2 pt-1" data-testid="annotation-panel-content">
			{annotation.description && !hasMedia && (
				<p
					data-testid="annotation-panel-description"
					className="line-clamp-3 text-xs leading-relaxed text-soft"
					style={{ textShadow: DESCRIPTION_TEXT_SHADOW }}
				>
					{annotation.description}
				</p>
			)}

			{annotation.images.length > 0 && (
				<div data-testid="annotation-panel-image-media">
					<ResizableMedia
						defaultWidth={
							storedImageSize?.width ?? (singleImage ? defaultImageWidth : 320)
						}
						defaultHeight={
							storedImageSize?.height ?? (singleImage ? undefined : 180)
						}
						minWidth={singleImage ? minImageWidth : 220}
						maxWidth={560}
						minHeight={120}
						maxHeight={400}
						maintainAspectRatio={singleImage}
						showHandleAlways
						onSizeChange={(size) =>
							setAnnotationMediaSize(`${annotation.id}:image`, size)
						}
					>
						<ImageThumbnails
							images={annotation.images}
							onPrimaryAspectRatioChange={onPrimaryAspectRatioChange}
						/>
					</ResizableMedia>
				</div>
			)}

			{vimeoId && (
				<div data-testid="annotation-panel-video-media">
					<ResizableMedia
						defaultWidth={storedVideoSize?.width ?? 280}
						minWidth={180}
						maxWidth={520}
						maintainAspectRatio
						showHandleAlways
						onSizeChange={(size) =>
							setAnnotationMediaSize(`${annotation.id}:video`, size)
						}
					>
						<VimeoEmbed
							videoId={vimeoId}
							sourceUrl={annotation.videoUrl}
							className="w-full"
						/>
					</ResizableMedia>
				</div>
			)}

			{annotation.description && hasMedia && (
				<p
					data-testid="annotation-panel-description"
					className="line-clamp-3 text-xs leading-relaxed text-soft"
					style={{ textShadow: DESCRIPTION_TEXT_SHADOW }}
				>
					{annotation.description}
				</p>
			)}

			{annotation.links.length > 0 && (
				<div data-testid="annotation-panel-links" className="space-y-1">
					{annotation.links.map((link, i) => (
						<a
							key={linkKeys[i]}
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5 text-xs text-[color:var(--signal-open)] hover:text-[color:var(--signal-ring)]"
							style={{ textShadow: DESCRIPTION_TEXT_SHADOW }}
						>
							<ExternalLink size={10} />
							<span className="truncate">{link.label || link.url}</span>
						</a>
					))}
				</div>
			)}
		</div>
	);
}
