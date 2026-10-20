// 할 날짜(plannedDate)와 마감(dueDate)을 나눈다.
// - 할 날짜: 언제 할지. 오늘·내일·나중 묶음을 정한다.
// - 마감: 언제까지인지. “금요일까지”, “금요일 면접 준비”의 금요일. 준비 할 일은 마감 전, 보통 오늘 한다.
// 짧은 입력은 AI를 부르지 않으므로 앱이 직접 날짜 말을 읽는다. 긴 입력은 Claude가 같은 규칙으로 나눈다(CLAUDE.md).

const DAY = 86_400_000;
const WEEKDAYS = "일월화수목금토";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function at(date: string): Date {
  return new Date(`${date}T00:00:00`);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((at(to).getTime() - at(from).getTime()) / DAY);
}
function plus(date: string, days: number): string {
  const d = at(date);
  d.setDate(d.getDate() + days);
  return iso(d);
}

// 날짜 말 하나를 찾아 날짜로 바꾼다. 찾은 말의 끝 위치도 돌려준다(뒤에 “까지”가 오는지 보려고).
function findDate(text: string, today: string): { date: string; end: number } | null {
  const rel: [RegExp, number][] = [
    [/오늘/, 0],
    [/내일/, 1],
    [/모레/, 2],
    [/글피/, 3],
  ];
  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일|(?<![\d.])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (md) {
    const month = Number(md[1] ?? md[3]);
    const day = Number(md[2] ?? md[4]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = at(today).getFullYear();
      let date = iso(new Date(year, month - 1, day));
      if (date < today) date = iso(new Date(year + 1, month - 1, day));
      return { date, end: md.index! + md[0].length };
    }
  }
  const wd = text.match(/(이번\s*주|이번주|다음\s*주|다음주)?\s*([일월화수목금토])요일/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]!);
    const now = at(today).getDay();
    // 월요일 시작 주: 이번 주 X요일, 다음 주 X요일. 아무 말 없으면 가장 가까운 X요일(오늘 포함 이후).
    const mon = (d: number) => (d + 6) % 7;
    let diff: number;
    if (wd[1] && /다음/.test(wd[1])) diff = 7 - mon(now) + mon(target);
    else if (wd[1]) diff = mon(target) - mon(now);
    else diff = (target - now + 7) % 7;
    if (diff < 0) diff += 7;
    return { date: plus(today, diff), end: wd.index! + wd[0].length };
  }
  if (/주말/.test(text)) {
    const now = at(today).getDay();
    return { date: plus(today, (6 - now + 7) % 7), end: text.indexOf("주말") + 2 };
  }
  for (const [re, d] of rel) {
    const m = text.match(re);
    if (m) return { date: plus(today, d), end: m.index! + m[0].length };
  }
  return null;
}

// 행사·마감을 뜻하는 말과, 그 행사를 준비하는 일을 뜻하는 말
const EVENT = /면접|인터뷰|발표|마감|제출|미팅|회의|시험|약속|데모|리허설|행사|결혼식|생일|출장|여행/;
const PREP = /준비|연습|정리|쓰기|쓰고|써야|작성|보기|읽|만들|고치|검토|다듬|챙기|찾아|알아보|예약|공부/;

// 짧은 입력에서 할 날짜와 마감을 정한다.
// - “금요일까지 …”, “금요일 면접 준비” → 마감 금요일, 할 날짜 오늘
// - “금요일 면접”, “금요일 결혼식 가기” → 행사 그 자체: 할 날짜 그날, 마감도 그날 (나누기 규칙과 같게)
// - “내일 운동” → 할 날짜 그날, 마감 없음
// - 날짜 말이 없으면 할 날짜 오늘, 마감 없음
export function readDates(text: string, today: string): { plannedDate: string; dueDate: string | null } {
  const found = findDate(text, today);
  if (!found) return { plannedDate: today, dueDate: null };
  const after = text.slice(found.end, found.end + 6);
  const isDeadline = /^\s*까지/.test(after) || (EVENT.test(text) && PREP.test(text));
  if (isDeadline) return { plannedDate: today, dueDate: found.date };
  if (EVENT.test(text)) return { plannedDate: found.date, dueDate: found.date };
  return { plannedDate: found.date, dueDate: null };
}

// 마감 배지. 지났거나 오늘이면 눈에 띄게, 일주일 넘게 남으면 날짜로.
export function dueLabel(due: string, today: string): { text: string; tone: "late" | "soon" | "calm" } {
  const n = daysBetween(today, due);
  if (n < 0) return { text: "Overdue", tone: "late" };
  if (n === 0) return { text: "Due today", tone: "soon" };
  if (n === 1) return { text: "Due tomorrow", tone: "soon" };
  if (n < 7) return { text: `${n} days left`, tone: "calm" };
  return { text: `Due ${at(due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, tone: "calm" };
}

// 첫 행동 결과(C2)의 “금 마감 전” 같은 짧은 표시
export function dueShort(due: string): string {
  return at(due).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

// 줄에 붙이는 짧은 배지: D-3, D-DAY, 지남, 일주일 넘으면 날짜
export function dueBadge(due: string, today: string): { text: string; tone: "late" | "soon" | "calm" } {
  const n = daysBetween(today, due);
  if (n < 0) return { text: "Overdue", tone: "late" };
  if (n === 0) return { text: "D-day", tone: "soon" };
  if (n < 7) return { text: `D-${n}`, tone: n === 1 ? "soon" : "calm" };
  return { text: at(due).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(), tone: "calm" };
}

// 마감 고르기 메뉴와 날짜 고르기 창에서 쓰는 빠른 선택지
export function deadlineOptions(today: string): { label: string; date: string }[] {
  const wd = at(today).getDay();
  const fri = (5 - wd + 7) % 7 || 7; // 오늘이 금요일이면 다음 주 금요일
  const mon = (1 - wd + 7) % 7 || 7;
  const name = (d: string) => at(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: plus(today, 1) },
    { label: `This Friday · ${name(plus(today, fri))}`, date: plus(today, fri) },
    { label: `Next Monday · ${name(plus(today, mon))}`, date: plus(today, mon) },
    { label: `In a week · ${name(plus(today, 7))}`, date: plus(today, 7) },
  ].filter((o, i, all) => all.findIndex((x) => x.date === o.date) === i);
}
