import type { Position } from './geometry'
import { browserCode, character, keyLabel, momentaryLayer, normalize, type TypingLayout } from './keycodes'
import { keyAt, type Keymap } from './vial'

export function effectiveKey(map: Keymap, layer: number, position: Position) {
  const raw = keyAt(map, layer, position)
  // A preview models the selected layer over layer 0.
  return normalize(raw) === 'KC_TRNS' && layer !== 0 ? keyAt(map, 0, position) : raw
}

export function fnKeys(map: Keymap, layer: number): Position[] {
  if (layer === 0) return []
  return map.geometry.positions.filter(key => momentaryLayer(keyAt(map, 0, key)) === layer)
}

export interface Hint {
  layer: number
  key: Position
  shift: boolean
}

export function hintShortcut(map: Keymap, hint: Hint, layout: TypingLayout): string {
  const baseKey = keyLabel(keyAt(map, 0, hint.key), layout)
  if (!hint.layer) return hint.shift ? `Shift + ${baseKey}` : baseKey
  if (fnKeys(map, hint.layer).length) return `Fn ${hint.layer} + ${hint.shift ? 'Shift + ' : ''}${baseKey}`
  const layerKey = keyLabel(effectiveKey(map, hint.layer, hint.key), layout)
  return `Слой ${hint.layer} · ${hint.shift ? 'Shift + ' : ''}${layerKey}`
}

export function findHint(map: Keymap, target: string, layout: TypingLayout, preferred: number | null): Hint | undefined {
  const reachable = map.layers.map((_, layer) => layer).filter(layer => layer === 0 || fnKeys(map, layer).length)
  const layers = preferred === null ? reachable : [preferred, ...reachable.filter(layer => layer !== preferred)]
  for (const layer of layers) {
    const held = new Set(fnKeys(map, layer).map(key => key.id))
    for (const shift of [false, true]) {
      const key = map.geometry.positions.find(position =>
        !held.has(position.id) && character(effectiveKey(map, layer, position), layout, shift) === target)
      if (key) return { layer, key, shift }
    }
  }
}

export function eventPosition(map: Keymap, layer: number, code: string, hint: Hint | undefined): Position | undefined {
  const ordered = [layer, 0, ...map.layers.keys()].filter((item, index, all) => all.indexOf(item) === index)
  if (hint && browserCode(effectiveKey(map, hint.layer, hint.key)) === code) return hint.key
  for (const candidate of ordered) {
    const key = map.geometry.positions.find(position => browserCode(effectiveKey(map, candidate, position)) === code)
    if (key) return key
  }
}
