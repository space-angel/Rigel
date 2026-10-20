import { DIAL_LABEL, type DialView, type RatioPart } from "@shared/dial";
import { msg } from "@shared/i18n";
import { t } from "../i18n";
import { AiSparkle, CalendarIcon, CheckIcon, PlayIcon } from "./icons";

// 다이얼 아래 비율 막대 (A1, A3). 바로 시작하거나 날짜가 정해진 칸이 파란 주인공, 끝낸 칸은 회색, 첫 행동이 필요한 칸은 점선.
const ICON = { done: CheckIcon, ready: PlayIcon, planned: CalendarIcon, step: AiSparkle };

export function RatioBar({ view, parts }: { view: DialView; parts: RatioPart[] }) {
  if (!parts.length) return null;
  const name = (p: RatioPart) => t(p.key === "ready" ? msg("Ready") : p.key === "step" ? msg("Step") : p.key === "done" ? msg("Done") : DIAL_LABEL[view]);
  return (
    <div className="ratio" role="img" aria-label={parts.map((p) => `${name(p)} ${p.count}, ${p.pct}%`).join(" · ")}>
      {parts.map((p) => {
        const Icon = ICON[p.key];
        return (
          <div key={p.key} className={`ratio__seg ratio__seg--${p.key}`} style={{ flexGrow: Math.max(p.pct, 14) }}>
            <Icon size={11} />
            <span className="ratio__pct">{p.pct}%</span>
            {p.pct >= 35 && <span className="ratio__name">{name(p)}</span>}
          </div>
        );
      })}
    </div>
  );
}
