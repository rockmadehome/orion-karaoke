import { KaraokeTrack, UserRole } from './index'

export interface Playlist {
  id: string
  name: string
  description?: string
  songs: KaraokeTrack[]
  createdAt: Date
  updatedAt: Date
  createdBy: UserRole
  isPublic: boolean
  shareable: boolean
  playCount: number
  lastPlayedAt?: Date
  coverImage?: string
  tags?: string[]
  currentTrackIndex?: number
  isShuffled: boolean
  repeatMode: 'off' | 'one' | 'all'
  autoPlay: boolean
}

export interface PlaylistOptions {
  name: string
  description?: string
  isPublic?: boolean
  shareable?: boolean
  coverImage?: string
  tags?: string[]
  autoPlay?: boolean
}

export interface PlaylistUpdateOptions {
  name?: string
  description?: string
  isPublic?: boolean
  shareable?: boolean
  coverImage?: string
  tags?: string[]
  autoPlay?: boolean
}

export interface PlaylistStats {
  totalTracks: number
  totalDuration: number // seconds
  estimatedQueueTime: number // seconds
  averagePlayDuration: number // seconds
  mostPlayedTracks: Array<{
    trackId: string
    playCount: number
    percentage: number
  }>
  recentActivity: Array<{
    trackId: string
    playedAt: Date
    duration: number
  }>
}

export interface PlaylistPositionUpdate {
  trackId: string
  newPosition: number
}

export interface PlaylistTrack {
  track: KaraokeTrack
  position: number
  addedAt: Date
  addedBy?: string
  requestedAt?: Date
}