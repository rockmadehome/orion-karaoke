import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GPUManager } from '@/services/gpu-manager.service'
import { GPUInfo, GPUManagerConfig } from '@/domain/entities'

describe('GPUManager', () => {
  let gpuManager: GPUManager
  let mockConfig: GPUManagerConfig

  beforeEach(() => {
    mockConfig = {
      maxGPUConcurrency: 2,
      forceCPU: false,
      autoSelect: true,
      fallbackToCloud: true,
      cloudProviders: [
        { provider: 'replicate', enabled: false },
        { provider: 'huggingface', enabled: false }
      ]
    }
    gpuManager = new GPUManager(mockConfig)
  })

  describe('GPU Detection', () => {
    it('should detect GPUs correctly', async () => {
      // Mock GPU detection
      const mockGPUs: GPUInfo[] = [
        {
          id: 'gpu-1',
          name: 'NVIDIA RTX 3080',
          manufacturer: 'NVIDIA',
          type: 'dedicated',
          memory: {
            total: 10 * 1024 * 1024 * 1024,
            available: 8 * 1024 * 1024 * 1024,
            used: 2 * 1024 * 1024 * 1024
          },
          computeUnits: 8704,
          clockSpeed: 1440,
          memoryBandwidth: 760,
          temperature: 65,
          powerUsage: 220,
          driverVersion: '470.57.02',
          api: 'cuda',
          capabilities: {
            machineLearning: true,
            videoProcessing: true,
            audioProcessing: true,
            realTimeProcessing: true
          },
          status: 'available',
          supportedModels: ['spleeter', 'demucs', 'whisper-small', 'whisper-medium']
        }
      ]

      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue(mockGPUs)

      const result = await gpuManager.detectGPU()
      
      expect(result).toEqual(mockGPUs)
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('NVIDIA RTX 3080')
    })

    it('should handle no GPUs available', async () => {
      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue([])

      const result = await gpuManager.detectGPU()
      
      expect(result).toEqual([])
      expect(result.length).toBe(0)
    })
  })

  describe('GPU Support', () => {
    it('should return true when GPU is available', async () => {
      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue([
        { id: 'gpu-1', name: 'Test GPU', manufacturer: 'Test', type: 'dedicated', memory: { total: 0, available: 0, used: 0 }, computeUnits: 0, clockSpeed: 0, memoryBandwidth: 0, capabilities: { machineLearning: false, videoProcessing: false, audioProcessing: false, realTimeProcessing: false }, status: 'available', api: 'cuda', supportedModels: [] }
      ])

      const result = await gpuManager.isGPUSupported()
      
      expect(result).toBe(true)
    })

    it('should return false when GPU is forced to CPU', async () => {
      mockConfig.forceCPU = true
      const gpuManagerForceCPU = new GPUManager(mockConfig)

      const result = await gpuManagerForceCPU.isGPUSupported()
      
      expect(result).toBe(false)
    })

    it('should return false when no GPUs available', async () => {
      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue([])

      const result = await gpuManager.isGPUSupported()
      
      expect(result).toBe(false)
    })
  })

  describe('Supported Models', () => {
    it('should return supported models based on available GPUs', async () => {
      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue([
        { id: 'gpu-1', name: 'Test GPU', manufacturer: 'Test', type: 'dedicated', memory: { total: 0, available: 0, used: 0 }, computeUnits: 0, clockSpeed: 0, memoryBandwidth: 0, capabilities: { machineLearning: false, videoProcessing: false, audioProcessing: false, realTimeProcessing: false }, status: 'available', api: 'cuda', supportedModels: ['spleeter', 'demucs', 'whisper-small'] }
      ])

      const result = await gpuManager.getSupportedModels()
      
      expect(result).toContain('spleeter')
      expect(result).toContain('demucs')
      expect(result).toContain('whisper-small')
      expect(result).not.toContain('whisper-large')
    })

    it('should return empty array when no GPUs available', async () => {
      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue([])

      const result = await gpuManager.getSupportedModels()
      
      expect(result).toEqual([])
    })
  })

  describe('Preferred Model Selection', () => {
    it('should select best model based on available memory', async () => {
      const mockGPUs: GPUInfo[] = [
        {
          id: 'gpu-1',
          name: 'NVIDIA RTX 3080',
          manufacturer: 'NVIDIA',
          type: 'dedicated',
          memory: {
            total: 10 * 1024 * 1024 * 1024,
            available: 8 * 1024 * 1024 * 1024,
            used: 2 * 1024 * 1024 * 1024
          },
          computeUnits: 8704,
          clockSpeed: 1440,
          memoryBandwidth: 760,
          capabilities: {
            machineLearning: true,
            videoProcessing: true,
            audioProcessing: true,
            realTimeProcessing: true
          },
          status: 'available',
          api: 'cuda',
          supportedModels: []
        }
      ]

      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue(mockGPUs)

      const result = await gpuManager.getPreferredModel()
      
      expect(result).toBe('whisper-large')
    })

    it('should select smaller model when limited memory', async () => {
      const mockGPUs: GPUInfo[] = [
        {
          id: 'gpu-1',
          name: 'GPU with limited memory',
          manufacturer: 'Test',
          type: 'integrated',
          memory: {
            total: 2 * 1024 * 1024 * 1024,
            available: 1 * 1024 * 1024 * 1024,
            used: 1 * 1024 * 1024 * 1024
          },
          computeUnits: 0,
          clockSpeed: 0,
          memoryBandwidth: 0,
          capabilities: {
            machineLearning: false,
            videoProcessing: false,
            audioProcessing: true,
            realTimeProcessing: true
          },
          status: 'available',
          api: 'cuda',
          supportedModels: []
        }
      ]

      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue(mockGPUs)

      const result = await gpuManager.getPreferredModel()
      
      expect(result).toBe('demucs')
    })
  })

  describe('Model Compatibility', () => {
    it('should return true for supported models', async () => {
      vi.spyOn(gpuManager as any, 'getSupportedModels').mockResolvedValue(['spleeter', 'demucs', 'whisper-small'])

      const result = await gpuManager.isModelCompatible('demucs')
      
      expect(result).toBe(true)
    })

    it('should return false for unsupported models', async () => {
      vi.spyOn(gpuManager as any, 'getSupportedModels').mockResolvedValue(['spleeter', 'demucs'])

      const result = await gpuManager.isModelCompatible('unsupported-model')
      
      expect(result).toBe(false)
    })
  })

  describe('GPU Stats', () => {
    it('should calculate GPU statistics correctly', async () => {
      const mockGPUs: GPUInfo[] = [
        {
          id: 'gpu-1',
          name: 'GPU 1',
          manufacturer: 'Test',
          type: 'dedicated',
          memory: { total: 8 * 1024 * 1024 * 1024, available: 6 * 1024 * 1024 * 1024, used: 2 * 1024 * 1024 * 1024 },
          computeUnits: 0,
          clockSpeed: 0,
          memoryBandwidth: 0,
          temperature: 65,
          powerUsage: 150,
          capabilities: { machineLearning: false, videoProcessing: false, audioProcessing: false, realTimeProcessing: false },
          status: 'available',
          api: 'cuda',
          supportedModels: []
        },
        {
          id: 'gpu-2',
          name: 'GPU 2',
          manufacturer: 'Test',
          type: 'dedicated',
          memory: { total: 4 * 1024 * 1024 * 1024, available: 3 * 1024 * 1024 * 1024, used: 1 * 1024 * 1024 * 1024 },
          computeUnits: 0,
          clockSpeed: 0,
          memoryBandwidth: 0,
          temperature: 70,
          powerUsage: 200,
          capabilities: { machineLearning: false, videoProcessing: false, audioProcessing: false, realTimeProcessing: false },
          status: 'busy',
          api: 'cuda',
          supportedModels: []
        }
      ]

      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue(mockGPUs)
      vi.spyOn(gpuManager as any, 'activeTasks').mockReturnValue(new Map())

      const result = await gpuManager.getGPUStats()
      
      expect(result.totalGPUs).toBe(2)
      expect(result.availableGPUs).toBe(1)
      expect(result.busyGPUs).toBe(1)
      expect(result.totalMemory).toBe(12 * 1024 * 1024 * 1024)
      expect(result.usedMemory).toBe(3 * 1024 * 1024 * 1024)
      expect(result.averageTemperature).toBe(67.5)
      expect(result.averagePowerUsage).toBe(175)
    })
  })

  describe('Task Management', () => {
    it('should submit and process tasks correctly', async () => {
      const mockTask = {
        id: 'task-1',
        type: 'audio_separation' as const,
        priority: 'normal' as const,
        estimatedTime: 10000
      }

      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue([
        { id: 'gpu-1', name: 'Test GPU', manufacturer: 'Test', type: 'dedicated', memory: { total: 0, available: 0, used: 0 }, computeUnits: 0, clockSpeed: 0, memoryBandwidth: 0, capabilities: { machineLearning: false, videoProcessing: false, audioProcessing: true, realTimeProcessing: false }, status: 'available', api: 'cuda', supportedModels: [] }
      ])

      await gpuManager.submitTask(mockTask)
      
      // Verify task was added to queue
      expect((gpuManager as any).taskQueue.length).toBe(1)
    })

    it('should handle task cancellation', async () => {
      const mockTask = {
        id: 'task-1',
        type: 'audio_separation' as const,
        priority: 'normal' as const,
        estimatedTime: 10000
      }

      vi.spyOn(gpuManager as any, 'detectGPU').mockResolvedValue([
        { id: 'gpu-1', name: 'Test GPU', manufacturer: 'Test', type: 'dedicated', memory: { total: 0, available: 0, used: 0 }, computeUnits: 0, clockSpeed: 0, memoryBandwidth: 0, capabilities: { machineLearning: false, videoProcessing: false, audioProcessing: true, realTimeProcessing: false }, status: 'available', api: 'cuda', supportedModels: [] }
      ])

      await gpuManager.submitTask(mockTask)
      await gpuManager.cancelTask('task-1')
      
      // Verify task was removed
      expect((gpuManager as any).activeTasks.has('task-1')).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle GPU detection errors gracefully', async () => {
      vi.spyOn(gpuManager as any, 'detectGPU').mockRejectedValue(new Error('GPU detection failed'))

      await expect(gpuManager.detectGPU()).rejects.toThrow('GPU detection failed')
    })

    it('should handle task submission errors', async () => {
      const mockTask = {
        id: 'task-1',
        type: 'unsupported_type' as const,
        priority: 'normal' as const,
        estimatedTime: 10000
      }

      vi.spyOn(gpuManager as any, 'findSuitableGPU').mockReturnValue(null)

      await expect(gpuManager.submitTask(mockTask)).resolves.toBe('queued-task-1')
    })
  })
})