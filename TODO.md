# Tareas Orion-Karaoke (Overnight)

## Principio General
Todo el sistema debe ser abstracto (ports/interfaces) con implementaciones base de ejemplo. La idea es que sea trivial añadir nuevas funcionalidades cambiando solo el adaptador, nunca el core.

## Completadas
- [x] Estructura base del proyecto creada.
- [x] README.md con especificaciones completas.
- [x] Arquitectura hexagonal definida.
- [x] Estructura de directorios propuesta.
- [x] **Todos los Ports interfaces definidos** (YouTubeAdapterPort, AudioSeparationPort, LyricsRecognitionPort, KaraokeGeneratorPort, PlaybackPort, PlaylistPort, AuthCodePort, LocalizationPort, StoragePort)
- [x] **Todos los Domain Entities implementados** (KaraokeTrack, Playlist, ProcessingJob, UserSession, Role, GPUInfo)
- [x] **Todos los Services core implementados** (GPUManager, WorkerManager, QueueManager, AuthManager)
- [x] **Tests unitarios básicos creados** (GPUManager, AuthManager)

## Pendientes — Core Architecture (Ports)
- [x] **YouTubeAdapterPort** (interface)
  - downloadVideo(url: string): Promise<DownloadResult>
  - getVideoInfo(url: string): Promise<VideoInfo>
- [x] **AudioSeparationPort** (interface)
  - separateVocals(audioPath: string): Promise<string>
  - separateInstrumentals(audioPath: string): Promise<string>
- [x] **LyricsRecognitionPort** (interface)
  - recognizeLanguage(audioPath: string): Promise<string>
  - extractLyricsWithTimestamps(audioPath: string, language: string): Promise<LyricsWithTimestamps>
- [x] **KaraokeGeneratorPort** (interface)
  - generateKaraoke(videoPath: string, vocalPath: string, lyrics: LyricsWithTimestamps): Promise<string>
- [x] **PlaybackPort** (interface)
  - play(trackId: string): Promise<void>
  - pause(): Promise<void>
  - stop(): Promise<void>
  - seek(time: number): Promise<void>
  - getCurrentTime(): Promise<number>
- [x] **PlaylistPort** (interface)
  - addSong(songUrl: string): Promise<Song>
  - removeSong(songId: string): Promise<void>
  - getCurrentSong(): Promise<Song | null>
  - playNext(): Promise<void>
  - playPrev(): Promise<void>
- [x] **AuthCodePort** (interface)
  - validateCode(code: string): Promise<AuthResult>
  - generateVisitCode(duration: DurationType): Promise<string>
  - generateMasterCode(): Promise<string>
  - refreshVisitCode(): Promise<string>
  - isCodeExpired(code: string): Promise<boolean>
- [x] **LocalizationPort** (interface)
  - getTranslations(lang: string): Promise<Translations>
  - getCurrentLang(): Promise<string>
  - setLang(lang: string): Promise<void>
- [x] **StoragePort** (interface)
  - saveKaraokeVideo(path: string, metadata: KaraokeMetadata): Promise<string>
  - getKaraokeVideo(id: string): Promise<string>
  - listKaraokeVideos(): Promise<KaraokeVideo[]>
  - saveVideoFile(file: Buffer, path: string): Promise<string>
  - getVideoFile(path: string): Promise<Buffer>
  - deleteVideo(id: string): Promise<void>
  - updateVideoMetadata(id: string, metadata: KaraokeMetadata): Promise<void>

## Pendientes — Core Architecture (Domain)
- [x] **Entity: KaraokeTrack**
  - id: string
  - youtubeUrl: string
  - videoPath: string
  - audioPath: string
  - vocalPath: string
  - instrumentalPath: string
  - lyrics: LyricsWithTimestamps
  - karaokeVideoPath: string
  - status: ProcessingStatus (pending/downloading/extracting_audio/separating_vocals/recognizing_lyrics/generating_karaoke/done/failed)
  - createdAt: Date
  - completedAt?: Date
  - error?: string
- [x] **Entity: Playlist**
  - id: string
  - name: string
  - songs: KaraokeTrack[]
  - createdAt: Date
- [x] **Entity: ProcessingJob**
  - id: string
  - type: JobType (karaoke_conversion, lyrics_sync)
  - status: JobStatus (pending/running/completed/failed/cancelled)
  - progress: number (0-100)
  - currentStep: string
  - error?: string
  - createdAt: Date
  - startedAt?: Date
  - completedAt?: Date
- [x] **Entity: UserSession**
  - id: string
  - role: UserRole (admin/visitor)
  - code: string
  - expiresAt?: Date
  - createdAt: Date
  - lastUsedAt: Date
  - ipAddress?: string
- [x] **Entity: Role**
  - ADMIN (código maestro)
  - VISITOR (código de visita)

## Pendientes — Core Architecture (Services)
- [x] **GPUManager**
  - detectGPU(): Promise<GPUInfo>
  - isGPUSupported(): Promise<boolean>
  - getSupportedModels(): Promise<string[]>
  - getPreferredModel(): Promise<string>
  - isModelCompatible(model: string): Promise<boolean>
