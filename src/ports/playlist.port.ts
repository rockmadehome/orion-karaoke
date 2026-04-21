import { Playlist, KaraokeTrack } from '@/domain/entities'

export interface PlaylistPort {
  /**
   * Add a song to the playlist
   * @param songUrl YouTube URL of the song
   * @param options Playlist options
   * @returns Promise<KaraokeTrack>
   */
  addSong(songUrl: string, options?: {
    position?: number
    priority?: 'normal' | 'high' | 'low'
    requestBy?: string
  }): Promise<KaraokeTrack>

  /**
   * Remove a song from the playlist
   * @param trackId Track ID to remove
   * @returns Promise<void>
   */
  removeSong(trackId: string): Promise<void>

  /**
   * Move a song to a new position
   * @param trackId Track ID to move
   * @param newPosition New position in playlist
   * @returns Promise<void>
   */
  moveSong(trackId: string, newPosition: number): Promise<void>

  /**
   * Get the current song
   * @returns Promise<KaraokeTrack | null>
   */
  getCurrentSong(): Promise<KaraokeTrack | null>

  /**
   * Play the next song in the playlist
   * @returns Promise<KaraokeTrack | null>
   */
  playNext(): Promise<KaraokeTrack | null>

  /**
   * Play the previous song in the playlist
   * @returns Promise<KaraokeTrack | null>
   */
  playPrev(): Promise<KaraokeTrack | null>

  /**
   * Clear the entire playlist
   * @returns Promise<void>
   */
  clear(): Promise<void>

  /**
   * Shuffle the playlist
   * @returns Promise<void>
   */
  shuffle(): Promise<void>

  /**
   * Get all songs in the playlist
   * @returns Promise<KaraokeTrack[]>
   */
  getAllSongs(): Promise<KaraokeTrack[]>

  /**
   * Get playlist statistics
   * @returns Promise<{ totalTracks: number, totalDuration: number, estimatedQueueTime: number }>
   */
  getStats(): Promise<{ totalTracks: number; totalDuration: number; estimatedQueueTime: number }>

  /**
   * Save playlist state
   * @param playlist Playlist to save
   * @returns Promise<void>
   */
  savePlaylist(playlist: Playlist): Promise<void>

  /**
   * Load saved playlist
   * @param playlistId Playlist ID to load
   * @returns Promise<Playlist>
   */
  loadPlaylist(playlistId: string): Promise<Playlist>
}