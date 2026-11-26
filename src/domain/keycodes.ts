import type { Keycode } from './vial'

export type Language = 'ru' | 'en'
export type TypingLayout = Language | 'dvorak' | 'colemak'

export const typingLayouts: Record<TypingLayout, string> = {
  ru: 'ЙЦУКЕН (RU)', en: 'QWERTY (US)', dvorak: 'Dvorak (US)', colemak: 'Colemak',
}

export function isTypingLayout(value: unknown): value is TypingLayout {
  return typeof value === 'string' && Object.hasOwn(typingLayouts, value)
}

export function layoutLanguage(layout: TypingLayout): Language {
  return layout === 'ru' ? 'ru' : 'en'
}

const aliases: Record<string, string> = {
  ESC: 'ESCAPE', BSPC: 'BSPACE', ENT: 'ENTER', SPC: 'SPACE', CAPS: 'CAPSLOCK',
  LSFT: 'LSHIFT', RSFT: 'RSHIFT', LCTL: 'LCTRL', RCTL: 'RCTRL',
  LWIN: 'LGUI', RWIN: 'RGUI', LCMD: 'LGUI', RCMD: 'RGUI',
  GRV: 'GRAVE', EQL: 'EQUAL', MINS: 'MINUS', LBRC: 'LBRACKET', RBRC: 'RBRACKET',
  SCLN: 'SCOLON', SEMICOLON: 'SCOLON', QUOT: 'QUOTE', COMM: 'COMMA',
  BSLS: 'BSLASH', SLSH: 'SLASH', DEL: 'DELETE', RGHT: 'RIGHT', PGDN: 'PGDOWN',
  TRANSPARENT: 'TRNS',
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const digits = '1234567890'
const hidBasic = [
  ...alphabet, ...digits,
  'ENTER', 'ESCAPE', 'BSPACE', 'TAB', 'SPACE', 'MINUS', 'EQUAL',
  'LBRACKET', 'RBRACKET', 'BSLASH', 'NONUS_HASH', 'SCOLON', 'QUOTE',
  'GRAVE', 'COMMA', 'DOT', 'SLASH', 'CAPSLOCK',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  'PSCREEN', 'SCROLLLOCK', 'PAUSE', 'INSERT', 'HOME', 'PGUP', 'DELETE',
  'END', 'PGDOWN', 'RIGHT', 'LEFT', 'DOWN', 'UP',
]
const hidModifiers = ['LCTRL', 'LSHIFT', 'LALT', 'LGUI', 'RCTRL', 'RSHIFT', 'RALT', 'RGUI']

export function normalize(code: Keycode): string {
  if (code === '_______' || code === 1) return 'KC_TRNS'
  if (code === 'XXXXXXX' || code === 0) return 'KC_NO'
  if (typeof code === 'string' && /^(?:0x[\da-f]{1,4}|\d{1,5})$/i.test(code)) return normalize(Number(code))
  if (typeof code === 'number') {
    const name = hidBasic[code - 4] ?? hidModifiers[code - 224]
    return name ? `KC_${name}` : `0x${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  const id = code.startsWith('KC_') ? code.slice(3) : ''
  return Object.hasOwn(aliases, id) ? `KC_${aliases[id]}` : code
}

const englishKeys = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`\\-="
// Output for the same USB keycodes, in QWERTY key order, with and without Shift.
const layoutSymbols: Record<TypingLayout, { base: string; shift: string }> = {
  ru: { base: 'йцукенгшщзхъфывапролджэячсмитьбю.ё\\-=', shift: 'ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,Ё/_+' },
  en: { base: englishKeys, shift: 'QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>?~|_+' },
  dvorak: { base: "',.pyfgcrl/=aoeuidhtns-;qjkxbmwvz`\\[]", shift: '"<>PYFGCRL?+AOEUIDHTNS_:QJKXBMWVZ~|{}' },
  colemak: { base: "qwfpgjluy;[]arstdhneio'zxcvbkm,./`\\-=", shift: 'QWFPGJLUY:{}ARSTDHNEIO"ZXCVBKM<>?~|_+' },
}
const punctuation: Record<string, string> = {
  GRAVE: '`', MINUS: '-', EQUAL: '=', LBRACKET: '[', RBRACKET: ']', BSLASH: '\\',
  SCOLON: ';', QUOTE: "'", COMMA: ',', DOT: '.', SLASH: '/', SPACE: ' ',
}

const shiftedAliases: Record<string, string> = {
  EXLM: '1', AT: '2', HASH: '3', DLR: '4', PERC: '5', CIRC: '6', AMPR: '7', ASTR: '8',
  LPRN: '9', RPRN: '0', UNDS: 'MINUS', PLUS: 'EQUAL', LCBR: 'LBRACKET', RCBR: 'RBRACKET',
  PIPE: 'BSLASH', COLN: 'SCOLON', DQUO: 'QUOTE', LT: 'COMMA', GT: 'DOT', QUES: 'SLASH', TILD: 'GRAVE',
}

export function tapKey(raw: Keycode): { code: string; shifted: boolean } {
  const normalized = normalize(raw)
  const shifted = normalized.match(/^(?:S|LSFT|RSFT)\(([^()]+)\)$/)
  const alias = normalized.startsWith('KC_') ? normalized.slice(3) : ''
  if (shifted) return { code: normalize(shifted[1]), shifted: true }
  if (Object.hasOwn(shiftedAliases, alias)) return { code: `KC_${shiftedAliases[alias]}`, shifted: true }
  const tap = normalized.match(/^(?:LT\(\d+\s*,\s*|[A-Z_]+_T\()([^()]+)\)$/)
  return { code: tap ? normalize(tap[1]) : normalized, shifted: false }
}

export function momentaryLayer(raw: Keycode): number | null {
  const match = normalize(raw).match(/^MO\((\d+)\)$/)
  return match ? Number(match[1]) : null
}

export function character(raw: Keycode, layout: TypingLayout, shift = false): string | null {
  const tap = tapKey(raw)
  if (tap.code === 'KC_ENTER' && !tap.shifted && !shift) return '\n'
  const id = tap.code.slice(3)
  const shifted = tap.shifted || shift
  const symbol = /^[A-Z0-9]$/.test(id) ? id.toLowerCase() : Object.hasOwn(punctuation, id) ? punctuation[id] : ''
  if (!tap.code.startsWith('KC_') || !symbol) return null
  const index = englishKeys.indexOf(symbol)
  if (index >= 0) return layoutSymbols[layout][shifted ? 'shift' : 'base'][index]
  if (shifted && digits.includes(symbol)) return (layout === 'ru' ? '!"№;%:?*()' : '!@#$%^&*()')[digits.indexOf(symbol)]
  return symbol
}

const specialLabels: Record<string, string> = {
  ESCAPE: 'Esc', TAB: 'Tab', CAPSLOCK: 'Caps', BSPACE: '⌫', DELETE: 'Del', ENTER: 'Enter', SPACE: '␣',
  LSHIFT: 'Shift', RSHIFT: 'Shift', LCTRL: 'Ctrl', RCTRL: 'Ctrl', LALT: 'Alt', RALT: 'Alt',
  LGUI: '⌘', RGUI: '⌘', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', MUTE: 'Mute',
  NO: '—', TRNS: '▽',
}
const browserCodes: Record<string, string> = {
  GRAVE: 'Backquote', MINUS: 'Minus', EQUAL: 'Equal', LBRACKET: 'BracketLeft', RBRACKET: 'BracketRight',
  SCOLON: 'Semicolon', QUOTE: 'Quote', BSLASH: 'Backslash', COMMA: 'Comma', DOT: 'Period', SLASH: 'Slash',
  SPACE: 'Space', ENTER: 'Enter', TAB: 'Tab', BSPACE: 'Backspace', ESCAPE: 'Escape', CAPSLOCK: 'CapsLock',
  DELETE: 'Delete', LSHIFT: 'ShiftLeft', RSHIFT: 'ShiftRight', LCTRL: 'ControlLeft', RCTRL: 'ControlRight',
  LALT: 'AltLeft', RALT: 'AltRight', LGUI: 'MetaLeft', RGUI: 'MetaRight',
  UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
}

export function browserCode(raw: Keycode): string | undefined {
  const code = tapKey(raw).code
  if (!code.startsWith('KC_')) return
  const id = code.slice(3)
  if (/^[A-Z]$/.test(id)) return `Key${id}`
  if (/^\d$/.test(id)) return `Digit${id}`
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(id)) return id
  return Object.hasOwn(browserCodes, id) ? browserCodes[id] : undefined
}

export function keyLabel(raw: Keycode, layout: TypingLayout): string {
  const code = normalize(raw)
  const layer = momentaryLayer(raw)
  if (layer !== null) return `Fn ${layer}`
  const id = code.slice(3)
  if (code.startsWith('KC_') && Object.hasOwn(specialLabels, id)) return specialLabels[id]
  const symbol = character(raw, layout)
  if (symbol) return symbol === ' ' ? '␣' : symbol.toUpperCase()
  return code.startsWith('KC_') ? id : code
}
