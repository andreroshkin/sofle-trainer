import { geometries, type Geometry, type Position } from './geometry'

export const maxFileSize = 1024 * 1024
export type Keycode = string | number
export type Layer = (Keycode | -1)[][]
export interface Keymap {
  geometry: Geometry
  layers: Layer[]
}

export function parseVial(source: string): Keymap {
  let document: unknown
  try {
    document = JSON.parse(source.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('Файл содержит некорректный JSON.')
  }

  if (!document || typeof document !== 'object' || !('version' in document) || document.version !== 1) {
    throw new Error('Ожидается экспорт Vial (.vil) версии 1.')
  }

  const layers = 'layout' in document ? document.layout : null
  if (!Array.isArray(layers) || !layers.length || layers.length > 32) {
    throw new Error('Поле layout должно содержать от 1 до 32 слоёв.')
  }

  for (const [index, layer] of layers.entries()) {
    if (!Array.isArray(layer) || !layer.length || !layer.every(row => Array.isArray(row) && row.length &&
      row.every((code: unknown) => typeof code === 'string'
        ? code.trim().length > 0 && code.length <= 128
        : Number.isInteger(code) && Number(code) >= -1 && Number(code) <= 65535))) {
      throw new Error(`Слой ${index} содержит некорректные строки или коды клавиш.`)
    }
  }

  const geometry = geometries.find(candidate => {
    const occupied = new Set(candidate.positions.map(key => key.id))
    return layers.every(layer => layer.length === candidate.rows &&
      layer.every((row: Keycode[], y: number) => row.length === candidate.columns &&
        row.every((code, x) => (code !== -1) === occupied.has(`${y}-${x}`))))
  })

  if (!geometry) {
    throw new Error('Геометрия файла не поддерживается. Выбери экспорт Vial для Sofle 66 с матрицей 5 × 16 и 64 позициями, как у base.vil.')
  }
  return { geometry, layers }
}

export function keyAt(map: Keymap, layer: number, position: Position): Keycode {
  return map.layers[layer][position.row][position.column]
}