- [x] **WorkerManager**
  - createWorker(type: WorkerType): Promise<Worker>
  - terminateWorker(workerId: string): Promise<void>
  - setWorkerCount(count: number): Promise<void>
  - getWorkerCount(): Promise<number>
  - getWorkerStatus(workerId: string): Promise<WorkerStatus>
- [x] **QueueManager**
  - enqueueJob(job: ProcessingJob): Promise<void>
  - dequeueJob(): Promise<ProcessingJob | null>
  - getQueue(): Promise<ProcessingJob[]>
  - updateJobProgress(jobId: string, progress: number, step: string): Promise<void>
  - updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void>
  - retryJob(jobId: string): Promise<void>
  - cancelJob(jobId: string): Promise<void>
- [x] **AuthManager**
  - validateMasterCode(code: string): Promise<boolean>
  - validateVisitCode(code: string): Promise<UserSession | null>
  - createVisitSession(code: string): Promise<UserSession>
  - refreshSession(sessionId: string): Promise<void>
  - invalidateSession(sessionId: string): Promise<void>
  - createMasterSession(): Promise<UserSession>

## Pendientes — Backend (Node.js/Express)
- [ ] Server HTTP con Fastify (puerto 3000)
- [ ] Endpoints REST:
  - POST /auth (validar código maestro o de visita)
  - GET /auth/me (obtener sesión actual)
  - POST /karaoke/queue (añadir canción a conversión)
  - GET /karaoke/queue (lista de tareas)
  - GET /karaoke/:id (estado de conversión)
  - POST /karaoke/:id/retry (reintentar fallo)
  - POST /karaoke/:id/cancel (cancelar tarea)
  - GET /playlist (lista de reproducción)
  - POST /playlist (añadir a reproducción)
  - POST /playlist/:id/next (play siguiente)
  - POST /playlist/:id/prev (play anterior)
  - POST /playlist/:id/remove (eliminar de reproducción)
  - POST /play/pause (control playback)
  - POST /play/seek (posicionar en tiempo)
  - GET /play/current (track actual)
  - GET /settings (configuración, código maestro)
  - POST /settings (actualizar configuración)
  - GET /gpu (información GPU)
  - POST /workers (configurar número de workers)
  - GET /workers (estado de workers)
  - GET /translations (obtener traducciones según idioma)
- [ ] Role guard middleware
- [ ] Rate limiting (máximo 5 requests por segundo por código de visita)

## Pendientes — Workers (Python/FastAPI)
- [ ] YouTube downloader (yt-dlp)
- [ ] Audio separator (Spleeter/Demucs)
  - Opciones: local con CUDA/MLX o cloud (para probar: Replicate API, Hugging Face)
- [ ] Lyrics recognition:
  - Whisper (oficial) + modelo fine-tuned para voz cantada (para probar: Udio API)
  - Timestamps por palabra y por frase
- [ ] Karaoke generator (FFmpeg)
- [ ] Webhook de notificación cuando el job completa
- [ ] Tests unitarios para cada función del worker

## Pendientes — Frontend (Vue 3 + Shadcn UI)
- [ ] Estructura Vue 3 con Vite
- [ ] Setup Shadcn UI con Tailwind CSS
- [ ] Temas oscuro/claro
- [ ] Sistema de i18n (ES por defecto)
- [ ] Login screen con 4-digit code input
- [ ] Dashboard:
  - Estado de conversiones (Kanban o lista)
  - Lista de reproducción con control pausa/play
  - Añadir canciones a conversión
  - Configuración GPU (detectar, opciones, API keys)
- [ ] Pantalla de playback:
  - Reproducción de karaoke
  - Controles básicos (play/pause, next, prev, seek)
  - Visualización de letras sincronizadas
- [ ] Google Cast integración (si no se hace del lado del servidor):
  - Cast SDK para emitir stream a TV
- [ ] Responsive design (mobile/desktop)
- [ ] Persistencia de estado con Zustand (auth, playback)

## Pendientes — Google Cast Server (Docker)
- [ ] Mini servidor local de Google Cast
- [ ] Stream desde servidor a TV
- [ ] Control de reproducción desde cliente
- [ ] Pantalla de proyección HDMI

## Pendientes — Cast Server Screen (HDMI)
- [ ] Pantalla HTML que se proyecta a TV
- [ ] Visualización de letras sincronizadas
- [ ] Controles grandes (play/pause, next, volume)
- [ ] Logo/Branding de la sala

## Pendientes — Storage (Multi-DB)
- [ ] SQLite adapter (por defecto)
- [ ] PostgreSQL adapter
- [ ] MongoDB adapter
- [ ] MySQL adapter
- [ ] Configuración vía .env (DB_PROVIDER, DATABASE_URL, etc.)

## Pendientes — Deployment
- [ ] Dockerfile para backend
- [ ] Dockerfile para worker
- [ ] Dockerfile para frontend
- [ ] Dockerfile para cast-server
- [ ] docker-compose.yml para orquestación
- [ ] Configuración de Redis (opcional) para sessions
- [ ] Configuración de GPU (si está disponible)

## Pendientes — Extras (futuras iteraciones)
- [ ] Tests end-to-end con Playwright
- [ ] Monitor de GPU usage
- [ ] Dashboard de performance
- [ ] Logs centralizados
- [ ] Multi-tenant (múltiples salas)
- [ ] API para integraciones externas
