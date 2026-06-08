import { app, BrowserWindow, Menu } from "electron";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { registerIpcHandlers } from "./ipc/router";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appName = "Nexum";

app.setName(appName);
if (process.platform === "darwin") {
  app.setAboutPanelOptions({
    applicationName: appName,
  });
}

const getAppIconPath = () => {
  const candidates = [
    path.join(currentDir, "../../resources/nexum-icon.png"),
    path.join(currentDir, "../../resources/nexum.icns"),
    path.join(process.resourcesPath, "nexum-icon.png"),
    path.join(process.resourcesPath, "nexum.icns"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
};

const blockedElectronShortcuts = new Set([
  "f5",
  "ctrl+r",
  "meta+r",
  "ctrl+shift+r",
  "meta+shift+r",
  "ctrl+alt+i",
  "meta+alt+i",
  "f12",
]);

const getShortcutKey = (input: Electron.Input): string => {
  const modifiers = [
    input.control ? "ctrl" : "",
    input.meta ? "meta" : "",
    input.shift ? "shift" : "",
    input.alt ? "alt" : "",
  ].filter(Boolean);

  return [...modifiers, input.key.toLowerCase()].join("+");
};

const createMainWindow = () => {
  const appIcon = getAppIconPath();
  const mainWindow = new BrowserWindow({
    width: 1728,
    height: 986,
    minWidth: 1280,
    minHeight: 760,
    title: appName,
    ...(appIcon ? { icon: appIcon } : {}),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#f8fafc",
    show: false,
    webPreferences: {
      preload: path.join(currentDir, "../preload/index.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (process.platform === "darwin" && app.dock && appIcon) {
    app.dock.setIcon(appIcon);
  }

  mainWindow.webContents.once("did-finish-load", () => {
    void mainWindow.webContents
      .executeJavaScript(
        "Boolean(window.nexum?.health?.ping && window.nexum?.mongodb?.aggregate && window.nexum?.mongodb?.explainAggregate && window.nexum?.mongodb?.explainFind && window.nexum?.mongodb?.findDocuments && window.nexum?.mongodb?.listIndexes && window.nexum?.mongodb?.manualWrite && window.nexum?.mongodb?.updateDocument)",
        true,
      )
      .then((hasPreloadApi) => {
        if (!hasPreloadApi) {
          console.error(
            "Nexum preload API is missing one or more required methods",
          );
        }
      });
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (blockedElectronShortcuts.has(getShortcutKey(input))) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on("will-navigate", (event) => {
    if (!process.env.ELECTRON_RENDERER_URL) {
      event.preventDefault();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(currentDir, "../renderer/index.html"));
  }
};

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
