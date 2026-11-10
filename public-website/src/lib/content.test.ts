import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { field, fmtDate, jsonLd, list, text } from './content'
import { dirOf, href, isLang } from './i18n'

const item = { title: 'English title', summary: 'English summary', body: null, data: { mission: 'English mission', steps: 'One\n\n  Two  \n', ar: { title: 'عنوان', mission: '  ' } } }

describe('content', () => {
  it('uses Arabic where it exists and falls back to English, never to nothing', () => {
    assert.equal(text(item, 'ar', 'title'), 'عنوان')
    assert.equal(text(item, 'ar', 'summary'), 'English summary')
    assert.equal(text(item, 'en', 'title'), 'English title')
    assert.equal(field(item, 'ar', 'mission'), 'English mission') // blank Arabic does not hide English
    assert.equal(text(item, 'en', 'body'), undefined)
    assert.equal(text(null, 'en', 'title'), undefined)
  })
  it('reads one list entry per line, ignoring blanks', () => {
    assert.deepEqual(list(item, 'en', 'steps'), ['One', 'Two'])
    assert.deepEqual(list(item, 'en', 'missing'), [])
  })
  it('structured data cannot break out of its script tag', () => {
    assert.ok(!jsonLd({ name: '</script><script>alert(1)</script>' }).includes('<'))
  })
  it('formats dates without shifting the day, and leaves bad input visible', () => {
    assert.match(fmtDate('2026-03-01', 'en'), /^1 March 2026$/)
    assert.equal(fmtDate('not a date', 'en'), 'not a date')
    assert.equal(fmtDate(null, 'en'), '')
  })
})

describe('languages', () => {
  it('gives each language one address, and Arabic reads right to left', () => {
    assert.equal(href('en', '/about'), '/about')
    assert.equal(href('ar', '/about'), '/ar/about')
    assert.equal(href('ar', '/'), '/ar')
    assert.equal(dirOf('ar'), 'rtl')
    assert.equal(dirOf('en'), 'ltr')
    assert.equal(isLang('fr'), false)
  })
})
