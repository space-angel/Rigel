import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";

// 부채꼴 다이얼. 고른 항목이 가운데(바늘 위)에 오도록 눈금 전체가 돈다.
// 빚기 화면의 크기(03 How big?)와 메뉴바 목록 머리의 묶음(Done·Overdue·Today·Tomorrow·Later)에 쓴다.
const W = 328;
const H = 86;
const R = 190;
const CX = W / 2;
const CY = R + 26;
const STEP = 18; // 항목 사이 각도
const PX_PER_STEP = 44; // 이만큼 끌거나 옆으로 밀면 한 칸
const TICK = 2.5;

const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (deg: number, r: number) => ({ x: CX + Math.cos(rad(deg - 90)) * r, y: CY + Math.sin(rad(deg - 90)) * r });

export interface DialItem<K extends string | number> {
  key: K;
  label: string;
  muted?: boolean; // 비어 있는 묶음처럼 고를 수는 있지만 흐리게
}

export function FanDial<K extends string | number>({
  items,
  value,
  onChange,
  label,
  variant = "box",
}: {
  items: DialItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  variant?: "box" | "bare";
}) {
  const index = Math.max(0, items.findIndex((i) => i.key === value));
  const mid = (items.length - 1) / 2;
  // 끄는 동안에는 손을 따라 돌고(drag, 칸 단위), 놓으면 가장 가까운 칸에 멈춘다.
  const [drag, setDrag] = useState<number | null>(null);
  const dragStart = useRef<{ x: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const wheel = useRef(0);
  const live = drag === null ? index : Math.min(items.length - 1, Math.max(0, index + drag));
  const rotation = (mid - live) * STEP;
  const span = STEP * mid;
  const ticks = Array.from({ length: Math.round((span * 2 + 40) / TICK) + 1 }, (_, i) => -span - 20 + i * TICK);
  const step = (d: number) => onChange(items[Math.min(items.length - 1, Math.max(0, index + d))]!.key);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const settle = (offset: number) => {
    const next = Math.min(items.length - 1, Math.max(0, index + Math.round(offset)));
    if (next !== index) onChange(items[next]!.key);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: e.clientX, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (!start.moved && Math.abs(dx) < 4) return;
    // 실제로 끌기 시작한 뒤에만 포인터를 붙잡는다. 그냥 누르면 라벨 클릭이 그대로 간다.
    if (!start.moved) e.currentTarget.setPointerCapture(e.pointerId);
    start.moved = true;
    // 오른쪽으로 끌면 왼쪽 칸이 가운데로 온다 (다이얼을 손으로 돌리는 방향)
    setDrag(-dx / PX_PER_STEP);
  };
  const onPointerUp = (e: PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (start?.moved) {
      settle(-(e.clientX - start.x) / PX_PER_STEP);
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
    }
    setDrag(null);
  };
  // 트랙패드로 옆으로 밀 때만 돈다. 위아래 스크롤은 화면 스크롤로 둔다.
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    wheel.current += e.deltaX;
    if (Math.abs(wheel.current) >= PX_PER_STEP) {
      step(wheel.current > 0 ? 1 : -1);
      wheel.current = 0;
    }
  };

  return (
    <div
      className={`dial dial--${variant}${drag !== null ? " is-dragging" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={items[index]?.label}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <g className="dial__scale" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          {ticks.map((deg) => {
            // 항목 자리는 긴 눈금, 그 사이는 짧은 눈금. 바늘에서 멀수록 흐리게.
            const major = Math.abs((deg + span) % STEP) < 0.01 && Math.abs(deg) <= span + 0.01;
            const len = major ? 9 : 4;
            const a = at(deg, R);
            const b = at(deg, R - len);
            return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dial__tick" style={{ opacity: Math.max(0.12, 0.75 - Math.abs(deg + rotation) / 55) }} />;
          })}
          {items.map((item, i) => {
            const deg = (i - mid) * STEP;
            const near = Math.round(live) === i;
            const p = at(deg, R + (near ? 16 : 12));
            return (
              <text
                key={item.key}
                x={p.x}
                y={p.y}
                className={`dial__label${near ? " is-active" : ""}${item.muted ? " is-muted" : ""}`}
                transform={`rotate(${deg} ${p.x} ${p.y})`}
                onClick={() => !justDragged.current && onChange(item.key)}
              >
                {item.label}
              </text>
            );
          })}
        </g>
        <path className="dial__needle" d={`M${CX - 4.5} ${CY - R + 13} L${CX + 4.5} ${CY - R + 13} L${CX} ${CY - R + 21} Z`} />
      </svg>
    </div>
  );
}
