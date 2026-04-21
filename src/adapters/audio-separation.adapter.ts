import { AudioSeparationPort, AudioSeparationResult } from '@/ports'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export enum SeparatorType {
  SPLEETER = 'spleeter',
  DEMUCS = 'demucs',
  CLOUD = 'cloud'
}

export interface AudioSeparatorConfig {
  type: SeparatorType
  model?: string
  cuda: boolean
  outputPath: string
}

export class AudioSeparator implements AudioSeparationPort {
  private config: AudioSeparatorConfig
  
  constructor(config: AudioSeparatorConfig) {
    this.config = config
  }
  
  async separateVocals(audioPath: string): Promise<AudioSeparationResult> {
    try {
      const outputPath = `${this.config.outputPath}/vocals_${Date.now()}`
      await execAsync(`mkdir -p ${outputPath}`)
      
      let command = ''
      let separatorName = ''
      
      switch (this.config.type) {
        case SeparatorType.SPLEETER:
          command = `spleeter separate -i "${audioPath}" -p "spleeter:2stems" -o "${outputPath}"`
          separatorName = 'Spleeter'
          break
          
        case SeparatorType.DEMUCS:
          const demucsArgs = this.config.cuda ? '--two-stems vocals' : '--two-stems vocals'
          command = `demucs "${audioPath}" -o "${outputPath}" ${demucsArgs}`
          separatorName = 'Demucs'
          break
          
        case SeparatorType.CLOUD:
          throw new Error('Cloud separation not implemented yet')
          
        default:
          throw new Error(`Unsupported separator type: ${this.config.type}`)
      }
      
      console.log(`Running ${separatorName} separation for vocals...`)
      await execAsync(command)
      
      // Find the output file
      const { stdout: filesOutput } = await execAsync(`find "${outputPath}" -name "*vocals*" -type f`)
      const vocalFiles = filesOutput.trim().split('\n').filter(Boolean)
      
      if (vocalFiles.length === 0) {
        throw new Error('Vocal separation failed - no output file found')
      }
      
      const vocalPath = vocalFiles[0]
      const instrumentalPath = vocalFiles.find(file => file.includes('other')) || vocalFiles[1]
      
      const result: AudioSeparationResult = {
        vocalsPath: vocalPath,
        instrumentalPath: instrumentalPath || '',
        duration: await this.getAudioDuration(vocalPath),
        sampleRate: 44100,
        bitRate: 320,
        channels: 2,
        success: true,
        separator: this.config.type,
        processingTime: 0 // Will need to measure this
      }
      
      return result
    } catch (error) {
      throw new Error(`Vocal separation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async separateInstrumentals(audioPath: string): Promise<AudioSeparationResult> {
    try {
      const outputPath = `${this.config.outputPath}/instrumentals_${Date.now()}`
      await execAsync(`mkdir -p ${outputPath}`)
      
      let command = ''
      let separatorName = ''
      
      switch (this.config.type) {
        case SeparatorType.SPLEETER:
          command = `spleeter separate -i "${audioPath}" -p "spleeter:2stems" -o "${outputPath}"`
          separatorName = 'Spleeter'
          break
          
        case SeparatorType.DEMUCS:
          const demucsArgs = this.config.cuda ? '--two-stems drums,bass,other' : '--two-stems drums,bass,other'
          command = `demucs "${audioPath}" -o "${outputPath}" ${demucsArgs}`
          separatorName = 'Demucs'
          break
          
        case SeparatorType.CLOUD:
          throw new Error('Cloud separation not implemented yet')
          
        default:
          throw new Error(`Unsupported separator type: ${this.config.type}`)
      }
      
      console.log(`Running ${separatorName} separation for instrumentals...`)
      await execAsync(command)
      
      // Find the output file
      const { stdout: filesOutput } = await execAsync(`find "${outputPath}" -name "*other*" -type f`)
      const instrumentalFiles = filesOutput.trim().split('\n').filter(Boolean)
      
      if (instrumentalFiles.length === 0) {
        throw new Error('Instrumental separation failed - no output file found')
      }
      
      const instrumentalPath = instrumentalFiles[0]
      const vocalPath = instrumentalFiles.find(file => file.includes('vocals')) || instrumentalFiles[1]
      
      const result: AudioSeparationResult = {
        vocalsPath: vocalPath || '',
        instrumentalPath: instrumentalPath,
        duration: await this.getAudioDuration(instrumentalPath),
        sampleRate: 44100,
        bitRate: 320,
        channels: 2,
        success: true,
        separator: this.config.type,
        processingTime: 0 // Will need to measure this
      }
      
      return result
    } catch (error) {
      throw new Error(`Instrumental separation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async separateBoth(audioPath: string): Promise<AudioSeparationResult> {
    console.log('Separating both vocals and instrumentals...')
    
    // First separate vocals
    const vocalsResult = await this.separateVocals(audioPath)
    
    // Then separate instrumentals from the same original file
    const instrumentalsResult = await this.separateInstrumentals(audioPath)
    
    return {
      vocalsPath: vocalsResult.vocalsPath,
      instrumentalPath: instrumentalsResult.instrumentalPath,
      duration: Math.max(vocalsResult.duration, instrumentalsResult.duration),
      sampleRate: vocalsResult.sampleRate,
      bitRate: Math.max(vocalsResult.bitRate, instrumentalsResult.bitRate),
      channels: vocalsResult.channels,
      success: vocalsResult.success && instrumentalsResult.success,
      separator: this.config.type,
      processingTime: (vocalsResult.processingTime || 0) + (instrumentalsResult.processingTime || 0)
    }
  }
  
  async getSupportedModels(): Promise<string[]> {
    switch (this.config.type) {
      case SeparatorType.SPLEETER:
        return ['spleeter:2stems', 'spleeter:4stems', 'spleeter:5stems']
        
      case SeparatorType.DEMUCS:
        return ['demucs', 'demucs-extra', 'demucs-master']
        
      case SeparatorType.CLOUD:
        return ['replicate/spleeter', 'huggingface/demucs']
        
      default:
        return []
    }
  }
  
  async testInstallation(): Promise<boolean> {
    try {
      switch (this.config.type) {
        case SeparatorType.SPLEETER:
          await execAsync('spleeter --version')
          return true
          
        case SeparatorType.DEMUCS:
          await execAsync('demucs --version')
          return true
          
        case SeparatorType.CLOUD:
          // Cloud doesn't need local installation
          return true
          
        default:
          return false
      }
    } catch {
      return false
    }
  }
  
  private async getAudioDuration(filePath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`)
      return parseFloat(stdout.trim())
    } catch {
      return 0
    }
  }
}