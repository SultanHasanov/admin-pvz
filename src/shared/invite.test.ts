import { describe, expect, it } from 'vitest'
import { INVITE_CODE, normalizeCode } from './invite'

describe('код приглашения', () => {
  it('приводит продиктованный код к виду ABC-D3F', () => {
    expect(normalizeCode('abc d3f')).toBe('ABC-D3F')
    expect(normalizeCode('ABCD3F')).toBe('ABC-D3F')
    expect(normalizeCode(' abc-d3f ')).toBe('ABC-D3F')
  })

  it('лишние символы отрезаются, неполный код остаётся как есть', () => {
    expect(normalizeCode('abcd3fxyz')).toBe('ABC-D3F')
    expect(normalizeCode('ab')).toBe('AB')
  })

  it('похожие символы 0/O и 1/I в код не входят', () => {
    expect(INVITE_CODE.test('ABC-D3F')).toBe(true)
    expect(INVITE_CODE.test('AB0-D3F')).toBe(false)
    expect(INVITE_CODE.test('ABO-D3F')).toBe(false)
    expect(INVITE_CODE.test('AB1-D3F')).toBe(false)
    expect(INVITE_CODE.test('ABI-D3F')).toBe(false)
  })
})
