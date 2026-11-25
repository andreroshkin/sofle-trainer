import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

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
  await page.getByRole('button', { name: 'Английский' }).click()
  await expect(page.getByRole('button', { name: 'Английский' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.keycap.target')).toHaveText('S')
  await page.getByRole('textbox', { name: 'Набор с экранной клавиатуры' }).fill('smooth')
  await expect(page.getByTestId('character-count')).toContainText('6 /')
  await expect(page.getByTestId('accuracy')).toHaveText('100%')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.close()
})

test('фокус после смены языка и отдельный ручной просмотр слоёв', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Английский' }).press('Enter')
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
  await page.getByRole('button', { name: 'Повторить ошибки' }).press('Enter')
  await expect(area).toBeFocused()
  await expect(area).toHaveText('ё'.repeat(15))
  await expect(page.getByTestId('hint')).toHaveText('Fn 1 + Esc')

  await page.reload()
  const history = page.locator('details').filter({ hasText: 'История тренировок' })
  await history.locator('summary').click()
  await expect(history.locator('li')).toHaveCount(2)
  await expect(history.getByRole('button', { name: 'Потренировать' })).toBeVisible()
  await page.getByRole('button', { name: 'Английский' }).click()
  await expect(history.locator('li')).toHaveCount(0)
  await page.getByRole('button', { name: 'Русский' }).click()
  await expect(history.locator('li')).toHaveCount(2)

  const config = JSON.parse(base)
  config.layout[2][0][0] = 'KC_NO'
  await page.getByLabel('Файл Vial').setInputFiles({ name: 'custom.vil', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) })
  await expect(page.getByText('custom.vil')).toBeVisible()
  await expect(history.locator('li')).toHaveCount(0)
  await page.getByRole('button', { name: 'Вернуть базу' }).click()
  await expect(history.locator('li')).toHaveCount(2)
})
