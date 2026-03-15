import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../../api/client'
import { useStore } from '../../store'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useCast } from '../../hooks/useCast'
import { PlaybackQueuePanel } from './PlaybackQueuePanel'
import { Button } from '../../components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../components/ui/sheet'
import { ArrowLeft, SkipForward, Cast, Tv2, List, Play, Pause } from 'lucide-react'

export default function PlayerPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { send } = useWebSocket()
  const { isAvailable: castAvailable, isCasting, castVideo } = useCast()

  const playback = useStore((s) => s.playback)
  const currentSong = playback.current_song

  // Sync isPlaying with actual video state
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    vid.addEventListener('play', onPlay)
    vid.addEventListener('pause', onPause)
    return () => {
      vid.removeEventListener('play', onPlay)
      vid.removeEventListener('pause', onPause)
    }
  }, [])

  // Load video source whenever current song changes
  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !currentSong?.video_path) return
    vid.src = api.storageUrl(currentSong.video_path)
    vid.play().catch(() => {})
  }, [currentSong?.queue_item_id])

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  useEffect(() => {
    showControls()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [showControls])

  function handleEnded() {
    send({ type: 'playback.next' })
  }

  function handleTogglePlay() {
    const vid = videoRef.current
    if (!vid) return
    if (vid.paused) {
      vid.play().catch(() => {})
    } else {
      vid.pause()
    }
  }

  async function handleSkip() {
    try {
      await api.playback.next()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to skip')
    }
  }

  async function handleCast() {
    if (!currentSong?.video_path) return
    const fullUrl = `${window.location.origin}${api.storageUrl(currentSong.video_path)}`
    try {
      await castVideo(fullUrl, currentSong.title ?? undefined)
    } catch {
      toast.error('Could not connect to Chromecast. Make sure you are using Chrome and both devices are on the same Wi-Fi network.')
    }
  }

  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden"
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      {currentSong ? (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onEnded={handleEnded}
          autoPlay
          playsInline
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full">
          <p className="text-white/50 text-lg">No song playing</p>
        </div>
      )}

      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none"
          >
            {/* Top bar */}
            <div className="absolute top-0 inset-x-0 flex items-center gap-3 p-4 bg-linear-to-b from-black/70 to-transparent pointer-events-auto">
              <NavLink to="/">
                <Button variant="ghost" size="icon" className="text-white hover:text-white hover:bg-white/20">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </NavLink>
              <div className="flex-1 min-w-0">
                <span className="text-white font-semibold text-sm truncate block">
                  {currentSong?.title ?? 'Orion Karaoke'}
                </span>
                {currentSong?.artist && (
                  <span className="text-white/60 text-xs truncate block">{currentSong.artist}</span>
                )}
              </div>
              {isCasting && (
                <span className="text-amber-400 text-xs font-medium flex items-center gap-1">
                  <Tv2 className="h-3.5 w-3.5" />
                  Casting
                </span>
              )}
            </div>

            {/* Bottom bar */}
            <div className="absolute bottom-0 inset-x-0 flex items-center gap-3 p-4 bg-linear-to-t from-black/70 to-transparent pointer-events-auto">
              {/* Play / Pause */}
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:text-white hover:bg-white/20"
                onClick={handleTogglePlay}
                disabled={!currentSong}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>

              {/* Skip */}
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:text-white hover:bg-white/20"
                onClick={handleSkip}
              >
                <SkipForward className="h-5 w-5" />
              </Button>

              {/* Cast */}
              {castAvailable && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={isCasting ? 'text-amber-400 hover:text-amber-300 hover:bg-white/20' : 'text-white hover:text-white hover:bg-white/20'}
                  onClick={handleCast}
                  title={isCasting ? 'Currently casting' : 'Cast to TV'}
                >
                  {isCasting ? <Tv2 className="h-5 w-5" /> : <Cast className="h-5 w-5" />}
                </Button>
              )}

              <div className="ml-auto">
                <Sheet>
                  <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 text-white hover:bg-white/20 transition-colors">
                    <List className="h-5 w-5" />
                  </SheetTrigger>
                  <SheetContent side="right" className="w-80">
                    <SheetHeader>
                      <SheetTitle>Up Next</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4">
                      <PlaybackQueuePanel />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
