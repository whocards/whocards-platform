import {describe, expect, it} from 'vitest'
import {CONSENT_TYPE_TO_SEGMENT, CONSENT_TYPES, isConsentType, normalizeEmail} from './consent'

describe('consent constants (#119)', () => {
  describe('CONSENT_TYPES', () => {
    it('contains app_launch and newsletter', () => {
      expect(CONSENT_TYPES).toContain('app_launch')
      expect(CONSENT_TYPES).toContain('newsletter')
    })
  })

  describe('CONSENT_TYPE_TO_SEGMENT', () => {
    it('newsletter maps to newsletter segment', () => {
      expect(CONSENT_TYPE_TO_SEGMENT.newsletter).toBe('newsletter')
    })

    it('app_launch maps to app-waitlist segment', () => {
      expect(CONSENT_TYPE_TO_SEGMENT.app_launch).toBe('app-waitlist')
    })
  })

  describe('isConsentType', () => {
    it('accepts valid consent types', () => {
      expect(isConsentType('app_launch')).toBe(true)
      expect(isConsentType('newsletter')).toBe(true)
    })

    it('rejects unknown strings', () => {
      expect(isConsentType('unknown')).toBe(false)
      expect(isConsentType('')).toBe(false)
      expect(isConsentType('app-launch')).toBe(false)
    })
  })

  describe('normalizeEmail', () => {
    it('lowercases the email', () => {
      expect(normalizeEmail('User@Example.COM')).toBe('user@example.com')
    })

    it('trims whitespace', () => {
      expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com')
    })

    it('handles already-normalized emails', () => {
      expect(normalizeEmail('user@example.com')).toBe('user@example.com')
    })
  })
})
