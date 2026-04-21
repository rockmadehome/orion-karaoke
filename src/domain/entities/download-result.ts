export interface DownloadResult {
  path: string
  filename: string
  size: number // bytes
  duration: number // seconds
  format: string
  quality: string
  thumbnailPath?: string
  metadata: {
    title?: string
    artist?: string
    album?: string
    genre?: string
    year?: number
  }
}

export interface DownloadOptions {
  quality?: string
  format?: string
  extractAudio?: boolean
  keepVideo?: boolean
  noPlaylist?: boolean
  playlistStart?: number
  playlistEnd?: number
  maxFileSize?: number
  noCheckCertificates?: boolean
  geoBypass?: boolean | string
}