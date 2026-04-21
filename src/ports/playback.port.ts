import { PlaybackState } from '@/domain/entities'

export interface PlaybackPort {
  /**
   * Play a specific track
   * @param trackId Track ID to play
   * @returns Promise<void>
   */
  play(trackId: string): Promise<void>

  /**
   * Pause current playback
   * @returns Promise<void>
   */
  pause(): Promise<void>

  /**
   * Stop current playback
   * @returns Promise<void>
   */
  stop(): Promise<void>

  /**
   * Seek to a specific time in the current track
   * @param time Time in seconds
   * @returns Promise<void>
   */
  seek(time: number): Promise<void>

  /**
   * Get current playback time
   * @returns Promise<number> Current time in seconds
   */
  getCurrentTime(): Promise<number>

  /**
   * Get the total duration of the current track
   * @returns Promise<number> Duration in seconds
   */
  getDuration(): Promise<number>

  /**
   * Set volume (0.0 to 1.0)
   * @param volume Volume level
   * @returns Promise<void>
   */
  setVolume(volume: number): Promise<void>

  /**
   * Get current volume level
   * @returns Promise<number> Volume level (0.0 to 1.0)
   */
  getVolume(): Promise<number>

  /**
   * Get current playback state
   * @returns Promise<PlaybackState>
   */
  getState(): Promise<PlaybackState>

  /**
   * Check if a track is currently playing
   * @param trackId Track ID
   * @returns Promise<boolean>
   */
  isPlaying(trackId: string): Promise<boolean>

  /**
   * Get the currently playing track
   * @returns Promise<string | null> Current track ID or null
   */
  getCurrentTrack(): Promise<string | null>

  /**
   * Get supported audio formats
   * @returns Promise<string[]>
   */
  getSupportedFormats(): Promise<string[]>
}