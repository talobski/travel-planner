/**
 * Moves the item with `id` to position `toIndex` among the items that pass `isMember`, such as the
 * activities on one day or the quotes in one section. The subset's slots in the full list are refilled in the
 * new order, so every other item keeps its place.
 */
export function moveAmong<T extends { id: string }>(
  items: readonly T[],
  isMember: (item: T) => boolean,
  id: string,
  toIndex: number,
): T[] {
  const members = items.filter(isMember)
  const from = members.findIndex((item) => item.id === id)
  const to = Math.max(0, Math.min(toIndex, members.length - 1))
  if (from === -1 || from === to) return [...items]
  members.splice(to, 0, ...members.splice(from, 1))
  let next = 0
  return items.map((item) => (isMember(item) ? members[next++] : item))
}
