import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import baseVial from './assets/base.vil?raw'
import { eventPosition, findHint, fnKeys } from './domain/hints'
import type { Language } from './domain/keycodes'
import { parseVial } from './domain/vial'

const storageKey = 'split-keyboard-trainer.vial.v1'
const base = parseVial(baseVial)
export type Mode = 'text' | 'symbols'

const passages = {
  ru: [
    'плавный ритм важнее скорости. обе руки двигаются легко, а пальцы возвращаются на свои места.',
    'пиши спокойно и замечай, как меняется точность. короткая пауза помогает найти нужную клавишу.',
    'каждый день добавляет уверенности. левая и правая руки постепенно находят общий ритм.',
  ],
  en: [
    'smooth rhythm comes before speed. keep both hands relaxed and let your fingers find their home.',
    'type a little every day. a short pause helps you return to the right key and keep a steady pace.',
    'each quiet practice builds confidence. let both hands work together and keep the motion easy.',
  ],
}
const symbols = {
  ru: ['ё - = _ + 2026.', 'ещё - ёж; 2 + 3 = 5.', 'ё = ё; 30 - 3 = 27.'],
  en: ['` - = _ + 2026.', '2 + 3 = 5; [a, b].', 'a_b = a + b - 1.'],
}

export const useTrainer = defineStore('trainer', () => {
  const map = shallowRef(base)
  const filename = ref('base.vil')
  const imported = ref(false)
  const storageWarning = ref('')
  const language = ref<Language>('ru')
  const mode = ref<Mode>('text')
  const exerciseIndex = ref(0)
  const manualLayer = ref<number | null>(null)
  const cursor = ref(0)
  const errors = ref(0)
  const mistake = ref('')
  const startedAt = ref<number | null>(null)
  const clock = ref(0)
  const pressed = ref<string>()
  let releaseTimer: ReturnType<typeof setTimeout> | undefined

  const exercise = computed(() => (mode.value === 'text' ? passages : symbols)[language.value][exerciseIndex.value])
  const target = computed(() => exercise.value[cursor.value] ?? '')
  const done = computed(() => cursor.value === exercise.value.length)
  const hint = computed(() => target.value ? findHint(map.value, target.value, language.value, manualLayer.value) : undefined)
  const layer = computed(() => manualLayer.value ?? hint.value?.layer ?? 0)
  const held = computed(() => hint.value && hint.value.layer !== 0 ? fnKeys(map.value, hint.value.layer) : [])
  const elapsed = computed(() => startedAt.value === null ? 0 : Math.max(0, clock.value - startedAt.value))
  const wpm = computed(() => elapsed.value >= 1000 ? Math.round(cursor.value * 12000 / elapsed.value) : 0)
  const accuracy = computed(() => cursor.value + errors.value
    ? Math.round(cursor.value / (cursor.value + errors.value) * 100) : 100)
  const progress = computed(() => Math.round(cursor.value / exercise.value.length * 100))

  function reset() {
    cursor.value = 0
    errors.value = 0
    mistake.value = ''
    startedAt.value = null
    clock.value = 0
    pressed.value = undefined
    clearTimeout(releaseTimer)
  }

  function setLanguage(value: Language) {
    if (language.value === value) return
    language.value = value
    exerciseIndex.value = 0
    reset()
  }

  function setMode(value: Mode) {
    if (mode.value === value) return
    mode.value = value
    exerciseIndex.value = 0
    reset()
  }

  function nextExercise() {
    exerciseIndex.value = (exerciseIndex.value + 1) % passages[language.value].length
    reset()
  }

  function tick() {
    if (startedAt.value !== null && !done.value) clock.value = Date.now()
  }

  function flash(code: string) {
    pressed.value = eventPosition(map.value, layer.value, code, hint.value)?.id
    clearTimeout(releaseTimer)
    releaseTimer = setTimeout(() => { pressed.value = undefined }, 170)
  }

  function type(value: string) {
    if (done.value || Array.from(value).length !== 1) return
    const now = Date.now()
    startedAt.value ??= now
    clock.value = now
    if (value === target.value) {
      cursor.value++
      mistake.value = ''
    } else {
      errors.value++
      mistake.value = value
    }
  }

  function revert() {
    if (!done.value) mistake.value = ''
  }

  function applyImport(source: string, name: string) {
    const parsed = parseVial(source)
    map.value = parsed
    filename.value = name
    imported.value = true
    manualLayer.value = null
    reset()
  }

  function importMap(source: string, name: string) {
    applyImport(source, name)
    storageWarning.value = ''
    try {
      localStorage.setItem(storageKey, JSON.stringify({ name, source }))
    } catch {
      storageWarning.value = 'Раскладка открыта на эту сессию. Браузер не смог сохранить файл.'
    }
  }

  function restoreBase() {
    map.value = base
    filename.value = 'base.vil'
    imported.value = false
    storageWarning.value = ''
    manualLayer.value = null
    reset()
    try {
      localStorage.removeItem(storageKey)
    } catch {
      storageWarning.value = 'Браузер не смог удалить сохранённую раскладку.'
    }
  }

  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const value = JSON.parse(saved)
      if (typeof value?.source !== 'string' || typeof value?.name !== 'string') throw new Error('Invalid storage')
      applyImport(value.source, value.name)
    }
  } catch {
    storageWarning.value = 'Сохранённая раскладка недоступна. Открыта рабочая база Sofle 66.'
  }

  return {
    map, filename, imported, storageWarning, language, mode, cursor, errors, mistake,
    exercise, target, done, hint, layer, manualLayer, held, elapsed, wpm, accuracy, progress, pressed,
    reset, setLanguage, setMode, nextExercise, tick, flash, type, revert, importMap, restoreBase,
  }
})
