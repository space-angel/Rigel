// 단축키 녹화: 키보드 이벤트를 Electron accelerator 문자열로 바꾸고, 화면에는 맥은 기호(⌥ Space), 윈도우는 글자(Alt+Space)로 보여 준다.

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
// 윈도우의 Windows 키(metaKey)는 Electron에서 Super다.
export function toAccelerator(e: KeyLike, mac = true): string | null {
  const key = keyName(e.code);
  if (!key) return null;
  const mods = [e.metaKey && (mac ? "Command" : "Super"), e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean) as string[];
  if (!mods.length && !/^F\d/.test(key)) return null;
  return [...mods, key].join("+");
}

const SYMBOL: Record<string, string> = { Command: "⌘", Control: "⌃", Alt: "⌥", Shift: "⇧" };

const WIN_NAME: Record<string, string> = { Control: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win", Command: "Win", CommandOrControl: "Ctrl", CmdOrCtrl: "Ctrl" };

export function displayAccelerator(acc: string, mac = true): string {
  const parts = acc.split("+");
  const key = parts.pop() ?? "";
  if (!mac) {
    const order = ["Control", "CommandOrControl", "CmdOrCtrl", "Alt", "Shift", "Super", "Command"];
    return [...order.filter((m) => parts.includes(m)).map((m) => WIN_NAME[m]), key].join("+");
  }
  const order = ["Control", "Alt", "Shift", "Command"];
  const mods = order.filter((m) => parts.includes(m)).map((m) => SYMBOL[m]).join("");
  return `${mods} ${key}`.trim();
}

// 처음 쓰는 단축키. 윈도우에서 Alt+Space는 창 메뉴(최소화·닫기) 키라 Alt+Shift+Space를 쓴다.
export function defaultHotkey(platform: string): string {
  return platform === "win32" ? "Alt+Shift+Space" : "Alt+Space";
}
