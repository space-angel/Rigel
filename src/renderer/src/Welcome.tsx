import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppData } from "@shared/types";
import { LOCAL_AVAILABLE, showHotkey } from "./platform";
import { MCP_SERVICES, MCP_SOURCES, statusOf, type McpStatus } from "@shared/mcp";
import { ArrowRightIcon, CheckIcon, Spinner } from "./components/icons";
import { sourceName } from "./components/SourceIcon";
import { t } from "./i18n";

const api = window.todoban;

type ClaudeInfo = { path: string | null; searched: string[]; version: string | null };

function Step({ n, state, title, desc, action }: { n: number; state: "done" | "todo" | "error" | "wait"; title: string; desc: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`step step--${state} step--n${n}`}>
      <span className="step__mark">{state === "done" ? <CheckIcon size={12} /> : state === "wait" ? <Spinner size={12} /> : state === "error" ? "!" : n}</span>
      <div className="step__text">
        <p className="step__title">{title}</p>
        <p className="step__desc">{desc}</p>
      </div>
      {action}
    </div>
  );
}

// 시작하기 (D4). 세 단계를 한 장에서 확인한다. 아직 안 끝난 첫 단계가 주인공 카드다.
export function Welcome() {
  const [data, setData] = useState<AppData | null>(null);
  const [claude, setClaude] = useState<ClaudeInfo | null>(null);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [mcp, setMcp] = useState<Record<string, McpStatus> | null>(null);
  const [toolsSeen, setToolsSeen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    setClaude(null);
    api.claudeInfo().then(setClaude);
    api.hotkeyStatus().then(setHotkeyError);
  };
  useEffect(() => {
    api.getData().then(setData);
    const off = api.onData(setData);
    refresh();
    api.mcpStatus().then(setMcp);
    // 설치하거나 설정을 바꾸고 돌아오면 다시 확인한다.
    const offFocus = api.onSettingsFocus(() => {
      refresh();
      api.mcpStatus(true).then(setMcp);
    });
    return () => {
      off();
      offFocus();
    };
  }, []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => api.resizeWelcome(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data !== null]);

  if (!data) return <div ref={rootRef} />;
  const claudeState = claude === null ? "wait" : claude.path ? "done" : "error";
  const hotkeyState = hotkeyError ? "error" : "done";
  const localOn = LOCAL_AVAILABLE.filter((s) => data.settings.tools.local[s]).map((s) => sourceName(s));
  const connected = mcp ? MCP_SOURCES.filter((s) => statusOf(mcp, s) === "connected").map((s) => sourceName(s)) : [];
  const mcpOn = MCP_SOURCES.filter((s) => data.settings.tools.mcp[s]).map((s) => sourceName(s));
  const toolsState = toolsSeen ? "done" : "todo";
  const hero = claudeState !== "done" ? 1 : hotkeyState !== "done" ? 2 : toolsState !== "done" ? 3 : 0;

  return (
    <div className="welcome" ref={rootRef}>
      <div className="welcome__drag" />
      <span className="welcome__mark">
        <CheckIcon size={24} />
      </span>
      <h1>{t("Welcome to todoBAN")}</h1>
      <p className="welcome__sub">{t("Write what's on your mind. Shape the first step with your own words and tools.")}</p>

      <div className={`steps stagger hero-${hero}`}>
        <Step
          n={1}
          state={claudeState}
          title={claudeState === "error" ? t("Claude Code not found") : "Claude Code"}
          desc={
            claude === null
              ? t("Looking for claude on this Mac…")
              : claude.path
                ? `${claude.path.replace(/^\/Users\/[^/]+/, "~")} · ${claude.version?.replace(" (Claude Code)", "") ?? t("version unknown")}`
                : t("Short tasks still go straight in. Splitting and first steps need Claude Code.")
          }
        />
        {claudeState === "error" && (
          <div className="step__actions">
            <button type="button" className="button button--primary button--sm" onClick={() => api.installGuide()}>
              {t("Install guide")}
            </button>
            <button type="button" className="button button--secondary button--sm" onClick={() => api.chooseClaude().then((p) => p && refresh())}>
              {t("Choose file")}
            </button>
            <button type="button" className="button button--secondary button--sm" onClick={refresh}>
              {t("Search again")}
            </button>
          </div>
        )}
        <Step
          n={2}
          state={hotkeyState}
          title={t("Capture hotkey")}
          desc={hotkeyError ?? t("Works from any app — write a thought, press Enter")}
          action={
            hotkeyError ? (
              <button type="button" className="button button--secondary button--sm" onClick={() => api.openSettings("general")}>
                {t("Change")}
              </button>
            ) : (
              <kbd>{showHotkey(data.settings.hotkey)}</kbd>
            )
          }
        />
        <Step
          n={3}
          state={toolsState}
          title={t("Pick your tools")}
          desc={
            <>
              {localOn.length ? t("{names} on", { names: localOn.join(", ") }) : t("No tools on")}
              {mcpOn.length ? ` · ${t("{names} via MCP", { names: mcpOn.join(", ") })}` : ""}
              <br />
              {mcp === null ? (
                <span className="step__note">{t("Checking what's connected in Claude…")}</span>
              ) : connected.length ? (
                <span className="step__note">{t("Connected in Claude: {names}", { names: connected.join(", ") })}</span>
              ) : (
                <span className="step__note">{t("Optional — you can add these anytime")}</span>
              )}
            </>
          }
          action={
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => {
                setToolsSeen(true);
                api.openSettings("tools");
              }}
            >
              {t("Choose")}
            </button>
          }
        />
      </div>

      <div className="welcome__foot">
        <button type="button" className="text-button" onClick={() => api.finishWelcome(false)}>
          {t("Set up later")}
        </button>
        <span className="spacer" />
        <button type="button" className="button button--primary" onClick={() => api.finishWelcome(true)}>
          {t("Start")} <ArrowRightIcon size={13} />
        </button>
      </div>
    </div>
  );
}
