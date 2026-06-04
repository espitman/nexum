import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

type MonacoEnvironmentTarget = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker(workerId: string, label: string): Worker;
  };
};

const target = globalThis as MonacoEnvironmentTarget;

target.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") {
      return new JsonWorker();
    }

    return new EditorWorker();
  },
};
