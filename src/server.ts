import fastify from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { 
  YouTubeAdapter, 
  AudioSeparator, 
  LyricsRecognizer, 
  KaraokeGenerator, 
  PlaybackManager, 
  PlaylistManager,
  AuthCodeManager,
  LocalizationManager,
  StorageFactory,
  DatabaseType
} from './adapters'

// Type definitions
export interface ServerConfig {
  port: number
  host: string
  dbType: DatabaseType
  dbConfig: any
  authConfig: any
  storageConfig: any
  youtubeConfig: any
  audioConfig: any
  lyricsConfig: any
  karaokeConfig: any
  playbackConfig: any
  playlistConfig: any
  localizationConfig: any
}

const serverSchema = z.object({
  port: z.number().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  dbType: z.nativeEnum(DatabaseType).default(DatabaseType.SQLITE),
  dbConfig: z.object({}).default({}),
  authConfig: z.object({}).default({}),
  storageConfig: z.object({}).default({}),
  youtubeConfig: z.object({}).default({}),
  audioConfig: z.object({}).default({}),
  lyricsConfig: z.object({}).default({}),
  karaokeConfig: z.object({}).default({}),
  playbackConfig: z.object({}).default({}),
  playlistConfig: z.object({}).default({}),
  localizationConfig: z.object({}).default({})
})

export class OrionKaraokeServer {
  private server: any
  private config: ServerConfig
  private youtubeAdapter: YouTubeAdapter
  private audioSeparator: AudioSeparator
  private lyricsRecognizer: LyricsRecognizer
  private karaokeGenerator: KaraokeGenerator
  private playbackManager: PlaybackManager
  private playlistManager: PlaylistManager
  private authCodeManager: AuthCodeManager
  private localizationManager: LocalizationManager
  private storage: any
  private processingJobs: Map<string, any> = new Map()
  
  constructor(config: Partial<ServerConfig> = {}) {
    this.config = serverSchema.parse(config)
    this.server = fastify({
      logger: true,
      disableRequestLogging: false
    })
    
    this.initializeServices()
    this.setupRoutes()
  }
  
  private initializeServices(): void {
    // Initialize storage
    this.storage = StorageFactory.create({
      type: this.config.dbType,
      ...this.config.storageConfig
    })
    
    // Initialize adapters
    this.youtubeAdapter = new YouTubeAdapter()
    this.audioSeparator = new AudioSeparator({
      type: 'spleeter' as any,
      cuda: false,
      outputPath: './output'
    })
    this.lyricsRecognizer = new LyricsRecognizer({
      model: 'tiny' as any,
      temperature: 0.0,
      beamSize: 5,
      bestOf: 5,
      wordTimestamps: true
    })
    this.karaokeGenerator = new KaraokeGenerator()
    this.playbackManager = new PlaybackManager(this.config.playbackConfig)
    this.playlistManager = new PlaylistManager(this.config.playlistConfig)
    this.authCodeManager = new AuthCodeManager(this.config.authConfig)
    this.localizationManager = new LocalizationManager(this.config.localizationConfig)
    
    console.log('All services initialized')
  }
  
