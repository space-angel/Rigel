import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppData } from "@shared/types";
import { LOCAL_AVAILABLE, showHotkey } from "./platform";
import type { ClaudeInfo } from "@shared/claude";
import { authLabel, homeShort, shortVersion } from "./claudeLabels";
import { MCP_SOURCES, statusOf, type McpSource, type McpStatus } from "@shared/mcp";
import { ArrowRightIcon, CheckIcon, Spinner } from "./components/icons";
import { sourceName } from "./components/SourceIcon";
import { t } from "./i18n";

const api = window.todoban;

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
  // Claude에 이미 연결된 서비스를 여기서 바로 켠다. 켤 때 어느 워크스페이스를 읽는지 확인한다(10초쯤).
  const [turning, setTurning] = useState<"idle" | "testing">("idle");
  const [failed, setFailed] = useState<McpSource[]>([]);
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
  // 찾았어도 로그인이 안 됐으면 아직 끝난 게 아니다. 로그인 상태를 모르는 옛 claude는 찾은 것으로 본다.
  const needsLogin = Boolean(claude?.path && claude.auth && !claude.auth.loggedIn);
  const claudeState = claude === null ? "wait" : claude.path && !needsLogin ? "done" : "error";
  const hotkeyState = hotkeyError ? "error" : "done";
  const localOn = LOCAL_AVAILABLE.filter((s) => data.settings.tools.local[s]).map((s) => sourceName(s));
  const connected = mcp ? MCP_SOURCES.filter((s) => statusOf(mcp, s) === "connected").map((s) => sourceName(s)) : [];
  const mcpOn = MCP_SOURCES.filter((s) => data.settings.tools.mcp[s]).map((s) => sourceName(s));
  // 연결돼 있지만 아직 켜지 않은 서비스. 첫날에도 내 자료로 첫 행동을 찾게 켤지 묻는다.
  const suggest = mcp ? MCP_SOURCES.filter((s) => statusOf(mcp, s) === "connected" && !data.settings.tools.mcp[s] && !failed.includes(s)) : [];
  const turnOnConnected = async () => {
    setTurning("testing");
    const latest = await api.getData();
    const tools = latest.settings.tools;
    api.act({
      type: "setSettings",
      patch: {
        tools: {
          ...tools,
          mcp: {
            ...tools.mcp,
            ...Object.fromEntries(suggest.map((s) => [s, true])),
          },
        },
      },
    });
    const results = await Promise.all(suggest.map(async (s) => ({ s, ok: (await api.verifyMcp(s)).ok })));
    const bad = results.filter((r) => !r.ok).map((r) => r.s);
    // 확인하지 못한 서비스는 다시 끈다(읽지 못하는 걸 켜 두지 않는다)
    if (bad.length) {
      const now = (await api.getData()).settings.tools;
      api.act({
        type: "setSettings",
        patch: {
          tools: {
            ...now,
            mcp: {
              ...now.mcp,
              ...Object.fromEntries(bad.map((s) => [s, false])),
            },
          },
        },
      });
    }
    setFailed(bad);
    setTurning("idle");
    setToolsSeen(true);
  };
  const toolsState = turning === "testing" ? "wait" : toolsSeen ? "done" : "todo";
  const hero = claudeState !== "done" ? 1 : hotkeyState !== "done" ? 2 : toolsState !== "done" ? 3 : 0;

  return (
    <div className="welcome" ref={rootRef}>
      <div className="welcome__drag" />
      <span className="welcome__mark" aria-hidden="true" />
      <h1>{t("Welcome to Rigel")}</h1>
      <p className="welcome__sub">{t("Write what's on your mind. Shape the first step with your own words and tools.")}</p>

      <div className={`steps stagger hero-${hero}`}>
        <Step
          n={1}
          state={claudeState}
          title={needsLogin ? t("Sign in to Claude Code") : claudeState === "error" ? t("Claude Code not found") : "Claude Code"}
          desc={
            claude === null
              ? t("Looking for claude on this computer…")
              : needsLogin
                ? t("Run claude in a terminal and sign in with your Claude account. Come back here when you're done.")
                : claude.path
                  ? [homeShort(claude.path), shortVersion(claude.version) ?? t("version unknown"), authLabel(claude.auth)].filter(Boolean).join(" · ")
                  : t("Short tasks still go straight in. Splitting and first steps need Claude Code.")
          }
        />
        {needsLogin && (
          <div className="step__actions">
            <button type="button" className="button button--primary button--sm" onClick={() => api.openTerminal()}>
              {t("Open Terminal")}
            </button>
            <button type="button" className="button button--secondary button--sm" onClick={refresh}>
              {t("Check again")}
            </button>
          </div>
        )}
        {claudeState === "error" && !needsLogin && (
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
              ) : turning === "testing" ? (
                <span className="step__note">{t("Checking which workspace it reads… about 10 seconds")}</span>
              ) : failed.length ? (
                <span className="step__note">{t("Couldn't turn on: {names}. Try again in Settings → Tools.", { names: failed.map((s) => sourceName(s)).join(", ") })}</span>
              ) : suggest.length ? (
                <span className="step__note">
                  {t("Connected in Claude: {names}. Read them when finding first steps?", { names: suggest.map((s) => sourceName(s)).join(", ") })}
                </span>
              ) : connected.length ? (
                <span className="step__note">
                  {t("Connected in Claude: {names}", {
                    names: connected.join(", "),
                  })}
                </span>
              ) : (
                <span className="step__note">{t("Optional — you can add these anytime")}</span>
              )}
            </>
          }
          action={
            suggest.length && turning === "idle" ? (
              <button type="button" className="button button--primary button--sm" onClick={turnOnConnected}>
                {t("Turn on")}
              </button>
            ) : (
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
            )
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
