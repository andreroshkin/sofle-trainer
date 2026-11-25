<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Keyboard from './components/Keyboard.vue'
import { useTrainer } from './trainer'
import { effectiveKey } from './domain/hints'
import { keyLabel } from './domain/keycodes'
import { keyAt, maxFileSize } from './domain/vial'

const trainer = useTrainer()
const fileInput = ref<HTMLInputElement>()
const touchInput = ref<HTMLInputElement>()
const importError = ref('')
const isImporting = ref(false)
const keyboardTitle = computed(() => trainer.layer === 0 ? 'Базовый' : `Слой ${trainer.layer}`)
const hintText = computed(() => {
  if (trainer.done) return 'Упражнение завершено'
  const hint = trainer.hint
  if (!hint) return 'Для этого символа нет подсказки в выбранной раскладке'
  const raw = keyAt(trainer.map, 0, hint.key)
  const key = keyLabel(hint.layer === 0 ? effectiveKey(trainer.map, 0, hint.key) : raw, trainer.language)
  const fn = hint.layer && trainer.held.length ? [`Fn ${hint.layer}`] : []
  if (hint.layer && !trainer.held.length) return `Слой ${hint.layer} · ${hint.shift ? 'Shift + ' : ''}${keyLabel(effectiveKey(trainer.map, hint.layer, hint.key), trainer.language)}`
  return [...fn, ...(hint.shift ? ['Shift'] : []), key].join(' + ')
})
const exerciseWords = computed(() => trainer.exercise.match(/\S+\s*|\s+/g)?.map((word, index, words) => ({
  word,
  start: words.slice(0, index).reduce((length, value) => length + value.length, 0),
})) ?? [])
const timeLabel = computed(() => {
  const seconds = Math.floor(trainer.elapsed / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})

function onKey(event: KeyboardEvent) {
  if (event.isComposing || event.defaultPrevented || event.ctrlKey || event.metaKey ||
      (event.altKey && !event.getModifierState('AltGraph'))) return
  const element = event.target
  if (element instanceof HTMLElement && (element.isContentEditable ||
      element.closest('input, select, textarea, a, button, summary'))) return
  if (event.repeat) {
    if (event.key === ' ' || event.key === 'Backspace') event.preventDefault()
    return
  }
  trainer.flash(event.code)
  if (event.key === 'Backspace') {
    event.preventDefault()
    trainer.revert()
  } else if (Array.from(event.key).length === 1 && !trainer.done) {
    event.preventDefault()
    trainer.type(event.key)
  }
}

function touchType(event: Event) {
  const input = event.target as HTMLInputElement
  if ((event as InputEvent).isComposing) return
  for (const character of input.value) trainer.type(character)
  input.value = ''
}

function resumeTyping(event: MouseEvent) {
  if (event.detail > 0) (event.currentTarget as HTMLElement).blur()
}

function focusExercise(event: MouseEvent) {
  if (window.matchMedia('(pointer: coarse)').matches) touchInput.value?.focus()
  else (event.currentTarget as HTMLElement).focus()
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || isImporting.value) return
  importError.value = ''
  isImporting.value = true
  try {
    if (!/\.vil$/i.test(file.name)) throw new Error('Выберите файл с расширением .vil.')
    if (file.size > maxFileSize) throw new Error('Размер файла .vil превышает 1 МБ.')
    trainer.importMap(await file.text(), file.name)
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Не удалось прочитать файл.'
  } finally {
    isImporting.value = false
  }
}

let ticker: ReturnType<typeof setInterval>
onMounted(() => {
  window.addEventListener('keydown', onKey)
  ticker = setInterval(trainer.tick, 250)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearInterval(ticker)
})
</script>