  private setupRoutes(): void {
    // Health check
    this.server.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    })
    
    // Authentication routes
    this.server.post('/auth', async (request, reply) => {
      try {
        const schema = z.object({
          code: z.string().min(4).max(10),
          type: z.enum(['master', 'visit']).optional()
        })
        
        const { code, type } = schema.parse(request.body)
        
        let result
        if (type === 'master' || (!type && code.length === 4)) {
          result = await this.authCodeManager.validateCode(code)
        } else {
          result = await this.authCodeManager.validateCode(code)
        }
        
        if (result === 'SUCCESS') {
          const session = {
            id: uuidv4(),
            code,
            role: type === 'master' ? 'admin' : 'visitor',
            createdAt: new Date().toISOString()
          }
          
          return {
            success: true,
            session,
            message: 'Authentication successful'
          }
        } else {
          return {
            success: false,
            error: 'Invalid code',
            code: result
          }
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    this.server.get('/auth/me', async (request, reply) => {
      try {
        // In a real implementation, this would check the session token
        return {
          session: {
            id: 'demo-session',
            role: 'visitor',
            permissions: ['read']
          }
        }
      } catch (error) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized'
        })
      }
    })
    
    // Karaoke conversion routes
    this.server.post('/karaoke/queue', async (request, reply) => {
      try {
        const schema = z.object({
          youtubeUrl: z.string().url(),
          priority: z.enum(['low', 'normal', 'high']).optional().default('normal')
        })
        
        const { youtubeUrl, priority } = schema.parse(request.body)
        
        // Validate YouTube URL
        const isValid = await this.youtubeAdapter.isValidYouTubeUrl(youtubeUrl)
        if (!isValid) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid YouTube URL'
          })
        }
        
        // Create processing job
        const jobId = uuidv4()
        const job = {
          id: jobId,
          type: 'karaoke_conversion',
          status: 'pending',
          progress: 0,
          currentStep: 'waiting',
          youtubeUrl,
          priority,
          createdAt: new Date().toISOString()
        }
        
        this.processingJobs.set(jobId, job)
        
        // Start processing in background
        this.processKaraokeJob(jobId)
        
        return {
          success: true,
          jobId,
          message: 'Job queued for processing'
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    this.server.get('/karaoke/queue', async () => {
      const jobs = Array.from(this.processingJobs.values())
      return {
        success: true,
        jobs,
        total: jobs.length
      }
    })
    
    this.server.get('/karaoke/:id', async (request, reply) => {
      try {
        const { id } = request.params as { id: string }
        const job = this.processingJobs.get(id)
        
        if (!job) {
          return reply.code(404).send({
            success: false,
            error: 'Job not found'
          })
        }
        
        return {
          success: true,
          job
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    this.server.post('/karaoke/:id/retry', async (request, reply) => {
      try {
        const { id } = request.params as { id: string }
        const job = this.processingJobs.get(id)
        
        if (!job) {
          return reply.code(404).send({
            success: false,
            error: 'Job not found'
          })
        }
        
        // Reset job status
        job.status = 'pending'
        job.progress = 0
        job.currentStep = 'waiting'
        job.error = undefined
        
        // Start processing again
        this.processKaraokeJob(id)
        
        return {
          success: true,
          message: 'Job retry initiated'
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    this.server.post('/karaoke/:id/cancel', async (request, reply) => {
      try {
        const { id } = request.params as { id: string }
        const job = this.processingJobs.get(id)
        
        if (!job) {
          return reply.code(404).send({
            success: false,
            error: 'Job not found'
          })
        }
        
        job.status = 'cancelled'
        
        return {
          success: true,
          message: 'Job cancelled'
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    // Playlist routes
    this.server.get('/playlist', async () => {
      try {
        const playlists = await this.playlistManager.getAllPlaylists()
        return {
          success: true,
          playlists
        }
      } catch (error) {
        return {
          success: false,
          error: 'Failed to get playlists'
        }
      }
    })
    
    this.server.post('/playlist', async (request, reply) => {
      try {
        const schema = z.object({
          name: z.string().min(1).max(100),
          description: z.string().optional()
        })
        
        const { name, description } = schema.parse(request.body)
        
        const playlist = await this.playlistManager.createPlaylist(name, { description })
        
        return {
          success: true,
          playlist
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    this.server.post('/playlist/:id/song', async (request, reply) => {
      try {
        const { id } = request.params as { id: string }
        const schema = z.object({
          youtubeUrl: z.string().url(),
          title: z.string().optional(),
          artist: z.string().optional()
        })
        
        const { youtubeUrl, title, artist } = schema.parse(request.body)
        
        // Validate YouTube URL
        const isValid = await this.youtubeAdapter.isValidYouTubeUrl(youtubeUrl)
        if (!isValid) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid YouTube URL'
          })
        }
        
        // Get video info
        const videoInfo = await this.youtubeAdapter.getVideoInfo(youtubeUrl)
        
        const song = {
          id: uuidv4(),
          youtubeUrl,
          title: title || videoInfo.title,
          artist: artist || 'Unknown',
          duration: videoInfo.duration,
          addedAt: new Date().toISOString()
        }
        
        await this.playlistManager.addToPlaylist(song, id)
        
        return {
          success: true,
          song
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    this.server.post('/playlist/:id/remove', async (request, reply) => {
      try {
        const { id } = request.params as { id: string }
        const schema = z.object({
          songId: z.string()
        })
        
        const { songId } = schema.parse(request.body)
        
        await this.playlistManager.removeFromPlaylist(songId, id)
        
        return {
          success: true,
          message: 'Song removed from playlist'
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    // Playback controls
    this.server.post('/play/pause', async (request, reply) => {
      try {
        await this.playbackManager.pause()
        return {
          success: true,
          message: 'Playback paused'
        }
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to pause playback'
        })
      }
    })
    
    this.server.post('/play/seek', async (request, reply) => {
      try {
        const schema = z.object({
          time: z.number().min(0)
        })
        
        const { time } = schema.parse(request.body)
        
        await this.playbackManager.seek(time)
        
        return {
          success: true,
          message: 'Playback seeked'
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    this.server.get('/play/current', async () => {
      try {
        const currentSong = await this.playbackManager.getCurrentSong()
        const status = await this.playbackManager.getStatus()
        
        return {
          success: true,
          currentSong,
          status
        }
      } catch (error) {
        return {
          success: false,
          error: 'Failed to get current song'
        }
      }
    })
    
    // Settings routes
    this.server.get('/settings', async () => {
      return {
        success: true,
        settings: {
          masterCode: await this.authCodeManager.generateMasterCode(),
          supportedLanguages: await this.localizationManager.getSupportedLanguages(),
          gpuInfo: 'CUDA available',
          workers: 4,
          storage: {
            type: this.config.dbType,
            totalSpace: 1000000000,
            usedSpace: 500000000
          }
        }
      }
    })
    
    this.server.post('/settings', async (request, reply) => {
      try {
        // Update settings logic here
        return {
          success: true,
          message: 'Settings updated'
        }
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request'
        })
      }
    })
    
    // Workers management
    this.server.get('/workers', async () => {
      return {
        success: true,
        workers: [
          { id: 'worker-1', status: 'idle', type: 'audio' },
          { id: 'worker-2', status: 'busy', type: 'video' },
          { id: 'worker-3', status: 'idle', type: 'lyrics' }
        ]
      }
    })
    
    // Translations
    this.server.get('/translations', async (request) => {
      try {
        const { lang } = request.query as { lang?: string }
        const translations = await this.localizationManager.getTranslations(lang || 'es')
        
        return {
          success: true,
          translations
        }
      } catch (error) {
        return {
          success: false,
          error: 'Failed to get translations'
        }
      }
    })
  }
  
  private async processKaraokeJob(jobId: string): Promise<void> {
    const job = this.processingJobs.get(jobId)
    if (!job) return
    
    try {
      job.status = 'running'
      job.currentStep = 'downloading'
      
      // Step 1: Download YouTube video
      const downloadResult = await this.youtubeAdapter.downloadVideo(job.youtubeUrl)
      job.progress = 20
      job.currentStep = 'extracting_audio'
      
      // Step 2: Extract audio
      const audioResult = await this.audioSeparator.separateVocals(downloadResult.filePath)
      job.progress = 40
      job.currentStep = 'recognizing_lyrics'
      
      // Step 3: Recognize lyrics
      const lyricsResult = await this.lyricsRecognizer.extractLyricsWithTimestamps(audioResult.vocalsPath)
      job.progress = 60
      job.currentStep = 'generating_karaoke'
      
      // Step 4: Generate karaoke video
      const karaokeResult = await this.karaokeGenerator.generateKaraoke(
        downloadResult.filePath,
        audioResult.vocalsPath,
        lyricsResult,
        { style: 'simple' }
      )
      
      job.progress = 100
      job.currentStep = 'completed'
      job.status = 'completed'
      karaokeVideoPath: karaokeResult
      
      console.log(`Karaoke job ${jobId} completed successfully`)
      
    } catch (error) {
      job.status = 'failed'
      job.currentStep = 'error'
      job.error = error instanceof Error ? error.message : 'Unknown error'
      
      console.error(`Karaoke job ${jobId} failed:`, error)
    }
  }
  
  async start(): Promise<void> {
    try {
      await this.server.listen({
        port: this.config.port,
        host: this.config.host
      })
      
      console.log(`Orion Karaoke server running on ${this.config.host}:${this.config.port}`)
    } catch (error) {
      console.error('Failed to start server:', error)
      process.exit(1)
    }
  }
  
  async stop(): Promise<void> {
    try {
      await this.server.close()
      console.log('Server stopped')
    } catch (error) {
      console.error('Failed to stop server:', error)
    }
  }
}

// Export server instance for direct use
export const createServer = (config?: Partial<ServerConfig>) => {
  return new OrionKaraokeServer(config)
}