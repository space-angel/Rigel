// 지금 할 일 카드의 글로우.
// 이어받기: 지금 할 일 카드가 다른 할 일로 바뀐 순간에만 한 번 움직인다(목록을 다시 열거나 다이얼을 돌려 다시 그릴 때는 안 움직인다).
let lastHeroId: string | null = null;
export function takeHandoff(id: string): boolean {
  const changed = lastHeroId !== null && lastHeroId !== id;
  lastHeroId = id;
  return changed;
}
