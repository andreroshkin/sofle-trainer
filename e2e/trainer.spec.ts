import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { profileFor, type Result } from '../src/domain/practice'
import { parseVial } from '../src/domain/vial'

const layoutSelect = (page: Page) => page.getByRole('combobox', { name: 'Системная раскладка' })

const base = readFileSync(new URL('../src/assets/base.vil', import.meta.url), 'utf8')
const russianKeys = [
  { key: 'ё', code: 'Backquote' },
  { key: ' ', code: 'Space' },
  { key: '-', code: 'Minus' },
  { key: ' ', code: 'Space' },
  { key: '=', code: 'Equal' },
]

test('русские символы, Fn, прогресс, точность и завершение', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Тренировка печати' })).toBeVisible()
  await expect(page.locator('.keycap')).toHaveCount(64)
  await page.getByRole('button', { name: 'Символы' }).click()
  await expect(page.getByTestId('hint')).toHaveText('Fn 1 + Esc')
  await expect(page.locator('.keycap.target')).toHaveAttribute('data-position', '0-0')
  await expect(page.locator('.keycap.modifier')).toHaveCount(2)

  await page.keyboard.press('X')
  await expect(page.getByTestId('accuracy')).toHaveText('0%')
  const area = page.getByRole('group', { name: 'Область набора' })
  for (const key of russianKeys) await area.dispatchEvent('keydown', key)
  await expect(page.getByTestId('accuracy')).toHaveText('83%')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
  await expect(page.getByTestId('character-count')).toHaveText('5 / 15 символов')
  await page.waitForTimeout(1050)
  await expect(page.getByTestId('wpm')).not.toHaveText('0')
  await page.keyboard.type(' _ + 2026.')
  await expect(page.getByRole('status')).toHaveText('✓ Упражнение завершено')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  const elapsed = await page.locator('.time').textContent()
  await page.waitForTimeout(1100)
  await expect(page.locator('.time')).toHaveText(elapsed!)
  await page.getByRole('button', { name: 'Сначала' }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
})

test('импорт, сохранение, прозрачная и отключённая клавиши, ошибки и сброс', async ({ page }) => {
  await page.goto('/')
  const file = page.getByLabel('Файл Vial')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Импорт .vil' }).click(),
  ])
  await chooser.setFiles({ name: 'base.vil', mimeType: 'application/json', buffer: Buffer.from(base) })
  await expect(page.getByRole('button', { name: 'Вернуть базу' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Слои Vial' }).getByRole('button')).toHaveCount(9)
  const config = JSON.parse(base)
  config.layout[2][0][0] = 'KC_NO'
  await file.setInputFiles({ name: 'custom.vil', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) })
  await expect(page.getByText('custom.vil')).toBeVisible()
  await page.reload()
  await expect(page.getByText('custom.vil')).toBeVisible()
  await page.getByRole('button', { name: 'Слой 2' }).click()
  await expect(page.locator('[data-position="0-0"]')).toHaveAttribute('data-keycode', 'KC_NO')
  await expect(page.locator('[data-position="0-1"]')).toContainText('▽')
  await expect(page.locator('[data-position="0-1"]')).toContainText('1')
  await file.setInputFiles({ name: 'broken.vil', mimeType: 'text/plain', buffer: Buffer.from('{') })
  await expect(page.getByRole('alert')).toContainText('некорректный JSON')
  await expect(page.getByText('custom.vil')).toBeVisible()
  await file.setInputFiles({ name: 'foreign.vil', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"layout":[[["KC_A"]]]}') })
  await expect(page.getByRole('alert')).toContainText('Геометрия файла не поддерживается')
  await page.getByRole('button', { name: 'Вернуть базу' }).click()
  await page.reload()
  await expect(page.getByText('base.vil')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Вернуть базу' })).toHaveCount(0)
})

test('английский набор и интерфейс на узком экране', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  await page.goto('/')
  await expect(page.getByTestId('hint')).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Показать схему' })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Показать схему' }).click()
  await expect(page.locator('.keycap').first()).toBeVisible()
  await page.getByRole('button', { name: 'Свернуть схему' }).click()
  await layoutSelect(page).selectOption('en')
  await expect(layoutSelect(page)).toHaveValue('en')
  await expect(page.locator('.keycap.target')).toHaveText('S')
  await page.getByRole('textbox', { name: 'Набор с экранной клавиатуры' }).fill('smooth')
  await expect(page.getByTestId('character-count')).toContainText('6 /')
  await expect(page.getByTestId('accuracy')).toHaveText('100%')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.close()
})

