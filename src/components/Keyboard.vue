<script setup lang="ts">
import { computed } from 'vue'
import { useTrainer } from '../trainer'
import { effectiveKey } from '../domain/hints'
import { keyLabel, momentaryLayer, normalize } from '../domain/keycodes'
import { keyAt } from '../domain/vial'

const trainer = useTrainer()
const props = defineProps<{ mistakeCounts?: ReadonlyMap<string, number> }>()
const halves = [
  { hand: 'left', title: 'Левая рука' },
  { hand: 'right', title: 'Правая рука' },
] as const

const keys = computed(() => trainer.map.geometry.positions.map(position => {
  const raw = keyAt(trainer.map, trainer.layer, position)
  const effective = effectiveKey(trainer.map, trainer.layer, position)
  const isTransparent = normalize(raw) === 'KC_TRNS'
  const isDisabled = normalize(raw) === 'KC_NO'
  const showHint = trainer.manualLayer === null
  const isHeld = showHint && trainer.held.some(key => key.id === position.id)
  const isShift = showHint && trainer.hint?.shift && ['KC_LSHIFT', 'KC_RSHIFT'].includes(normalize(effective))
  const isTarget = showHint && trainer.hint?.key.id === position.id
  const label = isHeld ? `Fn ${trainer.hint?.layer}` : keyLabel(raw, trainer.language)
  const physicalLabel = isTarget && trainer.layer !== 0 ? keyLabel(keyAt(trainer.map, 0, position), trainer.language) : ''
  return {
    ...position,
    code: normalize(raw),
    label,
    physicalLabel: physicalLabel === label ? '' : physicalLabel,
    inherited: isTransparent && effective !== raw ? keyLabel(effective, trainer.language) : '',
    layerKey: momentaryLayer(raw),
    isTransparent, isDisabled,
    isModifier: isHeld || isShift,
    isTarget,
    mistakes: props.mistakeCounts?.get(position.id),
  }
}))
</script>

<template>
  <div class="board" aria-label="Физическая схема клавиатуры">
    <section v-for="half in halves" :key="half.hand" class="half" :aria-label="half.title">
      <div class="half-caption"><span></span>{{ half.title }}<span></span></div>
      <div class="key-plane" :class="`key-plane--${half.hand}`" :style="{ aspectRatio: trainer.map.geometry.halfWidth / trainer.map.geometry.halfHeight }">
        <div class="keyboard-case" aria-hidden="true"></div>
        <div
          v-for="key in keys.filter(item => item.hand === half.hand)" :key="key.id"
          class="keycap" :class="{
            target: key.isTarget, modifier: key.isModifier, pressed: trainer.pressed === key.id,
            transparent: key.isTransparent, disabled: key.isDisabled, fn: key.layerKey !== null, 'mistake-key': key.mistakes,
          }"
          :style="{
            '--x': key.x, '--y': key.y, '--angle': `${key.angle}deg`,
            '--width': trainer.map.geometry.halfWidth, '--height': trainer.map.geometry.halfHeight,
            '--mistake-strength': key.mistakes ? `${Math.min(55, 14 + 10 * key.mistakes)}%` : undefined,
          }"
          :data-position="key.id" :data-keycode="key.code" :data-mistakes="key.mistakes"
          :title="key.mistakes ? `${key.label} · ошибок ${key.mistakes}` : key.inherited ? `${key.code} · слой 0: ${key.inherited}` : key.code"
        >
          <span :class="{ 'key-label-long': key.label.length > 4 }">{{ key.label }}</span>
          <small v-if="key.mistakes" :aria-label="`Ошибок ${key.mistakes}`">×{{ key.mistakes > 99 ? '99+' : key.mistakes }}</small>
          <small v-else-if="key.physicalLabel || key.inherited">{{ key.physicalLabel || key.inherited }}</small>
        </div>
      </div>
    </section>
  </div>
</template>
