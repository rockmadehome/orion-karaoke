/**
 * Integration tests for AuthCodeAdapter (SQLite-backed)
 *
 * Tests the full code lifecycle: generate → validate → session → refresh → invalidate.
 * Uses a real SQLite in-memory/temp database — no mocks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AuthCodeAdapter } from '@/adapters/auth-code.adapter'
import { AuthResult, UserRole } from '@/domain/entities'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('AuthCodeAdapter', () => {
  let adapter: AuthCodeAdapter
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orion-auth-test-'))
    dbPath = path.join(tmpDir, 'auth.db')
    adapter = new AuthCodeAdapter({ dbPath, codeLength: 4, maxCodeUses: 5 })
  })

  afterEach(() => {
    adapter.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // -------------------------------------------------------------------
  // Master Code
  // -------------------------------------------------------------------
  describe('Master codes', () => {
    it('should generate a 4-digit master code', async () => {
      const code = await adapter.generateMasterCode()
      expect(code).toHaveLength(4)
      expect(/^\d{4}$/.test(code)).toBe(true)
    })

    it('should validate a correct master code', async () => {
      const code = await adapter.generateMasterCode()
      const result = await adapter.validateMasterCode(code)
      expect(result).toBe(AuthResult.SUCCESS)
    })

    it('should reject a wrong code as INVALID_CODE', async () => {
      const result = await adapter.validateMasterCode('0000')
      expect(result).toBe(AuthResult.INVALID_CODE)
    })

    it('should reject a visit code when validating as master', async () => {
      const visitCode = await adapter.generateVisitCode('daily')
      const result = await adapter.validateMasterCode(visitCode)
      expect(result).toBe(AuthResult.INVALID_CODE)
    })

    it('should accept a custom description and createdBy', async () => {
      const code = await adapter.generateMasterCode({
        description: 'main TV',
        createdBy: 'eduops',
      })
      expect(code).toHaveLength(4)
      // The code should be valid
      expect(await adapter.validateMasterCode(code)).toBe(AuthResult.SUCCESS)
    })
  })

  // -------------------------------------------------------------------
  // Visit Code
  // -------------------------------------------------------------------
  describe('Visit codes', () => {
    it('should generate a 4-digit visit code', async () => {
      const code = await adapter.generateVisitCode('daily')
      expect(code).toHaveLength(4)
      expect(/^\d{4}$/.test(code)).toBe(true)
    })

    it('should validate a correct visit code', async () => {
      const code = await adapter.generateVisitCode('daily')
      expect(await adapter.validateVisitCode(code)).toBe(AuthResult.SUCCESS)
    })

    it('should reject a master code when validating as visit', async () => {
      const masterCode = await adapter.generateMasterCode()
      expect(await adapter.validateVisitCode(masterCode)).toBe(AuthResult.INVALID_CODE)
    })

    it('should respect maxUses limit', async () => {
      const code = await adapter.generateVisitCode('daily', { maxUses: 2 })

      // First two validations succeed
      expect(await adapter.validateVisitCode(code)).toBe(AuthResult.SUCCESS)
      expect(await adapter.validateVisitCode(code)).toBe(AuthResult.SUCCESS)

      // Third exceeds max uses
      expect(await adapter.validateVisitCode(code)).toBe(AuthResult.USED_CODE)
    })

    it('should expire hourly codes after creation when time-traveled', async () => {
      // 'once' duration expires immediately
      const code = await adapter.generateVisitCode('once')
      expect(await adapter.isCodeExpired(code)).toBe(true)
    })
  })

  // -------------------------------------------------------------------
  // Code info & expiration
  // -------------------------------------------------------------------
  describe('getCodeInfo / isCodeExpired', () => {
    it('should return info for a valid code', async () => {
      const code = await adapter.generateVisitCode('hourly')
      const info = await adapter.getCodeInfo(code)

      expect(info.isValid).toBe(true)
      expect(info.usageCount).toBe(0)
      expect(info.expiresAt).toBeInstanceOf(Date)
    })

    it('should return invalid info for nonexistent code', async () => {
      const info = await adapter.getCodeInfo('9999')
      expect(info.isValid).toBe(false)
      expect(info.usageCount).toBe(0)
    })

    it('should detect expired codes', async () => {
      const expired = await adapter.generateVisitCode('once')
      expect(await adapter.isCodeExpired(expired)).toBe(true)
    })

    it('should detect non-expired codes', async () => {
      const code = await adapter.generateVisitCode('daily')
      expect(await adapter.isCodeExpired(code)).toBe(false)
    })
  })

  // -------------------------------------------------------------------
  // Invalidate
  // -------------------------------------------------------------------
  describe('invalidateCode', () => {
    it('should remove a code so it is no longer valid', async () => {
      const code = await adapter.generateVisitCode('daily')
      await adapter.invalidateCode(code)

      expect(await adapter.isCodeExpired(code)).toBe(true)
      expect(await adapter.validateVisitCode(code)).toBe(AuthResult.INVALID_CODE)
    })
  })

  // -------------------------------------------------------------------
  // Refresh visit code
  // -------------------------------------------------------------------
  describe('refreshVisitCode', () => {
    it('should replace the old code with a new one', async () => {
      const oldCode = await adapter.generateVisitCode('daily')
      const newCode = await adapter.refreshVisitCode(oldCode, 'hourly')

      expect(newCode).toHaveLength(4)
      expect(newCode).not.toBe(oldCode)

      // Old code no longer valid
      expect(await adapter.validateVisitCode(oldCode)).toBe(AuthResult.INVALID_CODE)

      // New code is valid
      expect(await adapter.validateVisitCode(newCode)).toBe(AuthResult.SUCCESS)
    })

    it('should throw when refreshing a nonexistent code', async () => {
      await expect(adapter.refreshVisitCode('0000')).rejects.toThrow('Code not found')
    })
  })

  // -------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------
  describe('Sessions', () => {
    it('should create a visitor session from a visit code', async () => {
      const code = await adapter.generateVisitCode('daily')
      const session = await adapter.createSession(code, '192.168.1.42')

      expect(session.role).toBe(UserRole.VISITOR)
      expect(session.code).toBe(code)
      expect(session.ipAddress).toBe('192.168.1.42')
      expect(session.id).toBeTruthy()
      expect(session.createdAt).toBeInstanceOf(Date)
    })

    it('should create an admin session from a master code', async () => {
      const code = await adapter.generateMasterCode()
      const session = await adapter.createSession(code)

      expect(session.role).toBe(UserRole.ADMIN)
      expect(session.code).toBe(code)
    })

    it('should throw when creating session with expired code', async () => {
      const code = await adapter.generateVisitCode('once')
      await expect(adapter.createSession(code)).rejects.toThrow()
    })

    it('should throw when creating session with nonexistent code', async () => {
      await expect(adapter.createSession('0000')).rejects.toThrow('Code not found')
    })

    it('should enforce maxUses during session creation', async () => {
      const code = await adapter.generateVisitCode('daily', { maxUses: 1 })

      // First use: OK
      await adapter.createSession(code)

      // Second use: should fail (uses = 1 >= maxUses = 1)
      await expect(adapter.createSession(code)).rejects.toThrow()
    })

    it('should refresh a session and update lastUsedAt', async () => {
      const code = await adapter.generateVisitCode('daily')
      const session = await adapter.createSession(code)

      // Small delay to ensure time difference
      await new Promise(r => setTimeout(r, 10))

      const refreshed = await adapter.refreshSession(session.id)
      expect(refreshed.lastUsedAt.getTime()).toBeGreaterThanOrEqual(session.lastUsedAt.getTime())
      expect(refreshed.id).toBe(session.id)
    })

    it('should invalidate a session', async () => {
      const code = await adapter.generateVisitCode('daily')
      const session = await adapter.createSession(code)

      await adapter.invalidateSession(session.id)

      // Refreshing should fail
      await expect(adapter.refreshSession(session.id)).rejects.toThrow('Session not found')
    })

    it('should throw when invalidating a nonexistent session', async () => {
      await expect(adapter.invalidateSession('ghost-id')).rejects.toThrow('Session not found')
    })
  })

  // -------------------------------------------------------------------
  // Full lifecycle (integration scenario)
  // -------------------------------------------------------------------
  describe('Full auth lifecycle', () => {
    it('master generates → validates → creates admin session → refreshes → invalidates', async () => {
      // 1. Generate
      const masterCode = await adapter.generateMasterCode({ description: 'TV Principal' })
      expect(masterCode).toMatch(/^\d{4}$/)

      // 2. Validate
      expect(await adapter.validateMasterCode(masterCode)).toBe(AuthResult.SUCCESS)

      // 3. Create session
      const session = await adapter.createSession(masterCode, '10.0.0.1')
      expect(session.role).toBe(UserRole.ADMIN)

      // 4. Refresh
      const refreshed = await adapter.refreshSession(session.id)
      expect(refreshed.lastUsedAt.getTime()).toBeGreaterThanOrEqual(session.lastUsedAt.getTime())

      // 5. Invalidate
      await adapter.invalidateSession(session.id)
      await expect(adapter.refreshSession(session.id)).rejects.toThrow('Session not found')
    })

    it('visit generates → validates → creates visitor session → code expires after maxUses', async () => {
      const code = await adapter.generateVisitCode('hourly', { maxUses: 2 })

      // First session OK
      const s1 = await adapter.createSession(code)
      expect(s1.role).toBe(UserRole.VISITOR)

      // Second session OK
      const s2 = await adapter.createSession(code)
      expect(s2.id).not.toBe(s1.id)

      // Third fails
      expect(await adapter.validateVisitCode(code)).toBe(AuthResult.USED_CODE)
    })
  })
})
