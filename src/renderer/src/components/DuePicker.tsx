import { useState } from "react";
import type { TodoItem } from "@shared/types";
import { deadlineOptions, dueLabel } from "@shared/due";
import { localDate } from "@shared/todos";
import { currentLang, t } from "../i18n";

// 마감 고르기 (메뉴의 Pick a date…, ⌘D). 빠른 선택지 하나를 누르면 바로 정하고, 날짜 칸은 다른 날을 고를 때.
export function DuePicker({ item, onPick, onClose }: { item: TodoItem; onPick: (date: string | null) => void; onClose: () => void }) {
  const today = localDate();
  const [date, setDate] = useState(item.dueDate ?? "");
  return (
    <div
      className="due-picker"
      role="dialog"
      aria-label={t("Set deadline")}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
        if (e.key === "Enter" && date) onPick(date);
      }}
    >
      <div className="due-picker__head">
        <span className="eyebrow">{t("Deadline")}</span>
        <p className="due-picker__title">{item.title}</p>
      </div>
      <div className="due-picker__quick">
        {deadlineOptions(today, currentLang()).map((o) => (
          <button type="button" key={o.date} className={`word${item.dueDate === o.date ? " is-on" : ""}`} onClick={() => onPick(o.date)}>
            {o.label.split(" · ")[0]}
          </button>
        ))}
      </div>
      <div className="due-picker__row">
        <input id="due-date" className="field__input" type="date" min={today} value={date} autoFocus onChange={(e) => setDate(e.target.value)} />
        {date && <span className={`due-badge due-badge--${dueLabel(date, today).tone}`}>{dueLabel(date, today, currentLang()).text}</span>}
      </div>
      <div className="due-picker__actions">
        {item.dueDate && (
          <button type="button" className="text-button" onClick={() => onPick(null)}>
            {t("Clear")}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="button button--secondary button--sm" onClick={onClose}>
          {t("Cancel")}
        </button>
        <button type="button" className="button button--primary button--sm" disabled={!date} onClick={() => onPick(date)}>
          {t("Set")}
        </button>
      </div>
    </div>
  );
}