<template>
  <header class="topbar">
    <div class="shell header-content">
      <div class="brand">
        <span class="brand-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span>Split Keyboard Trainer</span>
      </div>
      <button type="button" class="button import" :disabled="isImporting" @click="fileInput?.click(); resumeTyping($event)">
        <span aria-hidden="true">↥</span>{{ isImporting ? 'Чтение файла…' : 'Импорт .vil' }}
      </button>
      <input ref="fileInput" class="visually-hidden" aria-label="Файл Vial" type="file" accept=".vil" tabindex="-1" @change="importFile">
    </div>
  </header>

  <main class="shell">
    <div class="intro">
      <div>
        <div class="device"><i aria-hidden="true"></i>{{ trainer.map.geometry.name }}</div>
        <h1>Тренировка печати</h1>
        <p>Практикуй набор на своей раздельной клавиатуре.</p>
      </div>
      <div class="controls">
        <div class="segmented" aria-label="Упражнение" role="group">
          <button type="button" :aria-pressed="trainer.mode === 'text'" @click="trainer.setMode('text'); resumeTyping($event)">Текст</button>
          <button type="button" :aria-pressed="trainer.mode === 'symbols'" @click="trainer.setMode('symbols'); resumeTyping($event)">Символы</button>
        </div>
        <div class="segmented languages" aria-label="Язык упражнения" role="group">
          <button type="button" aria-label="Русский" :aria-pressed="trainer.language === 'ru'" @click="trainer.setLanguage('ru'); resumeTyping($event)">RU</button>
          <button type="button" aria-label="Английский" :aria-pressed="trainer.language === 'en'" @click="trainer.setLanguage('en'); resumeTyping($event)">EN</button>
        </div>
      </div>
    </div>

    <p v-if="importError" class="message error" role="alert">{{ importError }}</p>
    <p v-if="trainer.storageWarning" class="message" role="status">{{ trainer.storageWarning }}</p>

    <section class="training card" aria-labelledby="exercise-title">
      <div class="training-top">
        <h2 id="exercise-title">Упражнение</h2>
        <div class="metrics">
          <div><span data-testid="wpm">{{ trainer.wpm }}</span> <small>слов/мин</small></div>
          <div><span data-testid="accuracy">{{ trainer.accuracy }}%</span> <small>точность</small></div>
          <div class="time" aria-label="Время">{{ timeLabel }}</div>
        </div>
      </div>
      <div tabindex="0" role="group" aria-label="Область набора" class="type-area"
        :class="{ wrong: trainer.mistake }" @click="focusExercise">
        <p class="exercise-copy" :lang="trainer.language"><span v-for="part in exerciseWords" :key="part.start" class="word"><span
          v-for="(char, index) in part.word" :key="index"
          :class="{ completed: part.start + index < trainer.cursor, current: part.start + index === trainer.cursor }"
        >{{ char }}</span></span></p>
      </div>
      <label class="touch-entry">
        Набор с экранной клавиатуры
        <input ref="touchInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
          :disabled="trainer.done" @input="touchType" @compositionend="touchType">
      </label>
      <div class="progress-track" role="progressbar" aria-label="Прогресс упражнения"
        :aria-valuenow="trainer.progress" aria-valuemin="0" aria-valuemax="100">
        <div :style="{ width: trainer.progress + '%' }"></div>
      </div>
      <div class="training-bottom">
        <span v-if="trainer.done" class="done" role="status">✓ Упражнение завершено</span>
        <span v-else-if="trainer.mistake" class="typing-error">
          Введено «{{ trainer.mistake === ' ' ? 'пробел' : trainer.mistake }}». Попробуй ещё раз.
        </span>
        <span v-else-if="trainer.cursor === 0">Начни печатать. Используй системную раскладку {{ trainer.language === 'ru' ? 'RU (ЙЦУКЕН)' : 'EN (US)' }}.</span>
        <span v-else data-testid="character-count">{{ trainer.cursor }} / {{ trainer.exercise.length }} символов</span>
        <div class="exercise-actions">
          <button type="button" class="text-button" @click="trainer.reset(); resumeTyping($event)">
            <span aria-hidden="true">↻</span> Сначала
          </button>
          <button type="button" class="text-button accent" @click="trainer.nextExercise(); resumeTyping($event)">Следующее</button>
        </div>
      </div>
    </section>

    <section class="keyboard card" aria-labelledby="keyboard-title">
      <div class="keyboard-top">
        <div>
          <h2 id="keyboard-title">Клавиатура</h2>
          <p class="file-line">
            <span :title="trainer.filename">{{ trainer.filename }}</span>
            <span aria-hidden="true">·</span>{{ trainer.manualLayer === null ? 'Автоподсказка' : keyboardTitle }}
            <button v-if="trainer.imported" type="button" class="text-button accent" :disabled="isImporting" @click="trainer.restoreBase(); importError = ''; resumeTyping($event)">
              Вернуть базу
            </button>
          </p>
        </div>
        <div class="layers" role="group" aria-label="Слои Vial">
          <button type="button" class="layer-chip" :aria-pressed="trainer.manualLayer === null" @click="trainer.manualLayer = null; resumeTyping($event)">Авто</button>
          <button v-for="(_, index) in trainer.map.layers" :key="index" type="button" class="layer-chip"
            :class="{ live: trainer.layer === index }" :aria-label="`Слой ${index}`"
            :aria-pressed="trainer.manualLayer === index" @click="trainer.manualLayer = index; resumeTyping($event)">
            {{ index }}
          </button>
        </div>
      </div>

      <Keyboard />

      <div class="board-footer">
        <div class="next-key"><span>Подсказка</span><strong data-testid="hint">{{ hintText }}</strong></div>
        <div class="legend"><span><i class="legend-target"></i> Следующая</span><span><i class="legend-mod"></i> Удерживать</span><span>▽ Прозрачная</span><span>— Без действия</span></div>
      </div>
    </section>

    <footer class="footer">
      <span>Аппаратная Fn может быть невидима браузеру. Слои на экране служат подсказкой.</span>
      <span class="local"><i aria-hidden="true"></i>Импорт хранится в браузере</span>
    </footer>
  </main>
</template>
