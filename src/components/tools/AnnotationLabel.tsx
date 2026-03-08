import { Html } from "@react-three/drei";
import { Edit2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useViewerStore } from "@/store/viewerStore";
import type { Annotation } from "@/types";

interface AnnotationLabelProps {
	annotation: Annotation;
}

export function AnnotationLabel({ annotation }: AnnotationLabelProps) {
	const removeAnnotation = useViewerStore((s) => s.removeAnnotation);
	const updateAnnotation = useViewerStore((s) => s.updateAnnotation);
	const [isEditing, setIsEditing] = useState(false);
	const [editText, setEditText] = useState(annotation.title);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
		}
	}, [isEditing]);

	const position = new THREE.Vector3(...annotation.position);

	const handleSave = () => {
		if (editText.trim()) {
			updateAnnotation(annotation.id, editText.trim());
		}
		setIsEditing(false);
	};

	return (
		<Html position={position} distanceFactor={10} transform occlude={false}>
			<div
				data-testid={`annotation-${annotation.id}`}
				className="relative"
				style={{ pointerEvents: "auto" }}
			>
				<div className="absolute -top-1 -left-1 h-2 w-2 rounded-full border border-[color:var(--signal-ring)] bg-[var(--signal-closed)] shadow-[0_0_8px_color-mix(in_oklab,var(--signal-halo-closed)_100%,transparent)]" />

				<div className="ml-3 min-w-max rounded-md border border-strong bg-elevated shadow-panel">
					{isEditing ? (
						<div className="flex items-center gap-1 p-1">
							<input
								ref={inputRef}
								value={editText}
								onChange={(e) => setEditText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSave();
									if (e.key === "Escape") setIsEditing(false);
								}}
								className="w-32 rounded border border-subtle bg-field px-2 py-1 text-xs text-strong outline-none"
							/>
							<button
								type="button"
								aria-label="Save annotation title"
								onClick={handleSave}
								className="px-1 text-xs text-success hover:opacity-80"
							>
								✓
							</button>
						</div>
					) : (
						<div className="flex items-center gap-1 px-2 py-1">
							<span className="text-xs font-medium text-strong">
								{annotation.title}
							</span>
							<button
								type="button"
								aria-label="Edit annotation title"
								onClick={() => setIsEditing(true)}
								className="ml-1 text-faint hover:text-soft"
							>
								<Edit2 size={10} />
							</button>
							<button
								type="button"
								data-testid={`annotation-delete-${annotation.id}`}
								aria-label="Delete annotation"
								onClick={() => removeAnnotation(annotation.id)}
								className="text-faint hover:text-danger"
							>
								<X size={10} />
							</button>
						</div>
					)}
				</div>
			</div>
		</Html>
	);
}