test('фокус после выбора системной раскладки и отдельный ручной просмотр слоёв', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await layoutSelect(page).selectOption('en')
  const area = page.getByRole('group', { name: 'Область набора' })
  await expect(area).toBeFocused()
  await page.keyboard.type('smooth')
  await expect(page.getByTestId('character-count')).toContainText('6 /')

  await page.getByRole('button', { name: 'Символы' }).press('Space')
  await expect(page.getByTestId('hint')).toHaveText('Fn 1 + Esc')
  await expect(page.getByTestId('hint')).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('region', { name: 'Левая рука' })).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('region', { name: 'Правая рука' })).toBeInViewport({ ratio: 1 })
  await expect(page.locator('[data-position="4-6"]')).toHaveCSS('--angle', '28deg')
  await expect(page.locator('[data-position="4-8"]')).toHaveCSS('--angle', '-28deg')
  await page.getByRole('button', { name: 'Слой 0', exact: true }).click()
  await expect(page.getByText('Просмотр вручную')).toBeVisible()
  await expect(page.locator('.keycap.target, .keycap.modifier')).toHaveCount(0)
  await expect(page.getByTestId('hint')).toHaveText('Fn 1 + Esc')
  await page.getByRole('button', { name: 'Авто' }).click()
  await expect(page.locator('.keycap.target')).toHaveAttribute('data-position', '0-0')
})

test('урок слоя, повтор ошибок и история по раскладке и языку', async ({ page }) => {
  await page.goto('/')
  const lessons = page.locator('details').filter({ hasText: 'Короткие уроки' })
  await lessons.locator('summary').click()
  const firstLayer = lessons.getByRole('button', { name: 'Первый символ через Fn' })
  const area = page.getByRole('group', { name: 'Область набора' })
  for (let run = 0; run < 2; run++) {
    await firstLayer.click()
    await expect(page.getByTestId('hint')).toHaveText('Fn 1 + Esc')
    await page.keyboard.type('xxx')
    await area.dispatchEvent('keydown', russianKeys[0])
    await expect(page.getByRole('heading', { name: 'Результат' })).toBeVisible()
    await expect(page.locator('.misses')).toContainText('ё × 3')
  }
  await expect(page.locator('.mistake-list')).toContainText('Fn 1 + Esc')
  await page.getByRole('button', { name: 'Потренировать эти клавиши' }).press('Enter')
  await expect(area).toBeFocused()
  await expect(area).toHaveText('ё'.repeat(15))
  await expect(page.getByTestId('hint')).toHaveText('Fn 1 + Esc')

  await page.reload()
  const history = page.locator('details').filter({ hasText: 'История тренировок' })
  await history.locator('summary').click()
  await expect(history.locator('li')).toHaveCount(2)
  await expect(history.getByRole('button', { name: 'Потренировать', exact: true })).toBeVisible()
  await layoutSelect(page).selectOption('en')
  await expect(history.locator('li')).toHaveCount(0)
  await layoutSelect(page).selectOption('ru')
  await expect(history.locator('li')).toHaveCount(2)

  const config = JSON.parse(base)
  config.layout[2][0][0] = 'KC_NO'
  await page.getByLabel('Файл Vial').setInputFiles({ name: 'custom.vil', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) })
  await expect(page.getByText('custom.vil')).toBeVisible()
  await expect(history.locator('li')).toHaveCount(0)
  await page.getByRole('button', { name: 'Вернуть базу' }).click()
  await expect(history.locator('li')).toHaveCount(2)
})

