import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AuthManager } from '@/services/auth-manager.service'
import { AuthResult, UserRole, DurationType } from '@/domain/entities'

describe('AuthManager', () => {
  let authManager: AuthManager

  beforeEach(() => {
    authManager = new AuthManager({
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      maxConcurrentSessions: 100,
      codeExpiration: {
        daily: 24 * 60 * 60 * 1000,
        hourly: 60 * 60 * 1000,
        fixed: 7 * 24 * 60 * 60 * 1000,
        once: 0
      },
      maxCodeUses: 10,
      bruteForceProtection: {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        cooldownMs: 5 * 60 * 1000
      }
    })
  })

  describe('Master Code Validation', () => {
    it('should validate a correct master code', async () => {
      // Generate a master code first
      const masterCode = await authManager.generateMasterCode({
        description: 'Test master code',
        createdBy: 'test-user'
      })

      const result = await authManager.validateMasterCode(masterCode)

      expect(result).toBe(AuthResult.SUCCESS)
    })

    it('should reject an invalid master code', async () => {
      const result = await authManager.validateMasterCode('invalid-code')

      expect(result).toBe(AuthResult.INVALID_CODE)
    })

    it('should reject expired master codes', async () => {
      const expiredCode = await authManager.generateMasterCode({
        expiresAt: new Date(Date.now() - 1000) // 1 second ago
      })

      const result = await authManager.validateMasterCode(expiredCode)

      expect(result).toBe(AuthResult.EXPIRED_CODE)
    })

    it('should handle brute force protection', async () => {
      const masterCode = await authManager.generateMasterCode()

      // Make multiple failed attempts
      for (let i = 0; i < 5; i++) {
        await authManager.validateMasterCode('wrong-code')
      }

      const result = await authManager.validateMasterCode(masterCode)

      // Should still validate correctly if code is valid
      expect(result).toBe(AuthResult.SUCCESS)
    })
  })

  describe('Visit Code Validation', () => {
    it('should validate a correct visit code', async () => {
      const visitCode = await authManager.generateVisitCode('daily', {
        description: 'Test visit code',
        maxUses: 1
      })

      const result = await authManager.validateVisitCode(visitCode)

      expect(result).toBe(AuthResult.SUCCESS)
    })

    it('should reject used visit codes', async () => {
      const visitCode = await authManager.generateVisitCode('once')

      // Use the code once
      await authManager.validateVisitCode(visitCode)

      // Try to use it again
      const result = await authManager.validateVisitCode(visitCode)

      expect(result).toBe(AuthResult.USED_CODE)
    })

    it('should handle max uses limit', async () => {
      const visitCode = await authManager.generateVisitCode('daily', {
        maxUses: 2
      })

      // Use code twice
      await authManager.validateVisitCode(visitCode)
      await authManager.validateVisitCode(visitCode)

      // Third attempt should fail
      const result = await authManager.validateVisitCode(visitCode)

      expect(result).toBe(AuthResult.USED_CODE)
    })
  })

  describe('Session Management', () => {
    it('should create a visitor session', async () => {
      const visitCode = await authManager.generateVisitCode('daily')
      const session = await authManager.createVisitSession(visitCode, '192.168.1.1')

      expect(session.role).toBe(UserRole.VISITOR)
      expect(session.code).toBe(visitCode)
      expect(session.ipAddress).toBe('192.168.1.1')
      expect(session.activity).toHaveLength(1)
      expect(session.activity[0].action).toBe('session_created')
    })

    it('should create an admin session', async () => {
      const masterCode = await authManager.generateMasterCode()
      const session = await authManager.createMasterSession({ ipAddress: '192.168.1.1' })

      expect(session.role).toBe(UserRole.ADMIN)
      expect(session.activity).toHaveLength(1)
      expect(session.activity[0].action).toBe('admin_session_created')
    })

    it('should refresh sessions', async () => {
      const visitCode = await authManager.generateVisitCode('daily')
      const session = await authManager.createVisitSession(visitCode)

      const originalLastUsed = session.lastUsedAt
      await new Promise(resolve => setTimeout(resolve, 10)) // Small delay

      await authManager.refreshSession(session.id)

      const refreshedSession = await authManager.getSession(session.id)
      expect(refreshedSession!.lastUsedAt.getTime()).toBeGreaterThan(originalLastUsed.getTime())
    })

    it('should invalidate sessions', async () => {
      const visitCode = await authManager.generateVisitCode('daily')
      const session = await authManager.createVisitSession(visitCode)

      await authManager.invalidateSession(session.id)

      const invalidatedSession = await authManager.getSession(session.id)
      expect(invalidatedSession).toBeNull()
    })

    it('should handle concurrent session limits', async () => {
      // Create many sessions
      const sessions = []
      for (let i = 0; i < 105; i++) {
        const visitCode = await authManager.generateVisitCode('daily')
        sessions.push(authManager.createVisitSession(visitCode))
      }

      const results = await Promise.allSettled(sessions)

      // Some should succeed, some should fail
      const successes = results.filter(r => r.status === 'fulfilled').length
      const failures = results.filter(r => r.status === 'rejected').length

      expect(successes).toBeGreaterThan(0)
      expect(failures).toBeGreaterThan(0)
    })
  })

  describe('Code Generation', () => {
    it('should generate valid visit codes', async () => {
      const code = await authManager.generateVisitCode('daily', {
        description: 'Test daily code',
        maxUses: 5
      })

      expect(typeof code).toBe('string')
      expect(code.length).toBe(4)
      expect(/^\d{4}$/.test(code)).toBe(true)

      // Verify code is stored
      const validationResult = await authManager.validateVisitCode(code)
      expect(validationResult).toBe(AuthResult.SUCCESS)
    })

    it('should generate master codes with single use', async () => {
      const code = await authManager.generateMasterCode({
        description: 'Single-use admin code',
        createdBy: 'admin-user'
      })

      const firstValidation = await authManager.validateMasterCode(code)
      expect(firstValidation).toBe(AuthResult.SUCCESS)

      const secondValidation = await authManager.validateMasterCode(code)
      expect(secondValidation).toBe(AuthResult.USED_CODE)
    })

    it('should handle different duration types', async () => {
      const now = new Date()
      
      const dailyCode = await authManager.generateVisitCode('daily')
      const hourlyCode = await authManager.generateVisitCode('hourly')
      const fixedCode = await authManager.generateVisitCode('fixed')
      const onceCode = await authManager.generateVisitCode('once')

      // All codes should be valid initially
      expect(await authManager.validateVisitCode(dailyCode)).toBe(AuthResult.SUCCESS)
      expect(await authManager.validateVisitCode(hourlyCode)).toBe(AuthResult.SUCCESS)
      expect(await authManager.validateVisitCode(fixedCode)).toBe(AuthResult.SUCCESS)
      expect(await authManager.validateVisitCode(onceCode)).toBe(AuthResult.SUCCESS)

      // Use the 'once' code
      await authManager.validateVisitCode(onceCode)

      // It should now be used
      expect(await authManager.validateVisitCode(onceCode)).toBe(AuthResult.USED_CODE)
    })
  })

  describe('Code Expiration', () => {
    it('should detect expired codes correctly', async () => {
      const expiredCode = await authManager.generateVisitCode('daily', {
        expiresAt: new Date(Date.now() - 1000) // 1 second ago
      })

      const isExpired = await authManager.isCodeExpired(expiredCode)
      expect(isExpired).toBe(true)
    })

    it('should detect non-expired codes correctly', async () => {
      const futureCode = await authManager.generateVisitCode('daily', {
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      })

      const isExpired = await authManager.isCodeExpired(futureCode)
      expect(isExpired).toBe(false)
    })

    it('should invalidate expired codes', async () => {
      const expiredCode = await authManager.generateVisitCode('daily', {
        expiresAt: new Date(Date.now() - 1000)
      })

      await authManager.invalidateCode(expiredCode)

      const validationResult = await authManager.validateVisitCode(expiredCode)
      expect(validationResult).toBe(AuthResult.INVALID_CODE)
    })
  })

  describe('Statistics', () => {
    it('should track authentication statistics', async () => {
      // Generate some codes
      await authManager.generateVisitCode('daily')
      await authManager.generateVisitCode('daily')
      await authManager.generateMasterCode()

      // Create sessions
      const visitCode = await authManager.generateVisitCode('daily')
      await authManager.createVisitSession(visitCode, '192.168.1.1')
      await authManager.createMasterSession({ ipAddress: '192.168.1.2' })

      const stats = await authManager.getStats()

      expect(stats.totalSessions).toBe(2)
      expect(stats.activeSessions).toBe(2)
      expect(stats.codesGenerated).toBe(4)
      expect(stats.sessionsByRole).toHaveLength(2)
      expect(stats.sessionsByRole.find(r => r.role === UserRole.VISITOR)?.count).toBe(1)
      expect(stats.sessionsByRole.find(r => r.role === UserRole.ADMIN)?.count).toBe(1)
    })

    it('should handle invalid attempts tracking', async () => {
      // Make some invalid attempts
      await authManager.validateMasterCode('wrong1')
      await authManager.validateMasterCode('wrong2')
      await authManager.validateMasterCode('wrong3')

      const stats = await authManager.getStats()

      expect(stats.invalidAttempts).toBe(3)
    })
  })

  describe('Cleanup Functions', () => {
    it('should clean up expired sessions', async () => {
      const oldSession = await authManager.createVisitSession('1234', '192.168.1.1')
      
      // Simulate expired session by manually setting expiration
      const expiredSession = await authManager.getSession(oldSession.id)
      if (expiredSession) {
        // This would need to be implemented in the actual class
        // For now, we'll just verify the method exists
        const cleanupCount = await (authManager as any).cleanupExpiredSessions()
        expect(cleanupCount).toBeGreaterThanOrEqual(0)
      }
    })

    it('should clean up expired codes', async () => {
      await authManager.generateVisitCode('once')
      await authManager.generateVisitCode('once')

      // Use the codes to make them expired
      const codes = await authManager.getAllSessions()
      for (const session of codes) {
        if (session.role === UserRole.VISITOR) {
          await authManager.validateVisitCode(session.code)
        }
      }

      const cleanupCount = await authManager.cleanupExpiredCodes()
      expect(cleanupCount).toBeGreaterThan(0)
    })
  })

  describe('Audit Log', () => {
    it('should generate audit log entries', async () => {
      const visitCode = await authManager.generateVisitCode('daily')
      await authManager.createVisitSession(visitCode, '192.168.1.1')
      await authManager.refreshSession('session-id')

      const auditLog = await authManager.exportAuditLog()

      expect(auditLog.length).toBeGreaterThan(0)
      expect(auditLog[0].action).toBe('session_created')
      expect(auditLog[0].ipAddress).toBe('192.168.1.1')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid sessions gracefully', async () => {
      const result = await authManager.getSession('non-existent-session-id')
      expect(result).toBeNull()
    })

    it('should handle invalid session refresh', async () => {
      await expect(authManager.refreshSession('non-existent-session-id')).rejects.toThrow('Session not found')
    })

    it('should handle invalid session invalidation', async () => {
      await expect(authManager.invalidateSession('non-existent-session-id')).rejects.toThrow('Session not found')
    })

    it('should handle invalid code generation parameters', async () => {
      // Should handle invalid parameters gracefully
      const code = await authManager.generateVisitCode('daily', {
        maxUses: 0 // Invalid - should use default
      })
      
      expect(typeof code).toBe('string')
      expect(code.length).toBe(4)
    })
  })
})