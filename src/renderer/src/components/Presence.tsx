import { useEffect, useRef, useState, type ReactNode } from "react";

// 사라질 때도 움직이게: show가 false가 되어도 나가는 움직임(ms)이 끝날 때까지 마지막 내용을 남겨 둔다.
// 자식에게 "enter" / "exit"를 넘겨 주면 CSS가 data-motion으로 움직임을 고른다.
export function Presence<T>({ value, ms = 180, children }: { value: T | null | undefined | false; ms?: number; children: (v: T, state: "enter" | "exit") => ReactNode }) {
  const last = useRef<T | null>(null);
  const [exiting, setExiting] = useState(false);
  const shown = value !== null && value !== undefined && value !== false;
  if (shown) last.current = value as T;
  useEffect(() => {
    if (shown) {
      setExiting(false);
      return;
    }
    if (last.current === null) return;
    setExiting(true);
    const t = setTimeout(() => {
      last.current = null;
      setExiting(false);
    }, ms);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown && !exiting) return null;
  return <>{children(last.current as T, shown ? "enter" : "exit")}</>;
}
