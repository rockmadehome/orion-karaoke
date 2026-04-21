export enum PlaybackState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  BUFFERING = 'buffering',
  ERROR = 'error'
}

export interface PlaybackStateDetails {
  state: PlaybackState
  currentTrackId?: string
  currentTime: number
  duration: number
  volume: number
  isShuffled: boolean
  repeatMode: 'off' | 'one' | 'all'
  playlistPosition: number
  nextTrackId?: string
  prevTrackId?: string
  error?: string
}

export interface PlaybackOptions {
  seekTo?: number
  volume?: number
  shuffle?: boolean
  repeat?: 'off' | 'one' | 'all'
  startFrom?: number
  endAt?: number
}