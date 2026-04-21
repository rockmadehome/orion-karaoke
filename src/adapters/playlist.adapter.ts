import { PlaylistPort, Playlist, Song, PlaylistOrder } from '@/ports'
import { EventEmitter } from 'events'

export interface PlaylistItem {
  id: string
  track: Song
  addedAt: Date
  addedBy?: string
  duration: number
  position: number
  played: boolean
  skipped: boolean
  playCount: number
  favorite: boolean
  customOrder?: number
}

export interface PlaylistOptions {
  name?: string
  description?: string
  order?: PlaylistOrder
  maxItems?: number
  allowDuplicates?: boolean
  autoShuffle?: boolean
}

export class PlaylistManager extends EventEmitter implements PlaylistPort {
  private playlists: Map<string, Playlist> = new Map()
  private currentPlaylist: Playlist | null = null
  private currentIndex: number = -1
  private history: PlaylistItem[] = []
  private queue: PlaylistItem[] = []
  private nextId: number = 1
  
  constructor() {
    super()
  }
  
  async createPlaylist(name: string, options: PlaylistOptions = {}): Promise<Playlist> {
    const playlistId = `playlist_${Date.now()}_${this.nextId++}`
    const playlist: Playlist = {
      id: playlistId,
      name,
      description: options.description || '',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      order: options.order || PlaylistOrder.SEQUENTIAL,
      maxItems: options.maxItems || 1000,
      allowDuplicates: options.allowDuplicates || false,
      autoShuffle: options.autoShuffle || false,
      currentTrack: null,
      isPlaying: false
    }
    
    this.playlists.set(playlistId, playlist)
    
    // Emit event
    this.emit('playlistCreated', { playlist })
    
    return playlist
  }
  
  async addToPlaylist(track: Song, playlistId?: string): Promise<void> {
    const targetPlaylist = playlistId ? this.playlists.get(playlistId) : this.currentPlaylist
    
    if (!targetPlaylist) {
      throw new Error(`Playlist not found: ${playlistId || 'current'}`)
    }
    
    // Check for duplicates if not allowed
    if (!targetPlaylist.allowDuplicates) {
      const exists = targetPlaylist.items.some(item => item.track.id === track.id)
      if (exists) {
        throw new Error('Track already exists in playlist')
      }
    }
    
    const playlistItem: PlaylistItem = {
      id: `item_${Date.now()}_${this.nextId++}`,
      track,
      addedAt: new Date(),
      duration: track.duration || 0,
      position: targetPlaylist.items.length,
      played: false,
      skipped: false,
      playCount: 0,
      favorite: false
    }
    
    targetPlaylist.items.push(playlistItem)
    targetPlaylist.updatedAt = new Date()
    
    // If auto-shuffle is enabled, reorder the playlist
    if (targetPlaylist.autoShuffle) {
      await this.shufflePlaylist(targetPlaylist.id)
    }
    
    // Emit event
    this.emit('trackAdded', { playlist: targetPlaylist, item: playlistItem })
    
    console.log(`Added ${track.title} to playlist ${targetPlaylist.name}`)
  }
  
  async removeFromPlaylist(trackId: string, playlistId?: string): Promise<void> {
    const targetPlaylist = playlistId ? this.playlists.get(playlistId) : this.currentPlaylist
    
    if (!targetPlaylist) {
      throw new Error(`Playlist not found: ${playlistId || 'current'}`)
    }
    
    const index = targetPlaylist.items.findIndex(item => item.track.id === trackId)
    
    if (index === -1) {
      throw new Error(`Track not found in playlist: ${trackId}`)
    }
    
    const removedItem = targetPlaylist.items.splice(index, 1)[0]
    targetPlaylist.updatedAt = new Date()
    
    // Update positions
    targetPlaylist.items.forEach((item, i) => {
      item.position = i
    })
    
    // If this was the current track, stop playing
    if (targetPlaylist.currentTrack && targetPlaylist.currentTrack.id === trackId) {
      targetPlaylist.currentTrack = null
      targetPlaylist.isPlaying = false
    }
    
    // Emit event
    this.emit('trackRemoved', { playlist: targetPlaylist, item: removedItem })
    
    console.log(`Removed track ${trackId} from playlist ${targetPlaylist.name}`)
  }
  
  async playNext(trackId: string): Promise<void> {
    if (!this.currentPlaylist) {
      throw new Error('No current playlist')
    }
    
    const track = this.findTrackById(trackId)
    if (!track) {
      throw new Error(`Track not found: ${trackId}`)
    }
    
    // Add to the beginning of the queue
    this.queue.unshift({
      id: `queue_${Date.now()}_${this.nextId++}`,
      track,
      addedAt: new Date(),
      duration: track.duration || 0,
      position: 0,
      played: false,
      skipped: false,
      playCount: 0,
      favorite: false
    })
    
    this.emit('queueUpdated', { playlist: this.currentPlaylist, queue: this.queue })
    
    console.log(`Added ${track.title} to next in queue`)
  }
  
