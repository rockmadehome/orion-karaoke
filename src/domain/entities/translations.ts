export interface Translations {
  [key: string]: string | Translations
}

export interface NamespaceTranslations {
  [namespace: string]: Translations
}

export interface LocalizationConfig {
  fallbackLanguage: string
  supportedLanguages: string[]
  defaultNamespace: string
  loadStrategy: 'lazy' | 'eager'
  cacheTTL: number // seconds
}

export interface TranslationKey {
  key: string
  namespace?: string
  params?: Record<string, any>
  fallback?: string
}

export interface TranslationResult {
  text: string
  usedFallback: boolean
  language: string
  namespace: string
  key: string
}