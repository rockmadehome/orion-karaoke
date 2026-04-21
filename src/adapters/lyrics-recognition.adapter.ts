import { LyricsRecognitionPort, LyricsWithTimestamps, LanguageDetectionResult } from '@/ports'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export enum WhisperModel {
  TINY = 'tiny',
  BASE = 'base',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  TURBO = 'turbo'
}

export interface WhisperConfig {
  model: WhisperModel
  language?: string
  temperature: number
  beamSize: number
  bestOf: number
  wordTimestamps: boolean
  prompt?: string
}

export class LyricsRecognizer implements LyricsRecognitionPort {
  private config: WhisperConfig
  
  constructor(config: WhisperConfig) {
    this.config = config
  }
  
  async recognizeLanguage(audioPath: string): Promise<LanguageDetectionResult> {
    try {
      console.log('Detecting language...')
      
      // Use Whisper to detect language
      const command = `whisper "${audioPath}" --model ${this.config.model} --language detect --verbose False`
      
      const { stdout } = await execAsync(command)
      
      // Parse language from output
      const languageMatch = stdout.match(/Detected language:\s+(\w+)/)
      if (!languageMatch) {
        throw new Error('Failed to detect language')
      }
      
      const language = languageMatch[1].toLowerCase()
      const confidence = 0.85 // Default confidence, Whisper doesn't provide this directly
      
      console.log(`Detected language: ${language} with confidence ${confidence}`)
      
      return {
        language,
        confidence,
        alternatives: [], // Could be enhanced with additional models
        timestamp: new Date()
      }
    } catch (error) {
      throw new Error(`Language detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async extractLyricsWithTimestamps(audioPath: string, language?: string): Promise<LyricsWithTimestamps> {
    try {
      console.log('Extracting lyrics with timestamps...')
      
      // Prepare Whisper command
      const whisperArgs = [
        `"${audioPath}"`,
        `--model ${this.config.model}`,
        '--task transcribe',
        '--word_timestamps True' if this.config.wordTimestamps else '',
        '--verbose False',
        '--output_format json'
      ]
      
      if (language) {
        whisperArgs.push(`--language ${language}`)
      }
      
      if (this.config.temperature !== 0) {
        whisperArgs.push(`--temperature ${this.config.temperature}`)
      }
      
      if (this.config.beamSize > 1) {
        whisperArgs.push(`--beam_size ${this.config.beamSize}`)
      }
      
      if (this.config.bestOf > 1) {
        whisperArgs.push(`--best_of ${this.config.bestOf}`)
      }
      
      if (this.config.prompt) {
        whisperArgs.push(`--prompt "${this.config.prompt}"`)
      }
      
      const command = whisperArgs.filter(Boolean).join(' ')
      
      console.log(`Running Whisper command: ${command}`)
      
      const { stdout } = await execAsync(command)
      
      // Parse JSON output
      const result = JSON.parse(stdout)
      
      // Process segments into lyrics with timestamps
      const lyrics = this.processWhisperSegments(result.segments || [])
      
      console.log(`Extracted ${lyrics.length} lyrics segments`)
      
      return {
        language: language || 'auto',
        segments: lyrics,
        confidence: this.calculateConfidence(lyrics),
        metadata: {
          model: this.config.model,
          processingTime: result.duration || 0,
          wordCount: lyrics.reduce((total, segment) => total + (segment.text.split(' ').length), 0),
          speakerCount: this.countSpeakers(lyrics)
        }
      }
    } catch (error) {
      throw new Error(`Lyrics extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async processKaraokeLyrics(plainLyrics: string, audioDuration: number): Promise<LyricsWithTimestamps> {
    try {
      console.log('Processing karaoke lyrics...')
      
      // Simple lyrics processing for karaoke
      // This is a basic implementation - could be enhanced with more sophisticated algorithms
      const lines = plainLyrics.split('\n').filter(line => line.trim())
      
      const segments = lines.map((line, index) => {
        const startTime = (index / lines.length) * audioDuration
        const endTime = ((index + 1) / lines.length) * audioDuration
        
        return {
          id: `segment_${index}`,
          text: line.trim(),
          start: startTime,
          end: endTime,
          confidence: 0.9,
          speaker: 'unknown',
          words: line.trim().split(' ').map((word, wordIndex) => ({
            text: word,
            start: startTime + (wordIndex / line.trim().split(' ').length) * (endTime - startTime),
            end: startTime + ((wordIndex + 1) / line.trim().split(' ').length) * (endTime - startTime),
            confidence: 0.9
          }))
        }
      })
      
      return {
        language: 'es', // Default to Spanish for karaoke
        segments,
        confidence: 0.85,
        metadata: {
          model: 'karaoke-processor',
          processingTime: 0,
          wordCount: segments.reduce((total, segment) => total + (segment.text.split(' ').length), 0),
          speakerCount: 1
        }
      }
    } catch (error) {
      throw new Error(`Karaoke lyrics processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async syncLyricsWithAudio(lyricsPath: string, audioPath: string): Promise<LyricsWithTimestamps> {
    try {
      console.log('Syncing lyrics with audio...')
      
      // Use audio analysis to better align lyrics
      const command = `ffmpeg -i "${audioPath}" -af "silencedetect=n=-30dB:d=0.1" -f null - 2>&1 | grep "silence_start"`
      
      const { stdout } = await execAsync(command)
      
      // Parse silence detection results
      const silenceMatches = stdout.match(/silence_start: (\d+\.\d+)/g)
      const silenceTimestamps = silenceMatches ? silenceMatches.map(match => parseFloat(match.split(': ')[1])) : []
      
      // Load lyrics file and apply timing based on silence detection
      const { stdout: lyricsContent } = await execAsync(`cat "${lyricsPath}"`)
      const lines = lyricsContent.split('\n').filter(line => line.trim())
      
      const segments = lines.map((line, index) => {
        const startTime = silenceTimestamps[index] || 0
        const endTime = silenceTimestamps[index + 1] || audioDuration
        
        return {
          id: `synced_segment_${index}`,
          text: line.trim(),
          start: startTime,
          end: endTime,
          confidence: 0.95,
          speaker: 'unknown',
          words: line.trim().split(' ').map((word, wordIndex) => ({
            text: word,
            start: startTime + (wordIndex / line.trim().split(' ').length) * (endTime - startTime),
            end: startTime + ((wordIndex + 1) / line.trim().split(' ').length) * (endTime - startTime),
            confidence: 0.95
          }))
        }
      })
      
      return {
        language: 'es',
        segments,
        confidence: 0.9,
        metadata: {
          model: 'audio-sync',
          processingTime: 0,
          wordCount: segments.reduce((total, segment) => total + (segment.text.split(' ').length), 0),
          speakerCount: 1,
          syncMethod: 'silence-detection'
        }
      }
    } catch (error) {
      throw new Error(`Lyrics sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async getSupportedModels(): Promise<WhisperModel[]> {
    return Object.values(WhisperModel)
  }
  
  async testInstallation(): Promise<boolean> {
    try {
      await execAsync('whisper --version')
      return true
    } catch {
      return false
    }
  }
  
  private processWhisperSegments(segments: any[]): any[] {
    return segments.map((segment, index) => ({
      id: `segment_${index}`,
      text: segment.text.trim(),
      start: segment.start,
      end: segment.end,
      confidence: segment.avg_logprob || 0,
      speaker: segment.speaker || 'unknown',
      words: segment.words ? segment.words.map((word: any, wordIndex: number) => ({
        text: word.word,
        start: word.start,
        end: word.end,
        confidence: word.probability || 0.9
      })) : []
    }))
  }
  
  private calculateConfidence(segments: any[]): number {
    if (segments.length === 0) return 0
    
    const avgConfidence = segments.reduce((sum, segment) => sum + (segment.confidence || 0), 0) / segments.length
    return Math.round(avgConfidence * 100) / 100
  }
  
  private countSpeakers(segments: any[]): number {
    const speakers = new Set(segments.map(segment => segment.speaker).filter(Boolean))
    return speakers.size
  }
}