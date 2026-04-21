/**
 * SQLite Storage Adapter — concrete implementation using better-sqlite3
 *
 * Implements the full StoragePort interface. All DB calls are synchronous
 * (better-sqlite3 is sync by design) which keeps the code simple and
 * eliminates callback/promise nesting issues.
 */
import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { StoragePort } from '@/ports/storage.port'
import type { KaraokeMetadata, KaraokeVideo } from '@/domain/entities'

// ---------------------------------------------------------------------------
// Public config
// ---------------------------------------------------------------------------
export interface SQLiteStorageConfig {
  /** Path to the .db file. Defaults to ./data/orion-karaoke.db */
  dbPath?: string
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export class SQLiteStorageAdapter implements StoragePort {
  private db!: DatabaseType
  private readonly dbPath: string
  private stmts!: {
    insertVideo: Statement
    getVideo: Statement
    listVideos: Statement
    deleteVideo: Statement
    updateMetadata: Statement
  }

  constructor(config: SQLiteStorageConfig = {}) {
    this.dbPath = config.dbPath ?? path.resolve('data', 'orion-karaoke.db')
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------
  /** Call once before using the adapter (creates tables, prepares statements). */
  init(): void {
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.createTables()
    this.prepareStatements()
  }

  /** Graceful shutdown. */
  close(): void {
    this.db.close()
  }

  // -----------------------------------------------------------------------
  // StoragePort — Video CRUD
  // -----------------------------------------------------------------------
  async saveKaraokeVideo(filePath: string, metadata: KaraokeMetadata): Promise<string> {
    const id = metadata.id || `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()

    this.stmts.insertVideo.run(
      id,
      filePath,
      metadata.title,
      metadata.artist,
      metadata.youtubeUrl ?? null,
      metadata.duration,
      metadata.language,
      metadata.genre ?? null,
      metadata.quality,
      metadata.fileSize,
      now,
      now,
    )
    return id
  }

  async getKaraokeVideo(id: string): Promise<{ path: string; metadata: KaraokeMetadata }> {
    const row = this.stmts.getVideo.get(id) as VideoRow | undefined
    if (!row) throw new Error(`Video not found: ${id}`)

    return { path: row.file_path, metadata: this.rowToMetadata(row) }
  }

  async listKaraokeVideos(options?: {
    limit?: number
    offset?: number
    sortBy?: 'createdAt' | 'title' | 'duration'
    sortOrder?: 'asc' | 'desc'
    filters?: {
      status?: string
      language?: string
      duration?: { min?: number; max?: number }
    }
  }): Promise<KaraokeVideo[]> {
    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0
    const sortCol = options?.sortBy === 'title' ? 'title' : options?.sortBy === 'duration' ? 'duration' : 'created_at'
    const sortDir = options?.sortOrder === 'asc' ? 'ASC' : 'DESC'

    // Build WHERE clause from filters (safe — values are always bound via ?)
    const where: string[] = []
    const params: unknown[] = []

    if (options?.filters?.status) {
      where.push('status = ?')
      params.push(options.filters.status)
    }
    if (options?.filters?.language) {
      where.push('language = ?')
      params.push(options.filters.language)
    }
    if (options?.filters?.duration?.min != null) {
      where.push('duration >= ?')
      params.push(options.filters.duration.min)
    }
    if (options?.filters?.duration?.max != null) {
      where.push('duration <= ?')
      params.push(options.filters.duration.max)
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const sql = `SELECT * FROM karaoke_videos ${whereClause} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
    const rows = this.db.prepare(sql).all(...params, limit, offset) as VideoRow[]

    return rows.map(row => this.rowToKaraokeVideo(row))
  }

  async deleteVideo(id: string): Promise<void> {
    const row = this.stmts.getVideo.get(id) as VideoRow | undefined
    if (row?.file_path) {
      try { await fs.unlink(row.file_path) } catch { /* file may already be gone */ }
    }
    this.stmts.deleteVideo.run(id)
  }

  async updateVideoMetadata(id: string, metadata: Partial<KaraokeMetadata>): Promise<void> {
    const existing = this.stmts.getVideo.get(id) as VideoRow | undefined
    if (!existing) throw new Error(`Video not found: ${id}`)

    const merged = {
      ...this.rowToMetadata(existing),
      ...metadata,
    }

    this.stmts.updateMetadata.run(
      merged.title,
      merged.artist,
      merged.duration,
      merged.language,
      merged.genre ?? null,
      merged.quality,
      merged.fileSize,
      new Date().toISOString(),
      id,
    )
  }

  // -----------------------------------------------------------------------
  // StoragePort — File I/O
  // -----------------------------------------------------------------------
  async saveVideoFile(file: Buffer, filePath: string, _mimeType?: string): Promise<string> {
    const abs = path.resolve(filePath)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, file)
    return abs
  }

  async getVideoFile(filePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const buffer = await fs.readFile(filePath)
    // Simple MIME guess from extension
    const ext = path.extname(filePath).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
    }
    return { buffer, mimeType: mimeMap[ext] ?? 'application/octet-stream' }
  }

