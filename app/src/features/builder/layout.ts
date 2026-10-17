import { SLOTS } from '../../lib/build'
import type { Slot } from '../../lib/build'

type V3 = [number, number, number]
export interface Box { slot: Slot; position: [number, number, number]; size: [number, number, number]; filled: boolean }

// Centimetres, [x=width, y=height, z=depth]. Case centred at the origin. Tower layout: the
// motherboard stands against the -x side wall and parts protrude from it along +x.
const CASE: V3 = [21, 46, 45]
const BOARD_X = -10 // board is 0.2 thick: spans x -10.1..-9.9
const FACE_X = BOARD_X + 0.1 // surface parts attach to
const POS = {
  case: [0, 0, 0] as V3,
  motherboard: [BOARD_X, 4, -6] as V3,
  cpu: [FACE_X + 0.25, 8, -6] as V3,
  cooler: [FACE_X + 6.25, 8, -6] as V3,
  gpu: [FACE_X + 6, -5, 0] as V3, // z centred so the longest card still fits the case depth
  psu: [0, -18.7, -8] as V3,
  storage: [5, -12, 18] as V3,
}
const RAM_BASE: V3 = [FACE_X + 1.55, 10, -2] // sticks stand on the board, 1 cm apart along y

const num = (v: string | undefined, d: number) => {
  const n = Number(v)
  return v !== undefined && Number.isFinite(n) && n > 0 ? n : d
}
/** Leading integer of "2 x 16 GB", "4x8GB", "4"; 2 when unparseable. */
export const moduleCount = (v: string | undefined): number => {
  const n = Number(/^\s*(\d+)/.exec(v ?? '')?.[1])
  return n >= 1 ? n : 2
}

export function layoutFor(
  filled: Partial<Record<Slot, boolean>>,
  specs: Partial<Record<Slot, Record<string, string>>>,
): Box[] {
  const f = (s: Slot) => !!filled[s]
  const sizes: Record<Exclude<Slot, 'ram'>, V3> = {
    case: CASE, motherboard: [0.2, 30.5, 24.4], cpu: [0.5, 4, 4], cooler: [12, 15, 12],
    gpu: [12, 4, num(specs.gpu?.lengthMm, 280) / 10], psu: [15, 8.6, 14], storage: [8, 0.3, 2.2],
  }
  const sticks = moduleCount(specs.ram?.modules)
  const boxes: Box[] = []
  for (const slot of SLOTS) {
    if (slot === 'ram') {
      for (let i = 0; i < sticks; i++) {
        boxes.push({ slot, position: [RAM_BASE[0], RAM_BASE[1] + i, RAM_BASE[2]], size: [3.1, 0.4, 13.3], filled: f(slot) })
      }
    } else {
      boxes.push({ slot, position: POS[slot], size: sizes[slot], filled: f(slot) })
    }
  }
  return boxes
}
