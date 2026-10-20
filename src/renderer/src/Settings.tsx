import { msg } from "@shared/i18n";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppData, Shortcut } from "@shared/types";
import { FIGMA_BUNDLE_ID } from "@shared/types";
import { figmaLinkInfo } from "@shared/todos";
import { displayAccelerator, toAccelerator } from "@shared/hotkey";
import { CheckIcon, EditIcon, FigmaMark, LinkIcon, PlusIcon, Spinner, TerminalIcon, TrashIcon, UserIcon } from "./components/icons";
import { LOCAL_SOURCES, normalizeMix, type LocalSource } from "@shared/shape";
import { MCP_SERVICES, MCP_SOURCES, statusOf, type McpSource, type McpStatus } from "@shared/mcp";
import { MixBar } from "./components/MixBar";
import { SourceIcon, sourceName } from "./components/SourceIcon";
import { LANGS } from "@shared/i18n";
import { currentLang, t } from "./i18n";
import { GLOW_MODES, getGlow, setGlow, type GlowMode } from "./glow";

const api = window.todoban;
type Tab = "general" | "tools" | "shortcuts";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className={`toggle${on ? " is-on" : ""}`} onClick={() => onChange(!on)} />;
}

function HotkeyRecorder({ value }: { value: string }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.hotkeyStatus().then(setError);
  }, [value]);

  useEffect(() => {
    if (!recording) return;
    api.pauseHotkey(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const acc = toAccelerator(e);
      if (!acc) return;
      setRecording(false);
      api.act({ type: "setSettings", patch: { hotkey: acc } }).then(() => api.hotkeyStatus().then(setError));
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      api.pauseHotkey(false);
    };
  }, [recording]);

  return (
    <div className="hotkey">
      <kbd className={recording ? "is-recording" : ""}>{recording ? t("Press keys…") : displayAccelerator(value)}</kbd>
      <button type="button" className="button button--secondary button--sm" onClick={() => setRecording((r) => !r)}>
        {recording ? t("Cancel") : t("Record")}
      </button>
      {error && !recording && <p className="field__error">{error}</p>}
    </div>
  );
}

// 설정은 이름표 + 글래스 묶음으로 보여 준다. 묶음 안의 행은 구분선으로 나뉜다.
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="group">
      <h2 className="group__label">{label}</h2>
      <div className="group__box">{children}</div>
    </section>
  );
}

