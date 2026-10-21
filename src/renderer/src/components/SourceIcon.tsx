import { msg } from "@shared/i18n";
import type { SourceId } from "@shared/shape";
import { t } from "../i18n";
import { AiSparkle, CalendarIcon, DocIcon, FigmaMark, IssueIcon, NoteIcon, RigelIcon } from "./icons";

export const SOURCE_NAME: Record<SourceId, string> = {
  figma: msg("Figma"),
  calendar: msg("Calendar"),
  files: msg("Files"),
  todoban: msg("Past tasks"), // 앱 안의 다른 할 일(앱 이름과 겹치지 않게)
  notion: msg("Notion"),
  linear: msg("Linear"),
  frame: msg("Figma frame"),
  claude: msg("Claude"),
};

// 화면에 보이는 도구 이름(지금 언어로)
export function sourceName(source: string): string {
  const name = SOURCE_NAME[source as SourceId];
  return name ? t(name) : source;
}

export function SourceIcon({ source, size = 13 }: { source: string; size?: number }) {
  switch (source) {
    case "figma":
    case "frame":
      return <FigmaMark size={size} />;
    case "calendar":
      return <CalendarIcon size={size} />;
    case "files":
      return <DocIcon size={size} />;
    case "todoban":
      return <RigelIcon size={size} />;
    case "notion":
      return <NoteIcon size={size} />;
    case "linear":
      return <IssueIcon size={size} />;
    default:
      return <AiSparkle size={size} />;
  }
}
