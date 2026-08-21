import { describe, it, expect } from 'vitest'
import { ROLE_LEVEL, canManageRole } from '@/lib/auth/roles'

describe('ROLE_LEVEL (SEC-001)', () => {
  it('reprend exactement la hiérarchie du hotfix SEC-001', () => {
    expect(ROLE_LEVEL).toEqual({
      employe: 10, salarie: 10,
      manager: 30, team_leader: 30,
      client_user: 30, client_assistant: 30,
      rh: 50, rh_manager: 50,
      comptable: 50, comptable_dedie: 50, juridique: 50,
      direction: 70, client_admin: 70,
      admin: 90,
      super_admin: 100,
    })
  })
})

describe('canManageRole (SEC-001)', () => {
  it('autorise un niveau strictement supérieur', () => {
    expect(canManageRole('super_admin', 'admin')).toBe(true)
    expect(canManageRole('admin', 'rh')).toBe(true)
    expect(canManageRole('rh', 'employe')).toBe(true)
    expect(canManageRole('rh', 'salarie')).toBe(true)
    expect(canManageRole('client_admin', 'client_user')).toBe(true)
    expect(canManageRole('direction', 'comptable')).toBe(true)
  })

  it('refuse rh (et assimilés) sur super_admin / admin', () => {
    expect(canManageRole('rh', 'super_admin')).toBe(false)
    expect(canManageRole('rh', 'admin')).toBe(false)
    expect(canManageRole('rh_manager', 'super_admin')).toBe(false)
    expect(canManageRole('comptable', 'admin')).toBe(false)
    expect(canManageRole('client_admin', 'super_admin')).toBe(false)
  })

  it('refuse un niveau égal (peer-to-peer interdit)', () => {
    expect(canManageRole('super_admin', 'super_admin')).toBe(false)
    expect(canManageRole('admin', 'admin')).toBe(false)
    expect(canManageRole('rh', 'rh_manager')).toBe(false)
    expect(canManageRole('rh', 'comptable')).toBe(false)
    expect(canManageRole('employe', 'salarie')).toBe(false)
  })

  it('refuse un niveau inférieur agissant vers le haut', () => {
    expect(canManageRole('employe', 'rh')).toBe(false)
    expect(canManageRole('manager', 'direction')).toBe(false)
  })

  it('refuse tout rôle inconnu ou manquant (refus sûr)', () => {
    expect(canManageRole('hacker', 'employe')).toBe(false)
    expect(canManageRole('super_admin', 'role_inconnu')).toBe(false)
    expect(canManageRole('', 'employe')).toBe(false)
    expect(canManageRole('admin', '')).toBe(false)
    expect(canManageRole(null, 'employe')).toBe(false)
    expect(canManageRole('admin', null)).toBe(false)
    expect(canManageRole(undefined, undefined)).toBe(false)
  })
})
