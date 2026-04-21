import { KaraokeMetadata } from './karaoke-metadata'

export interface KaraokeVideo {
  id: string
  metadata: KaraokeMetadata
  fileUrl: string
  streamUrl: string
  previewUrl?: string
  thumbnailUrl: string
  downloadUrl: string
  playable: boolean
  streamable: boolean
  shareable: boolean
  expiresAt?: Date
  downloadCount: number
  lastDownloadedAt?: Date
  streamCount: number
  lastStreamedAt?: Date
  viewCount: number
  lastViewedAt?: Date
  popularity: number // calculated metric
  relatedVideos?: string[] // IDs of related videos
}

export interface KaraokeVideoListOptions {
  limit?: number
  offset?: number
  sortBy?: 'createdAt' | 'title' | 'duration' | 'popularity' | 'viewCount'
  sortOrder?: 'asc' | 'desc'
  filters?: {
    status?: 'all' | 'ready' | 'processing' | 'failed'
    language?: string
    genre?: string
    duration?: { min?: number; max?: number }
    difficulty?: 'easy' | 'medium' | 'hard'
    tags?: string[]
    createdBy?: string
  }
  search?: string
}

export interface KaraokeVideoStats {
  totalVideos: number
  totalSize: number // bytes
  readyVideos: number
  processingVideos: number
  failedVideos: number
  averageDuration: number
  mostPopularGenres: Array<{
    genre: string
    count: number
    percentage: number
  }>
  topLanguages: Array<{
    language: string
    count: number
    percentage: number
  }>
  usage: {
    totalViews: number
    totalStreams: number
    totalDownloads: number
    averagePlayDuration: number
  }
}