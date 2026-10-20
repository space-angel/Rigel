import { useState, type ReactNode } from "react";
import type { ToolItem } from "@shared/shape";
import { SOURCE_NAME, SourceIcon } from "./SourceIcon";
import type { SourceId } from "@shared/shape";
import { ChevronDownIcon } from "./icons";

const api = window.todoban;

// LOCAL 도구는 제목만 쓰므로 근거 문장이 없다. 무엇을 봤는지 한 줄로 알려 준다.
const LOCAL_NOTE: Record<string, string> = {
  figma: "Your Figma shortcut — only its name is sent to Claude",
  files: "A file you opened this week — only its name is sent",
  todoban: "One of your done or later tasks",
  calendar: "An event in your calendar — only its title and time are sent",
};

// 근거 문장에서 낱말을 표시한다.
function highlight(text: string, words: string[]): ReactNode[] {
  const ws = words.filter((w) => w.length > 1);
  if (!ws.length) return [text];
  const re = new RegExp(`(${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

// 첫 행동의 근거 한 줄. 누르면 그 자리에서 펼쳐서 어디서 왔는지, Claude가 읽은 문장, 맞은 낱말을 보여 준다.
export function Evidence({
  source,
  label,
  weight,
  item,
  words,
  onLeaveOut,
  index,
}: {
  index?: number;
  source: string;
  label: string;
  weight?: number;
  item?: ToolItem;
  words: string[];
  onLeaveOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = SOURCE_NAME[source as SourceId] ?? source;
  // MCP는 Claude가 읽은 문장, 로컬 파일은 맥 안에서 읽은 줄(보내지 않음)
  const text = item?.text || item?.preview || "";
  const isFile = item?.open?.kind === "file";
  const hay = `${item?.label ?? label} ${text}`.toLowerCase();
  const matched = words.filter((w) => hay.includes(w.toLowerCase()));
  const weak = Boolean(item) && words.length > 0 && matched.length === 0;
  return (
    <div className={`evidence${open ? " is-open" : ""}${weak ? " is-weak" : ""}${index !== undefined ? " motion-rise" : ""}`} style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}>
      <button type="button" className="evidence__row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="made__icon">
          <SourceIcon source={source} size={12} />
        </span>
        <span className="made__label">{label}</span>
        {weak && <span className="evidence__weak">weak match</span>}
        {weight !== undefined && <span className="made__pct">{weight}%</span>}
        <ChevronDownIcon size={12} className="evidence__chev" />
      </button>
      {/* 닫혀 있어도 그려 두고 높이로 열고 닫는다(부드럽게 펼치기). 닫혀 있으면 누를 수 없게 inert. */}
      {(
        <div className="evidence__body" inert={!open} aria-hidden={!open}>
          <div className="evidence__inner">
          <p className="evidence__where">
            {isFile ? item?.where : name}
            {!isFile && item?.workspace ? ` · ${item.workspace}` : ""}
            {!isFile && item?.where ? ` / ${item.where}` : ""}
            {isFile && item?.modified ? ` · edited ${item.modified.slice(5).replace("-", "/")}` : ""}
          </p>
          {text ? <blockquote className="evidence__quote">{highlight(text, words)}</blockquote> : <p className="evidence__note">{LOCAL_NOTE[source] ?? "Only the title was used"}</p>}
          {isFile && (
            <p className="evidence__note">
              {item?.matchedIn === "content" ? "Found in the text, not the name. " : item?.matchedIn === "both" ? "Found in the name and the text. " : "Found in the name. "}
              Only the file name is sent to Claude.
            </p>
          )}
          <p className={`evidence__match${weak ? " is-weak" : ""}`}>
            {matched.length ? `Matched: ${matched.join(" · ")}` : words.length ? "None of your words appear here — check before using it" : "Picked without words"}
          </p>
          <div className="evidence__actions">
            {item?.open?.kind === "file" && (
              <button type="button" className="button button--secondary button--sm" onClick={() => api.quickLook((item.open as { path: string }).path)}>
                Quick Look
              </button>
            )}
            {item?.open && (
              <button type="button" className="button button--secondary button--sm" onClick={() => api.openToolItem(item.open)}>
                {isFile ? "Open file" : `Open in ${name.replace(" frame", "")}`}
              </button>
            )}
            {onLeaveOut && (
              <button type="button" className="text-button" onClick={onLeaveOut}>
                Leave this out and reshape
              </button>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
