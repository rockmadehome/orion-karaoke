export interface LanguageDetectionResult {
  detectedLanguage: string
  confidence: number
  alternatives?: Array<{
    language: string
    confidence: number
  }>
  processingTime: number
  modelUsed: string
}

export interface SupportedLanguage {
  code: string
  name: string
  nativeName: string
  iso6391: string
  iso6392?: string
  rtl?: boolean
}