<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Keyboard from './components/Keyboard.vue'
import { useTrainer } from './trainer'
import { hintShortcut } from './domain/hints'
import { isTypingLayout, typingLayouts } from './domain/keycodes'
import { maxFileSize } from './domain/vial'
import { customTextLimit, normalizeCustomText, reviewMistakes, type KeyStats, type Mode } from './domain/practice'

const trainer = useTrainer()
const fileInput = ref<HTMLInputElement>()
const touchInput = ref<HTMLTextAreaElement>()
const typeArea = ref<HTMLElement>()
const keyboardHeading = ref<HTMLElement>()
const customDialog = ref<HTMLDialogElement>()
const customDraft = ref('')
const customError = ref('')
const customLength = computed(() => Array.from(normalizeCustomText(customDraft.value)).length)
const importError = ref('')
const isImporting = ref(false)
const narrow = window.matchMedia('(max-width: 650px)')
const compact = ref(narrow.matches)
const boardOverride = ref<boolean | null>(null)
const boardVisible = computed(() => boardOverride.value ?? !compact.value)
const currentLesson = computed(() => trainer.availableLessons.find(lesson => lesson.id === trainer.mode))
const reviewTitle = computed(() => {
  if (trainer.reviewText) return 'Повторение'
  if (trainer.customActive) return 'Свой текст'
  return currentLesson.value?.title ?? 'Упражнение'
})
const keyboardTitle = computed(() => trainer.layer === 0 ? 'Базовый' : `Слой ${trainer.layer}`)
const hintText = computed(() => trainer.hint ? hintShortcut(trainer.map, trainer.hint, trainer.typingLayout)
  : 'Для этого символа нет подсказки в выбранной раскладке')
const mistakeReview = computed(() => reviewMistakes(trainer.map, trainer.missed, trainer.typingLayout))
const showMistakeMap = computed(() => trainer.manualLayer === null && mistakeReview.value.positions.length > 0)
const mistakeCounts = computed(() => showMistakeMap.value
  ? new Map(mistakeReview.value.positions.map(position => [position.id, position.errors])) : undefined)
