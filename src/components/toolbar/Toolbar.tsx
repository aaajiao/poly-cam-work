import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Toolbar() {
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex items-center gap-1" data-testid="tool-buttons" />
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        data-testid="screenshot-btn"
        className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
        title="Screenshot (Ctrl+S)"
      >
        <Camera size={16} />
      </Button>
    </div>
  )
}
