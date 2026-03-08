import { useViewerStore } from '@/store/viewerStore'
import { Separator } from '@/components/ui/separator'

export function ClipControls() {
  const clipPlane = useViewerStore((s) => s.clipPlane)
  const setClipPlane = useViewerStore((s) => s.setClipPlane)

  return (
    <div className="space-y-3" data-testid="clip-controls">
      <div className="flex items-center justify-between">
        <span className="text-dim text-xs">Clipping Plane</span>
        <button
          data-testid="clip-enable-toggle"
          onClick={() => setClipPlane({ enabled: !clipPlane.enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            clipPlane.enabled ? 'bg-primary' : 'bg-field'
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-foreground transition-transform ${
              clipPlane.enabled ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {clipPlane.enabled && (
        <>
          <Separator className="bg-border" />

          <div>
            <p className="text-faint text-xs mb-1.5">Axis</p>
            <div className="flex gap-1" data-testid="clip-axis-selector">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <button
                  key={axis}
                  data-testid={`clip-axis-${axis}`}
                  onClick={() => setClipPlane({ axis })}
                   className={`ui-hover-emphasis flex-1 py-1 text-xs rounded transition-colors uppercase font-mono ${
                    clipPlane.axis === axis
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-field text-dim hover:bg-field-hover'
                    }`}
                >
                  {axis}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
               <span className="text-faint text-xs">Position</span>
               <span className="text-soft text-xs font-mono">
                {Math.round(clipPlane.position * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={clipPlane.position}
              onChange={(e) => setClipPlane({ position: parseFloat(e.target.value) })}
               className="w-full accent-[var(--primary)]"
              data-testid="clip-position-slider"
            />
          </div>

          <div className="flex items-center justify-between">
             <span className="text-dim text-xs">Flip direction</span>
            <button
              data-testid="clip-flip-toggle"
              onClick={() => setClipPlane({ flipped: !clipPlane.flipped })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                 clipPlane.flipped ? 'bg-primary' : 'bg-field'
               }`}
            >
              <span
                 className={`inline-block h-3 w-3 transform rounded-full bg-foreground transition-transform ${
                  clipPlane.flipped ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
