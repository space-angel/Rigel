import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppData, Shortcut } from "@shared/types";
import { FIGMA_BUNDLE_ID } from "@shared/types";
import { figmaLinkInfo } from "@shared/todos";
import { displayAccelerator, toAccelerator } from "@shared/hotkey";
import { CheckIcon, EditIcon, FigmaMark, LinkIcon, PlusIcon, TerminalIcon, TrashIcon } from "./components/icons";

const api = window.todoban;
type Tab = "general" | "shortcuts";

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
      <kbd className={recording ? "is-recording" : ""}>{recording ? "Press keys…" : displayAccelerator(value)}</kbd>
      <button type="button" className="button button--secondary button--sm" onClick={() => setRecording((r) => !r)}>
        {recording ? "Cancel" : "Record"}
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
  { value: "", label: "Default" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

function GeneralTab({ data }: { data: AppData }) {
  const [info, setInfo] = useState<{ path: string | null; searched: string[]; version: string | null } | null>(null);
  const [path, setPath] = useState(data.settings.claudePath ?? "");
  const refresh = () => api.claudeInfo().then(setInfo);
  useEffect(() => {
    refresh();
  }, [data.settings.claudePath]);

  const savePath = () => {
    const v = path.trim() || null;
    if (v !== data.settings.claudePath) api.act({ type: "setSettings", patch: { claudePath: v } });
  };

  return (
    <div className="settings__body">
      <Group label="Capture">
        <div className="setting">
          <div className="setting__text">
            <p>Capture hotkey</p>
            <p className="setting__desc">Open the capture panel from any app</p>
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
              <p>Executable</p>
              {info &&
                (info.path ? (
                  <p className="setting__desc">
                    {data.settings.claudePath ? "Using this path" : "Found automatically"} · {info.version ?? "version unknown"}
                  </p>
                ) : (
                  <p className="field__error">Couldn't find claude here. Leave empty to search automatically.</p>
                ))}
            </div>
            {info && <span className={`status${info.path ? " status--ok" : " status--error"}`}>{info.path ? "FOUND" : "MISSING"}</span>}
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
            <p>Model</p>
            <p className="setting__desc">Sonnet was fastest in our step-0 test (avg 6.5s)</p>
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
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div className="setting__text">
            <p>Rules</p>
            <p className="setting__desc">CLAUDE.md — how tasks are split and shaped</p>
          </div>
          <button type="button" className="button button--secondary button--sm" onClick={api.openRules}>
            Open
          </button>
        </div>
      </Group>

      <Group label="General">
        <div className="setting">
          <p className="setting__text">Open at login</p>
          <Toggle on={data.settings.openAtLogin} onChange={(v) => api.act({ type: "setSettings", patch: { openAtLogin: v } })} />
        </div>
      </Group>
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
          <PlusIcon size={13} /> {initial ? "Edit shortcut" : "New shortcut"}
        </h2>
        <label className="field">
          <span className="field__label">Name</span>
          <input className="field__input" autoFocus value={name} placeholder="포폴" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span className="field__label">Called</span>
          <div className="chips-input">
            {keywords.map((k) => (
              <span className="kw" key={k}>
                {k}
                <button type="button" aria-label={`Remove ${k}`} onClick={() => setKeywords(keywords.filter((x) => x !== k))}>
                  ×
                </button>
              </span>
            ))}
            <input
              value={kw}
              placeholder={keywords.length ? "Add a word…" : "포폴, 포트폴리오, 덱"}
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
          <span className="field__help">Press Enter to add · tasks that mention a word get linked</span>
        </div>
        <label className="field">
          <span className="field__label">Figma link</span>
          <input className="field__input" value={url} placeholder="figma.com/design/…?node-id=…" onChange={(e) => setUrl(e.target.value)} />
          {url.trim() &&
            (link.hasNode ? (
              <span className="field__help field__help--ok">
                <CheckIcon size={12} /> Has a node-id — opens right at this frame
              </span>
            ) : link.isFigma ? (
              <span className="field__help">Opens the file, not a frame. Select a frame and use “Copy link” to jump straight to it.</span>
            ) : (
              <span className="field__help">Not a Figma link — opens in your default browser.</span>
            ))}
        </label>
        <div className="sheet__actions">
          <label className="pill-question">
            Open in Figma app <Toggle on={useFigma} onChange={setUseFigma} />
          </label>
          <span className="spacer" />
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button button--primary" disabled={!canSave} onClick={save}>
            Save
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
          {n} {n === 1 ? "shortcut" : "shortcuts"}
        </h2>
        <button type="button" className="button button--secondary button--sm" onClick={() => setEditing("new")}>
          <PlusIcon size={12} /> Add
        </button>
      </div>
      {n === 0 ? (
        <div className="empty-box">
          <p>No shortcuts yet</p>
          <p className="setting__desc">Add a Figma frame you open often, like “포폴”. Tasks that mention it get a start button.</p>
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
                      {usage(s.id)} {usage(s.id) === 1 ? "TASK" : "TASKS"}
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
              <button type="button" className="icon-button" aria-label="Edit" onClick={() => setEditing(s)}>
                <EditIcon size={14} />
              </button>
              <button type="button" className="icon-button" aria-label="Delete" onClick={() => api.act({ type: "removeShortcut", id: s.id })}>
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="tip">
        <LinkIcon size={14} /> Write “포폴 장표 고쳐야 함” and the task links to the 포폴 shortcut.
      </div>
      {editing && <ShortcutSheet initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function Settings({ initialTab, openSheet }: { initialTab: Tab; openSheet?: boolean }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<AppData | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
      <div className="settings__toolbar">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "general"} className={`tab${tab === "general" ? " is-active" : ""}`} onClick={() => setTab("general")}>
            General
          </button>
          <button type="button" role="tab" aria-selected={tab === "shortcuts"} className={`tab${tab === "shortcuts" ? " is-active" : ""}`} onClick={() => setTab("shortcuts")}>
            Shortcuts
          </button>
        </div>
      </div>
      {tab === "general" ? <GeneralTab data={data} /> : <ShortcutsTab data={data} openSheet={openSheet} />}
    </div>
  );
}
