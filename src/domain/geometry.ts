export interface Position {
  id: string
  row: number
  column: number
  hand: 'left' | 'right'
  x: number
  y: number
}

export interface Geometry {
  name: string
  rows: number
  columns: number
  halfWidth: number
  halfHeight: number
  positions: readonly Position[]
}

const positions: Position[] = []

function add(row: number, column: number, hand: Position['hand'], x: number, y: number) {
  positions.push({ id: `${row}-${column}`, row, column, hand, x, y })
}

const stagger = [0.24, 0.13, 0, 0.15, 0.33, 0.42, 0.49]
for (let row = 0; row < 4; row++) {
  const leftCount = row === 0 ? 6 : 7
  const rightStart = row === 0 ? 9 : 8
  for (let column = 0; column < leftCount; column++) {
    add(row, column, 'left', column, row + stagger[column])
  }
  for (let column = rightStart; column <= 14; column++) {
    add(row, column, 'right', column - 8, row + stagger[14 - column])
  }
}
for (let index = 0; index < 5; index++) {
  add(4, index + 2, 'left', index + 2, 4.23 + index * 0.12)
  add(4, index + 8, 'right', index, 4.23 + (4 - index) * 0.12)
}

export const sofle66: Geometry = {
  name: 'Sofle 66',
  rows: 5,
  columns: 16,
  halfWidth: 7,
  halfHeight: 5.71,
  positions,
}

export const geometries: readonly Geometry[] = [sofle66]