test('динамика ошибок сравнивает два окна сохранённых сессий текущей раскладки', async ({ page }) => {
  const profile = profileFor(parseVial(base))
  const config = JSON.parse(base)
  config.layout[2][0][0] = 'KC_NO'
  const otherVial = JSON.stringify(config)
  const sample = (index: number, keys: Result['keys'], overrides: Partial<Result> = {}): Result => ({
    id: `session-${index}`, profile, language: 'en', mode: 'custom', finishedAt: index * 1000,
    accuracy: 80, wpm: 0, elapsed: 0, keys, ...overrides,
  })
  const historyData = [
    sample(1, [{ char: 'z', attempts: 99, errors: 98 }]),
    ...Array.from({ length: 5 }, (_, index) => sample(index + 2, [
      { char: 'a', attempts: 4, errors: 2 }, { char: 'b', attempts: 2, errors: 1 },
      { char: 'e', attempts: 1, errors: 0 },
    ])),
    ...Array.from({ length: 5 }, (_, index) => sample(index + 7, [
      { char: 'a', attempts: 3, errors: 1 }, { char: 'c', attempts: 1, errors: 0 },
      { char: 'e', attempts: 1, errors: 0 },
    ], { typingLayout: 'en' })),
    sample(12, [{ char: 'a', attempts: 8, errors: 7 }], { typingLayout: 'dvorak' }),
    sample(13, [{ char: 'a', attempts: 6, errors: 5 }], { profile: profileFor(parseVial(otherVial)) }),
  ]
  await page.goto('/')
  await page.evaluate(data => {
    localStorage.setItem('split-keyboard-trainer.history.v1', JSON.stringify(data))
    localStorage.setItem('split-keyboard-trainer.typing-layout.v1', 'en')
  }, historyData)
  await page.reload()

  await page.locator('summary').filter({ hasText: 'История тренировок' }).click()
  const trends = page.getByRole('table', { name: 'Динамика ошибок по символам' })
  const values = (char: string) => trends.getByRole('row').filter({
    has: page.getByRole('button', { name: `Потренировать символ ${char}`, exact: true }),
  }).getByRole('cell')
  await expect(values('a')).toHaveText(['5 / 15', '10 / 20', '-16,7 п. п.'])
  await expect(values('b')).toHaveText(['0 / 0', '5 / 10', 'Мало данных'])
  await expect(values('c')).toHaveText(['0 / 5', '0 / 0', 'Мало данных'])
  await expect(values('e')).toHaveText(['0 / 5', '0 / 5', '0 п. п.'])
  await expect(values('z')).toHaveCount(0)

  await layoutSelect(page).selectOption('dvorak')
  await expect(values('a')).toHaveText(['7 / 8', '0 / 0', 'Мало данных'])
  await expect(values('b')).toHaveCount(0)
  await layoutSelect(page).selectOption('en')
  await page.getByLabel('Файл Vial').setInputFiles({
    name: 'alternate.vil', mimeType: 'application/json', buffer: Buffer.from(otherVial),
  })
  await expect(values('a')).toHaveText(['5 / 6', '0 / 0', 'Мало данных'])
  await page.getByRole('button', { name: 'Вернуть базу' }).click()
  await expect(values('a')).toHaveText(['5 / 15', '10 / 20', '-16,7 п. п.'])

  await trends.getByRole('button', { name: 'Потренировать символ a', exact: true }).click()
  const area = page.getByRole('group', { name: 'Область набора' })
  await expect(area).toBeFocused()
  await expect(area).toHaveText('a'.repeat(15))
  await page.keyboard.type('a'.repeat(15))
  await expect(page.getByRole('status')).toHaveText('✓ Упражнение завершено')
  await expect(values('a')).toHaveText(['4 / 27', '9 / 19', '-32,6 п. п.'])
})

