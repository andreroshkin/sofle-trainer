import { describe, expect, it } from 'vitest'
import base from '../assets/base.vil?raw'
import { effectiveKey, eventPosition, findHint, fnKeys } from './hints'
import { browserCode, character, keyLabel, normalize } from './keycodes'
import { keyAt, parseVial } from './vial'

const map = parseVial(base)
const escape = map.geometry.positions.find(key => key.id === '0-0')!

describe('экспорт Vial', () => {
  it('открывает рабочий base.vil и все восемь слоёв', () => {
    expect(map.geometry.name).toBe('Sofle 66')
    expect(map.geometry.positions).toHaveLength(64)
    expect(map.layers).toHaveLength(8)
    expect(keyAt(map, 0, escape)).toBe('KC_ESCAPE')
    expect(keyAt(map, 1, escape)).toBe('KC_GRAVE')
    expect(parseVial('\uFEFF' + base).layers).toEqual(map.layers)
  })

  it.each([
    ['{', 'некорректный JSON'],
    ['[]', 'версии 1'],
    ['{"version":2,"layout":[[[0]]]}', 'версии 1'],
    ['{"version":1,"layout":[]}', 'от 1 до 32'],
    ['{"version":1,"layout":[[[null]]]}', 'некорректные строки'],
    ['{"version":1,"layout":[[[65536]]]}', 'некорректные строки'],
    ['{"version":1,"layout":[[[2.5]]]}', 'некорректные строки'],
    ['{"version":1,"layout":[[["KC_A"]]]}', 'Геометрия файла не поддерживается'],
  ])('отклоняет %s', (source, reason) => {
    expect(() => parseVial(source)).toThrow(reason)
  })

  it('отклоняет несовпадение позиций даже в матрице 5 × 16', () => {
    const config = JSON.parse(base)
    config.layout[7][0][0] = -1
    config.layout[7][0][6] = 'KC_A'
    expect(() => parseVial(JSON.stringify(config))).toThrow('Геометрия файла не поддерживается')
  })

  it('различает прозрачную клавишу и клавишу без действия', () => {
    expect(keyAt(map, 2, escape)).toBe('KC_TRNS')
    expect(effectiveKey(map, 2, escape)).toBe('KC_ESCAPE')
    const config = JSON.parse(base)
    config.layout[2][0][0] = 'KC_NO'
    expect(effectiveKey(parseVial(JSON.stringify(config)), 2, escape)).toBe('KC_NO')
    expect(keyLabel('KC_NO', 'ru')).toBe('—')
    expect(keyLabel('KC_TRANSPARENT', 'ru')).toBe('▽')
  })
})

describe('коды клавиш и подсказки', () => {
  it.each([
    ['ё', 'ru', '0-0', false],
    ['Ё', 'ru', '0-0', true],
    ['`', 'en', '0-0', false],
    ['-', 'ru', '0-14', false],
    ['_', 'en', '0-14', true],
    ['=', 'ru', '3-14', false],
    ['+', 'en', '3-14', true],
  ] as const)('находит физическую комбинацию для %s', (symbol, language, position, shift) => {
    expect(findHint(map, symbol, language, null)).toMatchObject({ key: { id: position }, layer: 1, shift })
    expect(fnKeys(map, 1).map(key => key.id)).toEqual(['3-8', '4-5'])
  })

  it('использует переданный браузером HID-код для подсветки', () => {
    expect(eventPosition(map, 0, 'Backquote', undefined)?.id).toBe('0-0')
    expect(eventPosition(map, 1, 'Equal', undefined)?.id).toBe('3-14')
  })

  it('учитывает системную раскладку поверх назначений Vial', () => {
    expect(character('KC_Q', 'dvorak')).toBe("'")
    expect(character('KC_Q', 'dvorak', true)).toBe('"')
    expect(character('KC_PLUS', 'dvorak')).toBe('}')
    expect(character('KC_LBRACKET', 'dvorak', true)).toBe('?')
    expect(findHint(map, '{', 'dvorak', null)).toMatchObject({ key: { id: '0-14' }, layer: 1, shift: true })
    expect(findHint(map, 'o', 'dvorak', null)).toMatchObject({ key: { id: '2-2' }, layer: 0, shift: false })
    expect(findHint(map, 'r', 'colemak', null)).toMatchObject({ key: { id: '2-2' }, layer: 0, shift: false })
    expect(character('KC_P', 'colemak', true)).toBe(':')
    expect(character('LT(1,KC_K)', 'colemak')).toBe('e')
  })

  it('распознаёт QMK-алиасы, базовые числовые коды и tap-коды', () => {
    expect(browserCode('KC_SCLN')).toBe('Semicolon')
    expect(character('LT(1,KC_A)', 'ru')).toBe('ф')
    expect(character('LSFT_T(KC_DOT)', 'en')).toBe('.')
    expect(character('LSFT(KC_2)', 'ru')).toBe('"')
    expect(character('KC_PLUS', 'en')).toBe('+')
    expect(character('KC_BSLASH', 'en', true)).toBe('|')
    expect(character('KC_SLASH', 'ru')).toBe('.')
    expect(normalize(4)).toBe('KC_A')
    expect(normalize('0x0001')).toBe('KC_TRNS')
    expect(normalize(0)).toBe('KC_NO')
    expect(character('CUSTOM_MACRO', 'ru')).toBeNull()
    expect(findHint(map, '😀', 'ru', null)).toBeUndefined()
  })
})
