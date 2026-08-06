import { describe, expect, it } from 'vitest'
import {
  canInstallCleanly,
  chromeIntentUrl,
  detectAndroidBrowser,
  type AndroidBrowser,
} from '@/lib/pwa-browser'

/**
 * Ces tests verrouillent la reconnaissance du navigateur Android, dont dépend
 * l'issue de l'installation. Se tromper ici a un coût visible : soit on mène
 * l'utilisateur jusqu'à l'avertissement « Appli non sécurisée bloquée » de
 * Play Protect, soit on lui propose d'ouvrir Chrome alors qu'il y est déjà.
 *
 * Les agents utilisateurs ci-dessous sont recopiés d'appareils réels : tous
 * annoncent « Chrome/… », y compris Samsung Internet et les WebView, ce qui
 * est précisément le piège que la détection doit éviter.
 */

const UA = {
  chrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  edge: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
  opera:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 OPR/79.0.0.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  facebook:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/447.0.0.31.101;]',
  instagram:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.42.101',
  webview:
    'Mozilla/5.0 (Linux; Android 12; moto g52 Build/S3RQS32.20; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  desktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

describe('detectAndroidBrowser', () => {
  it.each([
    ['chrome', 'chromium'],
    ['edge', 'chromium'],
    ['opera', 'chromium'],
    ['samsung', 'samsung'],
    ['facebook', 'in-app'],
    ['instagram', 'in-app'],
    ['webview', 'in-app'],
    ['firefox', 'firefox'],
  ] as const)('%s → %s', (key, expected) => {
    expect(detectAndroidBrowser(UA[key])).toBe(expected)
  })

  it('ne se prononce pas hors Android : iOS et bureau ne sont pas concernés', () => {
    expect(detectAndroidBrowser(UA.iphone)).toBe('unknown')
    expect(detectAndroidBrowser(UA.desktop)).toBe('unknown')
    expect(detectAndroidBrowser('')).toBe('unknown')
  })

  it('ne prend pas Samsung Internet pour Chrome, malgré son « Chrome/115 »', () => {
    expect(UA.samsung).toContain('Chrome/')
    expect(detectAndroidBrowser(UA.samsung)).not.toBe('chromium')
  })
})

describe('canInstallCleanly', () => {
  it('n’autorise la boîte de dialogue que là où l’installation aboutit', () => {
    const verdicts: Record<AndroidBrowser, boolean> = {
      chromium: true,
      // Hors Android (iOS, bureau) : rien à bloquer.
      unknown: true,
      samsung: false,
      'in-app': false,
      firefox: false,
    }
    for (const [browser, expected] of Object.entries(verdicts)) {
      expect(canInstallCleanly(browser as AndroidBrowser)).toBe(expected)
    }
  })
})

describe('chromeIntentUrl', () => {
  it('vise Chrome et conserve chemin et paramètres', () => {
    const intent = chromeIntentUrl('https://www.lexora.finance/salarie?source=pwa')
    expect(intent).toContain('intent://www.lexora.finance/salarie?source=pwa')
    expect(intent).toContain('package=com.android.chrome')
    expect(intent).toContain('scheme=https')
  })

  it('emporte une adresse de repli, sans quoi le lien ne fait rien si Chrome est absent', () => {
    const intent = chromeIntentUrl('https://www.lexora.finance/installer')
    expect(intent).toContain(
      `S.browser_fallback_url=${encodeURIComponent('https://www.lexora.finance/installer')}`,
    )
    expect(intent?.endsWith(';end')).toBe(true)
  })

  it('refuse tout ce qui n’est pas une adresse https', () => {
    expect(chromeIntentUrl('http://www.lexora.finance/')).toBeNull()
    expect(chromeIntentUrl('javascript:alert(1)')).toBeNull()
    expect(chromeIntentUrl('pas une url')).toBeNull()
  })
})
