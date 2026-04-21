export interface Word {
  text: string
  start: number // seconds
  end: number // seconds
}

export interface Line {
  text: string
  start: number // seconds
  end: number // seconds
  words?: Word[]
}

export interface LyricsWithTimestamps {
  lines: Line[]
  language: string
  detectedLanguage?: string
  confidence?: number
  timestampGranularity: 'word' | 'phrase'
  totalDuration: number // seconds
  syncMethod: 'ai_generated' | 'synced' | 'manual'
}

export interface SerializedLyrics {
  lines: Array<{
    text: string
    start: number
    end: number
    words?: Array<{
      text: string
      start: number
      end: number
    }>
  }>
  language: string
  detectedLanguage?: string
  confidence?: number
  timestampGranularity: 'word' | 'phrase'
  totalDuration: number
  syncMethod: 'ai_generated' | 'synced' | 'manual'
}