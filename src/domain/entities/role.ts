import { UserRole } from './index'

export interface Role {
  id: string
  name: UserRole
  permissions: string[]
  description: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface RolePermission {
  id: string
  name: string
  description: string
  category: 'system' | 'content' | 'user' | 'playlist' | 'settings'
  subcategory?: string
  requiredRole?: UserRole[]
}

export interface RolePermissionGroup {
  category: string
  permissions: RolePermission[]
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermission[]> = {
  admin: [
    { id: 'system.admin', name: 'System Administration', description: 'Full system control', category: 'system' },
    { id: 'content.create', name: 'Create Content', description: 'Add new songs', category: 'content' },
    { id: 'content.delete', name: 'Delete Content', description: 'Remove songs', category: 'content' },
    { id: 'user.manage', name: 'User Management', description: 'Manage user sessions', category: 'user' },
    { id: 'playlist.manage', name: 'Playlist Management', description: 'Manage playlists', category: 'playlist' },
    { id: 'settings.manage', name: 'Settings Management', description: 'Change system settings', category: 'settings' }
  ],
  visitor: [
    { id: 'content.request', name: 'Request Songs', description: 'Add songs to conversion queue', category: 'content' },
    { id: 'playlist.view', name: 'View Playlists', description: 'View existing playlists', category: 'playlist' },
    { id: 'playlist.use', name: 'Use Playlists', description: 'Play songs from playlists', category: 'playlist' },
    { id: 'settings.view', name: 'View Settings', description: 'View basic settings', category: 'settings' }
  ]
}

export function hasPermission(role: UserRole, permissionId: string): boolean {
  return ROLE_PERMISSIONS[role].some(p => p.id === permissionId)
}

export function getPermissionsByRole(role: UserRole): RolePermission[] {
  return ROLE_PERMISSIONS[role]
}

export function getPermissionsByCategory(role: UserRole, category: string): RolePermission[] {
  return ROLE_PERMISSIONS[role].filter(p => p.category === category)
}