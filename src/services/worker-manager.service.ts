import { WorkerStatus, WorkerType } from '@/domain/entities'

export interface WorkerManagerPort {
  createWorker(type: WorkerType): Promise<Worker>
  terminateWorker(workerId: string): Promise<void>
  setWorkerCount(count: number): Promise<void>
  getWorkerCount(): Promise<number>
  getWorkerStatus(workerId: string): Promise<WorkerStatus>
}

export interface Worker {
  id: string
  type: WorkerType
  status: 'idle' | 'busy' | 'offline'
  capabilities: string[]
  currentTask?: string
  taskQueue: string[]
  stats: {
    tasksCompleted: number
    tasksFailed: number
    averageTaskTime: number
    lastActivity: Date
  }
}

export interface WorkerConfig {
  type: WorkerType
  maxWorkers: number
  maxTaskRetries: number
  timeout: number
  autoRestart: boolean
  healthCheckInterval: number
}

export interface WorkerTask {
  id: string
  type: WorkerType
  payload: any
  priority: 'low' | 'normal' | 'high'
  retries: number
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  timeout?: number
}

export interface WorkerHealthStatus {
  isHealthy: boolean
  lastCheck: Date
  uptime: number
  memoryUsage: number
  cpuUsage: number
  errorCount: number
  lastError?: string
}

