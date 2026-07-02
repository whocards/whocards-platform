import {describe, expect, it} from 'vitest'

import {ANDROID_PACKAGE_ID, APP_STORE_APP_ID, buildAppStoreUrl, buildPlayStoreUrl} from './index'

describe('buildAppStoreUrl', () => {
  it('builds the App Store product URL keyed off the numeric id', () => {
    const url = buildAppStoreUrl({source: 'website', medium: 'app_page', campaign: 'launch'})
    expect(url).toBe(
      `https://apps.apple.com/app/whocards/id${APP_STORE_APP_ID}?utm_source=website&utm_medium=app_page&utm_campaign=launch`
    )
  })

  it('defaults the campaign to launch', () => {
    const url = buildAppStoreUrl({source: 'email', medium: 'launch_blast'})
    expect(url).toContain('utm_campaign=launch')
  })
})

describe('buildPlayStoreUrl', () => {
  it('builds the Play Store URL keyed off the Android package id', () => {
    const url = buildPlayStoreUrl({source: 'website', medium: 'app_page', campaign: 'launch'})
    expect(url).toBe(
      `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}&utm_source=website&utm_medium=app_page&utm_campaign=launch`
    )
  })
})