const MODELS = [
  { value: "", label: msg("Default") },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

// 글로우 실험: 지금 할 일 카드의 빛을 어떻게 움직일지 직접 보고 고른다. 이 Mac에만 저장된다.
const GLOW_LABEL: Record<GlowMode, string> = { static: msg("Static"), breathe: msg("Breathe"), follow: msg("Follow"), handoff: msg("Handoff"), all: msg("All") };
function GlowSetting() {
  const [mode, setMode] = useState<GlowMode>(getGlow);
  return (
    <div className="setting setting--stack">
      <div className="setting__text">
        <p>{t("Glow (experiment)")}</p>
        <p className="setting__desc">{t("How the Now card glows. Check a task or ask for a first step to see it move.")}</p>
      </div>
      <div className="segmented" role="radiogroup" aria-label={t("Glow (experiment)")}>
        {GLOW_MODES.map((m) => (
          <button
            type="button"
            key={m}
            role="radio"
            aria-checked={mode === m}
            className={`segmented__item${mode === m ? " is-active" : ""}`}
            onClick={() => {
              setGlow(m);
              setMode(m);
            }}
          >
            {t(GLOW_LABEL[m])}
          </button>
        ))}
      </div>
    </div>
  );
}

function GeneralTab({ data }: { data: AppData }) {
  const [info, setInfo] = useState<{ path: string | null; searched: string[]; version: string | null } | null>(null);
  const [path, setPath] = useState(data.settings.claudePath ?? "");
  const refresh = () => api.claudeInfo().then(setInfo);
  // 규칙 파일을 고쳤는데 앱 기능 규칙이 빠졌으면 알린다. 되돌릴 때 고친 내용은 옆 파일로 남는다.
  const [rules, setRules] = useState<{ customized: boolean; missing: string[] } | null>(null);
  useEffect(() => {
    api.rulesStatus().then(setRules);
  }, []);
  useEffect(() => {
    refresh();
  }, [data.settings.claudePath]);

  const savePath = () => {
    const v = path.trim() || null;
    if (v !== data.settings.claudePath) api.act({ type: "setSettings", patch: { claudePath: v } });
  };

  return (
    <div className="settings__body">
      <Group label={t("Capture")}>
        <div className="setting">
          <div className="setting__text">
            <p>{t("Capture hotkey")}</p>
            <p className="setting__desc">{t("Open the capture panel from any app")}</p>
          </div>
          <HotkeyRecorder value={data.settings.hotkey} />
        </div>
      </Group>

      <Group label="Claude Code">
        <div className="setting setting--stack">
          <div className="setting__head">
            <span className="setting__icon">
              <TerminalIcon size={14} />
            </span>
            <div className="setting__text">
              <p>{t("Executable")}</p>
              {info &&
                (info.path ? (
                  <p className="setting__desc">
                    {data.settings.claudePath ? t("Using this path") : t("Found automatically")} · {info.version ?? t("version unknown")}
                  </p>
                ) : (
                  <p className="field__error">{t("Couldn't find claude here. Leave empty to search automatically.")}</p>
                ))}
            </div>
            {info && <span className={`status${info.path ? " status--ok" : " status--error"}`}>{info.path ? t("FOUND") : t("MISSING")}</span>}
          </div>
          <input
            className={`field__input${info && !info.path ? " is-error" : ""}`}
            value={path}
            placeholder={info?.path && !data.settings.claudePath ? info.path : "~/.local/bin/claude"}
            onChange={(e) => setPath(e.target.value)}
            onBlur={savePath}
            onKeyDown={(e) => e.key === "Enter" && savePath()}
          />
        </div>
        <div className="setting">
          <div className="setting__text">
            <p>{t("Model")}</p>
            <p className="setting__desc">{t("Sonnet was fastest in our step-0 test (avg 6.5s)")}</p>
          </div>
          <div className="segmented" role="radiogroup">
            {MODELS.map((m) => (
              <button
                type="button"
                key={m.value}
                role="radio"
                aria-checked={(data.settings.model ?? "") === m.value}
                className={`segmented__item${(data.settings.model ?? "") === m.value ? " is-active" : ""}`}
                onClick={() => api.act({ type: "setSettings", patch: { model: m.value || null } })}
              >
                {t(m.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div className="setting__text">
            <p>{t("Rules")}</p>
            {rules && rules.missing.length > 0 ? (
              <p className="setting__desc is-error">
                {t("Your edited CLAUDE.md is missing rules for {names}. Reading tools and shaping won't work until you reset it.", { names: rules.missing.join(", ") })}
              </p>
            ) : (
              <p className="setting__desc">{t("CLAUDE.md — how tasks are split and shaped")}{rules?.customized ? ` · ${t("edited by you")}` : ""}</p>
            )}
          </div>
          {rules && rules.missing.length > 0 && (
            <button type="button" className="button button--primary button--sm" onClick={() => api.resetRules().then(setRules)}>
              {t("Reset to default")}
            </button>
          )}
          <button type="button" className="button button--secondary button--sm" onClick={() => api.openRules()}>
            {t("Open")}
          </button>
        </div>
      </Group>

      <Group label={t("General")}>
        <div className="setting">
          <div className="setting__text">
            <p>{t("Language")}</p>
            <p className="setting__desc">{t("Menus and screens change right away")}</p>
          </div>
          <div className="segmented" role="radiogroup" aria-label={t("Language")}>
            {LANGS.map((l) => (
              <button
                type="button"
                key={l.value}
                role="radio"
                lang={l.value}
                aria-checked={data.settings.language === l.value}
                className={`segmented__item${data.settings.language === l.value ? " is-active" : ""}`}
                onClick={() => api.act({ type: "setSettings", patch: { language: l.value } })}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <GlowSetting />
        <div className="setting">
          <p className="setting__text">{t("Open at login")}</p>
          <Toggle on={data.settings.openAtLogin} onChange={(v) => api.act({ type: "setSettings", patch: { openAtLogin: v } })} />
        </div>
      </Group>
    </div>
  );
}

const LOCAL_DESC: Record<LocalSource, (data: AppData) => string> = {
  figma: (d) => t("Your shortcuts · {n}", { n: d.shortcuts.length }),
  calendar: () => t("Next 7 days · deadlines set the size. macOS asks once"),
  files: () => t("Documents you opened this week · names only"),
  todoban: () => t("Done & later tasks"),
};

const MCP_DESC: Record<McpSource, string> = {
  notion: msg("Pages that match your words"),
  linear: msg("Issues that match your words"),
  frame: msg("Reads the frame of the task's Figma shortcut"),
};

type Verify = { state: "testing" } | { state: "ok"; ms: number; workspace: string | null } | { state: "fail"; reason: string };
const VERIFY_FAIL: Record<string, string> = {
  "needs-auth": msg("Needs sign-in in Claude Code"),
  "no-shortcut": msg("Add a Figma shortcut with a frame link first"),
  slow: msg("Took longer than 30s"),
  failed: msg("Couldn't read — turn it on again to retry"),
};

function StatusPill({ status }: { status: McpStatus | null }) {
  return (
    <span className="motion-fade" key={status ?? "checking"} style={{ display: "contents" }}>
      <StatusPillInner status={status} />
    </span>
  );
}
function StatusPillInner({ status }: { status: McpStatus | null }) {
  if (status === null) return <span className="status">{t("Checking")}</span>;
  if (status === "connected") return <span className="status status--ok">{t("Connected")}</span>;
  if (status === "pending") return <span className="status">{t("Connecting")}</span>;
  if (status === "needs-auth") return <span className="status status--error">{t("Needs sign-in")}</span>;
  return <span className="status status--off">{t("Not added")}</span>;
}

// MCP 연결 안내. 인증이 필요하면 Claude Code에서 /mcp, 커넥터가 없으면 claude.ai에서 추가한다.
function McpGuide({ source, status, onClose }: { source: McpSource; status: McpStatus; onClose: () => void }) {
  const name = sourceName(source === "frame" ? "figma" : source);
  const signIn = status === "needs-auth";
  return (
    <div className="guide motion-rise">
      <div className="guide__head">
        <p className="guide__title">{signIn ? t("Sign in to {name}", { name }) : t("Add {name} to Claude", { name })}</p>
        <button type="button" className="text-button" onClick={onClose}>
          {t("Close")}
        </button>
      </div>
      {signIn ? (
        <ol className="guide__steps">
          <li>
            {t("Open Terminal")}{" "}
            <button type="button" className="link" onClick={() => api.openMcpGuide("terminal")}>
              {t("Open")}
            </button>
          </li>
          <li>
            {currentLang() === "ko" ? (
              <>
                <kbd>claude</kbd>를 실행한 뒤 <kbd>/mcp</kbd>를 입력해 주세요
              </>
            ) : (
              <>
                Run <kbd>claude</kbd>, then type <kbd>/mcp</kbd>
              </>
            )}
          </li>
          <li>{t("Pick “{server}” and finish signing in in your browser", { server: MCP_SERVICES[source].server })}</li>
          <li>{t("Come back here — todoBAN checks again on its own")}</li>
        </ol>
      ) : (
        <ol className="guide__steps">
          <li>
            {t("Open Claude → Settings → Connectors")}{" "}
            <button type="button" className="link" onClick={() => api.openMcpGuide("connectors")}>
              {t("Open")}
            </button>
          </li>
          <li>{t("Connect {name} with the same account you use in Claude Code", { name })}</li>
          <li>{t("Come back here — todoBAN checks again on its own")}</li>
        </ol>
      )}
    </div>
  );
}

// 첫 행동을 빚을 때 쓸 도구 (D2). LOCAL은 앱이 읽고, MCP는 Claude Code가 읽기 전용으로 읽는다.
function ToolsTab({ data }: { data: AppData }) {
  const tools = data.settings.tools;
  const toolsRef = useRef(tools);
  toolsRef.current = tools;
  const [status, setStatus] = useState<Record<string, McpStatus> | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [guide, setGuide] = useState<McpSource | null>(null);
  const [verify, setVerify] = useState<Partial<Record<McpSource, Verify>>>({});
  const check = (fresh = false) => {
    setStatus(null);
    api.mcpStatus(fresh).then((all) => {
      setStatus(all);
      setCheckedAt(Date.now());
      // 연결된 서비스는 어느 워크스페이스를 읽는지 확인해 둔다. 켜기 전에도 보이게, 꺼 둔 서비스도 확인한다.
      // 확인한 지 하루가 안 됐으면 건너뛴다(한 번에 약 10초, Claude 사용량을 쓴다). Check again은 모두 다시 확인한다.
      for (const src of MCP_SOURCES) {
        const st = statusOf(all, src);
        if (st !== "connected" && st !== "pending") continue;
        const info = toolsRef.current.mcpInfo[src];
        const stale = !info || Date.now() - Date.parse(info.checkedAt) > 24 * 3600_000;
        if (fresh || stale) checkWorkspace(src, false);
      }
    });
  };
  useEffect(() => check(), []);
  // 터미널이나 브라우저에서 연결하고 돌아오면 다시 확인한다.
  const checkedRef = useRef(0);
  checkedRef.current = checkedAt;
  useEffect(() => api.onSettingsFocus(() => Date.now() - checkedRef.current > 10_000 && check(true)), []);

  const save = (patch: Partial<typeof tools>) => api.act({ type: "setSettings", patch: { tools: { ...tools, ...patch } } });
  const on = [...LOCAL_SOURCES.filter((s) => tools.local[s]), ...MCP_SOURCES.filter((s) => tools.mcp[s])];
  const [rules, setRules] = useState<{ customized: boolean; missing: string[] } | null>(null);
  useEffect(() => {
    api.rulesStatus().then(setRules);
  }, []);
  const rulesBroken = Boolean(rules && rules.missing.some((t) => t === "collect" || t === "whoami" || t === "collectMany"));

  // 어느 워크스페이스·계정에 연결됐는지 확인한다(메인이 저장). 켤 때 안 되면 다시 끄고 이유를 보여 준다.
  const inflight = useRef(new Set<McpSource>());
  const checkWorkspace = async (s: McpSource, turningOn: boolean) => {
    if (inflight.current.has(s)) return;
    inflight.current.add(s);
    setVerify((v) => ({ ...v, [s]: { state: "testing" } }));
    const r = await api.verifyMcp(s);
    inflight.current.delete(s);
    if (r.ok) {
      setVerify((v) => ({ ...v, [s]: { state: "ok", ms: r.ms, workspace: r.workspace } }));
      return;
    }
    setVerify((v) => ({ ...v, [s]: { state: "fail", reason: VERIFY_FAIL[r.status] ?? VERIFY_FAIL.failed! } }));
    // 켤 때 실패했거나, 인증이 필요해 어차피 못 읽으면 끈다.
    if (turningOn || r.status === "needs-auth") {
      const latest = await api.getData();
      api.act({ type: "setSettings", patch: { tools: { ...latest.settings.tools, mcp: { ...latest.settings.tools.mcp, [s]: false } } } });
    }
    if (r.status === "needs-auth") {
      setStatus((st) => (st ? { ...st, [MCP_SERVICES[s].server]: "needs-auth" } : st));
      setGuide(s);
    }
  };
  const turnOn = (s: McpSource) => {
    save({ mcp: { ...tools.mcp, [s]: true } });
    checkWorkspace(s, true);
  };

  const mcpDesc = (s: McpSource, st: McpStatus | null) => {
    const v = verify[s];
    const info = tools.mcpInfo[s];
    if (v?.state === "testing") return t("Checking which workspace it reads… about 10 seconds");
    if (v?.state === "ok") return `${t("Works")} · ${v.workspace ? t("reads “{name}”", { name: v.workspace }) : t("connected")} · ${(v.ms / 1000).toFixed(1)}s`;
    if (v?.state === "fail") return t(v.reason);
    if (st === null) return t("Checking Claude Code…");
    if ((st === "connected" || st === "pending") && info?.workspace)
      return `${t("Reads “{name}”", { name: info.workspace })}${info.account ? ` · ${info.account}` : ""}`;
    if (st === "connected" || st === "pending") return t(MCP_DESC[s]);
    if (st === "needs-auth") return t("Connected to Claude, but needs sign-in in Claude Code");
    return t("Not connected in Claude yet");
  };

  return (
    <div className="settings__body">
      <Group label={t("Local · fast")}>
        {LOCAL_SOURCES.map((s) => (
          <div className="setting" key={s}>
            <span className="setting__icon">
              <SourceIcon source={s} size={13} />
            </span>
            <div className="setting__text">
              <p>{sourceName(s)}</p>
              <p className="setting__desc">{LOCAL_DESC[s](data)}</p>
            </div>
            <span className="badge">{t("Local")}</span>
            <Toggle on={tools.local[s]} onChange={(v) => save({ local: { ...tools.local, [s]: v } })} />
          </div>
        ))}
      </Group>
      <section className="group">
        <div className="settings__head">
          <h2 className="group__label">{t("MCP · read only")}</h2>
          <button type="button" className="text-button" onClick={() => check(true)} disabled={status === null}>
            {status === null ? t("Checking…") : t("Check again")}
          </button>
        </div>
        {rulesBroken && (
          <div className="guide motion-rise">
            <div className="guide__head">
              <p className="guide__title">{t("Your edited CLAUDE.md can't read these yet")}</p>
              <button type="button" className="button button--primary button--sm" onClick={() => api.resetRules().then((r) => (setRules(r), check(true)))}>
                {t("Reset rules")}
              </button>
            </div>
            <p className="setting__desc">{t("It's missing rules for {names}. Your edits are kept in a separate file next to it.", { names: rules!.missing.join(", ") })}</p>
          </div>
        )}
        <p className="group__desc">
          {t("Claude Code reads these with your Claude sign-in, one workspace per service. Each read takes about 10 seconds and uses your Claude plan. Notion search matches keywords, not meaning, unless your Notion plan includes AI search.")}
        </p>
        <div className="group__box">
          {MCP_SOURCES.map((s) => {
            const st = status && statusOf(status, s);
            const v = verify[s];
            const usable = st === "connected" || st === "pending";
            return (
              <div className="setting" key={s}>
                <span className="setting__icon">
                  <SourceIcon source={s} size={13} />
                </span>
                <div className="setting__text">
                  <p className="setting__title">
                    {sourceName(s)} <StatusPill status={st} />
                  </p>
                  <p className={`setting__desc motion-fade${v?.state === "ok" ? " is-ok" : v?.state === "fail" ? " is-error" : ""}`} key={mcpDesc(s, st)}>
                    {v?.state === "testing" && <Spinner size={10} />} {mcpDesc(s, st)}
                  </p>
                </div>
                {usable ? (
                  <Toggle on={Boolean(tools.mcp[s])} onChange={(val) => (val ? turnOn(s) : save({ mcp: { ...tools.mcp, [s]: false } }))} />
                ) : (
                  st !== null && (
                    <button type="button" className="button button--secondary button--sm" onClick={() => setGuide(s)}>
                      {st === "needs-auth" ? t("Sign in") : t("Add")}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
        {guide && status && <McpGuide source={guide} status={statusOf(status, guide)} onClose={() => setGuide(null)} />}
      </section>
      {on.length > 0 && (
        <section className="group">
          <h2 className="group__label">{t("Default mix")}</h2>
          <MixBar mix={normalizeMix(tools.defaultMix, on)} onChange={(mix) => save({ defaultMix: { ...tools.defaultMix, ...mix } })} />
        </section>
      )}
      <div className="tip">
        <UserIcon size={14} /> {t("Local tools send titles only — links, paths and file contents stay on your Mac. MCP tools are read by Claude Code itself; a Figma frame sends its file key.")}
      </div>
    </div>
  );
}

function ShortcutSheet({ initial, onClose }: { initial: Shortcut | null; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [kw, setKw] = useState("");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [useFigma, setUseFigma] = useState((initial?.appBundleId ?? FIGMA_BUNDLE_ID) === FIGMA_BUNDLE_ID);
  const link = figmaLinkInfo(url);
  const pushKw = () => {
    const v = kw.trim();
    if (v && !keywords.includes(v)) setKeywords([...keywords, v]);
    setKw("");
  };
  const canSave = name.trim() && url.trim();
  const save = () => {
    if (!canSave) return;
    const all = kw.trim() ? [...keywords, kw.trim()] : keywords;
    api.act({ type: "saveShortcut", shortcut: { id: initial?.id, name, keywords: all, url, appBundleId: useFigma ? FIGMA_BUNDLE_ID : null } });
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet__title">
          <PlusIcon size={13} /> {initial ? t("Edit shortcut") : t("New shortcut")}
        </h2>
        <label className="field">
          <span className="field__label">{t("Name")}</span>
          <input className="field__input" autoFocus value={name} placeholder="포폴" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span className="field__label">{t("Called")}</span>
          <div className="chips-input">
            {keywords.map((k) => (
              <span className="kw" key={k}>
                {k}
                <button type="button" aria-label={t("Remove {name}", { name: k })} onClick={() => setKeywords(keywords.filter((x) => x !== k))}>
                  ×
                </button>
              </span>
            ))}
            <input
              value={kw}
              placeholder={keywords.length ? t("Add a word…") : "포폴, 포트폴리오, 덱"}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  pushKw();
                }
                if (e.key === "Backspace" && !kw && keywords.length) setKeywords(keywords.slice(0, -1));
              }}
            />
          </div>
          <span className="field__help">{t("Press Enter to add · tasks that mention a word get linked")}</span>
        </div>
        <label className="field">
          <span className="field__label">{t("Figma link")}</span>
          <input className="field__input" value={url} placeholder="figma.com/design/…?node-id=…" onChange={(e) => setUrl(e.target.value)} />
          {url.trim() &&
            (link.hasNode ? (
              <span className="field__help field__help--ok">
                <CheckIcon size={12} /> {t("Has a node-id — opens right at this frame")}
              </span>
            ) : link.isFigma ? (
              <span className="field__help">{t("Opens the file, not a frame. Select a frame and use “Copy link” to jump straight to it.")}</span>
            ) : (
              <span className="field__help">{t("Not a Figma link — opens in your default browser.")}</span>
            ))}
        </label>
        <div className="sheet__actions">
          <label className="pill-question">
            {t("Open in Figma app")} <Toggle on={useFigma} onChange={setUseFigma} />
          </label>
          <span className="spacer" />
          <button type="button" className="button button--secondary" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button type="button" className="button button--primary" disabled={!canSave} onClick={save}>
            {t("Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutsTab({ data, openSheet }: { data: AppData; openSheet?: boolean }) {
  const [editing, setEditing] = useState<Shortcut | "new" | null>(openSheet ? "new" : null);
  const usage = (id: string) => data.todos.filter((t) => t.shortcutId === id && !t.completedAt).length;
  const n = data.shortcuts.length;
  return (
    <div className="settings__body">
      <div className="settings__head">
        <h2 className="group__label">
          {n === 1 ? t("1 shortcut") : t("{n} shortcuts", { n })}
        </h2>
        <button type="button" className="button button--secondary button--sm" onClick={() => setEditing("new")}>
          <PlusIcon size={12} /> {t("Add")}
        </button>
      </div>
      {n === 0 ? (
        <div className="empty-box">
          <p>{t("No shortcuts yet")}</p>
          <p className="setting__desc">{t("Add a Figma frame you open often, like “포폴”. Tasks that mention it get a start button.")}</p>
        </div>
      ) : (
        <div className="group__box">
          {data.shortcuts.map((s) => (
            <div className="shortcut" key={s.id}>
              <span className="setting__icon">
                <FigmaMark size={13} />
              </span>
              <div className="shortcut__body">
                <p className="shortcut__name">
                  {s.name}
                  {usage(s.id) > 0 && (
                    <span className="mono-label">
                      {usage(s.id) === 1 ? t("1 TASK") : t("{n} TASKS", { n: usage(s.id) })}
                    </span>
                  )}
                </p>
                {s.keywords.length > 0 && (
                  <span className="shortcut__kws">
                    {s.keywords.map((k) => (
                      <span className="kw kw--static" key={k}>
                        {k}
                      </span>
                    ))}
                  </span>
                )}
                <span className="shortcut__link" title={s.url}>
                  {s.url.replace(/^https?:\/\/(www\.)?/, "")}
                </span>
              </div>
              <button type="button" className="icon-button" aria-label={t("Edit")} onClick={() => setEditing(s)}>
                <EditIcon size={14} />
              </button>
              <button type="button" className="icon-button" aria-label={t("Delete")} onClick={() => api.act({ type: "removeShortcut", id: s.id })}>
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="tip">
        <LinkIcon size={14} /> {t("Write “포폴 장표 고쳐야 함” and the task links to the 포폴 shortcut.")}
      </div>
      {editing && <ShortcutSheet initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function Settings({ initialTab, openSheet }: { initialTab: Tab; openSheet?: boolean }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<AppData | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // 창보다 내용이 길면 창 안에서 스크롤한다. 탭은 위에 붙어 있고, 내려가면 탭 아래에 경계가 생긴다.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => window.scrollTo(0, 0), [tab]);
  useEffect(() => {
    api.getData().then(setData);
    const off = api.onData(setData);
    const offTab = api.onSettingsTab(setTab);
    return () => {
      off();
      offTab();
    };
  }, []);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // 바로가기 시트는 화면 위에 띄운 요소라 내용 높이에 들어가지 않는다. 시트가 열려 있으면 시트 아래까지 창을 늘린다.
    let sheet: Element | null = null;
    const measure = () => {
      const s = el.querySelector(".sheet");
      const sheetBottom = s ? s.getBoundingClientRect().bottom + 40 : 0;
      api.resizeSettings(Math.max(el.getBoundingClientRect().height, sheetBottom));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(() => {
      const s = el.querySelector(".sheet");
      if (s === sheet) return;
      if (sheet) ro.unobserve(sheet);
      sheet = s;
      if (s) ro.observe(s);
      measure();
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [data !== null]);

  if (!data) return <div ref={rootRef} />;
  return (
    <div className="settings" ref={rootRef}>
      <div className={`settings__toolbar${scrolled ? " is-scrolled" : ""}`}>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "general"} className={`tab${tab === "general" ? " is-active" : ""}`} onClick={() => setTab("general")}>
            {t("General")}
          </button>
          <button type="button" role="tab" aria-selected={tab === "tools"} className={`tab${tab === "tools" ? " is-active" : ""}`} onClick={() => setTab("tools")}>
            {t("Tools")}
          </button>
          <button type="button" role="tab" aria-selected={tab === "shortcuts"} className={`tab${tab === "shortcuts" ? " is-active" : ""}`} onClick={() => setTab("shortcuts")}>
            {t("Shortcuts")}
          </button>
        </div>
      </div>
      <div className="motion-fade" key={tab}>
        {tab === "general" ? <GeneralTab data={data} /> : tab === "tools" ? <ToolsTab data={data} /> : <ShortcutsTab data={data} openSheet={openSheet} />}
      </div>
    </div>
  );
}
