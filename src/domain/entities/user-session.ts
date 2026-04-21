import { UserRole } from './index'

export interface UserSession {
  id: string
  role: UserRole
  code: string
  expiresAt?: Date
  createdAt: Date
  lastUsedAt: Date
  ipAddress?: string
  userAgent?: string
  deviceInfo?: {
    type: 'mobile' | 'tablet' | 'desktop' | 'tv' | 'other'
    os?: string
    browser?: string
    deviceName?: string
  }
  activity: Array<{
    action: string
    timestamp: Date
    details?: Record<string, any>
    ipAddress?: string
  }>
  preferences?: {
    theme: 'light' | 'dark' | 'auto'
    language: string
    volume: number
    defaultQuality: 'low' | 'medium' | 'high'
    autoPlay: boolean
    showLyrics: boolean
    lyricsFontSize: number
    lyricsStyle: 'simple' | 'karaoke' | 'highlight'
  }
  stats?: {
    songsRequested: number
    songsPlayed: number
    timeSpent: number // seconds
    favoriteGenres: Array<{
      genre: string
      count: number
    }>
    lastActiveAt: Date
  }
}

export interface SessionCreateOptions {
  code: string
  role: UserRole
  ipAddress?: string
  userAgent?: string
  deviceInfo?: UserSession['deviceInfo']
}

export interface SessionUpdateOptions {
  preferences?: Partial<UserSession['preferences']>
}

export interface SessionStats {
  activeSessions: number
  totalSessions: number
  averageSessionDuration: number
  mostActiveRoles: Array<{
    role: UserRole
    count: number
    percentage: number
  }>
  recentActivity: Array<{
    sessionId: string
    action: string
    timestamp: Date
  }>
}

export interface SessionActivity {
  action: string
  timestamp: Date
  details?: Record<string, any>
  ipAddress?: string
}

export interface SessionToken {
  sessionId: string
  token: string
  expiresAt: Date
  createdAt: Date
}