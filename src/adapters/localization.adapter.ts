import { LocalizationPort, Translations } from '@/ports'

export interface Language {
  code: string
  name: string
  nativeName: string
  flag: string
  rtl?: boolean
  currency?: string
  timezone?: string
}

export interface TranslationKey {
  key: string
  value: string
  context?: string
  pluralForms?: string[]
  description?: string
  translatedBy?: string
  lastUpdated?: Date
}

export interface LocalizationConfig {
  defaultLanguage: string
  fallbackLanguage: string
  supportedLanguages: string[]
  autoDetect: boolean
  cacheEnabled: boolean
  cacheTTL: number
  missingKeyBehavior: 'ignore' | 'log' | 'create' | 'throw'
  interpolationEnabled: boolean
}

export class LocalizationManager implements LocalizationPort {
  private config: LocalizationConfig
  private translations: Map<string, Translations> = new Map()
  private currentLanguage: string
  private cache: Map<string, { value: any; expires: number }> = new Map()
  private missingKeys: Map<string, TranslationKey> = new Map()
  
  constructor(config: Partial<LocalizationConfig> = {}) {
    this.config = {
      defaultLanguage: 'es',
      fallbackLanguage: 'es',
      supportedLanguages: ['es', 'en', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'],
      autoDetect: true,
      cacheEnabled: true,
      cacheTTL: 60 * 60 * 1000, // 1 hour
      missingKeyBehavior: 'log',
      interpolationEnabled: true,
      ...config
    }
    
    this.currentLanguage = this.config.defaultLanguage
    
    // Load default translations
    this.loadDefaultTranslations()
  }
  
  async getTranslations(language: string): Promise<Translations> {
    try {
      // Check cache first
      if (this.config.cacheEnabled) {
        const cached = this.cache.get(language)
        if (cached && cached.expires > Date.now()) {
          return cached.value
        }
      }
      
      // Load translations if not available
      if (!this.translations.has(language)) {
        await this.loadTranslations(language)
      }
      
      const translations = this.translations.get(language)!
      
      // Cache the result
      if (this.config.cacheEnabled) {
        this.cache.set(language, {
          value: translations,
          expires: Date.now() + this.config.cacheTTL
        })
      }
      
      return translations
    } catch (error) {
      throw new Error(`Failed to get translations for ${language}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async getCurrentLang(): Promise<string> {
    return this.currentLanguage
  }
  
  async setLang(language: string): Promise<void> {
    if (!this.config.supportedLanguages.includes(language)) {
      throw new Error(`Language not supported: ${language}`)
    }
    
    console.log(`Setting language to ${language}`)
    this.currentLanguage = language
    
    // Clear cache for the new language
    if (this.config.cacheEnabled) {
      this.cache.delete(language)
    }
    
    // Emit event
    this.emit('languageChanged', { language })
  }
  
  async detectLanguage(text: string): Promise<string> {
    // Simple language detection based on common patterns
    // In a real implementation, this would use a proper language detection library
    
    const patterns = {
      es: /[áéíóúüñ¿¡]/g,
      en: /[a-zA-Z]/g,
      fr: /[àâäçéèêëïîôùûüÿñ]/g,
      de: /[äöüß]/g,
      it: /[àèéìòù]/g,
      pt: [/[áàâãéêíóôõúü]/g],
      zh: /[\u4e00-\u9fff]/g,
      ja: /[\u3040-\u309f\u30a0-\u30ff]/g,
      ko: /[\uac00-\ud7af]/g
    }
    
    let maxScore = 0
    let detectedLang = this.config.fallbackLanguage
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (this.config.supportedLanguages.includes(lang)) {
        const matches = text.match(pattern)
        const score = matches ? matches.length : 0
        
        if (score > maxScore) {
          maxScore = score
          detectedLang = lang
        }
      }
    }
    
    return detectedLang
  }
  
  async translate(key: string, language?: string, variables?: Record<string, any>): Promise<string> {
    const lang = language || this.currentLanguage
    
    try {
      const translations = await this.getTranslations(lang)
      
      if (!translations.messages[key]) {
        // Handle missing key
        await this.handleMissingKey(key, lang)
        
        // Try fallback language
        if (lang !== this.config.fallbackLanguage) {
          return await this.translate(key, this.config.fallbackLanguage, variables)
        }
        
        return key // Return the key itself if not found
      }
      
      let translation = translations.messages[key]
      
      // Handle variables/interpolation
      if (this.config.interpolationEnabled && variables && typeof translation === 'string') {
        translation = this.interpolate(translation, variables)
      }
      
      return translation
    } catch (error) {
      console.error(`Translation error for key "${key}" in language "${lang}":`, error)
      return key
    }
  }
  
  async translatePlural(key: string, count: number, language?: string, variables?: Record<string, any>): Promise<string> {
    const lang = language || this.currentLanguage
    
    try {
      const translations = await this.getTranslations(lang)
      
      if (!translations.messages[key]) {
        // Handle missing key
        await this.handleMissingKey(key, lang)
        return key
      }
      
      const translation = translations.messages[key]
      
      // Handle plural forms
      if (typeof translation === 'object' && translation.plural) {
        const pluralForm = this.getPluralForm(count, lang)
        let result = translation.plural[pluralForm] || translation.plural.other || translation.default
        
        // Handle variables/interpolation
        if (this.config.interpolationEnabled && variables) {
          result = this.interpolate(result, { ...variables, count })
        }
        
        return result
      }
      
      // Fallback to regular translation
      return await this.translate(key, lang, { ...variables, count })
    } catch (error) {
      console.error(`Plural translation error for key "${key}" in language "${lang}":`, error)
      return key
    }
  }
  
  async addTranslation(key: string, value: string, language: string, options: {
    context?: string
    description?: string
    pluralForms?: string[]
  } = {}): Promise<void> {
    if (!this.config.supportedLanguages.includes(language)) {
      throw new Error(`Language not supported: ${language}`)
    }
    
    const translations = await this.getTranslations(language)
    
    translations.messages[key] = {
      key,
      value,
      context: options.context,
      pluralForms: options.pluralForms,
      description: options.description,
      lastUpdated: new Date()
    }
    
    // Clear cache
    if (this.config.cacheEnabled) {
      this.cache.delete(language)
    }
    
    console.log(`Added translation for key "${key}" in language "${language}"`)
  }
  
  async updateTranslation(key: string, value: string, language: string): Promise<void> {
    if (!this.config.supportedLanguages.includes(language)) {
      throw new Error(`Language not supported: ${language}`)
    }
    
    const translations = await this.getTranslations(language)
    
    if (!translations.messages[key]) {
      throw new Error(`Translation key not found: ${key}`)
    }
    
    translations.messages[key].value = value
    translations.messages[key].lastUpdated = new Date()
    
    // Clear cache
    if (this.config.cacheEnabled) {
      this.cache.delete(language)
    }
    
    console.log(`Updated translation for key "${key}" in language "${language}"`)
  }
  
  async deleteTranslation(key: string, language: string): Promise<void> {
    if (!this.config.supportedLanguages.includes(language)) {
      throw new Error(`Language not supported: ${language}`)
    }
    
    const translations = await this.getTranslations(language)
    
    if (!translations.messages[key]) {
      throw new Error(`Translation key not found: ${key}`)
    }
    
    delete translations.messages[key]
    
    // Clear cache
    if (this.config.cacheEnabled) {
      this.cache.delete(language)
    }
    
    console.log(`Deleted translation for key "${key}" in language "${language}"`)
  }
  
  async exportTranslations(language: string): Promise<string> {
    if (!this.config.supportedLanguages.includes(language)) {
      throw new Error(`Language not supported: ${language}`)
    }
    
    const translations = await this.getTranslations(language)
    const exportData = {
      language,
      exportedAt: new Date().toISOString(),
      messages: translations.messages,
      meta: translations.meta
    }
    
    return JSON.stringify(exportData, null, 2)
  }
  
  async importTranslations(language: string, importData: string): Promise<void> {
    if (!this.config.supportedLanguages.includes(language)) {
      throw new Error(`Language not supported: ${language}`)
    }
    
    try {
      const data = JSON.parse(importData)
      
      const translations: Translations = {
        messages: data.messages || {},
        meta: {
          language: data.language || language,
          version: data.meta?.version || '1.0.0',
          lastUpdated: new Date().toISOString(),
          translator: 'imported',
          reviewed: false
        }
      }
      
      this.translations.set(language, translations)
      
      // Clear cache
      if (this.config.cacheEnabled) {
        this.cache.delete(language)
      }
      
      console.log(`Imported translations for language "${language}"`)
    } catch (error) {
      throw new Error(`Failed to import translations: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  async getSupportedLanguages(): Promise<Language[]> {
    return this.config.supportedLanguages.map(lang => ({
      code: lang,
      name: this.getLanguageName(lang),
      nativeName: this.getLanguageNativeName(lang),
      flag: this.getLanguageFlag(lang),
      rtl: this.isRTL(lang)
    }))
  }
  
  private async loadTranslations(language: string): Promise<void> {
    // In a real implementation, this would load from files or database
    const translations: Translations = {
      messages: this.getDefaultMessages(language),
      meta: {
        language,
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        translator: 'system',
        reviewed: false
      }
    }
    
    this.translations.set(language, translations)
  }
  
  private loadDefaultTranslations(): void {
    // Load default translations for all supported languages
    for (const language of this.config.supportedLanguages) {
      this.loadTranslations(language)
    }
  }
  
  private getDefaultMessages(language: string): Record<string, any> {
    // Basic default messages
    const messages: Record<string, any> = {
      // Common
      loading: 'Cargando...',
      error: 'Error',
      success: 'Éxito',
      cancel: 'Cancelar',
      save: 'Guardar',
      delete: 'Eliminar',
      edit: 'Editar',
      search: 'Buscar',
      
      // Auth
      login: 'Iniciar sesión',
      logout: 'Cerrar sesión',
      code: 'Código',
      invalidCode: 'Código inválido',
      expiredCode: 'Código expirado',
      sessionExpired: 'Sesión expirada',
      
      // Playlist
      playlist: 'Lista de reproducción',
      addSong: 'Añadir canción',
      removeSong: 'Eliminar canción',
      nextSong: 'Siguiente canción',
      previousSong: 'Canción anterior',
      play: 'Reproducir',
      pause: 'Pausar',
      stop: 'Detener',
      
      // Karaoke
      karaoke: 'Karaoke',
      download: 'Descargar',
      convert: 'Convertir',
      processing: 'Procesando...',
      completed: 'Completado',
      failed: 'Fallido',
      retry: 'Reintentar',
      
      // Navigation
      home: 'Inicio',
      settings: 'Configuración',
      help: 'Ayuda',
      about: 'Acerca de'
    }
    
    // Language-specific overrides
    switch (language) {
      case 'en':
        messages.loading = 'Loading...'
        messages.error = 'Error'
        messages.success = 'Success'
        messages.cancel = 'Cancel'
        messages.save = 'Save'
        messages.delete = 'Delete'
        messages.edit = 'Edit'
        messages.search = 'Search'
        // ... more English translations
        break
        
      case 'fr':
        messages.loading = 'Chargement...'
        messages.error = 'Erreur'
        messages.success = 'Succès'
        messages.cancel = 'Annuler'
        messages.save = 'Enregistrer'
        messages.delete = 'Supprimer'
        messages.edit = 'Modifier'
        messages.search = 'Rechercher'
        // ... more French translations
        break
        
      // Add more languages as needed
    }
    
    return messages
  }
  
  private getLanguageName(code: string): string {
    const names: Record<string, string> = {
      es: 'Spanish',
      en: 'English',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean'
    }
    
    return names[code] || code
  }
  
  private getLanguageNativeName(code: string): string {
    const names: Record<string, string> = {
      es: 'Español',
      en: 'English',
      fr: 'Français',
      de: 'Deutsch',
      it: 'Italiano',
      pt: 'Português',
      zh: '中文',
      ja: '日本語',
      ko: '한국어'
    }
    
    return names[code] || code
  }
  
  private getLanguageFlag(code: string): string {
    const flags: Record<string, string> = {
      es: '🇪🇸',
      en: '🇬🇧',
      fr: '🇫🇷',
      de: '🇩🇪',
      it: '🇮🇹',
      pt: '🇵🇹',
      zh: '🇨🇳',
      ja: '🇯🇵',
      ko: '🇰🇷'
    }
    
    return flags[code] || '🌐'
  }
  
  private isRTL(code: string): boolean {
    return ['ar', 'he', 'fa'].includes(code)
  }
  
  private interpolate(template: string, variables: Record<string, any>): string {
    if (!this.config.interpolationEnabled) {
      return template
    }
    
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match
    })
  }
  
  private getPluralForm(count: number, language: string): string {
    // Simplified plural rules
    switch (language) {
      case 'es':
      case 'it':
      case 'fr':
        return count === 1 ? 'one' : 'other'
        
      case 'en':
      case 'de':
        return count === 1 ? 'one' : 'other'
        
      case 'ru':
        return count % 10 === 1 && count % 100 !== 11 ? 'one' :
               count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'few' : 'other'
        
      default:
        return count === 1 ? 'one' : 'other'
    }
  }
  
  private async handleMissingKey(key: string, language: string): Promise<void> {
    switch (this.config.missingKeyBehavior) {
      case 'log':
        console.warn(`Missing translation key: ${key} in language: ${language}`)
        break
        
      case 'create':
        await this.addTranslation(key, key, language)
        break
        
      case 'throw':
        throw new Error(`Missing translation key: ${key} in language: ${language}`)
        
      case 'ignore':
        // Do nothing
        break
    }
  }
  
  // EventEmitter methods
  private emit(event: string, data: any): void {
    // In a real implementation, this would use EventEmitter
    console.log(`Event emitted: ${event}`, data)
  }
}