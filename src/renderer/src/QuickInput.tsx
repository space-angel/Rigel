import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { charCount, classifyQuickInput } from "@shared/quickInput";
import { AiSparkle, SunIcon } from "./components/icons";

const api = window.todoban;

export function QuickInput() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const kind = classifyQuickInput(text);

  useEffect(
    () =>
      api.onQuickOpened(() => {
        setBusy(false);
        inputRef.current?.focus();
        inputRef.current?.select();
      }),
    [],
  );

  // 입력이 길어지면 줄 수만큼 입력칸과 창을 늘린다.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 31 * 4)}px`;
    }
    const panel = panelRef.current;
    if (panel) api.resizeQuick(panel.getBoundingClientRect().height + 12 + 40);
  }, [text]);

  const submit = async () => {
    if (kind === "empty" || busy) return;
    setBusy(true);
    const res = await api.submitQuick(text);
    if (res.ok) setText("");
    setBusy(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      api.hideQuick();
    }
  };

  const count = charCount(text);
  return (
    <div className="quick-window">
      <div className="quick" ref={panelRef}>
        <div className="quick__input">
          <AiSparkle size={22} className="quick__icon" />
          <textarea
            ref={inputRef}
            autoFocus
            rows={1}
            value={text}
            placeholder="떠오르는 생각을 그대로 적어 보세요"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="quick__hint">
          {kind === "short" && (
            <span className="quick__kind">
              <SunIcon size={14} /> {count}자 · 바로 오늘에 넣어요
            </span>
          )}
          {kind === "long" && (
            <span className="quick__kind quick__kind--ai">
              <AiSparkle size={14} /> {count}자 · Claude가 할 일로 나눠요
            </span>
          )}
          <span className="quick__keys">
            <kbd>Esc</kbd> 닫기 <kbd>Enter</kbd> {kind === "long" ? "나누기" : "넣기"} <kbd>⇧ Enter</kbd> 줄바꿈
          </span>
        </div>
      </div>
    </div>
  );
}
