import type { ScanScene } from '@/types'

export const PRESET_SCENES: ScanScene[] = [
  {
    id: 'scan-a',
    name: 'Scan A (Corridor)',
    glbUrl: '/models/scan-a.glb',
    plyUrl: '/models/scan-a.ply',
  },
  {
    id: 'scan-b',
    name: 'Scan B (Large Room)',
    glbUrl: '/models/scan-b.glb',
    plyUrl: '/models/scan-b.ply',
  },
  {
    id: 'scan-c',
    name: 'Scan C (Multi-Room)',
    glbUrl: '/models/scan-c.glb',
    plyUrl: '/models/scan-c.ply',
  },
]