export class WorkerManager implements WorkerManagerPort {
  private workers: Map<string, Worker> = new Map()
  private workerConfigs: Map<WorkerType, WorkerConfig> = new Map()
  private taskQueues: Map<WorkerType, WorkerTask[]> = new Map()
  private healthCheckInterval?: NodeJS.Timeout
  private stats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageTaskTime: 0
  }

  constructor() {
    this.initializeDefaultConfigs()
    this.startHealthChecks()
  }

  private initializeDefaultConfigs(): void {
    this.workerConfigs.set('audio_separation', {
      type: 'audio_separation',
      maxWorkers: 4,
      maxTaskRetries: 3,
      timeout: 300000, // 5 minutes
      autoRestart: true,
      healthCheckInterval: 30000 // 30 seconds
    })

    this.workerConfigs.set('lyrics_recognition', {
      type: 'lyrics_recognition',
      maxWorkers: 2,
      maxTaskRetries: 3,
      timeout: 600000, // 10 minutes
      autoRestart: true,
      healthCheckInterval: 30000
    })

    this.workerConfigs.set('karaoke_generation', {
      type: 'karaoke_generation',
      maxWorkers: 2,
      maxTaskRetries: 2,
      timeout: 900000, // 15 minutes
      autoRestart: true,
      healthCheckInterval: 30000
    })

    this.workerConfigs.set('downloader', {
      type: 'downloader',
      maxWorkers: 3,
      maxTaskRetries: 3,
      timeout: 180000, // 3 minutes
      autoRestart: true,
      healthCheckInterval: 30000
    })
  }

  async createWorker(type: WorkerType): Promise<Worker> {
    const config = this.workerConfigs.get(type)
    if (!config) {
      throw new Error(`Unsupported worker type: ${type}`)
    }

    const existingWorkers = Array.from(this.workers.values()).filter(w => w.type === type)
    if (existingWorkers.length >= config.maxWorkers) {
      throw new Error(`Maximum number of workers (${config.maxWorkers}) reached for type: ${type}`)
    }

    const workerId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const worker: Worker = {
      id: workerId,
      type,
      status: 'idle',
      capabilities: this.getWorkerCapabilities(type),
      currentTask: undefined,
      taskQueue: [],
      stats: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageTaskTime: 0,
        lastActivity: new Date()
      }
    }

    this.workers.set(workerId, worker)
    this.startWorkerHealthChecks(workerId)
    
    return worker
  }

  async terminateWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId)
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`)
    }

    // Cancel any running task
    if (worker.currentTask) {
      // Cancel logic here
    }

    // Clear pending tasks
    worker.taskQueue = []

    // Stop health checks
    this.stopWorkerHealthChecks(workerId)

    // Remove worker
    this.workers.delete(workerId)
  }

  async setWorkerCount(count: number): Promise<void> {
    const workerTypes = Array.from(this.workerConfigs.keys())
    
    for (const type of workerTypes) {
      const config = this.workerConfigs.get(type)!
      const currentWorkers = Array.from(this.workers.values()).filter(w => w.type === type)
      
      // Terminate excess workers
      while (currentWorkers.length > count) {
        const worker = currentWorkers.pop()
        if (worker) {
          await this.terminateWorker(worker.id)
        }
      }
      
      // Create new workers if needed
      while (currentWorkers.length < count) {
        await this.createWorker(type)
      }
    }
  }

  async getWorkerCount(): Promise<number> {
    return this.workers.size
  }

  async getWorkerStatus(workerId: string): Promise<WorkerStatus> {
    const worker = this.workers.get(workerId)
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`)
    }

    return {
      workerId: worker.id,
      type: worker.type,
      status: worker.status,
      currentTask: worker.currentTask,
      queueLength: worker.taskQueue.length,
      stats: worker.stats,
      capabilities: worker.capabilities,
      health: await this.getWorkerHealth(workerId)
    }
  }

  private getWorkerCapabilities(type: WorkerType): string[] {
    const capabilities: Record<WorkerType, string[]> = {
      audio_separation: ['audio_processing', 'gpu_acceleration', 'format_conversion'],
      lyrics_recognition: ['speech_recognition', 'language_detection', 'timestamp_generation'],
      karaoke_generation: ['video_processing', 'subtitle_overlay', 'format_conversion'],
      downloader: ['video_download', 'audio_extraction', 'metadata_extraction']
    }

    return capabilities[type] || []
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllWorkers()
    }, 10000) // Check every 10 seconds
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
  }

  private startWorkerHealthChecks(workerId: string): void {
    // Start individual worker health checks
  }

  private stopWorkerHealthChecks(workerId: string): void {
    // Stop individual worker health checks
  }

  private async checkAllWorkers(): Promise<void> {
    for (const workerId of this.workers.keys()) {
      await this.checkWorkerHealth(workerId)
    }
  }

  private async checkWorkerHealth(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId)
    if (!worker) return

    // Simulate health check - in real implementation, this would check process health
    const isHealthy = Math.random() > 0.1 // 90% chance of being healthy

    if (!isHealthy) {
      worker.status = 'offline'
      // Auto-restart logic would go here
    }
  }

  private async getWorkerHealth(workerId: string): Promise<WorkerHealthStatus> {
    const worker = this.workers.get(workerId)
    if (!worker) {
      return {
        isHealthy: false,
        lastCheck: new Date(),
        uptime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        errorCount: 0
      }
    }

    // Simulate health data - in real implementation, this would get actual metrics
    return {
      isHealthy: worker.status !== 'offline',
      lastCheck: new Date(),
      uptime: Date.now() - worker.stats.lastActivity.getTime(),
      memoryUsage: Math.random() * 100,
      cpuUsage: Math.random() * 100,
      errorCount: worker.stats.tasksFailed,
      lastError: worker.stats.tasksFailed > 0 ? 'Simulated error' : undefined
    }
  }

  async submitTask(task: WorkerTask): Promise<string> {
    const workerType = task.type as WorkerType
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => w.type === workerType && w.status === 'idle')

    if (availableWorkers.length === 0) {
      // Add to queue
      if (!this.taskQueues.has(workerType)) {
        this.taskQueues.set(workerType, [])
      }
      this.taskQueues.get(workerType)!.push(task)
      
      // Try to process queue
      await this.processWorkerQueue(workerType)
      
      return `queued-${task.id}`
    }

    // Assign to available worker
    const worker = availableWorkers[0]
    worker.currentTask = task.id
    worker.status = 'busy'
    worker.taskQueue.push(task.id)
    
    // Execute task (placeholder)
    this.executeTask(worker, task)
    
    return `assigned-${task.id}`
  }

  private async executeTask(worker: Worker, task: WorkerTask): Promise<void> {
    worker.stats.lastActivity = new Date()
    task.startedAt = new Date()
    
    // Simulate task execution
    const processingTime = 1000 + Math.random() * 4000 // 1-5 seconds
    await new Promise(resolve => setTimeout(resolve, processingTime))
    
    task.completedAt = new Date()
    const duration = task.completedAt.getTime() - task.startedAt.getTime()
    
    // Update worker stats
    worker.stats.averageTaskTime = (worker.stats.averageTaskTime + duration) / 2
    worker.stats.tasksCompleted++
    worker.currentTask = undefined
    worker.taskQueue = worker.taskQueue.filter(id => id !== task.id)
    worker.status = 'idle'
    
    this.stats.completedTasks++
    this.stats.totalTasks++
    
    // Process next task in queue
    await this.processWorkerQueue(worker.type)
  }

  private async processWorkerQueue(workerType: WorkerType): Promise<void> {
    const queue = this.taskQueues.get(workerType)
    if (!queue || queue.length === 0) return

    const availableWorkers = Array.from(this.workers.values())
      .filter(w => w.type === workerType && w.status === 'idle')

    while (queue.length > 0 && availableWorkers.length > 0) {
      const task = queue.shift()!
      const worker = availableWorkers.shift()!
      
      await this.executeTask(worker, task)
    }
  }

  async getWorkerStats(): Promise<any> {
    const workers = Array.from(this.workers.values())
    
    return {
      totalWorkers: workers.length,
      workersByType: workers.reduce((acc, worker) => {
        if (!acc[worker.type]) {
          acc[worker.type] = { count: 0, busy: 0, idle: 0 }
        }
        acc[worker.type].count++
        acc[worker.type][worker.status]++
        return acc
      }, {} as any),
      totalTasks: this.stats.totalTasks,
      completedTasks: this.stats.completedTasks,
      failedTasks: this.stats.failedTasks,
      averageTaskTime: this.stats.averageTaskTime
    }
  }
}