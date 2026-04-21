import { UserSession, AuthResult, UserRole, DurationType } from '@/domain/entities'
import { AuthCodePort } from '@/ports'

export interface AuthManagerPort {
  validateMasterCode(code: string): Promise<AuthResult>
  validateVisitCode(code: string): Promise<AuthResult>
  createVisitSession(code: string): Promise<UserSession>
  createMasterSession(): Promise<UserSession>
  refreshSession(sessionId: string): Promise<void>
  invalidateSession(sessionId: string): Promise<void>
}

export interface AuthConfig {
  sessionTimeout: number // milliseconds
  maxConcurrentSessions: number
  codeExpiration: {
    daily: number
    hourly: number
    fixed: number
    once: number
  }
  maxCodeUses: number
  allowedIPAddresses?: string[]
  bruteForceProtection: {
    maxAttempts: number
    windowMs: number
    cooldownMs: number
  }
}

export interface AuthStats {
  totalSessions: number
  activeSessions: number
  expiredSessions: number
  invalidAttempts: number
  codesGenerated: number
  sessionsByRole: Array<{
    role: UserRole
    count: number
  }>
}

export class AuthManager implements AuthManagerPort {
  private sessions: Map<string, UserSession> = new Map()
  private codeStore: Map<string, {
    code: string
    type: 'master' | 'visit'
    uses: number
    expiresAt?: Date
    maxUses?: number
    createdAt: Date
    createdBy?: string
    description?: string
    userId?: string
    ipAddress?: string
  }> = new Map()
  
