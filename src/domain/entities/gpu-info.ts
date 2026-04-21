export interface GPUInfo {
  id: string
  name: string
  manufacturer: string
  type: 'integrated' | 'dedicated' | 'cloud'
  memory: {
    total: number // bytes
    available: number // bytes
    used: number // bytes
  }
  computeUnits: number
  clockSpeed: number // MHz
  memoryBandwidth: number // GB/s
  temperature?: number // Celsius
  powerUsage?: number // watts
  driverVersion?: string
  api: 'cuda' | 'metal' | 'opencl' | 'directml' | 'webgpu' | 'cloud'
  capabilities: {
    machineLearning: boolean
    videoProcessing: boolean
    audioProcessing: boolean
    realTimeProcessing: boolean
  }
  status: 'available' | 'busy' | 'offline' | 'error'
  supportedModels: string[]
  cloudProvider?: {
    provider: string
    region: string
    instanceType: string
    costPerHour?: number
  }
}

export interface GPUManagerConfig {
  preferredGPU?: string
  forceCPU?: boolean
  maxGPUConcurrency: number
  cloudProviders: Array<{
    provider: string
    enabled: boolean
    apiKey?: string
    region?: string
    costThreshold?: number
  }>
  autoSelect: boolean
  fallbackToCloud: boolean
}

export interface GPUProcessingTask {
  id: string
  type: 'audio_separation' | 'lyrics_recognition' | 'video_generation' | 'model_inference'
  gpuId?: string
  priority: 'low' | 'normal' | 'high'
  estimatedTime?: number
  startedAt?: Date
  completedAt?: Date
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
}

export interface GPUStats {
  totalGPUs: number
  availableGPUs: number
  busyGPUs: number
  totalMemory: number
  usedMemory: number
  averageTemperature: number
  averagePowerUsage: number
  tasksCompleted: number
  tasksFailed: number
  averageTaskTime: number
}

export interface GPUSupportedModel {
  name: string
  type: 'audio' | 'text' | 'video' | 'multimodal'
  requiredGPU: string[]
  memoryRequirement: number // bytes
  recommendedMemory: number // bytes
  cloudSupported: boolean
  localSupported: boolean
  quality: 'low' | 'medium' | 'high'
  processingTime: {
    gpu: number // seconds
    cpu: number // seconds
  }
  cost?: {
    local: number
    cloud: number
  }
}

export function estimateGPUMemoryRequirements(model: string, inputSize: number): number {
  // Basic estimation - should be replaced with model-specific requirements
  const baseModelMemory = {
    'spleeter': 1024 * 1024 * 1024, // 1GB
    'demucs': 2048 * 1024 * 1024, // 2GB
    'whisper-small': 256 * 1024 * 1024, // 256MB
    'whisper-medium': 512 * 1024 * 1024, // 512MB
    'whisper-large': 1024 * 1024 * 1024, // 1GB
    'udio': 4096 * 1024 * 1024 // 4GB
  }
  
  const baseMemory = baseModelMemory[model] || 1024 * 1024 * 1024 // Default 1GB
  const inputMemory = inputSize * 2 // 2x input size
  const overhead = baseMemory * 0.2 // 20% overhead
  
  return baseMemory + inputMemory + overhead
}