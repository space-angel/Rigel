import type { SourceId } from "@shared/shape";
import { AiSparkle, CalendarIcon, CheckIcon, DocIcon, FigmaMark } from "./icons";

export const SOURCE_NAME: Record<SourceId, string> = {
  figma: "Figma",
  calendar: "Calendar",
  files: "Files",
  todoban: "todoBAN",
  claude: "Claude",
};

export function SourceIcon({ source, size = 13 }: { source: string; size?: number }) {
  switch (source) {
    case "figma":
      return <FigmaMark size={size} />;
    case "calendar":
      return <CalendarIcon size={size} />;
    case "files":
      return <DocIcon size={size} />;
    case "todoban":
      return <CheckIcon size={size} />;
    default:
      return <AiSparkle size={size} />;
  }
}
