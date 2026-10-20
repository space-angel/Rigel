import { createRoot } from "react-dom/client";
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
  list: <TodayList />,
  quick: <QuickInput />,
  review: <Review />,
  welcome: <Welcome />,
  "settings-general": <Settings initialTab="general" />,
  "settings-tools": <Settings initialTab="tools" />,
  "settings-shortcuts": <Settings initialTab="shortcuts" />,
  "settings-shortcuts-new": <Settings initialTab="shortcuts" openSheet />,
} as const;
createRoot(document.getElementById("root")!).render(screens[view as keyof typeof screens] ?? <TodayList />);
