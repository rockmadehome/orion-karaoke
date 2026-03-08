import { create } from 'zustand'
import type { Job } from '../api/client'

export interface CurrentSong {
  queue_item_id: string
  song_id: string
  title: string | null
  artist: string | null
  video_path: string | null
  thumbnail_path: string | null
  duration_seconds: number | null
}

export interface PlaybackQueueEntry {
  queue_item_id: string
  song_id: string
  title: string | null
  artist: string | null
  duration_seconds: number | null
  thumbnail_path: string | null
  position: number
}

export interface PlaybackState {
  current_song: CurrentSong | null
  queue: PlaybackQueueEntry[]
}

interface AppStore {
  // Connection
  wsConnected: boolean
  setWsConnected: (v: boolean) => void

  // Jobs
  jobs: Job[]
  upsertJob: (job: Job) => void
  removeJob: (id: string) => void

  // Playback
  playback: PlaybackState
  setPlayback: (state: PlaybackState) => void
}

export const useStore = create<AppStore>((set) => ({
  wsConnected: false,
  setWsConnected: (wsConnected) => set({ wsConnected }),

  jobs: [],
  upsertJob: (job) =>
    set((s) => {
      const idx = s.jobs.findIndex((j) => j.id === job.id)
      if (idx === -1) return { jobs: [job, ...s.jobs] }
      const jobs = [...s.jobs]
      jobs[idx] = job
      return { jobs }
    }),
  removeJob: (id) =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

  playback: { current_song: null, queue: [] },
  setPlayback: (playback) => set({ playback }),
}))
