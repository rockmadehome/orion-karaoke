import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AudioSeparator, SeparatorType, AudioSeparatorConfig } from '@/adapters/audio-separation.adapter'

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    exec: vi.fn()
  }
})

const { exec } = vi.importActual('child_process')

describe('AudioSeparator', () => {
  let audioSeparator: AudioSeparator

  beforeEach(() => {
    const config: AudioSeparatorConfig = {
      type: SeparatorType.SPLEETER,
      cuda: false,
      outputPath: './test-output'
    }
    
    audioSeparator = new AudioSeparator(config)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with spleeter configuration', () => {
      expect(audioSeparator).toBeDefined()
      expect(audioSeparator['config'].type).toBe(SeparatorType.SPLEETER)
      expect(audioSeparator['config'].cuda).toBe(false)
    })

    it('should initialize with demucs configuration', () => {
      const config: AudioSeparatorConfig = {
        type: SeparatorType.DEMUCS,
        cuda: true,
        outputPath: './test-output'
      }
      
      const separator = new AudioSeparator(config)
      
      expect(separator['config'].type).toBe(SeparatorType.DEMUCS)
      expect(separator['config'].cuda).toBe(true)
    })
  })

  describe('Vocal Separation', () => {
    it('should separate vocals using spleeter', async () => {
      const mockOutput = `
Separating ./test/audio.mp4
Extracting vocals to ./test-output/vocals/test/audio.wav
Extraction complete.
      `.trim()

      const mockFileList = `-rw-r--r-- 1 user user 1234567 Apr 20 00:12 ./test-output/vocals/test/audio.wav
-rw-r--r-- 1 user user 9876543 Apr 20 00:12 ./test-output/vocals/test/other.wav`

      vi.mocked(exec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ stdout: mockOutput, stderr: '' }) // spleeter
        .mockResolvedValueOnce({ stdout: mockFileList, stderr: '' }) // find
        .mockResolvedValueOnce({ stdout: '180.0', stderr: '' }) // duration

      const result = await audioSeparator.separateVocals('./test/audio.mp4')

      expect(result.success).toBe(true)
      expect(result.vocalsPath).toContain('audio.wav')
      expect(result.instrumentalPath).toContain('other.wav')
      expect(result.duration).toBe(180)
      expect(result.sampleRate).toBe(44100)
      expect(result.bitRate).toBe(320)
      expect(result.channels).toBe(2)
      expect(result.separator).toBe(SeparatorType.SPLEETER)
    })

    it('should separate vocals using demucs', async () => {
      const config: AudioSeparatorConfig = {
        type: SeparatorType.DEMUCS,
        cuda: false,
        outputPath: './test-output'
      }
      
      const demucsSeparator = new AudioSeparator(config)
      
      const mockOutput = `
Separating ./test/audio.mp4
Demucs processing complete.
      `.trim()

      const mockFileList = `-rw-r--r-- 1 user user 1234567 Apr 20 00:12 ./test-output/test/audio vocals.wav`

      vi.mocked(exec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ stdout: mockOutput, stderr: '' }) // demucs
        .mockResolvedValueOnce({ stdout: mockFileList, stderr: '' }) // find
        .mockResolvedValueOnce({ stdout: '180.0', stderr: '' }) // duration

      const result = await demucsSeparator.separateVocals('./test/audio.mp4')

      expect(result.success).toBe(true)
      expect(result.vocalsPath).toContain('audio vocals.wav')
    })

    it('should handle separation errors', async () => {
      vi.mocked(exec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockRejectedValueOnce(new Error('Spleeter failed: Invalid audio format'))

      await expect(
        audioSeparator.separateVocals('./test/invalid.mp4')
      ).rejects.toThrow('Vocal separation failed')
    })

    it('should handle missing output files', async () => {
      const mockOutput = `
Separating ./test/audio.mp4
Extraction complete.
      `.trim()

      vi.mocked(exec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ stdout: mockOutput, stderr: '' }) // spleeter
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // find (no files found)
        .mockResolvedValueOnce({ stdout: '180.0', stderr: '' }) // duration

      await expect(
        audioSeparator.separateVocals('./test/audio.mp4')
      ).rejects.toThrow('Vocal separation failed - no output file found')
    })
  })

  describe('Instrumental Separation', () => {
    it('should separate instrumentals', async () => {
      const mockOutput = `
Separating ./test/audio.mp4
Extracting instrumentals to ./test-output/other/test/audio.wav
Extraction complete.
      `.trim()

      const mockFileList = `-rw-r--r-- 1 user user 1234567 Apr 20 00:12 ./test-output/other/test/audio.wav`

      vi.mocked(exec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ stdout: mockOutput, stderr: '' }) // spleeter
        .mockResolvedValueOnce({ stdout: mockFileList, stderr: '' }) // find
        .mockResolvedValueOnce({ stdout: '180.0', stderr: '' }) // duration

      const result = await audioSeparator.separateInstrumentals('./test/audio.mp4')

      expect(result.success).toBe(true)
      expect(result.instrumentalPath).toContain('audio.wav')
      expect(result.duration).toBe(180)
    })
  })

  describe('Dual Separation', () => {
    it('should separate both vocals and instrumentals', async () => {
      const mockVocalOutput = `
Separating ./test/audio.mp4
Extracting vocals to ./test-output/vocals/test/audio.wav
Extraction complete.
      `.trim()

      const mockVocalList = `-rw-r--r-- 1 user user 1234567 Apr 20 00:12 ./test-output/vocals/test/audio.wav
-rw-r--r-- 1 user user 9876543 Apr 20 00:12 ./test-output/vocals/test/other.wav`

      const mockInstrumentalOutput = `
Separating ./test/audio.mp4
Extracting instrumentals to ./test-output/other/test/audio.wav
Extraction complete.
      `.trim()

      const mockInstrumentalList = `-rw-r--r-- 1 user user 1234567 Apr 20 00:12 ./test-output/other/test/audio.wav`

      vi.mocked(exec)
        // First separation (vocals)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ stdout: mockVocalOutput, stderr: '' }) // spleeter
        .mockResolvedValueOnce({ stdout: mockVocalList, stderr: '' }) // find
        .mockResolvedValueOnce({ stdout: '180.0', stderr: '' }) // duration
        // Second separation (instrumentals)
        .mockResolvedValueOnce({ stdout: mockInstrumentalOutput, stderr: '' }) // spleeter
        .mockResolvedValueOnce({ stdout: mockInstrumentalList, stderr: '' }) // find
        .mockResolvedValueOnce({ stdout: '180.0', stderr: '' }) // duration

      const result = await audioSeparator.separateBoth('./test/audio.mp4')

      expect(result.success).toBe(true)
      expect(result.vocalsPath).toContain('audio.wav')
      expect(result.instrumentalPath).toContain('audio.wav')
      expect(result.duration).toBe(180)
    })
  })

  describe('Supported Models', () => {
    it('should return spleeter supported models', async () => {
      const config: AudioSeparatorConfig = {
        type: SeparatorType.SPLEETER,
        cuda: false,
        outputPath: './test-output'
      }
      
      const separator = new AudioSeparator(config)
      const models = await separator.getSupportedModels()

      expect(models).toContain('spleeter:2stems')
      expect(models).toContain('spleeter:4stems')
      expect(models).toContain('spleeter:5stems')
    })

    it('should return demucs supported models', async () => {
      const config: AudioSeparatorConfig = {
        type: SeparatorType.DEMUCS,
        cuda: false,
        outputPath: './test-output'
      }
      
      const separator = new AudioSeparator(config)
      const models = await separator.getSupportedModels()

      expect(models).toContain('demucs')
      expect(models).toContain('demucs-extra')
      expect(models).toContain('demucs-master')
    })

    it('should return cloud models', async () => {
      const config: AudioSeparatorConfig = {
        type: SeparatorType.CLOUD,
        cuda: false,
        outputPath: './test-output'
      }
      
      const separator = new AudioSeparator(config)
      const models = await separator.getSupportedModels()

      expect(models).toContain('replicate/spleeter')
      expect(models).toContain('huggingface/demucs')
    })
  })

  describe('Installation Testing', () => {
    it('should detect spleeter installation', async () => {
      vi.mocked(exec).mockResolvedValueOnce({ 
        stdout: 'spleeter 2.3.1', 
        stderr: '' 
      })

      const result = await audioSeparator.testInstallation()
      expect(result).toBe(true)
    })

    it('should detect demucs installation', async () => {
      const config: AudioSeparatorConfig = {
        type: SeparatorType.DEMUCS,
        cuda: false,
        outputPath: './test-output'
      }
      
      const separator = new AudioSeparator(config)
      
      vi.mocked(exec).mockResolvedValueOnce({ 
        stdout: 'Demucs 1.0.0', 
        stderr: '' 
      })

      const result = await separator.testInstallation()
      expect(result).toBe(true)
    })

    it('should handle missing installations', async () => {
      vi.mocked(exec).mockRejectedValueOnce(new Error('command not found'))

      const result = await audioSeparator.testInstallation()
      expect(result).toBe(false)
    })

    it('should detect cloud installation (always true)', async () => {
      const config: AudioSeparatorConfig = {
        type: SeparatorType.CLOUD,
        cuda: false,
        outputPath: './test-output'
      }
      
      const separator = new AudioSeparator(config)
      const result = await separator.testInstallation()
      expect(result).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle unsupported separator type', async () => {
      const config: AudioSeparatorConfig = {
        type: 'invalid' as any,
        cuda: false,
        outputPath: './test-output'
      }
      
      const separator = new AudioSeparator(config)
      
      await expect(
        separator.separateVocals('./test/audio.mp4')
      ).rejects.toThrow('Unsupported separator type')
    })

    it('should handle cloud separation not implemented', async () => {
      const config: AudioSeparatorConfig = {
        type: SeparatorType.CLOUD,
        cuda: false,
        outputPath: './test-output'
      }
      
      const cloudSeparator = new AudioSeparator(config)
      
      await expect(
        cloudSeparator.separateVocals('./test/audio.mp4')
      ).rejects.toThrow('Cloud separation not implemented yet')
    })
  })
})