import { describe, it, expect } from 'vitest'
import { classifyOcrMime, buildDataUri, joinPagesMarkdown, mistralOcrAvailable } from './mistral-ocr'

describe('classifyOcrMime', () => {
  it('détecte un PDF', () => {
    expect(classifyOcrMime('application/pdf')).toEqual({ kind: 'pdf', mime: 'application/pdf' })
  })
  it('mappe les images courantes', () => {
    expect(classifyOcrMime('image/png').mime).toBe('image/png')
    expect(classifyOcrMime('image/webp').mime).toBe('image/webp')
    expect(classifyOcrMime('image/gif').mime).toBe('image/gif')
  })
  it('défaut jpeg pour un mime inconnu ou vide', () => {
    expect(classifyOcrMime(undefined)).toEqual({ kind: 'image', mime: 'image/jpeg' })
    expect(classifyOcrMime('application/octet-stream').mime).toBe('image/jpeg')
  })
})

describe('buildDataUri', () => {
  it('construit une data-URI base64 valide', () => {
    expect(buildDataUri('QUJD', 'image/png')).toBe('data:image/png;base64,QUJD')
  })
})

describe('joinPagesMarkdown', () => {
  it('trie par index et concatène', () => {
    const md = joinPagesMarkdown([
      { index: 1, markdown: 'page2' },
      { index: 0, markdown: 'page1' },
    ])
    expect(md).toBe('page1\n\npage2')
  })
  it('ignore les pages vides sans planter', () => {
    expect(joinPagesMarkdown([])).toBe('')
  })
})

describe('mistralOcrAvailable', () => {
  it('reflète la présence de MISTRAL_API_KEY', () => {
    const prev = process.env.MISTRAL_API_KEY
    delete process.env.MISTRAL_API_KEY
    expect(mistralOcrAvailable()).toBe(false)
    process.env.MISTRAL_API_KEY = 'test-key'
    expect(mistralOcrAvailable()).toBe(true)
    if (prev === undefined) delete process.env.MISTRAL_API_KEY
    else process.env.MISTRAL_API_KEY = prev
  })
})
