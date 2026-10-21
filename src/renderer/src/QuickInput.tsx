import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { charCount, classifyQuickInput } from "@shared/quickInput";
import { ArrowRightIcon, RigelIcon } from "./components/icons";
import { t } from "./i18n";

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
        // 열 때마다 내려오는 움직임을 다시 튼다.
        const el = panelRef.current;
        if (el) {
          el.classList.remove("is-opening");
          void el.offsetWidth;
          el.classList.add("is-opening");
          setTimeout(() => el.classList.remove("is-opening"), 400);
        }
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
          <RigelIcon size={24} className="quick__icon" />
          <textarea
            ref={inputRef}
            autoFocus
            rows={1}
            value={text}
            placeholder={t("What's on your mind?")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="quick__hint">
          {kind === "short" && (
            <span className="quick__kind motion-fade" key="short">
              <ArrowRightIcon size={12} /> {t("{n} chars · straight into today", { n: count })}
            </span>
          )}
          {kind === "long" && (
            <span className="quick__kind quick__kind--ai motion-fade" key="long">
              <RigelIcon size={13} /> {t("{n} chars · Claude splits it into tasks", { n: count })}
            </span>
          )}
          <span className="quick__keys">
            <kbd>esc</kbd> {t("close")} <kbd>↵</kbd> {kind === "long" ? t("split") : t("add")} <kbd>⇧↵</kbd> {t("new line")}
          </span>
        </div>
      </div>
    </div>
  );
}
