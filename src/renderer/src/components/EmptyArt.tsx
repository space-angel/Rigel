import { useId } from "react";

// 빈 화면 그림: 로고의 원 셋을 밤하늘의 파란 별로 그린다. 로고를 그대로 붙이지 않고 상태에 따라 모양을 바꾼다.
// apart: 아직 모이지 않음(떨어져 천천히 떠 있다) · together: 로고 모양으로 모여 있음 · lit: 모여서 한 번 밝아짐(오늘 다 끝냄)
export type EmptyMood = "apart" | "together" | "lit";

// 원 크기와 자리는 로고 마크(피그마 80:169)의 비율. apart는 작은 원 둘이 바깥으로 떨어진 자리.
const ORBS = {
  big: { cx: 70, cy: 46, r: 14 },
  left: { cx: 45, cy: 37.5, r: 10.6, apart: [-11, -2] },
  small: { cx: 62, cy: 25, r: 5.7, apart: [5, -8] },
} as const;
const STARS: [number, number, number][] = [
  [14, 18, 1.1], [28, 62, 0.8], [96, 14, 1], [108, 52, 0.9], [20, 40, 0.6], [88, 70, 0.7], [102, 32, 0.6], [36, 10, 0.7],
];

export function EmptyArt({ mood }: { mood: EmptyMood }) {
  const id = useId().replace(/:/g, "");
  const apart = mood === "apart";
  return (
    <svg className={`empty-art empty-art--${mood}`} width="120" height="80" viewBox="0 0 120 80" aria-hidden="true">
      <defs>
        <radialGradient id={`orb${id}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#e6efff" />
          <stop offset="0.45" stopColor="#8fb4ff" />
          <stop offset="1" stopColor="#3d6dff" />
        </radialGradient>
        <radialGradient id={`halo${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6fa6ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#6fa6ff" stopOpacity="0" />
        </radialGradient>
        {/* 모인 원은 닿는 곳이 로고처럼 이어진다: 알파만 끈적하게 만든 뒤 원래 색을 그 안에 칠한다 */}
        <filter id={`goo${id}`} filterUnits="userSpaceOnUse" x="0" y="0" width="120" height="80">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
      </defs>
      {STARS.map(([x, y, r], i) => (
        <circle key={i} className="empty-art__star" cx={x} cy={y} r={r} style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
      <ellipse className="empty-art__halo" cx="60" cy="40" rx="44" ry="32" fill={`url(#halo${id})`} />
      <g filter={apart ? undefined : `url(#goo${id})`} fill={`url(#orb${id})`}>
        <circle className="empty-art__orb empty-art__orb--big" cx={ORBS.big.cx} cy={ORBS.big.cy} r={ORBS.big.r} />
        <circle
          className="empty-art__orb empty-art__orb--left"
          cx={ORBS.left.cx + (apart ? ORBS.left.apart[0] : 0)}
          cy={ORBS.left.cy + (apart ? ORBS.left.apart[1] : 0)}
          r={ORBS.left.r}
        />
        <circle
          className="empty-art__orb empty-art__orb--small"
          cx={ORBS.small.cx + (apart ? ORBS.small.apart[0] : 0)}
          cy={ORBS.small.cy + (apart ? ORBS.small.apart[1] : 0)}
          r={ORBS.small.r}
        />
      </g>
    </svg>
  );
}
