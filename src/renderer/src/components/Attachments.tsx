import type { ContextNote } from "@shared/types";
import { noteOpen } from "@shared/shape";
import { SOURCE_NAME, SourceIcon } from "./SourceIcon";
import type { SourceId } from "@shared/shape";

const api = window.todoban;

// 할 일에 붙인 자료(Notion 페이지, Linear 이슈, 피그마 프레임, 파일)를 바로 연다.
// 줄에서는 아이콘만, 지금 할 일 카드에서는 이름까지 보여 준다.
export function Attachments({ notes, variant }: { notes: ContextNote[]; variant: "icons" | "chips" }) {
  const openable = notes.filter((n) => noteOpen(n));
  if (!openable.length) return null;
  return (
    <span className={`attach attach--${variant}`}>
      {openable.slice(0, variant === "icons" ? 3 : 4).map((n) => {
        const name = SOURCE_NAME[n.source as SourceId] ?? n.source;
        return (
          <button
            type="button"
            key={`${n.source}-${n.label}`}
            className="attach__item"
            title={`Open ${name} · ${n.label}`}
            aria-label={`Open ${name}: ${n.label}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              api.openToolItem(noteOpen(n));
            }}
          >
            <SourceIcon source={n.source} size={variant === "icons" ? 11 : 12} />
            {variant === "chips" && <span className="attach__label">{n.label}</span>}
          </button>
        );
      })}
    </span>
  );
}
