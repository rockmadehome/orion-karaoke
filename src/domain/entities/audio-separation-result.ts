export interface AudioSeparationResult {
  vocals?: {
    path: string
    size: number
    duration: number
    format: string
    quality: string
    processingTime: number
    model: string
  }
  instrumentals?: {
    path: string
    size: number
    duration: number
    format: string
    quality: string
    processingTime: number
    model: string
  }
  both?: {
    vocals: AudioSeparationResult['vocals']
    instrumentals: AudioSeparationResult['instrumentals']
  }
  originalAudio: {
    path: string
    size: number
    duration: number
    format: string
  }
  separationQuality: 'low' | 'medium' | 'high'
  processingTime: number
  modelUsed: string
  gpuUsed: boolean
}

export interface AudioSeparationOptions {
  model?: string
  quality?: 'low' | 'medium' | 'high'
  outputFormat?: 'wav' | 'flac' | 'mp3'
  enableNormalization?: boolean
  enableDenoising?: boolean
  enableEnhancement?: boolean
  useGPU?: boolean
}