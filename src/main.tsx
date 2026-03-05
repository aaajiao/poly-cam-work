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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
