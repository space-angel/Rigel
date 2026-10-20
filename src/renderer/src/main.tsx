import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Lang } from "@shared/i18n";
import { setLang } from "./i18n";
import { watchGlow } from "./glow";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./theme/default.css";
import "./styles.css";
import { TodayList } from "./TodayList";
import { QuickInput } from "./QuickInput";
import { Review } from "./Review";
import { Settings } from "./Settings";
import { Welcome } from "./Welcome";

// 창마다 같은 번들을 쓰고, 주소의 해시로 화면을 고른다.
const view = window.location.hash.slice(1) || "list";
document.body.dataset.view = view.startsWith("settings") ? "settings" : view;
const screens = {
  list: () => <TodayList />,
  quick: () => <QuickInput />,
  review: () => <Review />,
  welcome: () => <Welcome />,
  "settings-general": () => <Settings initialTab="general" />,
  "settings-tools": () => <Settings initialTab="tools" />,
  "settings-shortcuts": () => <Settings initialTab="shortcuts" />,
  "settings-shortcuts-new": () => <Settings initialTab="shortcuts" openSheet />,
} as const;
const screen = screens[view as keyof typeof screens] ?? screens.list;
watchGlow();

// 화면 언어는 창 맨 위에서 데이터를 받아 맞춘다. 바뀌면 아래 화면 전체를 다시 그린다(같은 묶음 안에서 화면보다 먼저).
function Root() {
  const [lang, setLangState] = useState<Lang | null>(null);
  useEffect(() => {
    const apply = (d: { settings: { language: Lang } }) => setLangState(d.settings.language);
    window.todoban.getData().then(apply);
    return window.todoban.onData(apply);
  }, []);
  if (!lang) return null;
  setLang(lang);
  return screen();
}
createRoot(document.getElementById("root")!).render(<Root />);
