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
  const login = useViewerStore((state) => state.login)
  const logout = useViewerStore((state) => state.logout)

  const [password, setPassword] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <Button
        data-testid="logout-button"
        variant="outline"
        className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => {
          void logout()
        }}
      >
        <LogOut size={14} />
        <span className="hidden md:inline">Logout</span>
      </Button>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          data-testid="login-button"
          variant="outline"
          className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <LogIn size={14} />
          <span className="hidden md:inline">Login</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="border-zinc-700 bg-zinc-900 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editor Login</DialogTitle>
          <DialogDescription>
            Enter admin password to edit draft and publish releases.
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
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="Password"
          />

          {(error || draftError) && (
            <p className="text-xs text-red-400" data-testid="login-error-message">
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
            className="bg-blue-600 text-white hover:bg-blue-500"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
