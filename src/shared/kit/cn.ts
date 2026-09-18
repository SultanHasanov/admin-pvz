/** Склейка классов: `false`, `null` и `undefined` отбрасываются. */
export const cn = (...parts:(string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
