import { SIZES, sizeLabel } from "@shared/shape";
import { currentLang, t } from "../i18n";
import { FanDial } from "./FanDial";

// 빚기 화면(C1)의 03 How big? 다이얼.
export function SizeDial({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const items = SIZES.map((m) => ({ key: m as number, label: sizeLabel(m, currentLang()) }));
  return <FanDial items={items} value={value} onChange={onChange} label={t("Size")} />;
}
