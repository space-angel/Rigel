import { SIZES, sizeLabel } from "@shared/shape";
import { FanDial } from "./FanDial";

// 빚기 화면(C1)의 03 How big? 다이얼.
const ITEMS = SIZES.map((m) => ({ key: m as number, label: sizeLabel(m) }));

export function SizeDial({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  return <FanDial items={ITEMS} value={value} onChange={onChange} label="Size" />;
}
