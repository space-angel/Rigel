import { useId } from "react";

// Rigel이 일하는 중(첫 행동 찾기, 자료 읽기): 로고의 원 세 개가 떨어졌다가 큰 원 쪽으로 흘러 모인다.
// 원 크기는 피그마 로고 마크(80:169)에서 잰 값이고, 쉬는 자리에서 셋이 이어지게 조금 모았다. 끈적한 필터(흐림 → 알파 대비)로 닿는 곳이 로고처럼 이어진다.
export function RigelLoader({ size = 16, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`rigel-loader ${className}`} width={size} height={(size * 60) / 72} viewBox="0 0 72 60" fill="currentColor" role="presentation" aria-hidden="true">
      <defs>
        <filter id={`goo${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
        </filter>
      </defs>
      <g filter={`url(#goo${id})`}>
        <circle className="rigel-loader__big" cx="48.7" cy="37.6" r="17.6" />
        <circle className="rigel-loader__left" cx="16.5" cy="26.3" r="13.4" />
        <circle className="rigel-loader__small" cx="37.8" cy="12" r="7.2" />
      </g>
    </svg>
  );
}
