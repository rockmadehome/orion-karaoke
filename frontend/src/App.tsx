import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store'
import QueuePage from './features/queue'
import LibraryPage from './features/library'
import PlayerPage from './features/player/PlayerPage'
import SettingsPage from './features/settings'
import { Wifi, WifiOff } from 'lucide-react'

function WsIndicator() {
  const connected = useStore((s) => s.wsConnected)
  return connected ? (
    <Wifi className="h-4 w-4 text-green-400" />
  ) : (
    <WifiOff className="h-4 w-4 text-red-400 animate-pulse" />
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-4 py-3 flex items-center gap-6">
        <span className="font-bold text-lg tracking-tight text-amber-400">Orion Karaoke</span>
        <nav className="flex gap-4 text-sm font-medium">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }
          >
            Queue
          </NavLink>
          <NavLink
            to="/library"
            className={({ isActive }) =>
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }
          >
            Library
          </NavLink>
          <NavLink
            to="/player"
            className={({ isActive }) =>
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }
          >
            Player
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }
          >
            Settings
          </NavLink>
        </nav>
        <div className="ml-auto">
          <WsIndicator />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}

function AppRoutes() {
  useWebSocket()
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout>
            <QueuePage />
          </Layout>
        }
      />
      <Route
        path="/library"
        element={
          <Layout>
            <LibraryPage />
          </Layout>
        }
      />
      <Route path="/player" element={<PlayerPage />} />
      <Route
        path="/settings"
        element={
          <Layout>
            <SettingsPage />
          </Layout>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  )
}
