import { useCallback, useEffect, useState } from "react";
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const raw = body instanceof Blob;
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      "X-Evermore": "1",
      ...extraHeaders,
      ...(body !== undefined
        ? { "Content-Type": raw ? body.type : "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
export function useApi<T>(path: string) {
  const [state, set] = useState<{ data: T | null; error: string }>({
    data: null,
    error: "",
  });
  const [version, retry] = useState(0);
  const reload = useCallback(() => retry((x) => x + 1), []);
  useEffect(() => {
    let active = true;
    api<T>(path).then(
      (data) => {
        if (active) set({ data, error: "" });
      },
      (e) => {
        if (active) set({ data: null, error: e.message });
      },
    );
    return () => {
      active = false;
    };
  }, [path, version]);
  return { ...state, reload };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyPath(path: string) {
  await navigator.clipboard.writeText(new URL(path, location.origin).href);
}
export type Profile = {
  username: string | null;
  display_name: string;
  bio: string;
  theme: "rose" | "lavender" | "blue" | "night";
  is_public: number;
  show_creations: number;
  notify_notes: number;
  has_avatar: number;
};
export type Creation = {
  id: string;
  title: string;
  template: string;
  share: string | null;
  updated: number;
};
export type Inbox = {
  inbox: { slug: string; enabled: number };
  messages: {
    id: string;
    name: string | null;
    body: string;
    favorite: number;
    created: number;
  }[];
};
export type Notification = {
  id: string;
  kind: string;
  created: number;
  seen: number;
};
