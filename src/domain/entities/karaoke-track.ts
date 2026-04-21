import { LyricsWithTimestamps, ProcessingStatus } from './index'

export interface KaraokeTrack {
  id: string
  youtubeUrl: string
  title: string
  artist: string
  videoPath: string
  audioPath: string
  vocalPath?: string
  instrumentalPath?: string
  lyrics?: LyricsWithTimestamps
  karaokeVideoPath?: string
  status: ProcessingStatus
  createdAt: Date
  completedAt?: Date
  error?: string
  metadata?: {
    duration: number
    language: string
    genre?: string
    quality: 'low' | 'medium' | 'high'
    fileSize: number
  }
  queuePosition?: number
  priority: 'normal' | 'high' | 'low'
  requestedBy?: string
  estimatedProcessingTime?: number
  processingProgress?: {
    currentStep: string
    progress: number // 0-100
    estimatedTimeRemaining?: number
  }
}

export interface KaraokeTrackInput {
  youtubeUrl: string
  title?: string
  artist?: string
  priority?: 'normal' | 'high' | 'low'
  requestedBy?: string
}

export interface KaraokeTrackUpdate {
  title?: string
  artist?: string
  priority?: 'normal' | 'high' | 'low'
  queuePosition?: number
}

export interface KaraokeTrackListOptions {
  limit?: number
  offset?: number
  sortBy?: 'createdAt' | 'title' | 'artist' | 'status' | 'queuePosition'
  sortOrder?: 'asc' | 'desc'
  filters?: {
    status?: ProcessingStatus | ProcessingStatus[]
    priority?: 'normal' | 'high' | 'low'
    language?: string
    genre?: string
    createdAfter?: Date
    createdBefore?: Date
    completedAfter?: Date
    completedBefore?: Date
  }
  search?: string
}