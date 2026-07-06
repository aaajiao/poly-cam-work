import { useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useViewerStore } from '@/store/viewerStore'

export function LoginDialog() {
  const isAuthenticated = useViewerStore((state) => state.isAuthenticated)
  const draftError = useViewerStore((state) => state.draftError)
  const draftDirtyByScene = useViewerStore((state) => state.draftDirtyByScene)
  const login = useViewerStore((state) => state.login)
  const logout = useViewerStore((state) => state.logout)
  const saveDraftWithImages = useViewerStore((state) => state.saveDraftWithImages)
  const setDraftError = useViewerStore((state) => state.setDraftError)

  const [password, setPassword] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isProcessingLogout, setIsProcessingLogout] = useState(false)

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      setPassword('')
      setError(null)
      setIsSubmitting(false)
    }
  }

  const getDirtySceneIds = () =>
    Object.entries(draftDirtyByScene)
      .filter(([, dirty]) => dirty)
      .map(([sceneId]) => sceneId)

  const handleConfirmOpenChange = (open: boolean) => {
    if (isProcessingLogout) return
    setIsConfirmOpen(open)
  }

  const handleLogoutClick = () => {
    if (getDirtySceneIds().length === 0) {
      void logout()
      return
    }
    // Dirty edits exist — clear any stale error and ask how to resolve them
    // before logging out.
    setDraftError(null)
    setIsConfirmOpen(true)
  }

  const handleSaveAndLogout = async () => {
    setIsProcessingLogout(true)
    try {
      // Persist every dirty scene first, uploading any pending local images at
      // this explicit save boundary so nothing local-only survives logout.
      // saveDraftWithImages throws (and sets draftError) on failure, in which
      // case we stay logged in with the dialog still open.
      for (const sceneId of getDirtySceneIds()) {
        await saveDraftWithImages(sceneId)
      }
      await logout()
      setIsConfirmOpen(false)
    } catch {
      // saveDraft already surfaced the error via draftError; keep the dialog open.
    } finally {
      setIsProcessingLogout(false)
    }
  }

  const handleDiscardAndLogout = async () => {
    setIsProcessingLogout(true)
    try {
      await logout({ discardDirtyScenes: true })
      setIsConfirmOpen(false)
    } finally {
      setIsProcessingLogout(false)
    }
  }

  const onSubmit = async () => {
    if (!password.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      await login(password.trim())
      setPassword('')
      setIsOpen(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAuthenticated) {
    return (
      <Dialog open={isConfirmOpen} onOpenChange={handleConfirmOpenChange}>
        <Button
          data-testid="logout-button"
          variant="outline"
          className="h-8 gap-1 border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft"
          onClick={handleLogoutClick}
        >
          <LogOut size={14} />
          <span className="hidden md:inline">Logout</span>
        </Button>
        <DialogContent
          data-testid="logout-confirm-dialog"
          className="border-strong bg-elevated text-strong sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved edits. Save them before logging out or discard them. Logging out
              returns to the published view.
            </DialogDescription>
          </DialogHeader>

          {draftError && (
            <p className="text-xs text-danger" data-testid="logout-error-message">
              {draftError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              data-testid="logout-cancel-button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isProcessingLogout}
              className="border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft"
            >
              Cancel
            </Button>
            <Button
              data-testid="logout-discard-button"
              variant="outline"
              onClick={() => {
                void handleDiscardAndLogout()
              }}
              disabled={isProcessingLogout}
              className="border-subtle bg-panel text-danger hover:bg-elevated"
            >
              Discard &amp; log out
            </Button>
            <Button
              data-testid="logout-save-button"
              onClick={() => {
                void handleSaveAndLogout()
              }}
              disabled={isProcessingLogout}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isProcessingLogout ? 'Working...' : 'Save & log out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          data-testid="login-button"
          variant="outline"
          className="h-8 gap-1 border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft"
        >
          <LogIn size={14} />
          <span className="hidden md:inline">Login</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="border-strong bg-elevated text-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editor Login</DialogTitle>
          <DialogDescription>
            Enter admin password to sync official scenes, edit drafts, and publish releases.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <input
            data-testid="login-password-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void onSubmit()
              }
            }}
            className="w-full rounded border border-subtle bg-field px-3 py-2 text-sm text-soft outline-none focus:border-[color:var(--accent-border)]"
            placeholder="Password"
          />

          {(error || draftError) && (
              <p className="text-xs text-danger" data-testid="login-error-message">
              {error ?? draftError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            data-testid="login-submit"
            onClick={() => {
              void onSubmit()
            }}
            disabled={isSubmitting || !password.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
