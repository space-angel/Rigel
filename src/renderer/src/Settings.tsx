import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppData, Shortcut } from "@shared/types";
import { FIGMA_BUNDLE_ID } from "@shared/types";
import { figmaLinkInfo } from "@shared/todos";
import { displayAccelerator, toAccelerator } from "@shared/hotkey";
import { ChevronRightIcon, EditIcon, ExternalLinkIcon, LinkIcon, PlusIcon, SettingsIcon, TrashIcon } from "./components/icons";

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
      <kbd className={recording ? "is-recording" : ""}>{recording ? "키를 누르세요" : displayAccelerator(value)}</kbd>
      <button type="button" className="button button--secondary button--sm" onClick={() => setRecording((r) => !r)}>
        {recording ? "취소" : "녹화"}
      </button>
      {error && !recording && <p className="field__error">{error}</p>}
    </div>
  );
}

function GeneralTab({ data }: { data: AppData }) {
  const [info, setInfo] = useState<{ path: string | null; searched: string[]; version: string | null } | null>(null);
  const [path, setPath] = useState(data.settings.claudePath ?? "");
  const [advanced, setAdvanced] = useState(false);
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
      <section className="settings__section">
        <h2>빠른 입력</h2>
        <div className="setting">
          <div className="setting__text">
            <p>단축키</p>
            <p className="setting__desc">어느 앱에서든 빠른 입력창을 열어요</p>
          </div>
          <HotkeyRecorder value={data.settings.hotkey} />
        </div>
      </section>
      <div className="settings__divider" />
      <section className="settings__section">
        <h2>Claude Code</h2>
        <label className="field">
          <span className="field__label">실행 파일 경로</span>
          <input
            className={`field__input${info && !info.path ? " is-error" : ""}`}
            value={path}
            placeholder={info?.path && !data.settings.claudePath ? `${info.path} (자동으로 찾음)` : "~/.local/bin/claude"}
            onChange={(e) => setPath(e.target.value)}
            onBlur={savePath}
            onKeyDown={(e) => e.key === "Enter" && savePath()}
          />
          {info &&
            (info.path ? (
              <span className="field__help">
                {data.settings.claudePath ? "이 경로를 써요" : "자동으로 찾았어요"} · {info.version ?? "버전을 읽지 못했어요"}
              </span>
            ) : (
              <span className="field__error">이 경로에서 claude를 찾지 못했어요. 비워 두면 자동으로 찾아요.</span>
            ))}
        </label>
      </section>
      <div className="settings__divider" />
      <section className="settings__section">
        <h2>기타</h2>
        <div className="setting">
          <p className="setting__text">로그인할 때 열기</p>
          <Toggle on={data.settings.openAtLogin} onChange={(v) => api.act({ type: "setSettings", patch: { openAtLogin: v } })} />
        </div>
        <button type="button" className="setting setting--button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
          <span className="setting__text">
            고급 설정 <span className="setting__desc">모델 · 규칙 파일</span>
          </span>
          <ChevronRightIcon size={14} className={advanced ? "is-open" : ""} />
        </button>
        {advanced && (
          <div className="advanced">
            <div className="setting">
              <div className="setting__text">
                <p>모델</p>
                <p className="setting__desc">0단계 측정에서 sonnet이 가장 빨랐어요</p>
              </div>
              <select
                className="select"
                value={data.settings.model ?? ""}
                onChange={(e) => api.act({ type: "setSettings", patch: { model: e.target.value || null } })}
              >
                <option value="sonnet">sonnet</option>
                <option value="haiku">haiku</option>
                <option value="">기본값</option>
              </select>
            </div>
            <div className="setting">
              <div className="setting__text">
                <p>규칙 파일</p>
                <p className="setting__desc">할 일을 나누고 첫 행동을 고르는 규칙 (CLAUDE.md)</p>
              </div>
              <button type="button" className="button button--secondary button--sm" onClick={api.openRules}>
                열기
              </button>
            </div>
          </div>
        )}
      </section>
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
        <h2 className="sheet__title">{initial ? "바로가기 고치기" : "바로가기 추가"}</h2>
        <label className="field">
          <span className="field__label">이름</span>
          <input className="field__input" autoFocus value={name} placeholder="포폴" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span className="field__label">부르는 말</span>
          <div className="chips-input">
            {keywords.map((k) => (
              <span className="kw" key={k}>
                {k}
                <button type="button" aria-label={`${k} 빼기`} onClick={() => setKeywords(keywords.filter((x) => x !== k))}>
                  ×
                </button>
              </span>
            ))}
            <input
              value={kw}
              placeholder={keywords.length ? "" : "포폴, 포트폴리오, 덱"}
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
          <span className="field__help">Enter로 하나씩 추가 · 할 일에 이 말이 들어가면 연결돼요</span>
        </div>
        <label className="field">
          <span className="field__label">피그마 링크</span>
          <input className="field__input" value={url} placeholder="figma.com/design/…?node-id=…" onChange={(e) => setUrl(e.target.value)} />
          {url.trim() &&
            (link.hasNode ? (
              <span className="field__help field__help--ok">node-id가 있어 이 프레임까지 바로 열려요</span>
            ) : link.isFigma ? (
              <span className="field__help">파일은 열리지만 프레임은 지정되지 않아요. 프레임을 고르고 ‘링크 복사’한 주소를 넣으면 프레임까지 열려요</span>
            ) : (
              <span className="field__help">피그마 링크가 아니에요. 기본 브라우저로 열어요</span>
            ))}
        </label>
        <div className="setting">
          <p className="setting__text">피그마 앱으로 열기</p>
          <Toggle on={useFigma} onChange={setUseFigma} />
        </div>
        <div className="sheet__actions">
          <span className="spacer" />
          <button type="button" className="button button--secondary" onClick={onClose}>
            취소
          </button>
          <button type="button" className="button button--primary" disabled={!canSave} onClick={save}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutsTab({ data }: { data: AppData }) {
  const [editing, setEditing] = useState<Shortcut | "new" | null>(null);
  const usage = (id: string) => data.todos.filter((t) => t.shortcutId === id && !t.completedAt).length;
  return (
    <div className="settings__body">
      <div className="settings__head">
        <div>
          <h2>바로가기 {data.shortcuts.length}개</h2>
          <p className="setting__desc">피그마에서 프레임을 고르고 ‘링크 복사’한 주소를 넣어 주세요</p>
        </div>
        <button type="button" className="button button--primary button--sm" onClick={() => setEditing("new")}>
          <PlusIcon size={12} /> 추가
        </button>
      </div>
      {data.shortcuts.length === 0 ? (
        <div className="empty-box">
          <p>아직 바로가기가 없어요</p>
          <p className="setting__desc">‘포폴’처럼 자주 여는 피그마 프레임을 등록하면, 할 일 옆 시작 버튼으로 바로 열 수 있어요</p>
        </div>
      ) : (
        <div className="table">
          {data.shortcuts.map((s) => (
            <div className="table__row" key={s.id}>
              <span className="chip">{s.name}</span>
              <span className="table__kw">
                {s.keywords.map((k) => (
                  <span className="kw kw--static" key={k}>
                    {k}
                  </span>
                ))}
              </span>
              <span className="table__link" title={s.url}>
                <ExternalLinkIcon size={12} /> {s.url.replace(/^https?:\/\/(www\.)?/, "")}
              </span>
              <span className="table__count">{usage(s.id) ? `할 일 ${usage(s.id)}` : ""}</span>
              <button type="button" className="icon-button" aria-label="고치기" onClick={() => setEditing(s)}>
                <EditIcon size={14} />
              </button>
              <button type="button" className="icon-button" aria-label="지우기" onClick={() => api.act({ type: "removeShortcut", id: s.id })}>
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="tip">
        <LinkIcon size={14} /> “포폴 장표 고쳐야 함”처럼 부르는 말이 들어가면 Claude가 바로가기를 연결해요
      </div>
      {editing && <ShortcutSheet initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function Settings({ initialTab }: { initialTab: Tab }) {
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
    const ro = new ResizeObserver(() => api.resizeSettings(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data !== null]);

  if (!data) return <div ref={rootRef} />;
  return (
    <div className="settings" ref={rootRef}>
      <div className="settings__toolbar">
        <p className="settings__title">{tab === "general" ? "일반" : "바로가기"}</p>
        <div className="tabs">
          <button type="button" className={`tab${tab === "general" ? " is-active" : ""}`} onClick={() => setTab("general")}>
            <SettingsIcon size={18} /> 일반
          </button>
          <button type="button" className={`tab${tab === "shortcuts" ? " is-active" : ""}`} onClick={() => setTab("shortcuts")}>
            <LinkIcon size={18} /> 바로가기
          </button>
        </div>
      </div>
      {tab === "general" ? <GeneralTab data={data} /> : <ShortcutsTab data={data} />}
    </div>
  );
}
