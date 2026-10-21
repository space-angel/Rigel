import { useId } from "react";

// Rigel이 일하는 중(첫 행동 찾기, 자료 읽기): 로고 모양에서 작은 원 둘이 살짝 떨어졌다가 다시 붙는다.
// 원 크기는 피그마 로고 마크(80:169)에서 잰 값이고, 쉬는 자리에서 셋이 이어지게 조금 모았다. 끈적한 필터(흐림 → 알파 대비)로 닿는 곳이 로고처럼 이어진다.
// 원이 움직여도 잘리지 않게 그림 영역과 필터 영역을 둘레 10만큼 넓혀 두었다(크기는 넓힌 영역 기준).
export function RigelLoader({ size = 18, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`rigel-loader ${className}`} width={size} height={(size * 80) / 92} viewBox="-10 -10 92 80" fill="currentColor" role="presentation" aria-hidden="true">
      <defs>
        <filter id={`goo${id}`} filterUnits="userSpaceOnUse" x="-10" y="-10" width="92" height="80">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 14 -5.5" />
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
