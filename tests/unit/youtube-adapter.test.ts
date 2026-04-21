import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { YouTubeAdapter } from '@/adapters/youtube-adapter.adapter'

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    exec: vi.fn()
  }
})

const { exec } = vi.importActual('child_process')

describe('YouTubeAdapter', () => {
  let youtubeAdapter: YouTubeAdapter

  beforeEach(() => {
    youtubeAdapter = new YouTubeAdapter()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('YouTube URL Validation', () => {
    it('should validate correct YouTube URLs', async () => {
      const validUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/shorts/dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ'
      ]

      for (const url of validUrls) {
        vi.mocked(exec).mockResolvedValueOnce({ stdout: '', stderr: '' })
        
        const isValid = await youtubeAdapter.isValidYouTubeUrl(url)
        expect(isValid).toBe(true)
      }
    })

    it('should reject invalid YouTube URLs', async () => {
      const invalidUrls = [
        'https://vimeo.com/123456',
        'https://www.twitch.tv/channel',
        'https://facebook.com/watch',
        'not-a-url',
        'https://youtube.com/watch'
      ]

      for (const url of invalidUrls) {
        vi.mocked(exec).mockRejectedValueOnce(new Error('Invalid URL'))
        
        const isValid = await youtubeAdapter.isValidYouTubeUrl(url)
        expect(isValid).toBe(false)
      }
    })
  })

  describe('Video Information Retrieval', () => {
    it('should get video information successfully', async () => {
      const mockOutput = `
Rick Astley - Never Gonna Give You Up (Official Music Video)
03:30
video_123456.mp4
137+137
      `.trim()

      vi.mocked(exec).mockResolvedValueOnce({ 
        stdout: mockOutput, 
        stderr: '' 
      })

      const videoInfo = await youtubeAdapter.getVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')

      expect(videoInfo.title).toBe('Rick Astley - Never Gonna Give You Up (Official Music Video)')
      expect(videoInfo.duration).toBe(210) // 3:30 in seconds
      expect(videoInfo.quality).toBe('unknown')
      expect(videoInfo.format).toBe('137+137')
      expect(videoInfo.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })

    it('should handle video info retrieval errors', async () => {
      vi.mocked(exec).mockRejectedValueOnce(new Error('Failed to get video info'))

      await expect(
        youtubeAdapter.getVideoInfo('https://invalid.url/video')
      ).rejects.toThrow('Failed to get video info')
    })

    it('should handle video duration parsing correctly', async () => {
      const testCases = [
        { output: '01:23', expected: 83 }, // 1 minute 23 seconds
        { output: '12:34', expected: 754 }, // 12 minutes 34 seconds
        { output: '01:23:45', expected: 5025 }, // 1 hour 23 minutes 45 seconds
        { output: 'invalid', expected: 0 } // Should handle invalid format
      ]

      for (const testCase of testCases) {
        vi.mocked(exec).mockResolvedValueOnce({ 
          stdout: `Test Title\n${testCase.output}\nvideo.mp4\nformat`,
          stderr: '' 
        })

        const videoInfo = await youtubeAdapter.getVideoInfo('https://youtube.com/watch?v=test')
        expect(videoInfo.duration).toBe(testCase.expected)
      }
    })
  })

  describe('Video Download', () => {
    it('should download video successfully', async () => {
      const mockDownloadOutput = `
[youtube] dQw4w9WgXcQ: Downloading webpage
[download] Destination: ./downloads/video_1234567890.mp4
[download] 100% of ~4.23MiB in 00:00:01
      `.trim()

      const mockFileList = `-rw-r--r-- 1 user user 4234321 Apr 20 00:12 ./downloads/video_1234567890.mp4`

      vi.mocked(exec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ stdout: mockDownloadOutput, stderr: '' }) // yt-dlp
        .mockResolvedValueOnce({ stdout: mockFileList, stderr: '' }) // ls

      const result = await youtubeAdapter.downloadVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')

      expect(result.success).toBe(true)
      expect(result.filePath).toContain('video_1234567890.mp4')
      expect(result.title).toBeDefined()
      expect(result.duration).toBeGreaterThan(0)
      expect(result.fileSize).toBeGreaterThan(0)
      expect(result.format).toBe('mp4')
    })

    it('should handle download errors', async () => {
      vi.mocked(exec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockRejectedValueOnce(new Error('Download failed: Video unavailable'))

      await expect(
        youtubeAdapter.downloadVideo('https://www.youtube.com/watch?v=invalid')
      ).rejects.toThrow('Video download failed')
    })

    it('should handle missing output file', async () => {
      vi.mocked(exec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ stdout: 'Download complete', stderr: '' }) // yt-dlp
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // ls (no files found)

      await expect(
        youtubeAdapter.downloadVideo('https://www.youtube.com/watch?v=invalid')
      ).rejects.toThrow('Video download failed - no output file found')
    })
  })

  describe('Supported Qualities', () => {
    it('should return supported qualities', async () => {
      const qualities = await youtubeAdapter.getSupportedQualities()

      expect(qualities).toContain('highest')
      expect(qualities).toContain('1080p')
      expect(qualities).toContain('720p')
      expect(qualities).toContain('480p')
      expect(qualities).toContain('360p')
      expect(qualities).toEqual(['highest', '1080p', '720p', '480p', '360p'])
    })
  })

  describe('Thumbnail URL Extraction', () => {
    it('should extract thumbnail URL correctly', async () => {
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      
      vi.mocked(exec).mockResolvedValueOnce({ 
        stdout: `Video Title\n03:30\nvideo.mp4\nformat`,
        stderr: '' 
      })

      const videoInfo = await youtubeAdapter.getVideoInfo(testUrl)
      
      expect(videoInfo.thumbnailUrl).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg')
    })

    it('should handle invalid video ID extraction', async () => {
      const invalidUrl = 'https://youtube.com/watch'
      
      vi.mocked(exec).mockResolvedValueOnce({ 
        stdout: `Video Title\n03:30\nvideo.mp4\nformat`,
        stderr: '' 
      })

      const videoInfo = await youtubeAdapter.getVideoInfo(invalidUrl)
      
      expect(videoInfo.thumbnailUrl).toBe('')
    })
  })

  describe('Error Handling', () => {
    it('should handle command execution errors gracefully', async () => {
      vi.mocked(exec).mockRejectedValue(new Error('Command not found'))

      await expect(
        youtubeAdapter.isValidYouTubeUrl('https://www.youtube.com/watch?v=test')
      ).resolves.toBe(false)
    })

    it('should handle partial video info', async () => {
      const partialOutput = `
Partial Title
invalid-duration
video.mp4
format
      `.trim()

      vi.mocked(exec).mockResolvedValueOnce({ 
        stdout: partialOutput, 
        stderr: '' 
      })

      const videoInfo = await youtubeAdapter.getVideoInfo('https://youtube.com/watch?v=test')
      
      expect(videoInfo.title).toBe('Partial Title')
      expect(videoInfo.duration).toBe(0) // Should handle invalid duration
    })
  })

  describe('Video ID Extraction', () => {
    it('should extract video ID from various URL formats', async () => {
      const testCases = [
        {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          expectedId: 'dQw4w9WgXcQ'
        },
        {
          url: 'https://youtu.be/dQw4w9WgXcQ',
          expectedId: 'dQw4w9WgXcQ'
        },
        {
          url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          expectedId: 'dQw4w9WgXcQ'
        },
        {
          url: 'https://youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
          expectedId: 'dQw4w9WgXcQ'
        }
      ]

      for (const testCase of testCases) {
        // Access private method via reflection or create a utility function
        const method = (youtubeAdapter as any).extractVideoId
        const videoId = method(testCase.url)
        expect(videoId).toBe(testCase.expectedId)
      }
    })

    it('should return empty string for invalid URLs', async () => {
      const invalidUrls = [
        'https://vimeo.com/123',
        'not-a-url',
        'https://youtube.com/watch',
        ''
      ]

      for (const url of invalidUrls) {
        const method = (youtubeAdapter as any).extractVideoId
        const videoId = method(url)
        expect(videoId).toBe('')
      }
    })
  })
})