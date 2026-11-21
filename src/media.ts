import { palettes, type Greeting } from "../shared/model";
export function optimize(file: Blob, zoom = 1, x = 0.5, y = 0.5, size = 1000) {
  if (
    !/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type) ||
    file.size > 18000000
  )
    return Promise.reject(
      Error("Use a JPG, PNG, WebP, GIF, or AVIF under 18 MB."),
    );
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("./media.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error("Image processing timed out."));
    }, 20000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data instanceof Blob) resolve(e.data);
      else reject(Error(e.data));
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(Error("Image worker is not supported in this browser."));
    };
    worker.postMessage({ file, zoom, x, y, size });
  });
}
function store(key: string, value?: Blob, remove = false) {
  return new Promise<Blob | undefined>((resolve, reject) => {
    const req = indexedDB.open("evermore-crops", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("images");
    req.onerror = () => reject(Error("Local photo storage is unavailable."));
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(
        "images",
        value || remove ? "readwrite" : "readonly",
      );
      const s = tx.objectStore("images");
      const op = remove
        ? s.delete(key)
        : value
          ? s.put(value, key)
          : s.get(key);
      tx.oncomplete = () => {
        db.close();
        resolve(op.result instanceof Blob ? op.result : undefined);
      };
      tx.onerror = () => {
        db.close();
        reject(Error("Local photo storage failed."));
      };
    };
  });
}
export const localPhoto = (key: string) => store(key);
export const saveLocal = (key: string, b: Blob) => store(key, b);
export const removeLocal = (key: string) => store(key, undefined, true);
export function clearLocal() {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("evermore-crops");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(Error("Could not clear device photos."));
    req.onblocked = () =>
      reject(Error("Close other Evermore tabs before clearing device photos."));
  });
}
function typeFor(canvas: HTMLCanvasElement, mime: string) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b && b.type === mime
          ? resolve(b)
          : reject(Error("This export format is unavailable.")),
      mime,
      0.86,
    ),
  );
}
const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(Error("One of the photos could not be loaded."));
    i.src = src;
  });
export async function exportGreeting(
  c: Greeting,
  source: (id: string) => string | undefined,
  format: "png" | "jpeg" | "webp" | "video",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 900;
  const g = canvas.getContext("2d")!;
  const [bg, ink] = palettes[c.palette];
  const photos = await Promise.all(
    c.photos.slice(0, 6).map((p) => {
      const url = source(p.id);
      return url ? load(url) : null;
    }),
  );
  function paint(ms = 0) {
    g.fillStyle = bg;
    g.fillRect(0, 0, 900, 900);
    g.fillStyle = c.ink || ink;
    g.strokeStyle = g.fillStyle;
    g.strokeRect(35, 35, 830, 830);
    g.textAlign = "center";
    g.font = `46px ${{ serif: "Georgia, serif", sans: "system-ui, sans-serif", mono: "monospace" }[c.font]}`;
    g.fillText(c.title, 450, 145, 760);
    g.font = `25px ${{ serif: "Georgia, serif", sans: "system-ui, sans-serif", mono: "monospace" }[c.font]}`;
    const lines = c.body
      .split("\n")
      .flatMap((line) => line.match(/.{1,61}(?:\s|$)|.{1,61}/gu) || [""]);
    lines
      .slice(0, photos.length ? 10 : 20)
      .forEach((line, i) => g.fillText(line, 450, 205 + i * 27, 750));
    photos.forEach((im, i) => {
      if (!im) return;
      const x = 135 + (i % 3) * 215,
        y = 490 + Math.floor(i / 3) * 165;
      g.drawImage(im, x, y, 140, 140);
      g.font = "14px sans-serif";
      g.fillText(c.photos[i].caption, x + 70, y + 155, 140);
    });
    if (c.effect !== "none") {
      g.font = "32px serif";
      for (let i = 0; i < 16; i++) {
        g.globalAlpha = 0.35;
        g.fillText(
          c.effect === "hearts" ? "♥" : c.effect === "petals" ? "❀" : "✦",
          50 + i * 51,
          ((((i * 97 - ms / 10) % 780) + 780) % 780) + 60,
        );
      }
      g.globalAlpha = 1;
    }
  }
  paint();
  if (format !== "video") return typeFor(canvas, `image/${format}`);
  if (typeof MediaRecorder === "undefined" || !canvas.captureStream)
    throw Error("Video export is not available in this browser.");
  const mimeType = [
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((s) => MediaRecorder.isTypeSupported(s));
  if (!mimeType)
    throw Error(
      "This browser does not support a compatible MP4 or WebM codec.",
    );
  const stream = canvas.captureStream(24);
  return new Promise<Blob>((resolve, reject) => {
    let tick = 0;
    function stop() {
      clearInterval(tick);
      stream.getTracks().forEach((t) => t.stop());
    }
    try {
      const rec = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        stop();
        reject(Error("Video export failed."));
      };
      rec.onstop = () => {
        stop();
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType });
        if (blob.size) resolve(blob);
        else reject(Error("Video encoder did not produce a file."));
      };
      const start = performance.now();
      rec.start();
      tick = window.setInterval(() => {
        const t = performance.now() - start;
        paint(t);
        if (t >= 3500 && rec.state === "recording") rec.stop();
      }, 42);
    } catch (e) {
      stop();
      reject(e);
    }
  });
}
