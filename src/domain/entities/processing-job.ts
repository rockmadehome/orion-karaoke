import { JobStatus, JobType } from './index'

export interface ProcessingJob {
  id: string
  type: JobType
  status: JobStatus
  progress: number // 0-100
  currentStep: string
  error?: string
  data: Record<string, any> // Job-specific data
  result?: Record<string, any> // Job result data
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  estimatedTimeRemaining?: number
  retryCount: number
  maxRetries: number
  priority: 'low' | 'normal' | 'high'
  workerId?: string
  trackId?: string
  userId?: string
  metadata?: {
    inputFiles?: string[]
    outputFiles?: string[]
    processingTime?: number
    memoryUsage?: number
    cpuUsage?: number
    gpuUsage?: number
  }
}

export interface JobOptions {
  type: JobType
  data: Record<string, any>
  priority?: 'low' | 'normal' | 'high'
  maxRetries?: number
  trackId?: string
  userId?: string
}

export interface JobResult {
  success: boolean
  data?: any
  error?: string
  duration: number
  metadata?: {
    inputFiles?: string[]
    outputFiles?: string[]
    processingTime?: number
    memoryUsage?: number
    cpuUsage?: number
    gpuUsage?: number
  }
}

export interface JobProgressUpdate {
  jobId: string
  progress: number
  currentStep: string
  estimatedTimeRemaining?: number
  error?: string
}

export interface QueueStats {
  pendingJobs: number
  runningJobs: number
  completedJobs: number
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

export interface WorkerStats {
  workerId: string
  status: 'idle' | 'busy' | 'offline'
  currentJob?: string
  jobsCompleted: number
  jobsFailed: number
  averageJobTime: number
  lastActivity: Date
  cpuUsage: number
  memoryUsage: number
  gpuUsage?: number
}