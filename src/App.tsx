import './index.css'
import { useState } from 'react'
import { Layout } from '@/components/Layout'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { SceneCanvas } from '@/components/viewer/SceneCanvas'
import { DropZone } from '@/components/upload/DropZone'

export default function App() {
  const [uploadErrors, setUploadErrors] = useState<string[]>([])

  return (
    <>
      <Layout
        sidebar={<Sidebar />}
        toolbar={<Toolbar />}
      >
        <SceneCanvas />
      </Layout>
      <DropZone onError={setUploadErrors} />
      {uploadErrors.length > 0 && (
        <div
          data-testid="upload-error"
          className="fixed bottom-4 right-4 z-50 bg-red-900/90 text-red-200 text-sm p-3 rounded-lg max-w-sm"
          onClick={() => setUploadErrors([])}
        >
          {uploadErrors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </>
  )
}
