// Classic Worker: only the optional validator downloads the pinned runtime.
declare function importScripts(...urls: string[]): void;
const runtime = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const scope = globalThis as typeof globalThis & {
  loadPyodide: (opts: {
    indexURL: string;
  }) => Promise<{
    globals: { set: (n: string, v: string) => void };
    runPython: (s: string) => string;
  }>;
};
let py: ReturnType<typeof scope.loadPyodide> | undefined;
self.onmessage = async (e: MessageEvent<string>) => {
  try {
    if (!py) {
      self.postMessage({ stage: "Downloading the Python runtime…" });
      importScripts(runtime + "pyodide.js");
      self.postMessage({
        stage: "Initializing Python and its standard library…",
      });
      py = scope.loadPyodide({ indexURL: runtime });
    }
    const p = await py;
    self.postMessage({ stage: "Checking greeting schema v1…" });
    p.globals.set("greeting_json", e.data);
    const result = p.runPython(
      `import json\nc = json.loads(greeting_json)\njson.dumps({'valid': c.get('version') == 1 and bool(c.get('title', '').strip()) and bool(c.get('body', '').strip()) and len(c.get('photos', [])) <= 6, 'words': len(c.get('body', '').split())})`,
    );
    self.postMessage({ result: JSON.parse(result) });
  } catch {
    py = undefined;
    self.postMessage({
      error:
        "Python could not load. You can retry or keep using the JavaScript editor.",
    });
  }
};
