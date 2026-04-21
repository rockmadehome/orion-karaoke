import { LyricsWithTimestamps } from '@/domain/entities'

export interface KaraokeGeneratorPort {
  /**
   * Generate a karaoke video with synchronized lyrics
   * @param videoPath Path to the original video
   * @param vocalPath Path to the separated vocals
   * @param lyrics Lyrics with timestamps
   * @param options Generation options
   * @returns Promise<string> Path to the generated karaoke video
   */
  generateKaraoke(
    videoPath: string,
    vocalPath: string,
    lyrics: LyricsWithTimestamps,
    options?: {
      subtitleStyle?: {
        fontSize?: number
        fontFamily?: string
        color?: string
        strokeColor?: string
        strokeWidth?: number
        backgroundColor?: string
        backgroundOpacity?: number
      }
      outputFormat?: 'mp4' | 'mkv'
      outputQuality?: 'low' | 'medium' | 'high'
      enableBackground?: boolean
      backgroundImage?: string
      showTimestamps?: boolean
    }
  ): Promise<string>

  /**
   * Generate preview of karaoke video (first 30 seconds)
   * @param videoPath Path to the original video
   * @param vocalPath Path to the separated vocals
   * @param lyrics Lyrics with timestamps
   * @param options Preview options
   * @returns Promise<string> Path to the generated preview
   */
  generatePreview(
    videoPath: string,
    vocalPath: string,
    lyrics: LyricsWithTimestamps,
    options?: {
      duration?: number // seconds
      subtitleStyle?: any
    }
  ): Promise<string>

  /**
   * Validate video and audio formats
   * @param videoPath Path to video file
   * @param audioPath Path to audio file
   * @returns Promise<boolean>
   */
  validateInputs(videoPath: string, audioPath: string): Promise<boolean>

  /**
   * Get supported output formats and qualities
   * @returns Promise<{ formats: string[], qualities: string[] }>
   */
  getSupportedFormats(): Promise<{ formats: string[]; qualities: string[] }>
}