import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDir, "..");
const appName = "Nexum";
const bundleId = "com.espitman.nexum.dev";
const sourceApp = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const runtimeDist = path.join(root, ".runtime", "electron-dist");
const runtimeApp = path.join(runtimeDist, `${appName}.app`);
const runtimeResources = path.join(runtimeApp, "Contents", "Resources");
const runtimePlist = path.join(runtimeApp, "Contents", "Info.plist");
const sourceExecutable = path.join(runtimeApp, "Contents", "MacOS", "Electron");
const runtimeExecutable = path.join(runtimeApp, "Contents", "MacOS", appName);
const iconPng = path.join(root, "resources", "nexum-icon.png");
const iconset = path.join(root, ".runtime", "Nexum.iconset");
const iconIcns = path.join(runtimeResources, "nexum.icns");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const appVersion = packageJson.version || "0.0.0";
const helperNames = [
  { from: "Electron Helper", to: `${appName} Helper`, id: `${bundleId}.helper` },
  {
    from: "Electron Helper (GPU)",
    to: `${appName} Helper (GPU)`,
    id: `${bundleId}.helper.gpu`,
  },
  {
    from: "Electron Helper (Plugin)",
    to: `${appName} Helper (Plugin)`,
    id: `${bundleId}.helper.plugin`,
  },
  {
    from: "Electron Helper (Renderer)",
    to: `${appName} Helper (Renderer)`,
    id: `${bundleId}.helper.renderer`,
  },
];

const run = (command, args) => {
  execFileSync(command, args, { stdio: "ignore" });
};

const setPlistValue = (plist, key, value) => {
  try {
    run("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plist]);
  } catch {
    run("/usr/libexec/PlistBuddy", [
      "-c",
      `Add :${key} string ${value}`,
      plist,
    ]);
  }
};

const needsRefresh = () => {
  if (process.platform !== "darwin") return false;
  if (!fs.existsSync(runtimeApp)) return true;
  if (!fs.existsSync(runtimePlist)) return true;

  return fs.statSync(sourceApp).mtimeMs > fs.statSync(runtimeApp).mtimeMs;
};

const copyRuntimeApp = () => {
  fs.rmSync(runtimeDist, { recursive: true, force: true });
  fs.mkdirSync(runtimeDist, { recursive: true });
  run("ditto", [sourceApp, runtimeApp]);

  if (fs.existsSync(sourceExecutable) && !fs.existsSync(runtimeExecutable)) {
    fs.renameSync(sourceExecutable, runtimeExecutable);
  }
};

const prepareHelperApps = () => {
  const frameworksPath = path.join(runtimeApp, "Contents", "Frameworks");

  for (const helper of helperNames) {
    const oldApp = path.join(frameworksPath, `${helper.from}.app`);
    const newApp = path.join(frameworksPath, `${helper.to}.app`);
    const targetApp = fs.existsSync(newApp) ? newApp : oldApp;
    if (!fs.existsSync(targetApp)) continue;

    const oldExecutable = path.join(targetApp, "Contents", "MacOS", helper.from);
    const newExecutable = path.join(targetApp, "Contents", "MacOS", helper.to);
    if (fs.existsSync(oldExecutable) && !fs.existsSync(newExecutable)) {
      fs.renameSync(oldExecutable, newExecutable);
    }

    const plist = path.join(targetApp, "Contents", "Info.plist");
    setPlistValue(plist, "CFBundleName", helper.to);
    setPlistValue(plist, "CFBundleDisplayName", helper.to);
    setPlistValue(plist, "CFBundleExecutable", helper.to);
    setPlistValue(plist, "CFBundleIdentifier", helper.id);

    if (targetApp === oldApp) {
      fs.renameSync(oldApp, newApp);
    }
  }
};

const prepareIcon = () => {
  if (!fs.existsSync(iconPng)) return;

  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });

  for (const size of [16, 32, 128, 256, 512]) {
    run("sips", [
      "-z",
      String(size),
      String(size),
      iconPng,
      "--out",
      path.join(iconset, `icon_${size}x${size}.png`),
    ]);
    run("sips", [
      "-z",
      String(size * 2),
      String(size * 2),
      iconPng,
      "--out",
      path.join(iconset, `icon_${size}x${size}@2x.png`),
    ]);
  }

  fs.rmSync(iconIcns, { force: true });
  run("iconutil", ["-c", "icns", iconset, "-o", iconIcns]);
  fs.rmSync(iconset, { recursive: true, force: true });
};

const preparePlist = () => {
  setPlistValue(runtimePlist, "CFBundleName", appName);
  setPlistValue(runtimePlist, "CFBundleDisplayName", appName);
  setPlistValue(runtimePlist, "CFBundleIdentifier", bundleId);
  setPlistValue(runtimePlist, "CFBundleIconFile", "nexum");
  setPlistValue(runtimePlist, "CFBundleExecutable", appName);
  setPlistValue(runtimePlist, "CFBundleShortVersionString", appVersion);
  setPlistValue(runtimePlist, "CFBundleVersion", appVersion);
};

const signRuntimeApp = () => {
  run("codesign", ["--force", "--deep", "--sign", "-", runtimeApp]);
};

if (process.platform !== "darwin") {
  process.exit(0);
}

if (!fs.existsSync(sourceApp)) {
  throw new Error("Electron runtime is missing. Run pnpm install first.");
}

if (needsRefresh()) {
  copyRuntimeApp();
}

prepareHelperApps();
prepareIcon();
preparePlist();
signRuntimeApp();
