/**
 * AuthCode SQLite Adapter — concrete implementation of AuthCodePort
 *
 * All auth codes and sessions are persisted in SQLite via better-sqlite3.
 * Codes are 4-digit numeric strings (maestro/visita model).
 */
import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3'
import path from 'node:path'
import crypto from 'node:crypto'
import type { AuthCodePort, DurationType } from '@/ports/auth-code.port'
import { AuthResult, UserRole, type UserSession } from '@/domain/entities'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export interface AuthCodeConfig {
  dbPath?: string
  codeLength?: number
  maxCodeUses?: number
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
interface CodeRow {
  code: string
  type: 'master' | 'visit'
  uses: number
  max_uses: number | null
  expires_at: string | null
  created_at: string
  created_by: string | null
  description: string | null
  user_id: string | null
  ip_address: string | null
  last_used_at: string | null
}

interface SessionRow {
  id: string
  role: string
  code: string
  expires_at: string | null
  created_at: string
  last_used_at: string
  ip_address: string | null
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export class AuthCodeAdapter implements AuthCodePort {
  private db!: DatabaseType
  private stmts!: {
    insertCode: Statement
    getCode: Statement
    updateCodeUses: Statement
    deleteCode: Statement
    insertSession: Statement
    getSession: Statement
    updateSessionLastUsed: Statement
    deleteSession: Statement
  }

  private readonly codeLength: number
  private readonly defaultMaxUses: number

  constructor(config: AuthCodeConfig = {}) {
    const dbPath = config.dbPath ?? path.resolve('data', 'orion-auth.db')
    this.codeLength = config.codeLength ?? 4
    this.defaultMaxUses = config.maxCodeUses ?? 10
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.createTables()
    this.prepareStatements()
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------
  close(): void {
    this.db.close()
  }

  // -----------------------------------------------------------------------
  // AuthCodePort — Validation
  // -----------------------------------------------------------------------
  async validateMasterCode(code: string): Promise<AuthResult> {
    return this.validateCode(code, 'master')
  }

  async validateVisitCode(code: string): Promise<AuthResult> {
    return this.validateCode(code, 'visit')
  }

  // -----------------------------------------------------------------------
  // AuthCodePort — Code generation
  // -----------------------------------------------------------------------
  async generateVisitCode(
    duration: DurationType,
    options?: {
      userId?: string
      maxUses?: number
      expiresAt?: Date
      ipAddress?: string
    },
  ): Promise<string> {
    const code = this.freshCode()
    const expiresAt = options?.expiresAt?.toISOString() ?? this.calcExpiry(duration)
    const maxUses = options?.maxUses ?? this.defaultMaxUses

    this.stmts.insertCode.run(
      code,
      'visit',
      0,
      maxUses,
      expiresAt,
      new Date().toISOString(),
      null,
      null,
      options?.userId ?? null,
      options?.ipAddress ?? null,
      null,
    )
    return code
  }

  async generateMasterCode(options?: {
    description?: string
    createdBy?: string
    expiresAt?: Date
  }): Promise<string> {
    const code = this.freshCode()
    this.stmts.insertCode.run(
      code,
      'master',
      0,
      null, // master codes don't expire by usage by default
      options?.expiresAt?.toISOString() ?? null,
      new Date().toISOString(),
      options?.createdBy ?? null,
      options?.description ?? null,
      null,
      null,
      null,
    )
    return code
  }

  // -----------------------------------------------------------------------
  // AuthCodePort — Refresh / invalidate
  // -----------------------------------------------------------------------
  async refreshVisitCode(currentCode: string, newDuration?: DurationType): Promise<string> {
    const row = this.stmts.getCode.get(currentCode) as CodeRow | undefined
    if (!row) throw new Error(`Code not found: ${currentCode}`)

    const newCode = this.freshCode()
    const duration: DurationType = newDuration ?? 'daily'
    const expiresAt = this.calcExpiry(duration)

    this.stmts.deleteCode.run(currentCode)
    this.stmts.insertCode.run(
      newCode,
      row.type,
      0,
      row.max_uses,
      expiresAt,
      new Date().toISOString(),
      row.created_by,
      row.description,
      row.user_id,
      row.ip_address,
      null,
    )
    return newCode
  }

  async isCodeExpired(code: string): Promise<boolean> {
    const row = this.stmts.getCode.get(code) as CodeRow | undefined
    if (!row) return true
    if (row.expires_at && new Date(row.expires_at) < new Date()) return true
    if (row.max_uses != null && row.uses >= row.max_uses) return true
    return false
  }

  async invalidateCode(code: string, _reason?: string): Promise<void> {
    this.stmts.deleteCode.run(code)
  }

  async getCodeInfo(code: string): Promise<{
    isValid: boolean
    expiresAt?: Date
    usedAt?: Date
    usageCount: number
  }> {
    const row = this.stmts.getCode.get(code) as CodeRow | undefined
    if (!row) {
      return { isValid: false, usageCount: 0 }
    }
    const expired = (row.expires_at != null && new Date(row.expires_at) < new Date())
      || (row.max_uses != null && row.uses >= row.max_uses)

    return {
      isValid: !expired,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      usedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      usageCount: row.uses,
    }
  }

  // -----------------------------------------------------------------------
  // AuthCodePort — Sessions
  // -----------------------------------------------------------------------
  async createSession(code: string, ipAddress?: string): Promise<UserSession> {
    const row = this.stmts.getCode.get(code) as CodeRow | undefined
    if (!row) throw new Error(`Code not found: ${code}`)

    // Check validity
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      throw new Error('Code expired')
    }
    if (row.max_uses != null && row.uses >= row.max_uses) {
      throw new Error('Code usage limit reached')
    }

    // Increment uses
    this.stmts.updateCodeUses.run(row.uses + 1, new Date().toISOString(), code)

    // Create session
    const sessionId = crypto.randomUUID()
    const now = new Date().toISOString()
    const role = row.type === 'master' ? UserRole.ADMIN : UserRole.VISITOR

    this.stmts.insertSession.run(
      sessionId,
      role,
      code,
      row.expires_at,
      now,
      now,
      ipAddress ?? null,
    )

    return {
      id: sessionId,
      role,
      code,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdAt: new Date(now),
      lastUsedAt: new Date(now),
      ipAddress: ipAddress ?? undefined,
      activity: [{ action: 'session_created', timestamp: new Date() }],
    }
  }

  async refreshSession(sessionId: string): Promise<UserSession> {
    const row = this.stmts.getSession.get(sessionId) as SessionRow | undefined
    if (!row) throw new Error('Session not found')

    const now = new Date().toISOString()
    this.stmts.updateSessionLastUsed.run(now, sessionId)

    return {
      id: row.id,
      role: row.role as UserRole,
      code: row.code,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdAt: new Date(row.created_at),
      lastUsedAt: new Date(now),
      ipAddress: row.ip_address ?? undefined,
      activity: [{ action: 'session_refreshed', timestamp: new Date() }],
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const result = this.stmts.deleteSession.run(sessionId)
    if (result.changes === 0) throw new Error('Session not found')
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------
  private validateCode(code: string, expectedType: 'master' | 'visit'): AuthResult {
    const row = this.stmts.getCode.get(code) as CodeRow | undefined
    if (!row) return AuthResult.INVALID_CODE
    if (row.type !== expectedType) return AuthResult.INVALID_CODE
    if (row.expires_at && new Date(row.expires_at) < new Date()) return AuthResult.EXPIRED_CODE
    if (row.max_uses != null && row.uses >= row.max_uses) return AuthResult.USED_CODE

    // Increment usage on successful validation (matching AuthManager behavior)
    this.stmts.updateCodeUses.run(row.uses + 1, new Date().toISOString(), code)
    return AuthResult.SUCCESS
  }

  /** Generate a random numeric code of the configured length. */
  private freshCode(): string {
    const max = Math.pow(10, this.codeLength)
    return Math.floor(Math.random() * max).toString().padStart(this.codeLength, '0')
  }

  private calcExpiry(duration: DurationType): string | null {
    const now = Date.now()
    switch (duration) {
      case 'hourly': return new Date(now + 60 * 60 * 1000).toISOString()
      case 'daily': return new Date(now + 24 * 60 * 60 * 1000).toISOString()
      case 'fixed': return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
      case 'once': return new Date(now - 1).toISOString() // already expired = single use
      default: return new Date(now + 24 * 60 * 60 * 1000).toISOString()
    }
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_codes (
        code         TEXT PRIMARY KEY,
        type         TEXT    NOT NULL CHECK(type IN ('master','visit')),
        uses         INTEGER NOT NULL DEFAULT 0,
        max_uses     INTEGER,
        expires_at   TEXT,
        created_at   TEXT    NOT NULL,
        created_by   TEXT,
        description  TEXT,
        user_id      TEXT,
        ip_address   TEXT,
        last_used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id           TEXT PRIMARY KEY,
        role         TEXT    NOT NULL,
        code         TEXT    NOT NULL,
        expires_at   TEXT,
        created_at   TEXT    NOT NULL,
        last_used_at TEXT    NOT NULL,
        ip_address   TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ac_type       ON auth_codes(type);
      CREATE INDEX IF NOT EXISTS idx_ac_expires_at ON auth_codes(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_code  ON sessions(code);
    `)
  }

  private prepareStatements(): void {
    this.stmts = {
      insertCode: this.db.prepare(`
        INSERT INTO auth_codes (code, type, uses, max_uses, expires_at, created_at, created_by, description, user_id, ip_address, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getCode: this.db.prepare('SELECT * FROM auth_codes WHERE code = ?'),
      updateCodeUses: this.db.prepare('UPDATE auth_codes SET uses = ?, last_used_at = ? WHERE code = ?'),
      deleteCode: this.db.prepare('DELETE FROM auth_codes WHERE code = ?'),

      insertSession: this.db.prepare(`
        INSERT INTO sessions (id, role, code, expires_at, created_at, last_used_at, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      getSession: this.db.prepare('SELECT * FROM sessions WHERE id = ?'),
      updateSessionLastUsed: this.db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?'),
      deleteSession: this.db.prepare('DELETE FROM sessions WHERE id = ?'),
    }
  }
}
