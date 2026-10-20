import type { KeyboardEvent } from "react";
import { SIZES, sizeLabel } from "@shared/shape";

// 부채꼴 다이얼(C1 03 How big?). 고른 크기가 가운데 오도록 눈금 전체가 돈다.
const W = 328;
const H = 92;
const R = 190;
const CX = W / 2;
const CY = R + 26;
const STEP = 18; // 크기 사이 각도
const TICK = 2.5;

const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (deg: number, r: number) => ({ x: CX + Math.cos(rad(deg - 90)) * r, y: CY + Math.sin(rad(deg - 90)) * r });

const TICKS = Array.from({ length: Math.round((STEP * 4 + 40) / TICK) + 1 }, (_, i) => -STEP * 2 - 20 + i * TICK);

export function SizeDial({ value, onChange, hint }: { value: number; onChange: (minutes: number) => void; hint?: string }) {
  const index = Math.max(0, SIZES.indexOf(value as (typeof SIZES)[number]));
  const rotation = (2 - index) * STEP;
  const step = (d: number) => onChange(SIZES[Math.min(SIZES.length - 1, Math.max(0, index + d))]!);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="dial"
      role="slider"
      tabIndex={0}
      aria-label="Size"
      aria-valuetext={sizeLabel(value)}
      onKeyDown={onKeyDown}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <g className="dial__scale" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          {TICKS.map((deg) => {
            // 크기 자리는 긴 눈금, 그 사이는 짧은 눈금. 가운데(바늘)에서 멀수록 흐리게.
            const major = Math.abs((deg + STEP * 2) % STEP) < 0.01 && Math.abs(deg) <= STEP * 2;
            const len = major ? 9 : 4;
            const a = at(deg, R);
            const b = at(deg, R - len);
            const fromNeedle = Math.abs(deg + rotation);
            return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dial__tick" style={{ opacity: Math.max(0.12, 0.75 - fromNeedle / 55) }} />;
          })}
          {SIZES.map((m, i) => {
            const deg = (i - 2) * STEP;
            const p = at(deg, R + (i === index ? 16 : 12));
            return (
              <text
                key={m}
                x={p.x}
                y={p.y}
                className={`dial__label${i === index ? " is-active" : ""}`}
                transform={`rotate(${deg} ${p.x} ${p.y})`}
                onClick={() => onChange(m)}
              >
                {sizeLabel(m)}
              </text>
            );
          })}
        </g>
        <path className="dial__needle" d={`M${CX - 4.5} ${CY - R + 13} L${CX + 4.5} ${CY - R + 13} L${CX} ${CY - R + 21} Z`} />
      </svg>
      {hint && <p className="dial__hint">{hint}</p>}
    </div>
  );
}
