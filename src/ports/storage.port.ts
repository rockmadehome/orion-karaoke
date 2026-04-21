import { KaraokeMetadata, KaraokeVideo } from '@/domain/entities'

export interface StoragePort {
  /**
   * Save a karaoke video with metadata
   * @param path Path to the video file
   * @param metadata Video metadata
   * @returns Promise<string> Video ID
   */
  saveKaraokeVideo(path: string, metadata: KaraokeMetadata): Promise<string>

  /**
   * Get a karaoke video by ID
   * @param id Video ID
   * @returns Promise<{ path: string; metadata: KaraokeMetadata }>
   */
  getKaraokeVideo(id: string): Promise<{ path: string; metadata: KaraokeMetadata }>

  /**
   * Get all karaoke videos
   * @param options Query options
   * @returns Promise<KaraokeVideo[]>
   */
  listKaraokeVideos(options?: {
    limit?: number
    offset?: number
    sortBy?: 'createdAt' | 'title' | 'duration'
    sortOrder?: 'asc' | 'desc'
    filters?: {
      status?: string
      language?: string
      duration?: { min?: number; max?: number }
    }
  }): Promise<KaraokeVideo[]>

  /**
   * Delete a karaoke video
   * @param id Video ID
   * @returns Promise<void>
   */
  deleteVideo(id: string): Promise<void>

  /**
   * Update video metadata
   * @param id Video ID
   * @param metadata Updated metadata
   * @returns Promise<void>
   */
  updateVideoMetadata(id: string, metadata: Partial<KaraokeMetadata>): Promise<void>

  /**
   * Save a video file
   * @param file Buffer containing the file data
   * @param path Path where to save the file
   * @param mimeType File MIME type
   * @returns Promise<string> File path
   */
  saveVideoFile(file: Buffer, path: string, mimeType?: string): Promise<string>

  /**
   * Get a video file by path
   * @param path File path
   * @returns Promise<{ buffer: Buffer; mimeType: string }>
   */
  getVideoFile(path: string): Promise<{ buffer: Buffer; mimeType: string }>

  /**
   * Get file statistics
   * @param path File path
   * @returns Promise<{ size: number; created: Date; modified: Date }>
   */
  getFileInfo(path: string): Promise<{ size: number; created: Date; modified: Date }>

  /**
   * Clean up old or unused files
   * @param options Cleanup options
   * @returns Promise<number> Number of files cleaned up
   */
  cleanupFiles(options?: {
    olderThan?: Date
    unusedFor?: number // days
    maxTotalSize?: number // bytes
  }): Promise<number>

  /**
   * Get storage statistics
   * @returns Promise<{ totalSize: number; fileCount: number; freeSpace: number }>
   */
  getStats(): Promise<{ totalSize: number; fileCount: number; freeSpace: number }>

  /**
   * Check if a file exists
   * @param path File path
   * @returns Promise<boolean>
   */
  fileExists(path: string): Promise<boolean>

  /**
   * Get storage URL for public access
   * @param path File path
   * @param options URL options
   * @returns Promise<string> Public URL
   */
  getPublicUrl(path: string, options?: {
    expires?: number // seconds
    contentType?: string
  }): Promise<string>
}