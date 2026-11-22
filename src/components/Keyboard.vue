<script setup lang="ts">
import { computed } from 'vue'
import { useTrainer } from '../trainer'
import { effectiveKey } from '../domain/hints'
import { keyLabel, momentaryLayer, normalize } from '../domain/keycodes'
import { keyAt } from '../domain/vial'

const trainer = useTrainer()
const halves = [
  { hand: 'left', title: 'Левая рука' },
  { hand: 'right', title: 'Правая рука' },
] as const

const keys = computed(() => trainer.map.geometry.positions.map(position => {
  const raw = keyAt(trainer.map, trainer.layer, position)
  const effective = effectiveKey(trainer.map, trainer.layer, position)
  const isTransparent = normalize(raw) === 'KC_TRNS'
  const isDisabled = normalize(raw) === 'KC_NO'
  const isHeld = trainer.held.some(key => key.id === position.id)
  const isShift = trainer.hint?.shift && ['KC_LSHIFT', 'KC_RSHIFT'].includes(normalize(effective))
  return {
    ...position,
    code: normalize(raw),
    label: isHeld ? `Fn ${trainer.hint?.layer}` : keyLabel(raw, trainer.language),
    inherited: isTransparent && effective !== raw ? keyLabel(effective, trainer.language) : '',
    layerKey: momentaryLayer(raw),
    isTransparent, isDisabled,
    isModifier: isHeld || isShift,
    isTarget: trainer.layer === trainer.hint?.layer && trainer.hint.key.id === position.id,
  }
}))
</script>

<template>
  <div class="board" aria-label="Физическая схема клавиатуры">
    <section v-for="half in halves" :key="half.hand" class="half" :aria-label="half.title">
      <div class="half-caption"><span></span>{{ half.title }}<span></span></div>
      <div class="key-plane" :style="{ aspectRatio: trainer.map.geometry.halfWidth / trainer.map.geometry.halfHeight }">
        <div
          v-for="key in keys.filter(item => item.hand === half.hand)" :key="key.id"
          class="keycap" :class="{
            target: key.isTarget, modifier: key.isModifier, pressed: trainer.pressed === key.id,
            transparent: key.isTransparent, disabled: key.isDisabled, fn: key.layerKey !== null,
          }"
          :style="{
            '--x': key.x, '--y': key.y,
            '--width': trainer.map.geometry.halfWidth, '--height': trainer.map.geometry.halfHeight,
          }"
          :data-position="key.id" :data-keycode="key.code"
          :title="key.inherited ? `${key.code} · слой 0: ${key.inherited}` : key.code"
        >
          <span>{{ key.label }}</span>
          <small v-if="key.inherited">{{ key.inherited }}</small>
        </div>
      </div>
    </section>
  </div>
</template>
