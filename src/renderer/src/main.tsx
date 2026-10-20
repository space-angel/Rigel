import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./theme/default.css";
import "./styles.css";
import { TodayList } from "./TodayList";
import { QuickInput } from "./QuickInput";

// 창마다 같은 번들을 쓰고, 주소의 해시로 화면을 고른다.
const view = window.location.hash.slice(1) || "list";
document.body.dataset.view = view;
createRoot(document.getElementById("root")!).render(view === "quick" ? <QuickInput /> : <TodayList />);
