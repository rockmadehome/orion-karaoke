import { ProcessingStatus, UserRole } from './index'

export interface KaraokeMetadata {
  id: string
  title: string
  artist: string
  youtubeUrl: string
  duration: number // seconds
  language: string
  genre?: string
  tempo?: number
  key?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  tags?: string[]
  originalVideoPath?: string
  audioPath?: string
  vocalPath?: string
  instrumentalPath?: string
  karaokeVideoPath?: string
  lyricsPath?: string
  lyrics?: string
  status: ProcessingStatus
  processingSteps?: Array<{
    step: string
    status: ProcessingStatus
    startedAt?: Date
    completedAt?: Date
    error?: string
    progress: number // 0-100
  }>
  fileSize: number // bytes
  quality: 'low' | 'medium' | 'high'
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
  createdBy: UserRole
  lastPlayedAt?: Date
  playCount: number
  averagePlayDuration?: number
  rating?: number // 1-5 stars
  favoriteBy?: string[]
}

export interface KaraokeMetadataUpdate {
  title?: string
  artist?: string
  genre?: string
  tags?: string[]
  difficulty?: 'easy' | 'medium' | 'hard'
  rating?: number
}