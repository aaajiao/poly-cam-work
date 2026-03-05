import './index.css'
import { Layout } from '@/components/Layout'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Toolbar } from '@/components/toolbar/Toolbar'

export default function App() {
  return (
    <Layout
      sidebar={<Sidebar />}
      toolbar={<Toolbar />}
    >
      <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">
        3D Canvas (Task 7)
      </div>
    </Layout>
  )
}
