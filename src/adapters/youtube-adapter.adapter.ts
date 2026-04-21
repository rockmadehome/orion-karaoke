import { YouTubeAdapterPort, VideoInfo, DownloadResult } from '@/ports'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class YouTubeAdapter implements YouTubeAdapterPort {
  private readonly downloadDir = './downloads'
  private readonly qualities = ['highest', '1080p', '720p', '480p', '360p']
  
  async downloadVideo(url: string): Promise<DownloadResult> {
    try {
      // Ensure download directory exists
      await execAsync(`mkdir -p ${this.downloadDir}`)
      
      const timestamp = Date.now()
      const outputPattern = `${this.downloadDir}/video_${timestamp}.%(ext)s`
      
      // Download video with yt-dlp
      const command = `yt-dlp -f "bestvideo[ext!=webm]+bestaudio[ext!=webm]/best" --merge-output-format mp4 -o "${outputPattern}" "${url}"`
      
      await execAsync(command)
      
      // Find the downloaded file
      const { stdout: listOutput } = await execAsync(`ls -la ${this.downloadDir}/video_${timestamp}.*`)
      const filePath = listOutput.split('\n').find(line => line.includes('video_' + timestamp))?.split(' ').pop() || ''
      
      if (!filePath) {
        throw new Error('Video download failed - no output file found')
      }
      
      // Get video info
      const videoInfo = await this.getVideoInfo(url)
      
      const result: DownloadResult = {
        filePath,
        title: videoInfo.title,
        duration: videoInfo.duration,
        quality: videoInfo.quality,
        fileSize: await this.getFileSize(filePath),
        format: 'mp4',
        success: true
      }
      
      return result
    } catch (error) {
      throw new Error(`Video download failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async getVideoInfo(url: string): Promise<VideoInfo> {
    try {
      const { stdout } = await execAsync(`yt-dlp --get-title --get-duration --get-filename --get-format "${url}"`)
      
      const lines = stdout.trim().split('\n')
      if (lines.length < 3) {
        throw new Error('Failed to get video info')
      }
      
      const title = lines[0]
      const durationStr = lines[1]
      const filename = lines[2]
      const format = lines[3] || 'unknown'
      
      // Parse duration
      const durationParts = durationStr.split(':')
      let duration = 0
      if (durationParts.length === 3) {
        duration = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2])
      } else if (durationParts.length === 2) {
        duration = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1])
      }
      
      // Determine quality
      const quality = this.extractQualityFromFormat(format)
      
      return {
        title,
        url,
        duration,
        quality,
        format,
        filename,
        thumbnailUrl: await this.extractThumbnailUrl(url),
        uploadDate: new Date(),
        views: 0, // Will need additional parsing for this
        author: 'Unknown'
      }
    } catch (error) {
      throw new Error(`Failed to get video info: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async isValidYouTubeUrl(url: string): Promise<boolean> {
    try {
      // Basic URL validation
      const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.?be)\/.+$/
      if (!youtubeRegex.test(url)) {
        return false
      }
      
      // Try to get video info to validate URL
      await this.getVideoInfo(url)
      return true
    } catch {
      return false
    }
  }
  
  async getSupportedQualities(): Promise<string[]> {
    return [...this.qualities]
  }
  
  private async getFileSize(filePath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`ls -l "${filePath}" | awk '{print $5}'`)
      return parseInt(stdout.trim())
    } catch {
      return 0
    }
  }
  
  private async extractThumbnailUrl(url: string): Promise<string> {
    try {
      const videoId = this.extractVideoId(url)
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    } catch {
      return ''
    }
  }
  
  private extractVideoId(url: string): string {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
    const match = url.match(regex)
    return match ? match[1] : ''
  }
  
  private extractQualityFromFormat(format: string): string {
    if (format.includes('1080p')) return '1080p'
    if (format.includes('720p')) return '720p'
    if (format.includes('480p')) return '480p'
    if (format.includes('360p')) return '360p'
    return 'unknown'
  }
}