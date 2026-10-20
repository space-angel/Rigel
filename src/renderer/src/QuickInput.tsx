import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { charCount, classifyQuickInput } from "@shared/quickInput";
import { AiSparkle, ArrowRightIcon } from "./components/icons";

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
    if (panel) api.resizeQuick(panel.getBoundingClientRect().height);
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
            placeholder="What's on your mind?"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="quick__hint">
          {kind === "short" && (
            <span className="quick__kind">
              <ArrowRightIcon size={12} /> {count} chars · straight into today
            </span>
          )}
          {kind === "long" && (
            <span className="quick__kind quick__kind--ai">
              <AiSparkle size={12} /> {count} chars · Claude splits it into tasks
            </span>
          )}
          <span className="quick__keys">
            <kbd>esc</kbd> close <kbd>↵</kbd> {kind === "long" ? "split" : "add"} <kbd>⇧↵</kbd> new line
          </span>
        </div>
      </div>
    </div>
  );
}
