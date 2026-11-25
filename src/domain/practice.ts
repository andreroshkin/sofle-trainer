import { findHint } from './hints'
import { normalize, type Language } from './keycodes'
import type { Keymap } from './vial'

export type Lesson = 'letters' | 'thumbs' | 'digits' | 'layer'
export type Mode = 'text' | 'symbols' | Lesson
export const customTextLimit = 1200

export function normalizeCustomText(source: string) {
  return source.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
    .replace(/[\u2028\u2029]/g, '\n').replace(/\p{Zs}/gu, ' ')
}

export const lessons: readonly { id: Lesson; title: string; description: string }[] = [
  { id: 'letters', title: 'Буквы', description: 'Короткие последовательности из основного ряда.' },
  { id: 'thumbs', title: 'Большие пальцы', description: 'Чередуй буквы с пробелом и клавишами нижнего ряда.' },
  { id: 'digits', title: 'Цифры', description: 'Найди цифры на своей раскладке.' },
  { id: 'layer', title: 'Первый символ через Fn', description: 'Найди клавишу слоя, удерживай её и введи символ.' },
]

export function lessonText(mode: Lesson, map: Keymap, language: Language, index: number): string {
  const candidates = {
    letters: language === 'ru' ? ['фываолдж', 'ваолфыдж'] : ['asdfjkl', 'dfjkasl'],
    thumbs: language === 'ru' ? ['а (о) [в]', 'о [а] (л)'] : ['a [j] f', 'j [a] l'],
    digits: ['1234567890', '9078563412'],
    layer: language === 'ru' ? ['ё-=+_[]1234567890', '-=+_ё[]0987654321'] : ['`-=+_[]1234567890', '-=+_`[]0987654321'],
  }[mode]
  const reachable = Array.from(candidates[index % candidates.length]).filter(char => {
    const hint = findHint(map, char, language, null)
    return hint && (mode !== 'layer' || hint.layer > 0)
  })
  if (mode === 'layer') return reachable[0] ?? ''
  if (!reachable.some(char => char !== ' ')) return ''
  const sample = reachable.join('').trim()
  const separator = findHint(map, ' ', language, null) ? ' ' : ''
  return [sample, sample].join(separator)
}

export interface KeyStats {
  char: string
  attempts: number
  errors: number
}

export interface Result {
  id: string
  profile: string
  language: Language
  mode: Mode | 'custom' | 'review'
  finishedAt: number
  accuracy: number
  wpm: number
  elapsed: number
  keys: KeyStats[]
}

const historyKey = 'split-keyboard-trainer.history.v1'

export function profileFor(map: Keymap): string {
  const layout = JSON.stringify(map.layers.map(layer =>
    layer.map(row => row.map(code => code === -1 ? -1 : normalize(code)))))
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < layout.length; index++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(layout.charCodeAt(index))) * 0x100000001b3n)
  }
  return `${map.geometry.name}:${hash.toString(16)}`
}

function isKeyStats(value: unknown): value is KeyStats {
  if (!value || typeof value !== 'object') return false
  const key = value as Partial<KeyStats>
  return typeof key.char === 'string' && Array.from(key.char).length === 1 &&
    Number.isInteger(key.attempts) && Number.isInteger(key.errors) &&
    key.attempts! > 0 && key.errors! >= 0 && key.errors! <= key.attempts!
}

function isResult(value: unknown): value is Result {
  if (!value || typeof value !== 'object') return false
  const run = value as Partial<Result>
  return typeof run.id === 'string' && typeof run.profile === 'string' &&
    (run.language === 'ru' || run.language === 'en') &&
    (run.mode === 'text' || run.mode === 'symbols' || run.mode === 'custom' || run.mode === 'review' || lessons.some(lesson => lesson.id === run.mode)) &&
    typeof run.finishedAt === 'number' && run.finishedAt >= 0 && run.finishedAt <= 8.64e15 &&
    [run.accuracy, run.wpm, run.elapsed].every(value => Number.isFinite(value) && value! >= 0) &&
    Array.isArray(run.keys) && run.keys.every(isKeyStats)
}

export function readHistory(): Result[] {
  const stored = localStorage.getItem(historyKey)
  if (!stored) return []
  const data: unknown = JSON.parse(stored)
  return Array.isArray(data) ? data.filter(isResult) : []
}

export function recordResult(result: Result, current: Result[]): Result[] {
  let stored: Result[]
  try {
    stored = readHistory()
  } catch {
    stored = current
  }
  const byId = new Map([...current, ...stored].map(entry => [entry.id, entry]))
  byId.set(result.id, result)
  const history = [...byId.values()].sort((a, b) => b.finishedAt - a.finishedAt)
  let sameProfile = 0
  const recent = history.filter(entry =>
    entry.profile !== result.profile || entry.language !== result.language || ++sameProfile <= 30).slice(0, 300)
  localStorage.setItem(historyKey, JSON.stringify(recent))
  return recent
}

export function mistakes(keys: readonly KeyStats[]): KeyStats[] {
  return keys.filter(key => key.errors > 0).sort((a, b) => b.errors - a.errors)
}

export function suggestedKeys(history: readonly Result[]): KeyStats[] {
  const stats = new Map<string, KeyStats & { sessions: number }>()
  for (const session of history.slice(0, 10)) {
    for (const key of session.keys) {
      const previous = stats.get(key.char)
      stats.set(key.char, {
        char: key.char, attempts: (previous?.attempts ?? 0) + key.attempts,
        errors: (previous?.errors ?? 0) + key.errors,
        sessions: (previous?.sessions ?? 0) + 1,
      })
    }
  }
  return [...stats.values()]
    .filter(key => key.sessions >= 2 && key.attempts >= 5 && key.errors >= 2)
    .sort((a, b) => b.errors / b.attempts - a.errors / a.attempts || b.errors - a.errors)
    .slice(0, 4)
}
