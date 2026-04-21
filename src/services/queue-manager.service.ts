import { ProcessingJob, JobStatus, JobType, QueueStats } from '@/domain/entities'

export interface QueueManagerPort {
  enqueueJob(job: ProcessingJob): Promise<void>
  dequeueJob(): Promise<ProcessingJob | null>
  getQueue(): Promise<ProcessingJob[]>
  updateJobProgress(jobId: string, progress: number, step: string): Promise<void>
  updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void>
  retryJob(jobId: string): Promise<void>
  cancelJob(jobId: string): Promise<void>
}

export interface QueueConfig {
  maxConcurrency: number
  retryDelay: number
  maxRetries: number
  jobTimeout: number
  autoRetry: boolean
  prioritization: 'fifo' | 'priority' | 'shortest_first' | 'longest_first'
  deadLetterQueue: boolean
}

export interface QueueMetrics {
  totalJobs: number
  processedJobs: number
  failedJobs: number
  averageProcessingTime: number
  jobsByType: Array<{
    type: JobType
    count: number
    averageTime: number
  }>
  jobsByStatus: Array<{
    status: JobStatus
    count: number
  }>
}

export class QueueManager implements QueueManagerPort {
  private queue: ProcessingJob[] = []
  private processing: Map<string, ProcessingJob> = new Map()
  private completed: Map<string, ProcessingJob> = new Map()
  private failed: Map<string, ProcessingJob> = new Map()
  private config: QueueConfig
  private workers: Set<string> = new Set()
  private metrics: QueueMetrics = {
    totalJobs: 0,
    processedJobs: 0,
    failedJobs: 0,
    averageProcessingTime: 0,
    jobsByType: [],
    jobsByStatus: []
  }

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      maxConcurrency: 5,
      retryDelay: 5000,
      maxRetries: 3,
      jobTimeout: 300000, // 5 minutes
      autoRetry: true,
      prioritization: 'priority',
      deadLetterQueue: true,
      ...config
    }
  }

  async enqueueJob(job: ProcessingJob): Promise<void> {
    // Validate job
    if (!job.id || !job.type || !job.status) {
      throw new Error('Invalid job: missing required fields')
    }

    // Set default values
    if (!job.currentStep) {
      job.currentStep = this.getInitialStep(job.type)
    }

    if (!job.retryCount) {
      job.retryCount = 0
    }

    if (!job.maxRetries) {
      job.maxRetries = this.config.maxRetries
    }

    // Add to queue
    this.queue.push(job)
    this.metrics.totalJobs++
    
    // Update metrics
    this.updateMetrics()
    
    // Sort queue based on prioritization
    this.sortQueue()
    
    // Try to process
    await this.processQueue()
  }

  async dequeueJob(): Promise<ProcessingJob | null> {
    if (this.processing.size >= this.config.maxConcurrency) {
      return null
    }

    if (this.queue.length === 0) {
      return null
    }

    // Get next job based on prioritization
    let job: ProcessingJob | undefined
    switch (this.config.prioritization) {
      case 'priority':
        job = this.queue.find(j => j.priority === 'high') || this.queue[0]
        break
      case 'shortest_first':
        job = this.queue.reduce((shortest, current) => 
          current.estimatedTimeRemaining < (shortest.estimatedTimeRemaining || Infinity) 
            ? current 
            : shortest
        )
        break
      case 'longest_first':
        job = this.queue.reduce((longest, current) => 
          current.estimatedTimeRemaining > (longest.estimatedTimeRemaining || 0) 
            ? current 
            : longest
        )
        break
      default: // fifo
        job = this.queue[0]
    }

    if (!job) return null

    // Remove from queue and add to processing
    this.queue = this.queue.filter(j => j.id !== job!.id)
    this.processing.set(job.id, job)
    
    return job
  }

  async getQueue(): Promise<ProcessingJob[]> {
    return [...this.queue].sort((a, b) => {
      // Sort by priority first, then by creation time
      if (a.priority !== b.priority) {
        return a.priority === 'high' ? -1 : 1
      }
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
  }

  async updateJobProgress(jobId: string, progress: number, step: string): Promise<void> {
    const job = this.processing.get(jobId)
    if (!job) {
      throw new Error(`Job not found in processing queue: ${jobId}`)
    }

    job.progress = Math.max(0, Math.min(100, progress))
    job.currentStep = step
    job.estimatedTimeRemaining = this.calculateEstimatedTimeRemaining(job)

    // Update metrics
    this.updateMetrics()
  }

  async updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void> {
    const job = this.processing.get(jobId)
    if (!job) {
      throw new Error(`Job not found in processing queue: ${jobId}`)
    }

    job.status = status
    job.error = error

    // Move to appropriate queue
    this.processing.delete(jobId)

    if (status === JobStatus.COMPLETED) {
      job.completedAt = new Date()
      this.completed.set(jobId, job)
      this.metrics.processedJobs++
    } else if (status === JobStatus.FAILED) {
      job.completedAt = new Date()
      this.failed.set(jobId, job)
      this.metrics.failedJobs++
      
      // Auto-retry if enabled and under max retries
      if (this.config.autoRetry && job.retryCount < job.maxRetries) {
        await this.scheduleRetry(job)
      }
    }

    // Update metrics
    this.updateMetrics()
    
    // Process next job
    await this.processQueue()
  }

  async retryJob(jobId: string): Promise<void> {
    const job = this.failed.get(jobId) || this.completed.get(jobId)
    if (!job) {
      throw new Error(`Job not found in failed/completed queue: ${jobId}`)
    }

    // Reset job state for retry
    job.status = JobStatus.PENDING
    job.progress = 0
    job.currentStep = this.getInitialStep(job.type)
    job.error = undefined
    job.retryCount++
    job.createdAt = new Date()
    job.startedAt = undefined
    job.completedAt = undefined

    // Remove from failed/completed and add to queue
    this.failed.delete(jobId)
    this.completed.delete(jobId)
    
    await this.enqueueJob(job)
  }

  async cancelJob(jobId: string): Promise<void> {
    // Check if job is in queue
    const queueIndex = this.queue.findIndex(j => j.id === jobId)
    if (queueIndex !== -1) {
      const job = this.queue[queueIndex]
      this.queue.splice(queueIndex, 1)
      
      // Update metrics
      this.metrics.totalJobs--
      this.updateMetrics()
      
      return
    }

    // Check if job is being processed
    const job = this.processing.get(jobId)
    if (job) {
      job.status = JobStatus.CANCELLED
      job.completedAt = new Date()
      this.processing.delete(jobId)
      
      // Update metrics
      this.updateMetrics()
      
      return
    }

    // Check if job is in failed/completed
    if (this.failed.has(jobId) || this.completed.has(jobId)) {
      throw new Error(`Cannot cancel completed/failed job: ${jobId}`)
    }
  }

  async processQueue(): Promise<void> {
    while (this.processing.size < this.config.maxConcurrency && this.queue.length > 0) {
      const job = await this.dequeueJob()
      if (job) {
        await this.executeJob(job)
      } else {
        break
      }
    }
  }

  private async executeJob(job: ProcessingJob): Promise<void> {
    job.status = JobStatus.RUNNING
    job.startedAt = new Date()

    // Simulate job execution
    const processingTime = this.simulateJobExecution(job)
    
    setTimeout(async () => {
      // Simulate completion or failure
      const shouldSucceed = Math.random() > 0.1 // 90% success rate
      if (shouldSucceed) {
        await this.updateJobStatus(job.id, JobStatus.COMPLETED)
      } else {
        await this.updateJobStatus(job.id, JobStatus.FAILED, 'Simulated processing error')
      }
    }, processingTime)
  }

  private simulateJobExecution(job: ProcessingJob): number {
    // Simulate different processing times based on job type
    const baseTimes: Record<JobType, number> = {
      [JobType.KARAOKE_CONVERSION]: 30000, // 30 seconds
      [JobType.LYRICS_SYNC]: 20000, // 20 seconds
      [JobType.AUDIO_SEPARATION]: 25000, // 25 seconds
      [JobType.LANGUAGE_DETECTION]: 10000 // 10 seconds
    }

    const baseTime = baseTimes[job.type] || 15000
    const priorityMultiplier = job.priority === 'high' ? 0.8 : job.priority === 'low' ? 1.2 : 1.0
    const variance = Math.random() * 0.4 + 0.8 // 0.8x to 1.2x

    return Math.floor(baseTime * priorityMultiplier * variance)
  }

  private scheduleRetry(job: ProcessingJob): Promise<void> {
    return new Promise(resolve => {
      setTimeout(async () => {
        await this.retryJob(job.id)
        resolve()
      }, this.config.retryDelay)
    })
  }

  private sortQueue(): void {
    switch (this.config.prioritization) {
      case 'priority':
        this.queue.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority === 'high' ? -1 : 1
          }
          return a.createdAt.getTime() - b.createdAt.getTime()
        })
        break
      case 'fifo':
        // Already sorted by insertion time
        break
      case 'shortest_first':
        this.queue.sort((a, b) => {
          const aTime = a.estimatedTimeRemaining || 0
          const bTime = b.estimatedTimeRemaining || 0
          return aTime - bTime
        })
        break
      case 'longest_first':
        this.queue.sort((a, b) => {
          const aTime = a.estimatedTimeRemaining || 0
          const bTime = b.estimatedTimeRemaining || 0
          return bTime - aTime
        })
        break
    }
  }

  private getInitialStep(jobType: JobType): string {
    const steps: Record<JobType, string> = {
      [JobType.KARAOKE_CONVERSION]: 'downloading_video',
      [JobType.LYRICS_SYNC]: 'analyzing_audio',
      [JobType.AUDIO_SEPARATION]: 'extracting_audio',
      [JobType.LANGUAGE_DETECTION]: 'detecting_language'
    }
    return steps[jobType] || 'initializing'
  }

  private calculateEstimatedTimeRemaining(job: ProcessingJob): number {
    const elapsed = Date.now() - (job.startedAt?.getTime() || job.createdAt.getTime())
    const progressFactor = job.progress / 100
    const estimatedTotalTime = elapsed / progressFactor
    return Math.max(0, estimatedTotalTime - elapsed)
  }

  private updateMetrics(): void {
    // Update basic metrics
    this.metrics.totalJobs = this.queue.length + this.processing.size + this.completed.size + this.failed.size
    
    // Update jobs by type
    const jobsByType = new Map<JobType, { count: number; totalTime: number }>()
    
    [...this.queue, ...this.processing.values(), ...this.completed.values(), ...this.failed.values()].forEach(job => {
      if (!jobsByType.has(job.type)) {
        jobsByType.set(job.type, { count: 0, totalTime: 0 })
      }
      const typeData = jobsByType.get(job.type)!
      typeData.count++
      
      if (job.startedAt && job.completedAt) {
        typeData.totalTime += job.completedAt.getTime() - job.startedAt.getTime()
      }
    })
    
    this.metrics.jobsByType = Array.from(jobsByType.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      averageTime: data.count > 0 ? data.totalTime / data.count : 0
    }))
    
    // Update jobs by status
    const jobsByStatus = new Map<JobStatus, number>()
    Object.values(JobStatus).forEach(status => {
      jobsByStatus.set(status, 0)
    })
    
    [...this.queue, ...this.processing.values(), ...this.completed.values(), ...this.failed.values()].forEach(job => {
      jobsByStatus.set(job.status, (jobsByStatus.get(job.status) || 0) + 1)
    })
    
    this.metrics.jobsByStatus = Array.from(jobsByStatus.entries()).map(([status, count]) => ({
      status,
      count
    }))
    
    // Calculate average processing time
    const completedJobs = Array.from(this.completed.values()).filter(job => 
      job.startedAt && job.completedAt
    )
    
    if (completedJobs.length > 0) {
      const totalTime = completedJobs.reduce((sum, job) => {
        return sum + (job.completedAt!.getTime() - job.startedAt!.getTime())
      }, 0)
      this.metrics.averageProcessingTime = totalTime / completedJobs.length
    }
  }

  async getStats(): Promise<QueueStats> {
    return {
      pendingJobs: this.queue.length,
      runningJobs: this.processing.size,
      completedJobs: this.completed.size,
      failedJobs: this.failed.size,
      averageProcessingTime: this.metrics.averageProcessingTime,
      jobsByType: this.metrics.jobsByType,
      jobsByStatus: this.metrics.jobsByStatus
    }
  }

  async clearCompletedJobs(maxAge: number = 86400000): Promise<number> {
    const cutoffTime = Date.now() - maxAge
    let clearedCount = 0
    
    // Clear old completed jobs
    for (const [id, job] of this.completed) {
      if (job.completedAt && job.completedAt.getTime() < cutoffTime) {
        this.completed.delete(id)
        clearedCount++
      }
    }
    
    // Clear old failed jobs
    for (const [id, job] of this.failed) {
      if (job.completedAt && job.completedAt.getTime() < cutoffTime) {
        this.failed.delete(id)
        clearedCount++
      }
    }
    
    return clearedCount
  }

  async getJobHistory(limit: number = 100): Promise<ProcessingJob[]> {
    const allJobs = [
      ...Array.from(this.completed.values()),
      ...Array.from(this.failed.values()),
      ...Array.from(this.processing.values()),
      ...this.queue
    ]
    
    return allJobs
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
  }
}