test('свой код сохраняет переносы и отступы и использует результат с повтором ошибок', async ({ page }) => {
  await page.goto('/')
  await layoutSelect(page).selectOption('en')
  await page.getByRole('button', { name: 'Свой текст' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Свой текст' })
  const editor = dialog.getByRole('textbox', { name: 'Текст или код для тренировки' })
  const start = dialog.getByRole('button', { name: 'Начать тренировку' })
  await expect(editor).toBeFocused()
  await start.click()
  await expect(dialog.getByRole('alert')).toContainText('Вставь текст')
  await editor.fill('a'.repeat(1201))
  await start.click()
  await expect(dialog.getByRole('alert')).toContainText('1200')
  await editor.fill('[]\r\n\t{}_-=')
  await start.click()
  const area = page.getByRole('group', { name: 'Область набора' })
  await expect(area).toBeFocused()
  expect(await area.textContent()).toBe('[]\n    {}_-=')
  await expect(page.getByTestId('hint')).not.toContainText('нет подсказки')
  await page.keyboard.type('[]')
  await expect(page.getByTestId('hint')).toHaveText('Enter')
  await expect(area.locator('.current')).toHaveClass(/line-break/)
  await page.keyboard.press('Enter')
  await page.keyboard.type('    x{}_-=')
  await expect(page.locator('.misses')).toContainText('{ × 1')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await page.getByRole('button', { name: 'Потренировать эти клавиши' }).click()
  await expect(area).toHaveText('{'.repeat(15))
  await page.getByRole('button', { name: 'К своему тексту' }).click()
  expect(await area.textContent()).toBe('[]\n    {}_-=')
  await page.getByRole('button', { name: 'Свой текст' }).click()
  await expect(editor).toHaveValue('[]\n    {}_-=')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()

  await page.reload()
  await layoutSelect(page).selectOption('en')
  const history = page.locator('details').filter({ hasText: 'История тренировок' })
  await history.locator('summary').click()
  await expect(history.locator('li')).toContainText('Свой текст')
  await page.getByRole('button', { name: 'Свой текст' }).click()
  await expect(editor).toHaveValue('')
})

test('свой русский текст с Enter на узком экране', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Свой текст' }).tap()
  const editor = page.getByRole('textbox', { name: 'Текст или код для тренировки' })
  await editor.fill('ё\nя')
  await page.getByRole('button', { name: 'Начать тренировку' }).tap()
  await expect(page.getByTestId('hint')).toHaveText('Fn 1 + Esc')
  const touch = page.getByRole('textbox', { name: 'Набор с экранной клавиатуры' })
  await expect(touch).toBeFocused()
  await touch.fill('ё')
  await touch.press('Enter')
  await touch.fill('я')
  await expect(page.getByRole('heading', { name: 'Результат' })).toBeVisible()
  await expect(page.getByTestId('accuracy')).toHaveText('100%')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.close()
})

test('ошибки для [ и { отмечаются на одной клавише с отдельными подсказками', async ({ page }) => {
  await page.goto('/')
  await layoutSelect(page).selectOption('en')
  await page.getByRole('button', { name: 'Свой текст' }).click()
  await page.getByRole('textbox', { name: 'Текст или код для тренировки' }).fill('[{')
  await page.getByRole('button', { name: 'Начать тренировку' }).click()
  await expect(page.locator('[data-mistakes]')).toHaveCount(0)
  await page.keyboard.type('x[xx{')

  const highlighted = page.locator('.keycap.mistake-key')
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted).toHaveAttribute('data-position', '4-10')
  await expect(highlighted).toHaveAttribute('data-mistakes', '3')
  await expect(highlighted).toContainText('×3')
  const breakdown = page.locator('.mistake-list > li')
  await expect(breakdown).toHaveCount(1)
  await expect(breakdown).toContainText('Правая рука · Ошибок 3')
  await expect(breakdown).toContainText('Shift + [ · × 2')
  await expect(breakdown).toContainText('[ · × 1')

  await page.getByRole('button', { name: 'Слой 1', exact: true }).click()
  await expect(highlighted).toHaveCount(0)
  await page.getByRole('button', { name: 'Показать ошибки на схеме' }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Клавиатура', exact: true })).toBeFocused()
  await expect(highlighted).toHaveCount(1)

  await page.getByRole('button', { name: 'Потренировать эти клавиши' }).click()
  await expect(page.getByRole('group', { name: 'Область набора' })).toHaveText('{['.repeat(8))
  await expect(page.getByTestId('hint')).toHaveText('Shift + [')
  await expect(highlighted).toHaveCount(0)
})

test('на телефоне можно раскрыть карту ошибок, символ без подсказки не получает позицию', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  await page.goto('/')
  await layoutSelect(page).selectOption('en')
  await page.getByRole('button', { name: 'Свой текст' }).tap()
  await page.getByRole('textbox', { name: 'Текст или код для тренировки' }).fill('[ё')
  await page.getByRole('button', { name: 'Начать тренировку' }).tap()
  await page.getByRole('textbox', { name: 'Набор с экранной клавиатуры' }).fill('x[xё')

  const note = page.getByText('Без подсказки в этой раскладке')
  await expect(note).toContainText('ё')
  await expect(page.getByRole('button', { name: 'Показать схему' })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Показать ошибки на схеме' }).tap()
  await expect(page.locator('.keycap.mistake-key')).toBeVisible()
  await expect(page.locator('.keycap.mistake-key')).toHaveAttribute('data-mistakes', '1')
  await expect(page.locator('.mistake-list')).not.toContainText('ё')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await page.close()
})

test('Dvorak и Colemak меняют физические подсказки, урок и историю', async ({ page }) => {
  await page.goto('/')
  const selector = layoutSelect(page)
  const area = page.getByRole('group', { name: 'Область набора' })
  await selector.selectOption('dvorak')
  await expect(area).toBeFocused()
  await expect(page.locator('[data-position="2-2"]')).toHaveText('O')
  const lessons = page.locator('details').filter({ hasText: 'Короткие уроки' })
  await lessons.locator('summary').click()
  await lessons.getByRole('button', { name: 'Буквы', exact: true }).click()
  await expect(area).toContainText('aoeuidhtns')

  await page.getByRole('button', { name: 'Свой текст' }).click()
  await page.getByRole('textbox', { name: 'Текст или код для тренировки' }).fill('o{')
  await page.getByRole('button', { name: 'Начать тренировку' }).click()
  await area.dispatchEvent('keydown', { code: 'KeyS', key: 'o' })
  await expect(page.getByTestId('hint')).toHaveText('Fn 1 + Shift + ⌫')
  await expect(page.locator('.keycap.target')).toHaveAttribute('data-position', '0-14')
  await area.dispatchEvent('keydown', { code: 'KeyX', key: 'x' })
  await area.dispatchEvent('keydown', { code: 'Minus', key: '{', shiftKey: true })
  await expect(page.locator('[data-mistakes="1"]')).toHaveAttribute('data-position', '0-14')
  await expect(page.locator('.mistake-list')).toContainText('Fn 1 + Shift + ⌫')

  await page.reload()
  await expect(selector).toHaveValue('dvorak')
  const history = page.locator('details').filter({ hasText: 'История тренировок' })
  await history.locator('summary').click()
  await expect(history.locator('li')).toHaveCount(1)
  await selector.selectOption('colemak')
  await expect(history.locator('li')).toHaveCount(0)
  await expect(page.locator('[data-position="2-2"]')).toHaveText('R')
  await lessons.locator('summary').click()
  await lessons.getByRole('button', { name: 'Буквы', exact: true }).click()
  await expect(area).toContainText('arstdhneio')
  await selector.selectOption('en')
  await expect(history.locator('li')).toHaveCount(0)
  await expect(page.locator('[data-position="2-2"]')).toHaveText('S')
})
