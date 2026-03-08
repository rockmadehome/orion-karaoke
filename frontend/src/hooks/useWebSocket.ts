import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { api } from '../api/client'

const WS_URL = `ws://${window.location.host}/ws`
const MAX_RETRIES = 10
const BASE_DELAY = 100

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const retryCount = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setWsConnected = useStore((s) => s.setWsConnected)
  const upsertJob = useStore((s) => s.upsertJob)
  const removeJob = useStore((s) => s.removeJob)
  const setPlayback = useStore((s) => s.setPlayback)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      retryCount.current = 0
      setWsConnected(true)
    }

    ws.onmessage = (evt) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(evt.data)
      } catch {
        return
      }

      const type = msg.type as string | undefined

      switch (type) {
        case 'job.progress':
        case 'job.completed':
        case 'job.failed':
        case 'job.cancelled': {
          const jobId = msg.job_id as string
          if (jobId) {
            api.jobs.get(jobId).then(upsertJob).catch(() => {})
          }
          break
        }
        case 'playback.state':
          if (msg.data) {
            setPlayback(msg.data as Parameters<typeof setPlayback>[0])
          }
          break
      }
    }

    ws.onclose = () => {
      setWsConnected(false)
      wsRef.current = null
      if (retryCount.current < MAX_RETRIES) {
        const delay = BASE_DELAY * 2 ** retryCount.current
        retryCount.current++
        retryTimer.current = setTimeout(connect, delay)
      }
    }

    ws.onerror = () => ws.close()
  }, [setWsConnected, upsertJob, removeJob, setPlayback])

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { send }
}
