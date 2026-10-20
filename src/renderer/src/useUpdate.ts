import { useEffect, useState } from "react";
import type { UpdateState } from "@shared/update";

// 새 버전 상태. 메인이 확인할 때마다 알려 준다.
export function useUpdate(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    window.todoban.getUpdate().then(setState);
    return window.todoban.onUpdate(setState);
  }, []);
  return state;
}

export const hasUpdate = (s: UpdateState | null) => s?.status === "available" || s?.status === "ready";
