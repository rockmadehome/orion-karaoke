import { GPUInfo, GPUManagerConfig, GPUStats, GPUProcessingTask } from '@/domain/entities'
import { GPUManagerPort } from '@/ports'

export interface GPUManagerPort {
  detectGPU(): Promise<GPUInfo[]>
  isGPUSupported(): Promise<boolean>
  getSupportedModels(): Promise<string[]>
  getPreferredModel(): Promise<string>
  isModelCompatible(model: string): Promise<boolean>
}

export class GPUManager implements GPUManagerPort {
  private config: GPUManagerConfig
  private detectedGPUs: GPUInfo[] = []
  private activeTasks: Map<string, GPUProcessingTask> = new Map()
  private taskQueue: GPUProcessingTask[] = []

  constructor(config: GPUManagerConfig) {
    this.config = config
  }

  async detectGPU(): Promise<GPUInfo[]> {
    // Placeholder implementation
    // In a real implementation, this would detect local GPUs
    return this.detectedGPUs
  }

  async isGPUSupported(): Promise<boolean> {
    const gpus = await this.detectGPU()
    return gpus.length > 0 && !this.config.forceCPU
  }

  async getSupportedModels(): Promise<string[]> {
    // Return models that are supported by available GPUs
    const gpus = await this.detectGPU()
    if (gpus.length === 0) return []
    
    return [
      'spleeter',
      'demucs',
      'whisper-small',
      'whisper-medium',
      'whisper-large'
    ]
  }

  async getPreferredModel(): Promise<string> {
    // Select the best model based on available GPU memory
    const gpus = await this.detectGPU()
    if (gpus.length === 0) return 'cpu-based' // fallback
    
    const availableMemory = Math.max(...gpus.map(gpu => gpu.memory.available))
    
    if (availableMemory >= 4 * 1024 * 1024 * 1024) { // 4GB+
      return 'whisper-large'
    } else if (availableMemory >= 2 * 1024 * 1024 * 1024) { // 2GB+
      return 'whisper-medium'
    } else if (availableMemory >= 1 * 1024 * 1024 * 1024) { // 1GB+
      return 'whisper-small'
    } else {
      return 'demucs'
    }
  }

  async isModelCompatible(model: string): Promise<boolean> {
    const supportedModels = await this.getSupportedModels()
    return supportedModels.includes(model)
  }

  async getGPUStats(): Promise<GPUStats> {
    const gpus = await this.detectGPU()
    const activeTasks = Array.from(this.activeTasks.values())
    
    return {
      totalGPUs: gpus.length,
      availableGPUs: gpus.filter(gpu => gpu.status === 'available').length,
      busyGPUs: gpus.filter(gpu => gpu.status === 'busy').length,
      totalMemory: gpus.reduce((sum, gpu) => sum + gpu.memory.total, 0),
      usedMemory: gpus.reduce((sum, gpu) => sum + gpu.memory.used, 0),
      averageTemperature: gpus.length > 0 ? gpus.reduce((sum, gpu) => sum + (gpu.temperature || 0), 0) / gpus.length : 0,
      averagePowerUsage: gpus.length > 0 ? gpus.reduce((sum, gpu) => sum + (gpu.powerUsage || 0), 0) / gpus.length : 0,
      tasksCompleted: activeTasks.filter(task => task.status === 'completed').length,
      tasksFailed: activeTasks.filter(task => task.status === 'failed').length,
      averageTaskTime: this.calculateAverageTaskTime(activeTasks)
    }
  }

  async submitTask(task: GPUProcessingTask): Promise<void> {
    this.taskQueue.push(task)
    await this.processQueue()
  }

  private async processQueue(): Promise<void> {
    // Process tasks in priority order
    this.taskQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === 'high' ? -1 : 1
      }
      return a.id.localeCompare(b.id)
    })

    const availableGPUs = this.detectedGPUs.filter(gpu => gpu.status === 'available')
    
    for (const task of this.taskQueue) {
      if (this.activeTasks.size >= this.config.maxGPUConcurrency) {
        break
      }

      const suitableGPU = this.findSuitableGPU(task)
      if (suitableGPU) {
        this.taskQueue = this.taskQueue.filter(t => t.id !== task.id)
        this.activeTasks.set(task.id, { ...task, status: 'running', startedAt: new Date() })
        suitableGPU.status = 'busy'
        
        // Start task processing (placeholder)
        this.executeTask(task, suitableGPU)
      }
    }
  }

  private findSuitableGPU(task: GPUProcessingTask): GPUInfo | null {
    // Find a GPU that can handle the task
    const availableGPUs = this.detectedGPUs.filter(gpu => gpu.status === 'available')
    
    if (task.type === 'audio_separation') {
      return availableGPUs.find(gpu => gpu.capabilities.audioProcessing) || availableGPUs[0] || null
    }
    
    if (task.type === 'lyrics_recognition') {
      return availableGPUs.find(gpu => gpu.capabilities.machineLearning) || availableGPUs[0] || null
    }
    
    return availableGPUs[0] || null
  }

  private async executeTask(task: GPUProcessingTask, gpu: GPUInfo): Promise<void> {
    // Placeholder for actual task execution
    setTimeout(async () => {
      this.activeTasks.delete(task.id)
      gpu.status = 'available'
      await this.processQueue()
    }, 5000) // Simulate 5-second processing time
  }

  private calculateAverageTaskTime(tasks: GPUProcessingTask[]): number {
    const completedTasks = tasks.filter(task => 
      task.status === 'completed' && task.startedAt && task.completedAt
    )
    
    if (completedTasks.length === 0) return 0
    
    const totalTime = completedTasks.reduce((sum, task) => {
      const duration = task.completedAt!.getTime() - task.startedAt!.getTime()
      return sum + duration
    }, 0)
    
    return totalTime / completedTasks.length / 1000 // Convert to seconds
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = this.activeTasks.get(taskId)
    if (task) {
      task.status = 'cancelled'
      this.activeTasks.delete(taskId)
      
      // Release GPU
      const gpu = this.detectedGPUs.find(gpu => gpu.memory.used > 0)
      if (gpu) {
        gpu.status = 'available'
      }
      
      await this.processQueue()
    }
  }

  async getTaskStatus(taskId: string): Promise<GPUProcessingTask | undefined> {
    return this.activeTasks.get(taskId)
  }
}