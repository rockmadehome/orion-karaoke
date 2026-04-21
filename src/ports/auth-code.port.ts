import { UserSession, AuthResult } from '@/domain/entities'

export type DurationType = 'daily' | 'hourly' | 'fixed' | 'once'

export interface AuthCodePort {
  /**
   * Validate a master code (admin)
   * @param code Code to validate
   * @returns Promise<AuthResult>
   */
  validateMasterCode(code: string): Promise<AuthResult>

  /**
   * Validate a visit code
   * @param code Code to validate
   * @returns Promise<AuthResult>
   */
  validateVisitCode(code: string): Promise<AuthResult>

  /**
   * Generate a visit code with specific duration
   * @param duration Duration type
   * @param options Additional options
   * @returns Promise<string> Generated code
   */
  generateVisitCode(
    duration: DurationType,
    options?: {
      userId?: string
      maxUses?: number
      expiresAt?: Date
      ipAddress?: string
    }
  ): Promise<string>

  /**
   * Generate a master code
   * @param options Additional options
   * @returns Promise<string> Generated master code
   */
  generateMasterCode(options?: {
    description?: string
    createdBy?: string
    expiresAt?: Date
  }): Promise<string>

  /**
   * Refresh an existing visit code
   * @param currentCode Current code to refresh
   * @param newDuration Optional new duration
   * @returns Promise<string> New refreshed code
   */
  refreshVisitCode(currentCode: string, newDuration?: DurationType): Promise<string>

  /**
   * Check if a code has expired
   * @param code Code to check
   * @returns Promise<boolean>
   */
  isCodeExpired(code: string): Promise<boolean>

  /**
   * Invalidate a code (mark as used/expired)
   * @param code Code to invalidate
   * @param reason Reason for invalidation
   * @returns Promise<void>
   */
  invalidateCode(code: string, reason?: string): Promise<void>

  /**
   * Get code information and usage statistics
   * @param code Code to check
   * @returns Promise<{ isValid: boolean; expiresAt?: Date; usedAt?: Date; usageCount: number }>
   */
  getCodeInfo(code: string): Promise<{
    isValid: boolean
    expiresAt?: Date
    usedAt?: Date
    usageCount: number
  }>

  /**
   * Create a user session
   * @param code Authentication code
   * @param ipAddress Client IP address
   * @returns Promise<UserSession>
   */
  createSession(code: string, ipAddress?: string): Promise<UserSession>

  /**
   * Refresh an existing user session
   * @param sessionId Session ID to refresh
   * @returns Promise<UserSession>
   */
  refreshSession(sessionId: string): Promise<UserSession>

  /**
   * Invalidate a user session
   * @param sessionId Session ID to invalidate
   * @returns Promise<void>
   */
  invalidateSession(sessionId: string): Promise<void>
}