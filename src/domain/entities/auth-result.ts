export enum AuthResult {
  SUCCESS = 'success',
  INVALID_CODE = 'invalid_code',
  EXPIRED_CODE = 'expired_code',
  USED_CODE = 'used_code',
  INTERNAL_ERROR = 'internal_error'
}