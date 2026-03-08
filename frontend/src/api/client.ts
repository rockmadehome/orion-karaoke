const BASE_URL = ''  // same origin — proxied in dev, served directly in prod

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// --- Types ---

export interface Job {
  id: string
  url: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  stage: string | null
  progress: number
  error_message: string | null
  song_id: string | null
  created_at: string
  updated_at: string
}

export interface Song {
  id: string
  title: string
  artist: string | null
  duration_seconds: number | null
  language: string | null
  video_path: string
  thumbnail_path: string | null
  source_url: string | null
  source_provider: string
  created_at: string
}

export interface SongListResponse {
  items: Song[]
  total: number
  page: number
  page_size: number
}

export interface QueueItem {
  id: string
  song_id: string
  position: number
  added_by: string | null
  added_at: string
}

export interface AppSettings {
  separator_model: string
  transcriber_backend: string
  whisper_model_size: string
  hardware_backend: string
  auth_enabled: boolean
}

// --- Jobs ---

export const api = {
  jobs: {
    submit: (url: string) =>
      request<Job>('/api/jobs', { method: 'POST', body: JSON.stringify({ url }) }),
    list: () => request<Job[]>('/api/jobs'),
    get: (id: string) => request<Job>(`/api/jobs/${id}`),
    cancel: (id: string) =>
      request<void>(`/api/jobs/${id}`, { method: 'DELETE' }),
  },

  songs: {
    list: (params?: { q?: string; page?: number; page_size?: number }) => {
      const qs = new URLSearchParams()
      if (params?.q) qs.set('q', params.q)
      if (params?.page) qs.set('page', String(params.page))
      if (params?.page_size) qs.set('page_size', String(params.page_size))
      return request<SongListResponse>(`/api/songs?${qs}`)
    },
    get: (id: string) => request<Song>(`/api/songs/${id}`),
    delete: (id: string) => request<void>(`/api/songs/${id}`, { method: 'DELETE' }),
  },

  playback: {
    queue: () => request<QueueItem[]>('/api/playback/queue'),
    add: (song_id: string, position?: number) =>
      request<QueueItem>('/api/playback/queue', {
        method: 'POST',
        body: JSON.stringify({ song_id, position }),
      }),
    remove: (item_id: string) =>
      request<void>(`/api/playback/queue/${item_id}`, { method: 'DELETE' }),
    reorder: (items: { id: string; position: number }[]) =>
      request<QueueItem[]>('/api/playback/queue/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    next: () => request<void>('/api/playback/next', { method: 'POST' }),
  },

  settings: {
    get: () => request<AppSettings>('/api/settings'),
    update: (data: Partial<AppSettings>) =>
      request<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },

  storageUrl: (filename: string) => `/storage/${filename}`,
}
