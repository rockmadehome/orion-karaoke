import { LyricsWithTimestamps, LanguageDetectionResult } from '@/domain/entities'

export interface LyricsRecognitionPort {
  /**
   * Detect the language of an audio file
   * @param audioPath Path to the audio file
   * @returns Promise<LanguageDetectionResult>
   */
  recognizeLanguage(audioPath: string): Promise<LanguageDetectionResult>

  /**
   * Extract lyrics with timestamps from audio
   * @param audioPath Path to the audio file
   * @param language Language code (e.g., 'en', 'es', 'fr')
   * @param options Recognition options
   * @returns Promise<LyricsWithTimestamps>
   */
  extractLyricsWithTimestamps(
    audioPath: string,
    language: string,
    options?: {
      model?: string
      useGPU?: boolean
      timestampGranularity?: 'word' | 'phrase'
      temperature?: number
    }
  ): Promise<LyricsWithTimestamps>

  /**
   * Sync existing lyrics with audio
   * @param lyrics Text lyrics without timestamps
   * @param audioPath Path to the audio file
   * @param language Language code
   * @returns Promise<LyricsWithTimestamps>
   */
  syncLyricsWithAudio(
    lyrics: string,
    audioPath: string,
    language: string
  ): Promise<LyricsWithTimestamps>

  /**
   * Get supported languages for recognition
   * @returns Promise<string[]>
   */
  getSupportedLanguages(): Promise<string[]>

  /**
   * Check if GPU acceleration is available for transcription
   * @returns Promise<boolean>
   */
  isGPUAvailable(): Promise<boolean>
}