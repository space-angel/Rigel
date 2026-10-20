// 단축키 녹화: 키보드 이벤트를 Electron accelerator 문자열로 바꾸고, 화면에는 맥 기호로 보여 준다.

interface KeyLike {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const named: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
  };
  return named[code] ?? null;
}

// 수정 키만 눌렸거나, 수정 키 없이 일반 키만 눌렸으면 null (F키는 단독으로 허용).
export function toAccelerator(e: KeyLike): string | null {
  const key = keyName(e.code);
  if (!key) return null;
  const mods = [e.metaKey && "Command", e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean) as string[];
  if (!mods.length && !/^F\d/.test(key)) return null;
  return [...mods, key].join("+");
}

const SYMBOL: Record<string, string> = { Command: "⌘", Control: "⌃", Alt: "⌥", Shift: "⇧" };

export function displayAccelerator(acc: string): string {
  const parts = acc.split("+");
  const key = parts.pop() ?? "";
  const order = ["Control", "Alt", "Shift", "Command"];
  const mods = order.filter((m) => parts.includes(m)).map((m) => SYMBOL[m]).join("");
  return `${mods} ${key}`.trim();
}
