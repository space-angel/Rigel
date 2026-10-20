import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./theme/default.css";
import "./styles.css";
import { TodayList } from "./TodayList";

createRoot(document.getElementById("root")!).render(<TodayList />);
