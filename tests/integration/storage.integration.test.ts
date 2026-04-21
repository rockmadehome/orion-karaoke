/**
 * Integration tests for SQLiteStorageAdapter
 *
 * Uses a real in-memory SQLite database — no mocks.
 * These tests verify actual DB reads/writes + file I/O.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SQLiteStorageAdapter } from '@/adapters/storage.adapter'
import type { KaraokeMetadata } from '@/domain/entities'
import { ProcessingStatus } from '@/domain/entities'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('SQLiteStorageAdapter', () => {
  let adapter: SQLiteStorageAdapter
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orion-test-'))
    const dbPath = path.join(tmpDir, 'test.db')
    adapter = new SQLiteStorageAdapter({ dbPath })
    adapter.init()
  })

  afterEach(() => {
    adapter.close()
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function sampleMetadata(overrides: Partial<KaraokeMetadata> = {}): KaraokeMetadata {
    return {
      id: 'vid_001',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      youtubeUrl: 'https://youtube.com/watch?v=fJ9rUzIMcZQ',
      duration: 354,
      language: 'en',
      genre: 'Rock',
      quality: 'high',
      fileSize: 12_000_000,
      status: ProcessingStatus.DONE,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'admin',
      playCount: 0,
      ...overrides,
    }
  }

  // -------------------------------------------------------------------
  // Video CRUD
  // -------------------------------------------------------------------
  describe('saveKaraokeVideo / getKaraokeVideo', () => {
    it('should save and retrieve a video by id', async () => {
      const meta = sampleMetadata()
      const id = await adapter.saveKaraokeVideo('/videos/bohemian.mp4', meta)

      expect(id).toBeTruthy()

      const result = await adapter.getKaraokeVideo(id)
      expect(result.path).toBe('/videos/bohemian.mp4')
      expect(result.metadata.title).toBe('Bohemian Rhapsody')
      expect(result.metadata.artist).toBe('Queen')
      expect(result.metadata.duration).toBe(354)
    })

    it('should throw when video not found', async () => {
      await expect(adapter.getKaraokeVideo('nonexistent')).rejects.toThrow('Video not found')
    })
  })

  describe('listKaraokeVideos', () => {
    it('should list saved videos ordered by creation date', async () => {
      await adapter.saveKaraokeVideo('/v/a.mp4', sampleMetadata({ id: 'a', title: 'A' }))
      await adapter.saveKaraokeVideo('/v/b.mp4', sampleMetadata({ id: 'b', title: 'B' }))

      const list = await adapter.listKaraokeVideos()
      expect(list).toHaveLength(2)
      // Default order: DESC by created_at — most recent first
      expect(list[0]!.metadata.title).toBe('B')
    })

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await adapter.saveKaraokeVideo(`/v/${i}.mp4`, sampleMetadata({ id: `v${i}`, title: `Song ${i}` }))
      }

      const page1 = await adapter.listKaraokeVideos({ limit: 2, offset: 0 })
      const page2 = await adapter.listKaraokeVideos({ limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
    })

    it('should filter by language', async () => {
      await adapter.saveKaraokeVideo('/v/es.mp4', sampleMetadata({ id: 'es1', language: 'es' }))
      await adapter.saveKaraokeVideo('/v/en.mp4', sampleMetadata({ id: 'en1', language: 'en' }))

      const results = await adapter.listKaraokeVideos({ filters: { language: 'es' } })
      expect(results).toHaveLength(1)
      expect(results[0]!.metadata.language).toBe('es')
    })
  })

  describe('updateVideoMetadata', () => {
    it('should update only the provided fields', async () => {
      const id = await adapter.saveKaraokeVideo('/v/test.mp4', sampleMetadata())

      await adapter.updateVideoMetadata(id, { title: 'Updated Title', artist: 'New Artist' })

      const result = await adapter.getKaraokeVideo(id)
      expect(result.metadata.title).toBe('Updated Title')
      expect(result.metadata.artist).toBe('New Artist')
      // Unchanged fields remain
      expect(result.metadata.duration).toBe(354)
    })

    it('should throw when updating nonexistent video', async () => {
      await expect(
        adapter.updateVideoMetadata('ghost', { title: 'Nope' }),
      ).rejects.toThrow('Video not found')
    })
  })

  describe('deleteVideo', () => {
    it('should delete a video from the database', async () => {
      const id = await adapter.saveKaraokeVideo('/v/del.mp4', sampleMetadata())
      await adapter.deleteVideo(id)
      await expect(adapter.getKaraokeVideo(id)).rejects.toThrow('Video not found')
    })

    it('should also delete the physical file if it exists', async () => {
      const filePath = path.join(tmpDir, 'physical.mp4')
      fs.writeFileSync(filePath, Buffer.from('fake video content'))

      const id = await adapter.saveKaraokeVideo(filePath, sampleMetadata())
      await adapter.deleteVideo(id)

      expect(fs.existsSync(filePath)).toBe(false)
    })
  })

  // -------------------------------------------------------------------
  // File I/O
  // -------------------------------------------------------------------
  describe('saveVideoFile / getVideoFile', () => {
    it('should write and read a buffer to disk', async () => {
      const content = Buffer.from('hello karaoke world')
      const filePath = path.join(tmpDir, 'output', 'test.mp4')

      const savedPath = await adapter.saveVideoFile(content, filePath)
      expect(savedPath).toBe(path.resolve(filePath))

      const result = await adapter.getVideoFile(savedPath)
      expect(result.buffer).toEqual(content)
      expect(result.mimeType).toBe('video/mp4')
    })
  })

  describe('getFileInfo', () => {
    it('should return file stats', async () => {
      const filePath = path.join(tmpDir, 'stats.txt')
      fs.writeFileSync(filePath, Buffer.from('x'.repeat(42)))

      const info = await adapter.getFileInfo(filePath)
      expect(info.size).toBe(42)
      expect(info.modified).toBeInstanceOf(Date)
    })
  })

  describe('fileExists', () => {
    it('returns true for existing files', async () => {
      const filePath = path.join(tmpDir, 'exists.txt')
      fs.writeFileSync(filePath, 'yes')
      expect(await adapter.fileExists(filePath)).toBe(true)
    })

    it('returns false for missing files', async () => {
      expect(await adapter.fileExists('/no/such/file')).toBe(false)
    })
  })

  // -------------------------------------------------------------------
  // Stats & cleanup
  // -------------------------------------------------------------------
  describe('getStats', () => {
    it('should return total size and file count', async () => {
      await adapter.saveKaraokeVideo('/v/1.mp4', sampleMetadata({ id: 's1', fileSize: 100 }))
      await adapter.saveKaraokeVideo('/v/2.mp4', sampleMetadata({ id: 's2', fileSize: 200 }))

      const stats = await adapter.getStats()
      expect(stats.fileCount).toBe(2)
      expect(stats.totalSize).toBe(300)
    })
  })

  describe('cleanupFiles', () => {
    it('should remove videos older than the given date', async () => {
      await adapter.saveKaraokeVideo('/v/old.mp4', sampleMetadata({ id: 'old1' }))

      // Everything is "just now" so cleaning up with a date in the future removes nothing
      const none = await adapter.cleanupFiles({ olderThan: new Date(Date.now() + 100_000) })
      expect(none).toBe(1) // they were just created, so a future cutoff catches them

      // Cleaning up with a date in the past removes nothing
      const count = await adapter.cleanupFiles({ olderThan: new Date(0) })
      expect(count).toBe(0)
    })
  })

  describe('getPublicUrl', () => {
    it('should return a relative URL with the filename', async () => {
      const url = await adapter.getPublicUrl('/storage/videos/test.mp4')
      expect(url).toBe('/storage/test.mp4')
    })
  })
})
