export interface VideoInfo {
  id: string
  title: string
  author: string
  duration: number // seconds
  thumbnail: string
  description: string
  uploadDate: Date
  viewCount: number
  likeCount: number
  availableQualities: Array<{
    format: string
    resolution: string
    fps: number
    size: number
    bitrate: number
  }>
  language?: string
  tags?: string[]
  genre?: string
}

export interface VideoInfoSummary {
  id: string
  title: string
  author: string
  duration: number
  thumbnail: string
  uploadDate: Date
  viewCount: number
}