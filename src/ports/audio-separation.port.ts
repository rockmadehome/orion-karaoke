import { AudioSeparationResult } from '@/domain/entities'

export interface AudioSeparationPort {
  /**
   * Separate vocals from audio
   * @param audioPath Path to the audio file
   * @param quality Audio quality (low, medium, high)
   * @returns Promise<AudioSeparationResult>
   */
  separateVocals(audioPath: string, quality?: 'low' | 'medium' | 'high'): Promise<AudioSeparationResult>

  /**
   * Separate instrumentals from audio
   * @param audioPath Path to the audio file
   * @param quality Audio quality (low, medium, high)
   * @returns Promise<AudioSeparationResult>
   */
  separateInstrumentals(audioPath: string, quality?: 'low' | 'medium' | 'high'): Promise<AudioSeparationResult>

  /**
   * Separate both vocals and instrumentals in one operation
   * @param audioPath Path to the audio file
   * @param quality Audio quality (low, medium, high)
   * @returns Promise<AudioSeparationResult>
   */
  separateBoth(audioPath: string, quality?: 'low' | 'medium' | 'high'): Promise<AudioSeparationResult>

  /**
   * Check if GPU acceleration is available
   * @returns Promise<boolean>
   */
  isGPUAvailable(): Promise<boolean>

  /**
   * Get supported separation models
   * @returns Promise<string[]>
   */
  getSupportedModels(): Promise<string[]>
}