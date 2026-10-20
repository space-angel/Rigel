import { useLayoutEffect, useRef, type RefObject } from "react";

// 줄이 생기거나 사라지거나 순서가 바뀌면, 남은 줄이 원래 자리에서 새 자리로 미끄러지게 한다(FLIP).
// 위치만 읽고 transform만 움직인다(WAAPI → GPU 합성). 렌더마다 [data-flip-id] 요소의 위치를 기억해 두고 비교한다.
export function useFlip(root: RefObject<HTMLElement | null>, paused: RefObject<boolean>) {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const box = root.current;
    if (!box) return;
    const base = box.getBoundingClientRect().top - box.scrollTop;
    const next = new Map<string, number>();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const el of box.querySelectorAll<HTMLElement>("[data-flip-id]")) {
      const id = el.dataset.flipId!;
      const top = el.getBoundingClientRect().top - base;
      next.set(id, top);
      const prev = last.current.get(id);
      if (prev === undefined || paused.current || reduce || el.classList.contains("is-completing")) continue;
      const dy = prev - top;
      if (Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
        duration: 240,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        composite: "add", // 이미 움직이는 중(새 할 일 미끄러짐 등)이어도 더해서 이어지게
      });
    }
    last.current = next;
  });
}
