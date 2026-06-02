import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
      preload: path.join(currentDir, "../preload/index.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(currentDir, "../renderer/index.html"));
  }
};

app.whenReady().then(() => {
  ipcMain.handle("nexum:health:ping", () => ({
    ok: true,
    appName: "Nexum",
    timestamp: new Date().toISOString(),
  }));

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
