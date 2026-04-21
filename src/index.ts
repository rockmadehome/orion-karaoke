import { createServer } from './server'

const server = createServer({
  port: 3000,
  host: '0.0.0.0',
  dbType: 'sqlite' as any,
  authConfig: {
    codeLength: 4,
    maxCodes: 1000,
    codeExpiration: {
      daily: 24 * 60 * 60 * 1000,
      hourly: 60 * 60 * 1000,
      fixed: 7 * 24 * 60 * 60 * 1000,
      once: 0
    },
    maxCodeUses: 10
  },
  storageConfig: {
    type: 'sqlite',
    connectionString: './data/orion-karaoke.db'
  },
  youtubeConfig: {},
  audioConfig: {
    type: 'spleeter',
    cuda: false,
    outputPath: './output'
  },
  lyricsConfig: {
    model: 'tiny',
    temperature: 0.0,
    beamSize: 5,
    bestOf: 5,
    wordTimestamps: true
  },
  karaokeConfig: {},
  playbackConfig: {
    volume: 70,
    autoPlay: true,
    loop: false,
    shuffle: false,
    crossfade: 0,
    normalizeAudio: false
  },
  playlistConfig: {},
  localizationConfig: {
    defaultLanguage: 'es',
    fallbackLanguage: 'es',
    supportedLanguages: ['es', 'en', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'],
    autoDetect: true,
    cacheEnabled: true,
    cacheTTL: 60 * 60 * 1000,
    missingKeyBehavior: 'log',
    interpolationEnabled: true
  }
})

// Start the server
server.start().catch(error => {
  console.error('Failed to start server:', error)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...')
  await server.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  await server.stop()
  process.exit(0)
})