const exerciseWords = computed(() => {
  let start = 0
  return (trainer.exercise.match(/[^ \n]+ *| +|\n/g) ?? []).map(word => {
    const chars = Array.from(word)
    const part = { chars, start }
    start += chars.length
    return part
  })
})
const timeLabel = computed(() => {
  const seconds = Math.floor(trainer.elapsed / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})
const dateFormat = new Intl.DateTimeFormat('ru', { dateStyle: 'short', timeStyle: 'short' })
const changeFormat = new Intl.NumberFormat('ru', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const formatChar = (char: string) => char === ' ' ? 'Пробел' : char === '\n' ? 'Enter' : char
const formatSpeed = (wpm: number, elapsed: number) => elapsed >= 1000 ? `${wpm} слов/мин` : '— слов/мин'

function formatErrorChange(latest: Omit<KeyStats, 'char'>, previous: Omit<KeyStats, 'char'>) {
  if (!latest.attempts || !previous.attempts) return 'Мало данных'
  const change = 100 * (latest.errors / latest.attempts - previous.errors / previous.attempts)
  return `${changeFormat.format(change)} п. п.`
}

function updateViewport(event: MediaQueryListEvent) {
  compact.value = event.matches
  boardOverride.value = null
}

function onKey(event: KeyboardEvent) {
  if (event.isComposing || event.defaultPrevented || event.ctrlKey || event.metaKey ||
      (event.altKey && !event.getModifierState('AltGraph'))) return
  const element = event.target
  if (element instanceof HTMLElement && (element.isContentEditable ||
      element.closest('input, select, textarea, a, button, summary'))) return
  const enterIsInput = event.key === 'Enter' && !trainer.done && (trainer.customActive || trainer.target === '\n')
  if (event.repeat) {
    if (event.key === ' ' || event.key === 'Backspace' || enterIsInput) event.preventDefault()
    return
  }
  trainer.flash(event.code)
  if (event.key === 'Backspace') {
    event.preventDefault()
    trainer.revert()
  } else if (enterIsInput || (Array.from(event.key).length === 1 && !trainer.done)) {
    event.preventDefault()
    trainer.type(enterIsInput ? '\n' : event.key)
  }
}

function touchType(event: Event) {
  const input = event.target as HTMLTextAreaElement
  if ((event as InputEvent).isComposing) return
  for (const character of input.value.normalize('NFC')) trainer.type(character)
  input.value = ''
}

function resumeTyping() {
  typeArea.value?.focus({ preventScroll: true })
}

function changeTypingLayout(event: Event) {
  const layout = (event.currentTarget as HTMLSelectElement).value
  if (!isTypingLayout(layout)) return
  trainer.setTypingLayout(layout)
  trainer.manualLayer = null
  resumeTyping()
}

function focusExercise() {
  if (window.matchMedia('(pointer: coarse)').matches) touchInput.value?.focus()
  else resumeTyping()
}

async function revealMistakeMap() {
  boardOverride.value = true
  trainer.manualLayer = null
  await nextTick()
  keyboardHeading.value?.focus({ preventScroll: true })
  keyboardHeading.value?.scrollIntoView({ block: 'start' })
}

async function practiceMistakes() {
  const { mapped } = mistakeReview.value
  trainer.repeatKeys(mapped.length ? mapped : trainer.missed)
  await nextTick()
  focusExercise()
}

async function practiceFromHistory(keys: readonly Pick<KeyStats, 'char'>[]) {
  trainer.repeatKeys(keys)
  await nextTick()
  focusExercise()
  typeArea.value?.scrollIntoView({ block: 'nearest' })
}

function openCustomText() {
  customDraft.value = trainer.customText
  customError.value = ''
  customDialog.value?.showModal()
}

async function submitCustomText() {
  const text = normalizeCustomText(customDraft.value)
  if (!text.trim()) customError.value = 'Вставь текст, чтобы начать тренировку.'
  else if (customLength.value > customTextLimit) customError.value = 'Сократи текст до 1200 символов.'
  else if (/[\p{Cc}\p{Cf}]/u.test(text.replaceAll('\n', ''))) customError.value = 'Удали невидимые управляющие символы и попробуй снова.'
  else {
    trainer.startCustom(text)
    customDialog.value?.close()
    await nextTick()
    focusExercise()
  }
}

watch([() => trainer.cursor, () => trainer.exercise], () => {
  const area = typeArea.value
  if (!area) return
  if (trainer.cursor === 0) area.scrollTop = 0
  const current = area.querySelector('.current')?.getBoundingClientRect()
  if (!current) return
  const bounds = area.getBoundingClientRect()
  if (current.bottom > bounds.bottom - 8) area.scrollTop += current.bottom - bounds.bottom + 8
  else if (current.top < bounds.top + 8) area.scrollTop += current.top - bounds.top - 8
}, { flush: 'post' })

function startLesson(mode: Mode) {
  trainer.setMode(mode)
  trainer.reset()
  trainer.manualLayer = null
  resumeTyping()
  typeArea.value?.scrollIntoView({ block: 'nearest' })
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
    resumeTyping()
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Не удалось прочитать файл.'
  } finally {
    isImporting.value = false
  }
}

let ticker: ReturnType<typeof setInterval>
onMounted(() => {
  window.addEventListener('keydown', onKey)
  narrow.addEventListener('change', updateViewport)
  ticker = setInterval(trainer.tick, 250)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  narrow.removeEventListener('change', updateViewport)
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
      <button type="button" class="button import" :disabled="isImporting" @click="fileInput?.click()">
        <span aria-hidden="true">↥</span>{{ isImporting ? 'Чтение файла…' : 'Импорт .vil' }}
      </button>
      <input ref="fileInput" class="visually-hidden" aria-label="Файл Vial" type="file" accept=".vil" tabindex="-1" @change="importFile">
    </div>
  </header>

  <main class="shell">
    <div class="intro">
      <div>
        <h1>Тренировка печати</h1>
        <p class="active-map">
          <span>{{ trainer.map.geometry.name }}</span>
          <span class="active-map-name" :title="trainer.filename">{{ trainer.filename }}</span>
          <button v-if="trainer.imported" type="button" class="text-button accent" :disabled="isImporting"
            @click="trainer.restoreBase(); importError = ''; resumeTyping()">Вернуть базу</button>
        </p>
      </div>
      <div class="controls">
        <div class="segmented" aria-label="Упражнение" role="group">
          <button type="button" :aria-pressed="!trainer.customActive && !trainer.reviewText && trainer.mode === 'text'" @click="trainer.setMode('text'); resumeTyping()">Текст</button>
          <button type="button" :aria-pressed="!trainer.customActive && !trainer.reviewText && trainer.mode === 'symbols'" @click="trainer.setMode('symbols'); resumeTyping()">Символы</button>
          <button type="button" aria-haspopup="dialog" :class="{ selected: trainer.customActive && !trainer.reviewText }"
            @click="openCustomText">Свой текст</button>
        </div>
        <select class="layout-select" aria-label="Системная раскладка" :value="trainer.typingLayout" @change="changeTypingLayout">
          <option v-for="(name, id) in typingLayouts" :key="id" :value="id">{{ name }}</option>
        </select>
      </div>
    </div>

    <dialog ref="customDialog" class="custom-dialog" aria-labelledby="custom-title">
      <form @submit.prevent="submitCustomText">
        <h2 id="custom-title">Свой текст</h2>
        <label for="custom-text">Текст или код для тренировки</label>
        <textarea id="custom-text" v-model="customDraft" rows="6" autofocus spellcheck="false"
          aria-describedby="custom-help custom-count" :aria-invalid="Boolean(customError)" @input="customError = ''"></textarea>
        <p id="custom-help">Переносы вводятся через Enter. Табуляция превращается в четыре пробела.</p>
        <p id="custom-count">{{ customLength }} / {{ customTextLimit }} символов</p>
        <p v-if="customError" class="error" role="alert">{{ customError }}</p>
        <div class="exercise-actions">
          <button type="button" class="button" @click="customDialog?.close()">Отмена</button>
          <button type="submit" class="button primary">Начать тренировку</button>
        </div>
      </form>
    </dialog>

    <p v-if="importError" class="message error" role="alert">{{ importError }}</p>
    <p v-if="trainer.storageWarning" class="message" role="status">{{ trainer.storageWarning }}</p>

    <section class="training card" aria-labelledby="exercise-title">
      <div class="training-top">
        <h2 id="exercise-title">{{ reviewTitle }}</h2>
        <div class="metrics">
          <div><span data-testid="wpm">{{ trainer.wpm }}</span> <small>слов/мин</small></div>
          <div><span data-testid="accuracy">{{ trainer.accuracy }}%</span> <small>точность</small></div>
          <div class="time" aria-label="Время">{{ timeLabel }}</div>
        </div>
      </div>
      <div ref="typeArea" tabindex="0" role="group" aria-label="Область набора" class="type-area"
        :class="{ wrong: trainer.mistake }" @click="focusExercise">
        <p class="exercise-copy" :class="{ 'custom-copy': trainer.customActive || trainer.exercise.includes('\n') }"
          :lang="trainer.language"><span v-for="part in exerciseWords" :key="part.start" class="word"><span
          v-for="(char, index) in part.chars" :key="index"
          :class="{ completed: part.start + index < trainer.cursor, current: part.start + index === trainer.cursor, 'line-break': char === '\n' }"
        >{{ char }}</span></span></p>
      </div>
      <div v-if="!trainer.done" class="next-key">
        <span>{{ trainer.hint?.layer && trainer.held.length ? 'Удерживай и нажми' : 'Следующая клавиша' }}</span>
        <strong data-testid="hint">{{ hintText }}</strong>
      </div>
      <label class="touch-entry">
        Набор с экранной клавиатуры
        <textarea ref="touchInput" rows="1" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
          :disabled="trainer.done" @input="touchType" @compositionend="touchType"></textarea>
      </label>
      <div class="progress-track" role="progressbar" aria-label="Прогресс упражнения"
        :aria-valuenow="trainer.progress" aria-valuemin="0" aria-valuemax="100">
        <div :style="{ width: trainer.progress + '%' }"></div>
      </div>
      <div class="training-bottom">
        <span v-if="trainer.done" class="done" role="status">✓ Упражнение завершено</span>
        <span v-else-if="trainer.mistake" class="typing-error" aria-live="polite">
          Ошибка. Введено «{{ formatChar(trainer.mistake) }}», нужно «{{ formatChar(trainer.target) }}».
        </span>
        <span v-else-if="trainer.cursor === 0">Начни печатать. В системе должна быть выбрана {{ typingLayouts[trainer.typingLayout] }}.</span>
        <span v-else data-testid="character-count">{{ trainer.cursor }} / {{ trainer.length }} символов</span>
        <div class="exercise-actions">
          <button type="button" class="text-button" @click="trainer.reset(); resumeTyping()">
            <span aria-hidden="true">↻</span> Сначала
          </button>
          <button v-if="!trainer.done && !trainer.customActive" type="button" class="text-button accent" @click="trainer.nextExercise(); resumeTyping()">Следующее</button>
          <button v-if="!trainer.done && trainer.customActive && trainer.reviewText" type="button" class="text-button accent"
            @click="trainer.nextExercise(); resumeTyping()">К своему тексту</button>
        </div>
      </div>
      <div v-if="trainer.result" class="result">
        <div>
          <h3>Результат</h3>
          <p>{{ trainer.result.accuracy }}% точность · {{ formatSpeed(trainer.result.wpm, trainer.result.elapsed) }} · {{ timeLabel }}</p>
          <p v-if="trainer.missed.length" class="misses">
            Ошибки <span v-for="key in trainer.missed" :key="key.char"><kbd>{{ formatChar(key.char) }}</kbd> × {{ key.errors }}</span>
          </p>
          <p v-else>Все символы набраны с первой попытки.</p>
        </div>
        <div class="exercise-actions">
          <button v-if="trainer.missed.length" type="button" class="button primary"
            @click="practiceMistakes">{{ mistakeReview.mapped.length ? 'Потренировать эти клавиши' : 'Повторить ошибки' }}</button>
          <button v-if="mistakeReview.positions.length" type="button" class="button" @click="revealMistakeMap">Показать ошибки на схеме</button>
          <button v-if="trainer.customActive && !trainer.reviewText" type="button" class="button" @click="openCustomText">Изменить текст</button>
          <button v-else type="button" class="button" @click="trainer.nextExercise(); resumeTyping()">
            {{ trainer.customActive ? 'К своему тексту' : 'Следующее упражнение' }}
          </button>
        </div>
        <p v-if="mistakeReview.mapped.length > 5" class="result-note">Тренировка возьмёт пять символов с наибольшим числом ошибок.</p>
        <p v-if="mistakeReview.unmapped.length" class="result-note">Без подсказки в этой раскладке
          <kbd v-for="key in mistakeReview.unmapped" :key="key.char">{{ formatChar(key.char) }}</kbd>
        </p>
      </div>
    </section>

    <section class="keyboard card" aria-labelledby="keyboard-title">
      <div class="keyboard-top">
        <div>
          <h2 id="keyboard-title" ref="keyboardHeading" tabindex="-1">Клавиатура</h2>
          <p class="file-line" v-if="showMistakeMap">Ошибки за упражнение · базовый слой</p>
          <p class="file-line" v-else>{{ trainer.manualLayer === null ? 'Схема следует за упражнением' : `Просмотр вручную · ${keyboardTitle}` }}</p>
        </div>
        <button type="button" class="button" :aria-expanded="boardVisible" aria-controls="keyboard-preview keyboard-layers"
          @click="boardOverride = !boardVisible">{{ boardVisible ? 'Свернуть схему' : 'Показать схему' }}</button>
        <div v-show="boardVisible" id="keyboard-layers" class="layers" role="group" aria-label="Слои Vial">
          <button type="button" class="layer-chip" :aria-pressed="trainer.manualLayer === null" @click="trainer.manualLayer = null">Авто</button>
          <button v-for="(_, index) in trainer.map.layers" :key="index" type="button" class="layer-chip"
            :class="{ live: trainer.layer === index }" :aria-label="`Слой ${index}`"
            :aria-pressed="trainer.manualLayer === index" @click="trainer.manualLayer = index">
            {{ index }}
          </button>
        </div>
      </div>
      <div v-show="boardVisible" id="keyboard-preview">
        <Keyboard :mistake-counts="mistakeCounts" />
        <div class="board-footer">
          <div v-if="showMistakeMap" class="mistake-review">
            <h3>Какие клавиши потренировать</h3>
            <ul class="mistake-list">
              <li v-for="position in mistakeReview.positions" :key="position.id">
                <div><strong>{{ position.label }}</strong> · {{ position.hand === 'left' ? 'Левая рука' : 'Правая рука' }} · Ошибок {{ position.errors }}</div>
                <ul class="mistake-symbols">
                  <li v-for="symbol in position.symbols" :key="symbol.char">
                    <kbd>{{ formatChar(symbol.char) }}</kbd><span>{{ symbol.shortcut }} · × {{ symbol.errors }}</span>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
          <div v-else class="legend"><span><i class="legend-target"></i> Нажать</span><span><i class="legend-mod"></i> Удерживать</span><span>▽ Прозрачная</span><span>— Без действия</span></div>
        </div>
      </div>
    </section>

    <details class="card extra">
      <summary>Короткие уроки</summary>
      <ul class="lesson-list">
        <li v-for="lesson in trainer.availableLessons" :key="lesson.id">
          <button type="button" class="button" @click="startLesson(lesson.id)">{{ lesson.title }}</button>
          <span>{{ lesson.description }}</span>
        </li>
        <li><button type="button" class="button" @click="startLesson('symbols')">Символы и сочетания</button>
          <span>Закрепи знаки препинания, Shift и переходы между слоями.</span></li>
      </ul>
    </details>

    <details class="card extra">
      <summary>История тренировок <span>{{ trainer.recent.length || '' }}</span></summary>
      <p v-if="trainer.historyWarning" class="history-warning">{{ trainer.historyWarning }}</p>
      <p v-if="!trainer.recent.length">Здесь появятся результаты для {{ typingLayouts[trainer.typingLayout] }} с текущим файлом Vial.</p>
      <template v-else>
        <div v-if="trainer.suggested.length" class="recommendation">
          <p>Чаще всего в последних тренировках вызывали ошибки <kbd v-for="key in trainer.suggested" :key="key.char"
              :title="`Ошибок ${key.errors} из ${key.attempts} попыток`">{{ formatChar(key.char) }}</kbd></p>
          <button type="button" class="button" @click="practiceFromHistory(trainer.suggested)">Потренировать</button>
        </div>
        <table v-if="trainer.trends.length" class="error-trends" aria-describedby="error-trends-note">
          <caption>Динамика ошибок по символам</caption>
          <thead>
            <tr>
              <th scope="col">Символ</th>
              <th scope="col">Последние 5</th>
              <th scope="col">Предыдущие 5</th>
              <th scope="col">Изменение доли ошибок</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="trend in trainer.trends" :key="trend.char">
              <th scope="row">
                <button type="button" class="button" :aria-label="`Потренировать символ ${formatChar(trend.char)}`"
                  @click="practiceFromHistory([trend])">{{ formatChar(trend.char) }}</button>
              </th>
              <td>{{ trend.latest.errors }} / {{ trend.latest.attempts }}</td>
              <td>{{ trend.previous.errors }} / {{ trend.previous.attempts }}</td>
              <td>{{ formatErrorChange(trend.latest, trend.previous) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="trainer.trends.length" id="error-trends-note">Ошибки / попытки за завершённые тренировки. Нажми на символ, чтобы потренировать его.</p>
        <ol class="history-list">
          <li v-for="entry in trainer.recent" :key="entry.id">
            <time :datetime="new Date(entry.finishedAt).toISOString()">{{ dateFormat.format(entry.finishedAt) }}</time>
            <span>{{ entry.mode === 'custom' ? 'Свой текст · ' : '' }}{{ entry.accuracy }}% точность · {{ formatSpeed(entry.wpm, entry.elapsed) }}</span>
          </li>
        </ol>
      </template>
    </details>

    <details class="card extra">
      <summary>Как импортировать раскладку Vial</summary>
      <p>В Vial сохрани раскладку через <span lang="en">File → Save current layout</span>. Здесь нажми «Импорт .vil» и выбери файл Sofle 66. Раскладка сохраняется в этом браузере.</p>
    </details>

    <footer class="footer">
      <span>Аппаратная Fn может быть невидима браузеру. Слои на экране служат подсказкой.</span>
    </footer>
  </main>
</template>
