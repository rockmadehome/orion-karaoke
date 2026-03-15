import { useEffect, useRef, useState, useCallback } from 'react'

declare global {
  interface Window {
    cast?: {
      framework: {
        CastContext: {
          getInstance(): {
            setOptions(opts: object): void
            requestSession(): Promise<void>
            getCurrentSession(): { loadMedia(req: object): Promise<void> } | null
            getCastState(): string
            addEventListener(type: string, handler: () => void): void
            removeEventListener(type: string, handler: () => void): void
          }
        }
        RemotePlayerController: new (player: unknown) => {
          addEventListener(type: string, handler: () => void): void
        }
        RemotePlayer: new () => unknown
        CastContextEventType: { CAST_STATE_CHANGED: string }
        CastState: { CONNECTED: string; CONNECTING: string; NOT_CONNECTED: string }
        PlaybackConfig: new () => unknown
      }
    }
    chrome?: {
      cast: {
        media: {
          MediaInfo: new (url: string, contentType: string) => object
          LoadRequest: new (info: object) => object
          GenericMediaMetadata: new () => { title?: string; images?: object[] }
          MetadataType: { GENERIC: string }
        }
      }
    }
    __onGCastApiAvailable?: (isAvailable: boolean) => void
  }
}

export function useCast() {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    // Handle race condition: if the SDK already loaded and called the callback
    // before this hook mounted, initialize immediately.
    if (window.cast?.framework && !initialized.current) {
      initializeCast()
      return
    }

    // Otherwise register the callback for when the SDK finishes loading.
    const prev = window.__onGCastApiAvailable
    window.__onGCastApiAvailable = (ok: boolean) => {
      prev?.(ok)
      if (!ok) return
      initializeCast()
    }

    function initializeCast() {
      if (initialized.current) return
      initialized.current = true

      const ctx = window.cast!.framework.CastContext.getInstance()
      ctx.setOptions({
        receiverApplicationId: 'CC1AD845', // Default Media Receiver
        autoJoinPolicy: 'origin_scoped',
      })

      // Listen on the CastContext (not RemotePlayerController) for cast state changes.
      const onCastStateChanged = () => {
        const s = ctx.getCastState()
        setIsCasting(s === window.cast?.framework.CastState.CONNECTED)
      }
      ctx.addEventListener(
        window.cast!.framework.CastContextEventType.CAST_STATE_CHANGED,
        onCastStateChanged,
      )

      // Sync initial state in case a session is already active
      onCastStateChanged()
      setIsAvailable(true)
    }
  }, [])

  const castVideo = useCallback(async (url: string, title?: string) => {
    if (!window.cast || !window.chrome?.cast) return
    const ctx = window.cast.framework.CastContext.getInstance()
    try {
      if (!ctx.getCurrentSession()) await ctx.requestSession()
      const session = ctx.getCurrentSession()
      if (!session) return

      const mediaInfo = new window.chrome.cast.media.MediaInfo(url, 'video/mp4')
      const metadata = new window.chrome.cast.media.GenericMediaMetadata()
      metadata.title = title ?? 'Orion Karaoke'
      ;(mediaInfo as Record<string, unknown>).metadata = metadata

      const loadReq = new window.chrome.cast.media.LoadRequest(mediaInfo)
      await session.loadMedia(loadReq)
    } catch {
      // user cancelled or device unavailable — silently ignore
    }
  }, [])

  return { isAvailable, isCasting, castVideo }
}
