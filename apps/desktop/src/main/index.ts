import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { registerIpcHandlers } from "./ipc/router";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const createMainWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1728,
    height: 986,
    minWidth: 1280,
    minHeight: 760,
    title: "Nexum",
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

  mainWindow.webContents.once("did-finish-load", () => {
    void mainWindow.webContents
      .executeJavaScript("Boolean(window.nexum?.health?.ping)", true)
      .then((hasPreloadApi) => {
        if (!hasPreloadApi) {
          console.error("Nexum preload API was not exposed to the renderer");
        }
      });
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
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
