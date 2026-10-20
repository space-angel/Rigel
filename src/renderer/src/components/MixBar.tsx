import { useRef } from "react";
import { CLAUDE_MIN, moveEdge } from "@shared/shape";
import { SourceIcon } from "./SourceIcon";

// 출처별 비율 막대. 칸 사이 경계를 끌면 이웃한 두 칸만 바뀐다. Claude(일반 지식) 칸은 점선이고 최소 10%.
export function MixBar({ mix, onChange }: { mix: Record<string, number>; onChange: (mix: Record<string, number>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const ids = Object.keys(mix).sort((a, b) => Number(a === "claude") - Number(b === "claude"));
  const values = ids.map((id) => mix[id]!);
  const mins = ids.map((id) => (id === "claude" ? CLAUDE_MIN : 5));

  const startDrag = (i: number) => (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const width = el.getBoundingClientRect().width;
    const x0 = e.clientX;
    const start = values;
    const move = (ev: PointerEvent) => {
      const next = moveEdge(start, i, ((ev.clientX - x0) / width) * 100, mins);
      onChange(Object.fromEntries(ids.map((id, k) => [id, next[k]!])));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="mix" ref={ref}>
      {ids.map((id, i) => (
        <div key={id} className="mix__cell" style={{ flexGrow: values[i] }}>
          <div className={`mix__seg mix__seg--${id === "claude" ? "claude" : i === 0 ? "lead" : "rest"}`} style={{ opacity: id === "claude" || i === 0 ? 1 : Math.max(0.55, 1 - i * 0.15) }}>
            <SourceIcon source={id} size={11} />
            {values[i]! >= 12 && <span>{values[i]}%</span>}
          </div>
          {i < ids.length - 1 && <span className="mix__edge" role="separator" aria-label="Drag to change the mix" onPointerDown={startDrag(i)} />}
        </div>
      ))}
    </div>
  );
}
