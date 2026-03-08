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
    window.__onGCastApiAvailable = (ok: boolean) => {
      if (!ok || initialized.current) return
      initialized.current = true

      const ctx = window.cast!.framework.CastContext.getInstance()
      ctx.setOptions({
        receiverApplicationId: 'CC1AD845', // Default Media Receiver
        autoJoinPolicy: 'origin_scoped',
      })

      const player = new window.cast!.framework.RemotePlayer()
      const controller = new window.cast!.framework.RemotePlayerController(player)

      controller.addEventListener(
        window.cast!.framework.CastContextEventType.CAST_STATE_CHANGED,
        () => {
          const state = ctx as unknown as { getCastState(): string }
          const s = state.getCastState?.()
          setIsCasting(s === window.cast?.framework.CastState.CONNECTED)
        },
      )

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
