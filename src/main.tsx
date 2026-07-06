import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { extend } from '@react-three/fiber'
import {
  Group, Mesh, Points,
  BoxGeometry, SphereGeometry,
  PointsMaterial, MeshBasicMaterial,
  AmbientLight, DirectionalLight,
} from 'three'
import App from './App.tsx'

extend({
  Group, Mesh, Points,
  BoxGeometry, SphereGeometry,
  PointsMaterial, MeshBasicMaterial,
  AmbientLight, DirectionalLight,
})

// The autoUpdate service worker (skipWaiting + clientsClaim) can swap the
// deployed assets mid-session, so a lazy chunk requested after a deploy 404s.
// Recover by reloading once to pull the fresh manifest. A sessionStorage
// timestamp guards against reload loops when a reload doesn't resolve it, while
// still allowing recovery from a later deploy in the same session.
const PRELOAD_RELOAD_KEY = 'polycam:preload-error-reload'
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  try {
    const now = Date.now()
    const last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) ?? '0')
    if (Number.isFinite(last) && now - last < 10_000) return
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(now))
  } catch (_e) {
    // sessionStorage unavailable (private mode / disabled) — fall through and
    // reload without the loop guard rather than swallowing the recovery.
  }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
