import { PlaybackPort, PlaybackState, PlaybackDevice } from '@/ports'
import { EventEmitter } from 'events'

export enum PlaybackStatus {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error'
}

export interface PlaybackConfig {
  volume: number
  outputDevice?: PlaybackDevice
  autoPlay: boolean
  loop: boolean
  shuffle: boolean
  crossfade: number
  normalizeAudio: boolean
}

export class PlaybackManager extends EventEmitter implements PlaybackPort {
  private config: PlaybackConfig
  private currentState: PlaybackState
  private currentTrack: string | null = null
  private isPlaying = false
  private playbackStartTime = 0
  private pausedTime = 0
  private totalDuration = 0
  private progressInterval: NodeJS.Timeout | null = null
  
  constructor(config: Partial<PlaybackConfig> = {}) {
    super()
    this.config = {
      volume: 70,
      autoPlay: true,
      loop: false,
      shuffle: false,
      crossfade: 0,
      normalizeAudio: false,
      ...config
    }
    
    this.currentState = {
      status: PlaybackStatus.IDLE,
      volume: this.config.volume,
      position: 0,
      duration: 0,
      isPlaying: false,
      currentTrack: null,
      playbackSpeed: 1.0,
      muted: false
    }
  }
  
  async play(trackId: string): Promise<void> {
    try {
      console.log(`Playing track: ${trackId}`)
      
      // Stop any current playback
      if (this.isPlaying) {
        await this.stop()
      }
      
      this.currentTrack = trackId
      this.isPlaying = true
      this.playbackStartTime = Date.now()
      
      // Start progress tracking
      this.startProgressTracking()
      
      // Update state
      this.updateState({
        status: PlaybackStatus.PLAYING,
        currentTrack: trackId,
        isPlaying: true,
        position: 0
      })
      
      // Emit event
      this.emit('play', { trackId })
      
      // Simulate playback (in reality, this would use actual audio playback)
      this.simulatePlayback()
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async pause(): Promise<void> {
    try {
      if (!this.isPlaying || this.currentState.status === PlaybackStatus.PAUSED) {
        return
      }
      
      console.log('Pausing playback')
      
      this.isPlaying = false
      this.pausedTime = Date.now() - this.playbackStartTime
      
      // Stop progress tracking
      this.stopProgressTracking()
      
      // Update state
      this.updateState({
        status: PlaybackStatus.PAUSED,
        isPlaying: false,
        position: this.getCurrentTimeSync()
      })
      
      // Emit event
      this.emit('pause')
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async stop(): Promise<void> {
    try {
      console.log('Stopping playback')
      
      this.isPlaying = false
      this.currentTrack = null
      this.playbackStartTime = 0
      this.pausedTime = 0
      this.totalDuration = 0
      
      // Stop progress tracking
      this.stopProgressTracking()
      
      // Update state
      this.updateState({
        status: PlaybackStatus.STOPPED,
        currentTrack: null,
        isPlaying: false,
        position: 0,
        duration: 0
      })
      
      // Emit event
      this.emit('stop')
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async seek(time: number): Promise<void> {
    try {
      if (!this.currentTrack) {
        throw new Error('No track loaded')
      }
      
      console.log(`Seeking to ${time}ms`)
      
      // Adjust playback time
      if (this.isPlaying) {
        this.playbackStartTime = Date.now() - time
      } else {
        this.pausedTime = time
      }
      
      // Update state
      this.updateState({
        position: time
      })
      
      // Emit event
      this.emit('seek', { time })
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async getCurrentTime(): Promise<number> {
    return this.getCurrentTimeSync()
  }
  
  async setVolume(volume: number): Promise<void> {
    try {
      volume = Math.max(0, Math.min(100, volume))
      
      console.log(`Setting volume to ${volume}%`)
      
      this.config.volume = volume
      this.updateState({ volume })
      
      // Emit event
      this.emit('volumeChange', { volume })
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async setPlaybackSpeed(speed: number): Promise<void> {
    try {
      speed = Math.max(0.25, Math.min(4, speed))
      
      console.log(`Setting playback speed to ${speed}x`)
      
      this.updateState({ playbackSpeed: speed })
      
      // Emit event
      this.emit('speedChange', { speed })
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async setMuted(muted: boolean): Promise<void> {
    try {
      console.log(`${muted ? 'Muting' : 'Unmuting'} audio`)
      
      this.updateState({ muted })
      
      // Emit event
      this.emit('muteChange', { muted })
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async setLoop(loop: boolean): Promise<void> {
    try {
      console.log(`${loop ? 'Enabling' : 'Disabling'} loop`)
      
      this.config.loop = loop
      this.updateState({ loop })
      
      // Emit event
      this.emit('loopChange', { loop })
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async setShuffle(shuffle: boolean): Promise<void> {
    try {
      console.log(`${shuffle ? 'Enabling' : 'Disabling'} shuffle`)
      
      this.config.shuffle = shuffle
      this.updateState({ shuffle })
      
      // Emit event
      this.emit('shuffleChange', { shuffle })
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async getStatus(): Promise<PlaybackState> {
    return { ...this.currentState }
  }
  
  async getDevices(): Promise<PlaybackDevice[]> {
    // In a real implementation, this would query available audio devices
    return [
      {
        id: 'default',
        name: 'Default Output',
        type: 'speaker',
        isSelected: true
      },
      {
        id: 'headphones',
        name: 'Headphones',
        type: 'headphones',
        isSelected: false
      },
      {
        id: 'hdmi',
        name: 'HDMI Output',
        type: 'hdmi',
        isSelected: false
      }
    ]
  }
  
  async setOutputDevice(deviceId: string): Promise<void> {
    try {
      console.log(`Setting output device to ${deviceId}`)
      
      const devices = await this.getDevices()
      const device = devices.find(d => d.id === deviceId)
      
      if (!device) {
        throw new Error(`Device not found: ${deviceId}`)
      }
      
      // Update device selection
      devices.forEach(d => d.isSelected = d.id === deviceId)
      
      this.config.outputDevice = device
      this.updateState({ outputDevice: device })
      
      // Emit event
      this.emit('deviceChange', { device })
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async crossfadeTo(trackId: string, duration: number = 2000): Promise<void> {
    try {
      console.log(`Crossfading to ${trackId} over ${duration}ms`)
      
      // Start fade out for current track
      await this.fadeOut(duration / 2)
      
      // Play new track
      await this.play(trackId)
      
      // Start fade in for new track
      await this.fadeIn(duration / 2)
      
      // Emit event
      this.emit('crossfade', { fromTrack: this.currentTrack, toTrack: trackId })
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  private simulatePlayback(): void {
    // Simulate playback progress
    const simulateProgress = () => {
      if (!this.isPlaying) return
      
      const elapsed = this.getCurrentTimeSync()
      
      // Check if track has finished
      if (elapsed >= this.totalDuration) {
        if (this.config.loop) {
          // Restart track
          this.playbackStartTime = Date.now()
        } else {
          // Stop playback
          this.stop()
          this.emit('trackEnd', { trackId: this.currentTrack })
          return
        }
      }
      
      // Update state
      this.updateState({ position: elapsed })
    }
    
    // Simulate every 100ms
    this.progressInterval = setInterval(simulateProgress, 100)
  }
  
  private startProgressTracking(): void {
    this.progressInterval = setInterval(() => {
      if (this.isPlaying) {
        const elapsed = this.getCurrentTimeSync()
        this.updateState({ position: elapsed })
      }
    }, 100)
  }
  
  private stopProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }
  }
  
  private getCurrentTimeSync(): number {
    if (this.isPlaying) {
      return Date.now() - this.playbackStartTime
    } else if (this.currentState.status === PlaybackStatus.PAUSED) {
      return this.pausedTime
    }
    return 0
  }
  
  private async fadeOut(duration: number): Promise<void> {
    const steps = 20
    const stepDuration = duration / steps
    const startVolume = this.currentState.volume
    
    for (let i = 0; i < steps; i++) {
      const progress = i / steps
      const volume = startVolume * (1 - progress)
      
      await this.setVolume(volume)
      await new Promise(resolve => setTimeout(resolve, stepDuration))
    }
  }
  
  private async fadeIn(duration: number): Promise<void> {
    const steps = 20
    const stepDuration = duration / steps
    const targetVolume = this.config.volume
    
    for (let i = 0; i < steps; i++) {
      const progress = i / steps
      const volume = targetVolume * progress
      
      await this.setVolume(volume)
      await new Promise(resolve => setTimeout(resolve, stepDuration))
    }
  }
  
  private updateState(updates: Partial<PlaybackState>): void {
    this.currentState = { ...this.currentState, ...updates }
    this.emit('stateChange', this.currentState)
  }
  
  private handleError(error: string): void {
    console.error('Playback error:', error)
    this.updateState({ status: PlaybackStatus.ERROR })
    this.emit('error', { error })
  }
  
  // Utility methods for external control
  onStateChange(callback: (state: PlaybackState) => void): void {
    this.on('stateChange', callback)
  }
  
  onTrackEnd(callback: (data: { trackId: string }) => void): void {
    this.on('trackEnd', callback)
  }
  
  onError(callback: (data: { error: string }) => void): void {
    this.on('error', callback)
  }
}