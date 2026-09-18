/** Маска кода: три символа, дефис, три символа. Алфавит без 0/O и 1/I — как в базе. */
export const INVITE_CODE = /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/

/**
 * Приводит ввод к виду кода: «abc d3f», «ABCD3F», «abc-d3f» → «ABC-D3F».
 * Код диктуют по телефону и переписывают с бумажки — строгий ввод здесь только мешает.
 */
export function normalizeCode(value:string) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean
}
