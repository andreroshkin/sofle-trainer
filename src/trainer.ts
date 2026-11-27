import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import baseVial from './assets/base.vil?raw'
import { eventPosition, findHint, fnKeys } from './domain/hints'
import { isTypingLayout, layoutLanguage, type TypingLayout } from './domain/keycodes'
import { parseVial } from './domain/vial'
import { errorTrends, lessonText, lessons, mistakes, profileFor, readHistory, recordResult, resultLayout, suggestedKeys,
  type KeyStats, type Mode, type Result } from './domain/practice'

const storageKey = 'split-keyboard-trainer.vial.v1'
const layoutStorageKey = 'split-keyboard-trainer.typing-layout.v1'
const base = parseVial(baseVial)

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
  const historyWarning = ref('')
  const typingLayout = ref<TypingLayout>('ru')
  const language = computed(() => layoutLanguage(typingLayout.value))
  const mode = ref<Mode>('text')
  const exerciseIndex = ref(0)
  const manualLayer = ref<number | null>(null)
  const cursor = ref(0)
  const errors = ref(0)
  const mistake = ref('')
  const startedAt = ref<number | null>(null)
  const clock = ref(0)
  const pressed = ref<string>()
  const keyStats = new Map<string, KeyStats>()
  const history = shallowRef<Result[]>([])
  const result = shallowRef<Result>()
  const reviewText = ref('')
  const customText = ref('')
  const customActive = ref(false)
  let releaseTimer: ReturnType<typeof setTimeout> | undefined

  const profile = computed(() => profileFor(map.value))
  const recent = computed(() => history.value
    .filter(entry => entry.profile === profile.value && resultLayout(entry) === typingLayout.value)
    .sort((a, b) => b.finishedAt - a.finishedAt))
  const trends = computed(() => errorTrends(recent.value))
  const suggested = computed(() => suggestedKeys(recent.value)
    .filter(key => findHint(map.value, key.char, typingLayout.value, null)))
  const availableLessons = computed(() => lessons.filter(lesson => lessonText(lesson.id, map.value, typingLayout.value, 0)))
  const exercise = computed(() => {
    if (reviewText.value) return reviewText.value
    if (customActive.value) return customText.value
    const index = exerciseIndex.value
    if (mode.value === 'text') return passages[language.value][index % passages[language.value].length]
    if (mode.value === 'symbols') return symbols[language.value][index % symbols[language.value].length]
    return lessonText(mode.value, map.value, typingLayout.value, index) || lessonText(mode.value, map.value, typingLayout.value, 0)
  })
  const chars = computed(() => Array.from(exercise.value))
  const target = computed(() => chars.value[cursor.value] ?? '')
  const done = computed(() => cursor.value === chars.value.length)
  const hint = computed(() => target.value ? findHint(map.value, target.value, typingLayout.value, null) : undefined)
  const layer = computed(() => manualLayer.value ?? hint.value?.layer ?? 0)
  const held = computed(() => hint.value && hint.value.layer !== 0 ? fnKeys(map.value, hint.value.layer) : [])
  const elapsed = computed(() => startedAt.value === null ? 0 : Math.max(0, clock.value - startedAt.value))
  const wpm = computed(() => elapsed.value >= 1000 ? Math.round(cursor.value * 12000 / elapsed.value) : 0)
  const accuracy = computed(() => cursor.value + errors.value
    ? Math.round(cursor.value / (cursor.value + errors.value) * 100) : 100)
  const progress = computed(() => Math.round(cursor.value / chars.value.length * 100))

  function reset() {
    cursor.value = 0
    errors.value = 0
    mistake.value = ''
    startedAt.value = null
    clock.value = 0
    pressed.value = undefined
    keyStats.clear()
    result.value = undefined
    clearTimeout(releaseTimer)
  }

  function restartAvailableExercise() {
    if (mode.value !== 'text' && mode.value !== 'symbols' && !availableLessons.value.some(item => item.id === mode.value)) {
      mode.value = 'text'
    }
    exerciseIndex.value = 0
    reviewText.value = ''
    reset()
  }

  function setTypingLayout(value: TypingLayout) {
    if (typingLayout.value === value) return
    typingLayout.value = value
    restartAvailableExercise()
    try {
      localStorage.setItem(layoutStorageKey, value)
    } catch {
      // The selected layout is still available for this visit.
    }
  }

  function setMode(value: Mode) {
    if (mode.value === value && !reviewText.value && !customActive.value) return
    mode.value = value
    customActive.value = false
    exerciseIndex.value = 0
    reviewText.value = ''
    reset()
  }

  function startCustom(text: string) {
    customText.value = text
    customActive.value = true
    reviewText.value = ''
    manualLayer.value = null
    reset()
  }

  function nextExercise() {
    if (!customActive.value) exerciseIndex.value++
    reviewText.value = ''
    reset()
  }

  function repeatKeys(keys: readonly Pick<KeyStats, 'char'>[]) {
    const sample = keys.slice(0, 5).map(key => key.char).join('')
    if (!sample) return
    reviewText.value = sample.repeat(Math.ceil(15 / sample.length))
    manualLayer.value = null
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
    const char = target.value
    const stats = keyStats.get(char) ?? { char, attempts: 0, errors: 0 }
    stats.attempts++
    keyStats.set(char, stats)
    if (value === char) {
      cursor.value++
      mistake.value = ''
      if (done.value) {
        const entry: Result = {
          id: globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random()}`,
          profile: profile.value, language: language.value, typingLayout: typingLayout.value,
          mode: reviewText.value ? 'review' : customActive.value ? 'custom' : mode.value,
          finishedAt: now, accuracy: accuracy.value, wpm: wpm.value, elapsed: elapsed.value,
          keys: [...keyStats.values()],
        }
        result.value = entry
        try {
          history.value = recordResult(entry, history.value)
          historyWarning.value = ''
        } catch {
          history.value = [entry, ...history.value]
          historyWarning.value = 'Браузер не сохранил историю. Этот результат доступен до закрытия страницы.'
        }
      }
    } else {
      errors.value++
      stats.errors++
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
    restartAvailableExercise()
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
    restartAvailableExercise()
    try {
      localStorage.removeItem(storageKey)
    } catch {
      storageWarning.value = 'Браузер не смог удалить сохранённую раскладку.'
    }
  }

  try {
    const saved = localStorage.getItem(layoutStorageKey)
    if (isTypingLayout(saved)) typingLayout.value = saved
  } catch {
    // Keep the default layout if browser storage is disabled.
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
  try {
    history.value = readHistory()
  } catch {
    historyWarning.value = 'История тренировок недоступна.'
  }

  return {
    map, filename, imported, storageWarning, historyWarning, language, typingLayout, mode, cursor, errors, mistake,
    exercise, length: computed(() => chars.value.length), target, done, hint, layer, manualLayer, held, elapsed, wpm, accuracy, progress, pressed,
    recent, trends, suggested, result, reviewText, availableLessons, missed: computed(() => mistakes(result.value?.keys ?? [])),
    customText, customActive, startCustom, reset, setTypingLayout, setMode, nextExercise, repeatKeys, tick, flash, type, revert, importMap, restoreBase,
  }
})