  async getFileInfo(filePath: string): Promise<{ size: number; created: Date; modified: Date }> {
    const stat = await fs.stat(filePath)
    return { size: stat.size, created: stat.birthtime, modified: stat.mtime }
  }

  // -----------------------------------------------------------------------
  // StoragePort — Cleanup & Stats
  // -----------------------------------------------------------------------
  async cleanupFiles(options?: {
    olderThan?: Date
    unusedFor?: number
    maxTotalSize?: number
  }): Promise<number> {
    const olderThan = options?.olderThan?.toISOString() ?? new Date(0).toISOString()
    const result = this.db.prepare(
      `DELETE FROM karaoke_videos WHERE created_at < ?`
    ).run(olderThan)
    return result.changes
  }

  async getStats(): Promise<{ totalSize: number; fileCount: number; freeSpace: number }> {
    const row = this.db.prepare(
      'SELECT COALESCE(SUM(file_size), 0) as total_size, COUNT(*) as file_count FROM karaoke_videos'
    ).get() as { total_size: number; file_count: number }

    return {
      totalSize: row.total_size,
      fileCount: row.file_count,
      freeSpace: 0, // Not trivially knowable without df; placeholder
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async getPublicUrl(filePath: string, _options?: { expires?: number; contentType?: string }): Promise<string> {
    // For a self-hosted system, just return a relative path.
    // A production deployment would reverse-proxy /storage/* to this path.
    return `/storage/${path.basename(filePath)}`
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------
  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS karaoke_videos (
        id            TEXT PRIMARY KEY,
        file_path     TEXT NOT NULL,
        title         TEXT    DEFAULT '',
        artist        TEXT    DEFAULT '',
        youtube_url   TEXT    DEFAULT '',
        duration      INTEGER DEFAULT 0,
        language      TEXT    DEFAULT 'es',
        genre         TEXT    DEFAULT '',
        quality       TEXT    DEFAULT 'medium',
        file_size     INTEGER DEFAULT 0,
        status        TEXT    DEFAULT 'pending',
        created_at    TEXT    NOT NULL,
        updated_at    TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kv_created_at ON karaoke_videos(created_at);
      CREATE INDEX IF NOT EXISTS idx_kv_status     ON karaoke_videos(status);
    `)
  }

  private prepareStatements(): void {
    this.stmts = {
      insertVideo: this.db.prepare(`
        INSERT INTO karaoke_videos (id, file_path, title, artist, youtube_url, duration, language, genre, quality, file_size, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getVideo: this.db.prepare('SELECT * FROM karaoke_videos WHERE id = ?'),
      listVideos: this.db.prepare('SELECT * FROM karaoke_videos ORDER BY created_at DESC LIMIT ? OFFSET ?'),
      deleteVideo: this.db.prepare('DELETE FROM karaoke_videos WHERE id = ?'),
      updateMetadata: this.db.prepare(`
        UPDATE karaoke_videos
        SET title = ?, artist = ?, duration = ?, language = ?, genre = ?, quality = ?, file_size = ?, updated_at = ?
        WHERE id = ?
      `),
    }
  }

  private rowToMetadata(row: VideoRow): KaraokeMetadata {
    return {
      id: row.id,
      title: row.title ?? '',
      artist: row.artist ?? '',
      youtubeUrl: row.youtube_url ?? '',
      duration: row.duration ?? 0,
      language: row.language ?? 'es',
      genre: row.genre ?? undefined,
      quality: (row.quality as KaraokeMetadata['quality']) ?? 'medium',
      fileSize: row.file_size ?? 0,
      status: (row.status as KaraokeMetadata['status']) ?? 'pending',
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: 'admin' as const,
      playCount: 0,
    }
  }

  private rowToKaraokeVideo(row: VideoRow): KaraokeVideo {
    return {
      id: row.id,
      metadata: this.rowToMetadata(row),
      fileUrl: `/storage/${row.file_path}`,
      streamUrl: `/stream/${row.id}`,
      thumbnailUrl: '',
      downloadUrl: `/download/${row.id}`,
      playable: row.status === 'done',
      streamable: row.status === 'done',
      shareable: true,
      downloadCount: 0,
      streamCount: 0,
      viewCount: 0,
      popularity: 0,
    }
  }
}

// ---------------------------------------------------------------------------
// Internal row type (matches the DB schema)
// ---------------------------------------------------------------------------
interface VideoRow {
  id: string
  file_path: string
  title: string
  artist: string
  youtube_url: string
  duration: number
  language: string
  genre: string
  quality: string
  file_size: number
  status: string
  created_at: string
  updated_at: string
}
