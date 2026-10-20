// 지금 할 일 카드의 글로우 움직임 (실험). 설정에서 고르고, 같은 앱의 모든 창이 localStorage로 함께 바뀐다.
// 토스 인터랙션 기준(피드백·다음 행동 안내·지금 일어나는 일 전달)에 맞는 순간에만 움직인다. 아무 일 없을 때 계속 도는 움직임은 두지 않는다.
// static: 고정 · nudge: 목록을 열고 망설이면 한 번 “여기서 시작해요” · press: 누르는 순간 빛이 손끝에 모임
// handoff: 체크한 빛이 다음 할 일로 넘어감 · all: 모두. 생각 중·답 도착은 static 말고 모두에서.
export const GLOW_MODES = ["static", "nudge", "press", "handoff", "all"] as const;
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
