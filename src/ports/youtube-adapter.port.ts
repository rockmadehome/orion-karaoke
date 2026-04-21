import { VideoInfo, DownloadResult } from '@/domain/entities'

export interface YouTubeAdapterPort {
  /**
   * Download a YouTube video and return the file path
   * @param url YouTube video URL
   * @returns Promise<DownloadResult>
   */
  downloadVideo(url: string): Promise<DownloadResult>

  /**
   * Get video information from YouTube
   * @param url YouTube video URL
   * @returns Promise<VideoInfo>
   */
  getVideoInfo(url: string): Promise<VideoInfo>

  /**
   * Validate if a URL is a valid YouTube URL
   * @param url URL to validate
   * @returns Promise<boolean>
   */
  isValidYouTubeUrl(url: string): Promise<boolean>

  /**
   * Get supported video qualities
   * @returns Promise<string[]>
   */
  getSupportedQualities(): Promise<string[]>
}