  async playPrevious(trackId: string): Promise<void> {
    if (!this.currentPlaylist) {
      throw new Error('No current playlist')
    }
    
    const track = this.findTrackById(trackId)
    if (!track) {
      throw new Error(`Track not found: ${trackId}`)
    }
    
    // Add to the end of the queue
    this.queue.push({
      id: `queue_${Date.now()}_${this.nextId++}`,
      track,
      addedAt: new Date(),
      duration: track.duration || 0,
      position: this.queue.length,
      played: false,
      skipped: false,
      playCount: 0,
      favorite: false
    })
    
    this.emit('queueUpdated', { playlist: this.currentPlaylist, queue: this.queue })
    
    console.log(`Added ${track.title} to previous in queue`)
  }
  
  async getCurrentSong(): Promise<Song | null> {
    if (!this.currentPlaylist) {
      return null
    }
    
    const currentItem = this.currentPlaylist.currentTrack
    return currentItem ? currentItem.track : null
  }
  
  async getNextSong(): Promise<Song | null> {
    if (!this.currentPlaylist) {
      return null
    }
    
    let nextIndex = this.currentIndex + 1
    
    // Handle queue
    if (this.queue.length > 0) {
      const nextQueueItem = this.queue[0]
      return nextQueueItem.track
    }
    
    // Handle sequential order
    if (this.currentPlaylist.order === PlaylistOrder.SEQUENTIAL) {
      if (nextIndex < this.currentPlaylist.items.length) {
        return this.currentPlaylist.items[nextIndex].track
      }
      
      // Loop if enabled
      if (this.currentPlaylist.order === PlaylistOrder.LOOP) {
        nextIndex = 0
        return this.currentPlaylist.items[0].track
      }
    }
    
    // Handle shuffle order
    if (this.currentPlaylist.order === PlaylistOrder.SHUFFLE) {
      const unplayedItems = this.currentPlaylist.items.filter(item => !item.played)
      if (unplayedItems.length > 0) {
        const randomIndex = Math.floor(Math.random() * unplayedItems.length)
        return unplayedItems[randomIndex].track
      }
    }
    
    return null
  }
  
  async getPreviousSong(): Promise<Song | null> {
    if (!this.currentPlaylist) {
      return null
    }
    
    // Check history
    if (this.history.length > 0) {
      const previousItem = this.history[this.history.length - 1]
      return previousItem.track
    }
    
    // If no history, return the previous item in the playlist
    if (this.currentIndex > 0) {
      return this.currentPlaylist.items[this.currentIndex - 1].track
    }
    
    return null
  }
  
  async shufflePlaylist(playlistId?: string): Promise<void> {
    const targetPlaylist = playlistId ? this.playlists.get(playlistId) : this.currentPlaylist
    
    if (!targetPlaylist) {
      throw new Error(`Playlist not found: ${playlistId || 'current'}`)
    }
    
    // Fisher-Yates shuffle
    for (let i = targetPlaylist.items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[targetPlaylist.items[i], targetPlaylist.items[j]] = [targetPlaylist.items[j], targetPlaylist.items[i]]
    }
    
    // Update positions
    targetPlaylist.items.forEach((item, i) => {
      item.position = i
    })
    
    targetPlaylist.updatedAt = new Date()
    
    this.emit('playlistShuffled', { playlist: targetPlaylist })
    
    console.log(`Shuffled playlist ${targetPlaylist.name}`)
  }
  
  async reorderPlaylist(trackIds: string[], playlistId?: string): Promise<void> {
    const targetPlaylist = playlistId ? this.playlists.get(playlistId) : this.currentPlaylist
    
    if (!targetPlaylist) {
      throw new Error(`Playlist not found: ${playlistId || 'current'}`)
    }
    
    // Create a map of tracks by ID for quick lookup
    const trackMap = new Map<string, PlaylistItem>()
    targetPlaylist.items.forEach(item => {
      trackMap.set(item.track.id, item)
    })
    
    // Build new ordered array
    const newItems: PlaylistItem[] = []
    
    trackIds.forEach((trackId, index) => {
      const item = trackMap.get(trackId)
      if (item) {
        item.position = index
        newItems.push(item)
      }
    })
    
    // Add any remaining tracks
    targetPlaylist.items.forEach(item => {
      if (!trackIds.includes(item.track.id)) {
        item.position = newItems.length
        newItems.push(item)
      }
    })
    
    targetPlaylist.items = newItems
    targetPlaylist.updatedAt = new Date()
    
    this.emit('playlistReordered', { playlist: targetPlaylist })
    
    console.log(`Reordered playlist ${targetPlaylist.name}`)
  }
  
