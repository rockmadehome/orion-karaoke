export enum ProcessingStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  EXTRACTING_AUDIO = 'extracting_audio',
  SEPARATING_VOCALS = 'separating_vocals',
  RECOGNIZING_LYRICS = 'recognizing_lyrics',
  GENERATING_KARAOKE = 'generating_karaoke',
  DONE = 'done',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}