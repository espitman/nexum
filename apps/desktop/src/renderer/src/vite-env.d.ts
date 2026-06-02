/// <reference types="vite/client" />

import type { NexumDesktopApi } from "../../preload";

declare global {
  interface Window {
    nexum: NexumDesktopApi;
  }
}
