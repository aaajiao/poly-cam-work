import './index.css'
export default function App() {
  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      <aside className="w-72 border-r border-zinc-800 flex-shrink-0" id="sidebar" />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="h-12 border-b border-zinc-800 flex-shrink-0" id="toolbar" />
        <main className="flex-1 relative" id="canvas-container" />
        <footer className="h-8 border-t border-zinc-800 flex-shrink-0 text-xs px-3 flex items-center text-zinc-500" id="statusbar" />
      </div>
    </div>
  )
}
