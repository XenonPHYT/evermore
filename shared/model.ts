import { z } from "zod";
export const kinds = [
  "letter",
  "heartbeat",
  "memory",
  "forever",
  "surprise",
] as const;
export const palettes = {
  rose: ["#fff2e8", "#75465e"],
  lavender: ["#eee6ff", "#4c386a"],
  blue: ["#e4f1fb", "#264866"],
  night: ["#31203d", "#fff2e8"],
} as const;
export const greeting = z.object({
  version: z.literal(1),
  kind: z.enum(kinds),
  title: z.string().max(90),
  body: z.string().max(2500),
  font: z.enum(["serif", "sans", "mono"]),
  palette: z.enum(["rose", "lavender", "blue", "night"]),
  ink: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  texture: z.enum(["plain", "linen"]),
  effect: z.enum(["none", "hearts", "petals", "sparkles"]),
  sticker: z.enum(["none", "heart", "flower", "star"]),
  sound: z.boolean(),
  countdown: z.number().int().nonnegative().max(4102444800000).nullable(),
  photos: z
    .array(z.object({ id: z.string().uuid(), caption: z.string().max(150) }))
    .max(6),
});
export type Greeting = z.infer<typeof greeting>;
export const templates = [
  {
    id: "letter",
    title: "Love Letter Studio",
    icon: "✉",
    relationship: "Partners",
    occasion: "Appreciation",
    body: "Of all the little things in my day, thinking of you is my favorite.",
    palette: "rose",
    effect: "sparkles",
  },
  {
    id: "heartbeat",
    title: "Heartbeat",
    icon: "♡",
    relationship: "Someone special",
    occasion: "Missing you",
    body: "A little reminder that you’re on my mind.",
    palette: "night",
    effect: "hearts",
  },
  {
    id: "memory",
    title: "Memory Lane",
    icon: "▧",
    relationship: "Family",
    occasion: "Gratitude",
    body: "Here are a few moments I never want to forget.",
    palette: "lavender",
    effect: "none",
  },
  {
    id: "forever",
    title: "Forever Yours",
    icon: "❀",
    relationship: "Self-love",
    occasion: "Encouragement",
    body: "Look how far you’ve come. I’m proud of you.",
    palette: "rose",
    effect: "petals",
  },
  {
    id: "surprise",
    title: "Surprise Me",
    icon: "✦",
    relationship: "Friends",
    occasion: "Celebration",
    body: "Today calls for a little extra joy. This one is for you!",
    palette: "blue",
    effect: "sparkles",
  },
] as const;
export function newGreeting(id: string): Greeting {
  const t = templates.find((x) => x.id === id) ?? templates[0];
  return {
    version: 1,
    kind: t.id,
    title: t.title,
    body: t.body,
    font: "serif",
    palette: t.palette,
    texture: "linen",
    effect: t.effect,
    sticker: "none",
    sound: false,
    countdown: null,
    photos: [],
  };
}
export const maxPhoto = 1024 * 1024;
export function isWebP(bytes: Uint8Array) {
  return (
    bytes.length >= 16 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(
      String.fromCharCode(...bytes.subarray(12, 16)),
    ) &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      4,
      true,
    ) ===
      bytes.length - 8
  );
}