  private failedAttempts: Map<string, { attempts: number; lastAttempt: Date }> = new Map()
  private config: AuthConfig
  private stats: AuthStats = {
    totalSessions: 0,
    activeSessions: 0,
    expiredSessions: 0,
    invalidAttempts: 0,
    codesGenerated: 0,
    sessionsByRole: []
  }

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = {
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      maxConcurrentSessions: 100,
      codeExpiration: {
        daily: 24 * 60 * 60 * 1000, // 24 hours
        hourly: 60 * 60 * 1000, // 1 hour
        fixed: 7 * 24 * 60 * 60 * 1000, // 7 days
        once: 0 // immediate expiration after use
      },
      maxCodeUses: 10,
      bruteForceProtection: {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
        cooldownMs: 5 * 60 * 1000 // 5 minutes
      },
      ...config
    }
  }

  async validateMasterCode(code: string): Promise<AuthResult> {
    // Check for brute force
    const bruteForceResult = this.checkBruteForce(code)
    if (bruteForceResult !== AuthResult.SUCCESS) {
      return bruteForceResult
    }

    const codeData = this.codeStore.get(code)
    if (!codeData) {
      this.recordFailedAttempt(code)
      return AuthResult.INVALID_CODE
    }

    if (codeData.type !== 'master') {
      this.recordFailedAttempt(code)
      return AuthResult.INVALID_CODE
    }

    if (codeData.expiresAt && codeData.expiresAt < new Date()) {
      this.recordFailedAttempt(code)
      return AuthResult.EXPIRED_CODE
    }

    if (codeData.maxUses && codeData.uses >= codeData.maxUses) {
      this.codeStore.delete(code)
      this.recordFailedAttempt(code)
      return AuthResult.USED_CODE
    }

    // Mark code as used
    codeData.uses++
    this.codeStore.set(code, codeData)

    return AuthResult.SUCCESS
  }

  async validateVisitCode(code: string): Promise<AuthResult> {
    // Check for brute force
    const bruteForceResult = this.checkBruteForce(code)
    if (bruteForceResult !== AuthResult.SUCCESS) {
      return bruteForceResult
    }

    const codeData = this.codeStore.get(code)
    if (!codeData) {
      this.recordFailedAttempt(code)
      return AuthResult.INVALID_CODE
    }

    if (codeData.type !== 'visit') {
      this.recordFailedAttempt(code)
      return AuthResult.INVALID_CODE
    }

    if (codeData.expiresAt && codeData.expiresAt < new Date()) {
      this.recordFailedAttempt(code)
      return AuthResult.EXPIRED_CODE
    }

    if (codeData.maxUses && codeData.uses >= codeData.maxUses) {
      this.codeStore.delete(code)
      this.recordFailedAttempt(code)
      return AuthResult.USED_CODE
    }

    // Mark code as used
    codeData.uses++
    this.codeStore.set(code, codeData)

    return AuthResult.SUCCESS
  }

  async createVisitSession(code: string, ipAddress?: string): Promise<UserSession> {
    const validationResult = await this.validateVisitCode(code)
    if (validationResult !== AuthResult.SUCCESS) {
      throw new Error(`Invalid code: ${validationResult}`)
    }

    // Check concurrent sessions limit
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error('Maximum concurrent sessions reached')
    }

    const codeData = this.codeStore.get(code)!
    const sessionId = this.generateSessionId()
    
    const session: UserSession = {
      id: sessionId,
      role: UserRole.VISITOR,
      code,
      expiresAt: codeData.expiresAt,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      ipAddress,
      activity: [{
        action: 'session_created',
        timestamp: new Date(),
        details: { code, ipAddress }
      }]
    }

    this.sessions.set(sessionId, session)
    this.updateStats()

    // Clean up used codes
    if (codeData.maxUses && codeData.uses >= codeData.maxUses) {
      this.codeStore.delete(code)
    }

    return session
  }

  async createMasterSession(options?: { ipAddress?: string }): Promise<UserSession> {
    // Find a valid master code
    const masterCodes = Array.from(this.codeStore.values()).filter(
      code => code.type === 'master' && 
              (!code.expiresAt || code.expiresAt > new Date()) &&
              (!code.maxUses || code.uses < code.maxUses)
    )

    if (masterCodes.length === 0) {
      throw new Error('No valid master codes available')
    }

    // Use the first available master code
    const masterCode = masterCodes[0]
    const sessionId = this.generateSessionId()

    const session: UserSession = {
      id: sessionId,
      role: UserRole.ADMIN,
      code: masterCode.code,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      ipAddress: options?.ipAddress,
      activity: [{
        action: 'admin_session_created',
        timestamp: new Date(),
        details: { ipAddress }
      }]
    }

    this.sessions.set(sessionId, session)
    this.updateStats()

    return session
  }

  async refreshSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      throw new Error('Session expired')
    }

    // Update last used timestamp
    session.lastUsedAt = new Date()
    session.activity.push({
      action: 'session_refreshed',
      timestamp: new Date()
    })

    this.sessions.set(sessionId, session)
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    // Add to activity
    session.activity.push({
      action: 'session_invalidated',
      timestamp: new Date()
    })

    this.sessions.delete(sessionId)
    this.updateStats()
  }

  async generateVisitCode(
    duration: DurationType,
    options: {
      userId?: string
      maxUses?: number
      expiresAt?: Date
      ipAddress?: string
      description?: string
    } = {}
  ): Promise<string> {
    const code = this.generateCode()
    const expiration = this.calculateExpiration(duration, options.expiresAt)
    const maxUses = options.maxUses ?? this.config.maxCodeUses

    const codeData = {
      code,
      type: 'visit' as const,
      uses: 0,
      expiresAt,
      maxUses,
      createdAt: new Date(),
      userId: options.userId,
      ipAddress: options.ipAddress,
      description: options.description
    }

    this.codeStore.set(code, codeData)
    this.stats.codesGenerated++
    this.updateStats()

    return code
  }

  async generateMasterCode(options: {
    description?: string
    createdBy?: string
    expiresAt?: Date
  } = {}): Promise<string> {
    const code = this.generateCode()
    const maxUses = options.description?.includes('single-use') ? 1 : undefined

    const codeData = {
      code,
      type: 'master' as const,
      uses: 0,
      expiresAt: options.expiresAt,
      maxUses,
      createdAt: new Date(),
      createdBy: options.createdBy,
      description: options.description
    }

    this.codeStore.set(code, codeData)
    this.stats.codesGenerated++
    this.updateStats()

    return code
  }

  async isCodeExpired(code: string): Promise<boolean> {
    const codeData = this.codeStore.get(code)
    if (!codeData) {
      return true
    }

    if (codeData.expiresAt) {
      return codeData.expiresAt < new Date()
    }

    if (codeData.maxUses && codeData.uses >= codeData.maxUses) {
      return true
    }

    return false
  }

  async invalidateCode(code: string, reason?: string): Promise<void> {
    const codeData = this.codeStore.get(code)
    if (!codeData) {
      throw new Error('Code not found')
    }

    // Add usage record if not already maxed out
    if (!codeData.maxUses || codeData.uses < codeData.maxUses) {
      codeData.uses = codeData.maxUses || codeData.uses + 1
      this.codeStore.set(code, codeData)
    }

    this.codeStore.delete(code)
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      await this.invalidateSession(sessionId)
      return null
    }

    return session
  }

  async getAllSessions(): Promise<UserSession[]> {
    return Array.from(this.sessions.values())
  }

  async getSessionsByRole(role: UserRole): Promise<UserSession[]> {
    return Array.from(this.sessions.values()).filter(session => session.role === role)
  }

  private generateCode(): string {
    // Generate 4-digit numeric code
    return Math.floor(1000 + Math.random() * 9000).toString()
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private calculateExpiration(duration: DurationType, customExpiresAt?: Date): Date | undefined {
    if (customExpiresAt) {
      return customExpiresAt
    }

    const now = new Date()
    switch (duration) {
      case 'daily':
        return new Date(now.getTime() + this.config.codeExpiration.daily)
      case 'hourly':
        return new Date(now.getTime() + this.config.codeExpiration.hourly)
      case 'fixed':
        return new Date(now.getTime() + this.config.codeExpiration.fixed)
      case 'once':
        return new Date(now.getTime() - 1) // Immediate expiration
      default:
        return new Date(now.getTime() + this.config.codeExpiration.daily)
    }
  }

  private checkBruteForce(code: string): AuthResult {
    const attemptData = this.failedAttempts.get(code)
    if (!attemptData) {
      return AuthResult.SUCCESS
    }

    // Check if window has passed
    const timeSinceLastAttempt = Date.now() - attemptData.lastAttempt.getTime()
    if (timeSinceLastAttempt > this.config.bruteForceProtection.windowMs) {
      this.failedAttempts.delete(code)
      return AuthResult.SUCCESS
    }

    // Check if max attempts exceeded
    if (attemptData.attempts >= this.config.bruteForceProtection.maxAttempts) {
      const cooldownTime = this.config.bruteForceProtection.cooldownMs - timeSinceLastAttempt
      if (cooldownTime > 0) {
        return AuthResult.INVALID_CODE
      }
      // Reset after cooldown
      this.failedAttempts.delete(code)
    }

    return AuthResult.SUCCESS
  }

  private recordFailedAttempt(code: string): void {
    const attemptData = this.failedAttempts.get(code) || { attempts: 0, lastAttempt: new Date() }
    attemptData.attempts++
    attemptData.lastAttempt = new Date()
    this.failedAttempts.set(code, attemptData)
    this.stats.invalidAttempts++
    this.updateStats()
  }

  private updateStats(): void {
    this.stats.totalSessions = this.sessions.size
    this.stats.activeSessions = Array.from(this.sessions.values()).filter(
      session => !session.expiresAt || session.expiresAt > new Date()
    ).length
    this.stats.expiredSessions = this.stats.totalSessions - this.stats.activeSessions

    const sessionsByRole = new Map<UserRole, number>()
    sessionsByRole.set(UserRole.ADMIN, 0)
    sessionsByRole.set(UserRole.VISITOR, 0)

    Array.from(this.sessions.values()).forEach(session => {
      sessionsByRole.set(session.role, (sessionsByRole.get(session.role) || 0) + 1)
    })

    this.stats.sessionsByRole = Array.from(sessionsByRole.entries()).map(([role, count]) => ({
      role,
      count
    }))
  }

  async getStats(): Promise<AuthStats> {
    return { ...this.stats }
  }

  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date()
    let cleanupCount = 0

    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt && session.expiresAt < now) {
        await this.invalidateSession(sessionId)
        cleanupCount++
      }
    }

    return cleanupCount
  }

  async cleanupExpiredCodes(): Promise<number> {
    const now = new Date()
    let cleanupCount = 0

    for (const [code, codeData] of this.codeStore) {
      if ((codeData.expiresAt && codeData.expiresAt < now) ||
          (codeData.maxUses && codeData.uses >= codeData.maxUses)) {
        this.codeStore.delete(code)
        cleanupCount++
      }
    }

    return cleanupCount
  }

  async exportAuditLog(): Promise<Array<{
    timestamp: Date
    action: string
    details: Record<string, any>
    sessionId?: string
    ipAddress?: string
  }>> {
    const logs: Array<{
      timestamp: Date
      action: string
      details: Record<string, any>
      sessionId?: string
      ipAddress?: string
    }> = []

    // Session logs
    Array.from(this.sessions.values()).forEach(session => {
      session.activity.forEach(activity => {
        logs.push({
          timestamp: activity.timestamp,
          action: activity.action,
          details: activity.details || {},
          sessionId: session.id,
          ipAddress: session.ipAddress
        })
      })
    })

    // Sort by timestamp
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return logs
  }
}