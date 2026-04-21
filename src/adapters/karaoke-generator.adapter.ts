import { KaraokeGeneratorPort, KaraokeVideoConfig, LyricsWithTimestamps } from '@/ports'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface KaraokeStyle {
  type: 'simple' | 'fancy' | 'animated'
  fontSize: number
  fontFamily: string
  color: string
  backgroundColor: string
  outlineColor: string
  outlineWidth: number
  animation: boolean
  duration: number
}

export class KaraokeGenerator implements KaraokeGeneratorPort {
  private readonly outputDir = './karaoke-output'
  private readonly tempDir = './temp'
  
  constructor() {
    // Ensure directories exist
    this.ensureDirectories()
  }
  
  async generateKaraoke(
    videoPath: string, 
    vocalPath: string, 
    lyrics: LyricsWithTimestamps,
    config: KaraokeVideoConfig = {}
  ): Promise<string> {
    try {
      console.log('Generating karaoke video...')
      
      const outputPath = `${this.outputDir}/karaoke_${Date.now()}.mp4`
      const tempVideo = `${this.tempDir}/processed_${Date.now()}.mp4`
      
      // Process video with enhanced audio
      await this.processVideoWithEnhancedAudio(videoPath, vocalPath, tempVideo)
      
      // Generate karaoke overlay
      const overlayPath = await this.generateLyricsOverlay(lyrics, config)
      
      // Combine video with karaoke overlay
      await this.combineVideoWithOverlay(tempVideo, overlayPath, outputPath)
      
      // Clean up temporary files
      await this.cleanup(tempVideo)
      
      console.log(`Karaoke video generated: ${outputPath}`)
      
      return outputPath
    } catch (error) {
      throw new Error(`Karaoke generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async generatePreview(
    videoPath: string, 
    lyrics: LyricsWithTimestamps, 
    duration: number = 30
  ): Promise<string> {
    try {
      console.log('Generating karaoke preview...')
      
      const previewPath = `${this.outputDir}/preview_${Date.now()}.mp4`
      const tempVideo = `${this.tempDir}/preview_${Date.now()}.mp4`
      
      // Extract first 30 seconds of video
      await execAsync(`ffmpeg -i "${videoPath}" -t ${duration} -c:v libx264 -c:a aac "${tempVideo}"`)
      
      // Generate overlay for preview
      const overlayPath = await this.generateLyricsOverlay(lyrics, {
        style: 'simple',
        duration: duration,
        preview: true
      })
      
      // Combine with overlay
      await this.combineVideoWithOverlay(tempVideo, overlayPath, previewPath)
      
      // Clean up
      await this.cleanup(tempVideo)
      
      return previewPath
    } catch (error) {
      throw new Error(`Preview generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async extractLyricsFromVideo(videoPath: string): Promise<LyricsWithTimestamps> {
    try {
      console.log('Extracting lyrics from video...')
      
      // Extract audio from video
      const audioPath = `${this.tempDir}/extracted_audio_${Date.now()}.mp3`
      await execAsync(`ffmpeg -i "${videoPath}" -vn -acodec mp3 "${audioPath}"`)
      
      // Use lyrics recognizer to extract lyrics
      // This would typically use the LyricsRecognitionPort, but for simplicity we'll create a basic extraction
      const lyrics = await this.basicLyricsExtraction(audioPath)
      
      // Clean up
      await this.cleanup(audioPath)
      
      return lyrics
    } catch (error) {
      throw new Error(`Lyrics extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async optimizeForCast(outputPath: string, targetResolution: string = '1280x720'): Promise<string> {
    try {
      console.log('Optimizing for casting...')
      
      const optimizedPath = `${this.outputDir}/optimized_${Date.now()}.mp4`
      
      await execAsync(`ffmpeg -i "${outputPath}" -vf "scale=${targetResolution}" -c:v libx264 -preset fast -c:a aac -b:a 192k "${optimizedPath}"`)
      
      return optimizedPath
    } catch (error) {
      throw new Error(`Cast optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async validateOutput(outputPath: string): Promise<boolean> {
    try {
      await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec,width,height,duration "${outputPath}"`)
      return true
    } catch {
      return false
    }
  }
  
  async getVideoInfo(outputPath: string): Promise<{
    duration: number
    resolution: string
    fileSize: number
    codec: string
  }> {
    try {
      const { stdout: infoOutput } = await execAsync(`ffprobe -v quiet -print_format json -show_format "${outputPath}"`)
      const info = JSON.parse(infoOutput)
      
      const duration = parseFloat(info.format.duration)
      const resolution = info.streams[0].width + 'x' + info.streams[0].height
      const fileSize = parseInt(info.format.size)
      const codec = info.streams[0].codec_name
      
      return { duration, resolution, fileSize, codec }
    } catch (error) {
      throw new Error(`Failed to get video info: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  private async processVideoWithEnhancedAudio(videoPath: string, vocalPath: string, outputPath: string): Promise<void> {
    console.log('Processing video with enhanced audio...')
    
    // Mix original video audio with separated vocals
    await execAsync(`ffmpeg -i "${videoPath}" -i "${vocalPath}" -filter_complex "[0:a][1:a]amix=inputs=2:duration=longest" -map 0:v -map "[amix]" -c:v copy -c:a aac "${outputPath}"`)
  }
  
  private async generateLyricsOverlay(lyrics: LyricsWithTimestamps, config: KaraokeVideoConfig): Promise<string> {
    try {
      console.log('Generating lyrics overlay...')
      
      const overlayPath = `${this.tempDir}/lyrics_overlay_${Date.now()}.mp4`
      const style = config.style || 'simple'
      
      // Create lyrics text file for FFmpeg
      const lyricsFile = `${this.tempDir}/lyrics_${Date.now()}.txt`
      await this.createLyricsFile(lyricsFile, lyrics)
      
      // Generate based on style
      switch (style) {
        case 'fancy':
          await this.generateFancyOverlay(lyricsFile, overlayPath, config)
          break
        case 'animated':
          await this.generateAnimatedOverlay(lyricsFile, overlayPath, config)
          break
        default:
          await this.generateSimpleOverlay(lyricsFile, overlayPath, config)
      }
      
      // Clean up lyrics file
      await this.cleanup(lyricsFile)
      
      return overlayPath
    } catch (error) {
      throw new Error(`Overlay generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  private async createLyricsFile(filePath: string, lyrics: LyricsWithTimestamps): Promise<void> {
    let content = ''
    
    for (const segment of lyrics.segments) {
      const startTime = this.formatTime(segment.start)
      const endTime = this.formatTime(segment.end)
      content += `[${startTime}]${segment.text}\n`
    }
    
    await this.writeFile(filePath, content)
  }
  
  private async generateSimpleOverlay(lyricsFile: string, outputPath: string, config: KaraokeVideoConfig): Promise<void> {
    const duration = config.duration || 300 // 5 minutes default
    
    await execAsync(`ffmpeg -f lavfi -i testsrc2=duration=${duration}:size=1920x1080:rate=30 -vf "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile='${lyricsFile}':fontsize=48:fontcolor=white@0.8:x=(w-tw)/2:y=h-th-100:enable='between(t,0,${duration})'" -c:v libx264 -t ${duration} "${outputPath}"`)
  }
  
  private async generateFancyOverlay(lyricsFile: string, outputPath: string, config: KaraokeVideoConfig): Promise<void> {
    const duration = config.duration || 300
    
    await execAsync(`ffmpeg -f lavfi -i testsrc2=duration=${duration}:size=1920x1080:rate=30 -vf `
      + `"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile='${lyricsFile}':"
      + `fontsize=48:fontcolor=yellow@0.9:x=(w-tw)/2:y=h-th-100:`
      + `box=1:boxcolor=black@0.5:boxborderw=5:"
      + `shadowcolor=black@0.5:shadowx=2:shadowy=2:`
      + `enable='between(t,0,${duration})'" `
      + `-c:v libx264 -t ${duration} "${outputPath}"`)
  }
  
  private async generateAnimatedOverlay(lyricsFile: string, outputPath: string, config: KaraokeVideoConfig): Promise<void> {
    const duration = config.duration || 300
    
    await execAsync(`ffmpeg -f lavfi -i testsrc2=duration=${duration}:size=1920x1080:rate=30 -vf `
      + `"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile='${lyricsFile}':"
      + `fontsize=48:fontcolor=white@0.9:x='(w-tw)/2+sin(2*PI*t/5)*20':y='h-th-100+cos(2*PI*t/5)*10':"
      + `enable='between(t,0,${duration})':"
      + `fade=in:st=0:d=1:alpha=1:out=st=${duration-1}:d=1:alpha=0' `
      + `-c:v libx264 -t ${duration} "${outputPath}"`)
  }
  
  private async combineVideoWithOverlay(videoPath: string, overlayPath: string, outputPath: string): Promise<void> {
    console.log('Combining video with overlay...')
    
    // Get video duration
    const { stdout: durationOutput } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`)
    const duration = parseFloat(durationOutput.trim())
    
    await execAsync(`ffmpeg -i "${videoPath}" -i "${overlayPath}" `
      + `-filter_complex "[0:v][1:v]overlay=format=auto" `
      + `-map 0:a -map "[overlay]" `
      + `-c:v libx264 -c:a aac `
      + `-t ${duration} "${outputPath}"`)
  }
  
  private async basicLyricsExtraction(audioPath: string): Promise<LyricsWithTimestamps> {
    // Basic implementation - in reality this would use proper speech recognition
    return {
      language: 'es',
      segments: [
        {
          id: '1',
          text: 'Example lyrics',
          start: 0,
          end: 30,
          confidence: 0.8,
          speaker: 'unknown',
          words: []
        }
      ],
      confidence: 0.8,
      metadata: {
        model: 'basic-extractor',
        processingTime: 0,
        wordCount: 2,
        speakerCount: 1
      }
    }
  }
  
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  
  private async ensureDirectories(): Promise<void> {
    await execAsync(`mkdir -p ${this.outputDir} ${this.tempDir}`)
  }
  
  private async cleanup(filePath: string): Promise<void> {
    try {
      await execAsync(`rm -f "${filePath}"`)
    } catch {
      // Ignore cleanup errors
    }
  }
  
  private async writeFile(filePath: string, content: string): Promise<void> {
    await execAsync(`echo '${content}' > "${filePath}"`)
  }
}