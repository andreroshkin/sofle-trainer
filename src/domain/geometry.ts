export interface Position {
  id: string
  row: number
  column: number
  hand: 'left' | 'right'
  x: number
  y: number
  angle: number
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

const halfWidth = 7.8

function addPair(row: number, column: number, x: number, y: number, angle = 0) {
  const rightColumn = 14 - column
  positions.push(
    { id: `${row}-${column}`, row, column, hand: 'left', x, y, angle },
    { id: `${row}-${rightColumn}`, row, column: rightColumn, hand: 'right', x: halfWidth - 1 - x, y, angle: -angle },
  )
}

// Approximate top view of the wireless Sofle 66. Vial matrix positions are independent of these dimensions.
const stagger = [0.39, 0.37, 0.16, 0.05, 0.17, 0.29, 0.39]
for (let row = 0; row < 4; row++) {
  for (let column = 0; column < (row === 0 ? 6 : 7); column++) {
    addPair(row, column, 0.22 + column, row + 0.2 + stagger[column])
  }
}

const thumbs = [
  { x: 2.22, y: 4.41, angle: 0 },
  { x: 3.22, y: 4.3, angle: 0 },
  { x: 4.22, y: 4.42, angle: 0 },
  { x: 5.31, y: 4.68, angle: 15 },
  { x: 6.42, y: 5.12, angle: 28 },
]
thumbs.forEach(({ x, y, angle }, index) => addPair(4, index + 2, x, y, angle))
positions.sort((a, b) => a.row - b.row || a.column - b.column)

export const sofle66: Geometry = {
  name: 'Sofle 66',
  rows: 5,
  columns: 16,
  halfWidth,
  halfHeight: 6.48,
  positions,
}

export const geometries: readonly Geometry[] = [sofle66]
