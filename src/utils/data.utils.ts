/*
  limitNumberWithinRange()

  given min, max
*/
export const limitNumberWithinRange = function (
  value: number,
  min: number,
  max: number
): number {
  return Math.min(Math.max(value, min), max)
}
