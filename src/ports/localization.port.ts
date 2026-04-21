import { Translations } from '@/domain/entities'

export type SupportedLanguage = 'es' | 'en' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko'

export interface LocalizationPort {
  /**
   * Get translations for a specific language
   * @param lang Language code (e.g., 'es', 'en', 'fr')
   * @param namespace Optional namespace for translations
   * @returns Promise<Translations>
   */
  getTranslations(lang: SupportedLanguage, namespace?: string): Promise<Translations>

  /**
   * Get the current language
   * @returns Promise<SupportedLanguage>
   */
  getCurrentLang(): Promise<SupportedLanguage>

  /**
   * Set the current language
   * @param lang Language code
   * @param persist Whether to persist the setting
   * @returns Promise<void>
   */
  setLang(lang: SupportedLanguage, persist?: boolean): Promise<void>

  /**
   * Get all supported languages
   * @returns Promise<Array<{ code: SupportedLanguage; name: string; nativeName: string }>>
   */
  getSupportedLanguages(): Promise<Array<{
    code: SupportedLanguage
    name: string
    nativeName: string
  }>>

  /**
   * Detect the language from text
   * @param text Text to analyze
   * @returns Promise<SupportedLanguage>
   */
  detectLanguage(text: string): Promise<SupportedLanguage>

  /**
   * Format date according to current language
   * @param date Date to format
   * @param format Optional format string
   * @returns Promise<string>
   */
  formatDate(date: Date, format?: string): Promise<string>

  /**
   * Format number according to current language
   * @param number Number to format
   * @param options Formatting options
   * @returns Promise<string>
   */
  formatNumber(
    number: number,
    options?: {
      style?: 'decimal' | 'currency' | 'percent'
      currency?: string
      minimumFractionDigits?: number
      maximumFractionDigits?: number
    }
  ): Promise<string>

  /**
   * Format time duration according to current language
   * @param seconds Duration in seconds
   * @returns Promise<string>
   */
  formatDuration(seconds: number): Promise<string>

  /**
   * Add or update translations for a specific language
   * @param lang Language code
   * @param translations Translations object
   * @param namespace Optional namespace
   * @returns Promise<void>
   */
  addTranslations(lang: SupportedLanguage, translations: Translations, namespace?: string): Promise<void>

  /**
   * Get translation for a specific key
   * @param key Translation key
   * @param params Optional parameters for interpolation
   * @returns Promise<string>
   */
  t(key: string, params?: Record<string, any>): Promise<string>
}