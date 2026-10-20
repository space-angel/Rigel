// 지금 할 일 카드의 글로우 움직임 (실험). 설정에서 고르고, 같은 앱의 모든 창이 localStorage로 함께 바뀐다.
// static: 지금처럼 고정 · breathe: 천천히 숨쉬기 · follow: 마우스를 따라오기 · handoff: 다음 할 일이 이어받을 때 한 번 · all: 모두
export const GLOW_MODES = ["static", "breathe", "follow", "handoff", "all"] as const;
export type GlowMode = (typeof GLOW_MODES)[number];
const KEY = "todoban.glow";

export function getGlow(): GlowMode {
  try {
    const v = localStorage.getItem(KEY);
    return (GLOW_MODES as readonly string[]).includes(v ?? "") ? (v as GlowMode) : "static";
  } catch {
    return "static";
  }
}

export function setGlow(mode: GlowMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // 저장이 안 되면 이 창에서만 바뀐다
  }
  document.documentElement.dataset.glow = mode;
}

// 창을 열 때 한 번 맞추고, 다른 창(설정)에서 바꾸면 따라 바꾼다.
export function watchGlow(): void {
  document.documentElement.dataset.glow = getGlow();
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) document.documentElement.dataset.glow = getGlow();
  });
}

// 이어받기: 지금 할 일 카드가 다른 할 일로 바뀐 순간에만 한 번 움직인다(목록을 다시 열거나 다이얼을 돌려 다시 그릴 때는 안 움직인다).
let lastHeroId: string | null = null;
export function takeHandoff(id: string): boolean {
  const changed = lastHeroId !== null && lastHeroId !== id;
  lastHeroId = id;
  return changed;
}
