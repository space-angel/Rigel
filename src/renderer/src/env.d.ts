/// <reference types="vite/client" />
import type { TodoBanApi } from "../../preload/index";

declare global {
  interface Window {
    todoban: TodoBanApi;
  }
}