  async setPlaylistOrder(order: PlaylistOrder, playlistId?: string): Promise<void> {
    const targetPlaylist = playlistId ? this.playlists.get(playlistId) : this.currentPlaylist
    
    if (!targetPlaylist) {
      throw new Error(`Playlist not found: ${playlistId || 'current'}`)
    }
    
    targetPlaylist.order = order
    targetPlaylist.updatedAt = new Date()
    
    // Reorder if needed
    if (order === PlaylistOrder.SHUFFLE) {
      await this.shufflePlaylist(targetPlaylist.id)
    }
    
    this.emit('playlistOrderChanged', { playlist: targetPlaylist, order })
    
    console.log(`Set playlist ${targetPlaylist.name} order to ${order}`)
  }
  
  async getPlaylist(playlistId: string): Promise<Playlist> {
    const playlist = this.playlists.get(playlistId)
    
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistId}`)
    }
    
    return playlist
  }
  
  async getAllPlaylists(): Promise<Playlist[]> {
    return Array.from(this.playlists.values())
  }
  
  async deletePlaylist(playlistId: string): Promise<void> {
    const playlist = this.playlists.get(playlistId)
    
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistId}`)
    }
    
    // If this is the current playlist, clear it
    if (playlist === this.currentPlaylist) {
      this.currentPlaylist = null
      this.currentIndex = -1
      this.queue = []
      this.history = []
    }
    
    this.playlists.delete(playlistId)
    
    this.emit('playlistDeleted', { playlist })
    
    console.log(`Deleted playlist ${playlist.name}`)
  }
  
  async setCurrentPlaylist(playlistId: string): Promise<void> {
    const playlist = this.playlists.get(playlistId)
    
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistId}`)
    }
    
    this.currentPlaylist = playlist
    this.currentIndex = -1
    this.queue = []
    this.history = []
    
    this.emit('playlistChanged', { playlist })
    
    console.log(`Set current playlist to ${playlist.name}`)
  }
  
  async markAsPlayed(trackId: string, playlistId?: string): Promise<void> {
    const targetPlaylist = playlistId ? this.playlists.get(playlistId) : this.currentPlaylist
    
    if (!targetPlaylist) {
      throw new Error(`Playlist not found: ${playlistId || 'current'}`)
    }
    
    const item = targetPlaylist.items.find(i => i.track.id === trackId)
    if (item) {
      item.played = true
      item.playCount++
      targetPlaylist.updatedAt = new Date()
      
      this.emit('trackPlayed', { playlist: targetPlaylist, item })
    }
  }
  
  async markAsSkipped(trackId: string, playlistId?: string): Promise<void> {
    const targetPlaylist = playlistId ? this.playlists.get(playlistId) : this.currentPlaylist
    
    if (!targetPlaylist) {
      throw new Error(`Playlist not found: ${playlistId || 'current'}`)
    }
    
    const item = targetPlaylist.items.find(i => i.track.id === trackId)
    if (item) {
      item.skipped = true
      targetPlaylist.updatedAt = new Date()
      
      this.emit('trackSkipped', { playlist: targetPlaylist, item })
    }
  }
  
  async setFavorite(trackId: string, favorite: boolean, playlistId?: string): Promise<void> {
    const targetPlaylist = playlistId ? this.playlists.get(playlistId) : this.currentPlaylist
    
    if (!targetPlaylist) {
      throw new Error(`Playlist not found: ${playlistId || 'current'}`)
    }
    
    const item = targetPlaylist.items.find(i => i.track.id === trackId)
    if (item) {
      item.favorite = favorite
      targetPlaylist.updatedAt = new Date()
      
      this.emit('trackFavorited', { playlist: targetPlaylist, item, favorite })
    }
  }
  
  private findTrackById(trackId: string): Song | null {
    if (!this.currentPlaylist) {
      return null
    }
    
    const item = this.currentPlaylist.items.find(i => i.track.id === trackId)
    return item ? item.track : null
  }
  
  // Event listeners
  onTrackAdded(callback: (data: { playlist: Playlist; item: PlaylistItem }) => void): void {
    this.on('trackAdded', callback)
  }
  
  onTrackRemoved(callback: (data: { playlist: Playlist; item: PlaylistItem }) => void): void {
    this.on('trackRemoved', callback)
  }
  
  onTrackPlayed(callback: (data: { playlist: Playlist; item: PlaylistItem }) => void): void {
    this.on('trackPlayed', callback)
  }
  
  onTrackSkipped(callback: (data: { playlist: Playlist; item: PlaylistItem }) => void): void {
    this.on('trackSkipped', callback)
  }
  
  onPlaylistCreated(callback: (data: { playlist: Playlist }) => void): void {
    this.on('playlistCreated', callback)
  }
  
  onPlaylistDeleted(callback: (data: { playlist: Playlist }) => void): void {
    this.on('playlistDeleted', callback)
  }
  
  onPlaylistChanged(callback: (data: { playlist: Playlist }) => void): void {
    this.on('playlistChanged', callback)
  }
  
  onQueueUpdated(callback: (data: { playlist: Playlist; queue: PlaylistItem[] }) => void): void {
    this.on('queueUpdated', callback)
  }
}