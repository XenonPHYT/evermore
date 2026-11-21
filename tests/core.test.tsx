import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { greeting, isWebP, newGreeting, kinds } from "../shared/model";
import GreetingView from "../src/viewer";
beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: true })));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("ships five valid template defaults and rejects unknown schema versions", () => {
  for (const id of kinds) expect(greeting.parse(newGreeting(id)).kind).toBe(id);
  expect(
    greeting.safeParse({ ...newGreeting("letter"), version: 2 }).success,
  ).toBe(false);
});
it("rejects fake or truncated file signatures", () => {
  expect(isWebP(new Uint8Array(50))).toBe(false);
  expect(isWebP(new TextEncoder().encode("RIFF0000WEBPVP8 "))).toBe(false);
});
it("renders the real saved greeting on reveal and can replay", () => {
  render(
    <GreetingView
      config={{
        ...newGreeting("surprise"),
        title: "Happy birthday!",
        body: "We miss you.",
      }}
      source={() => undefined}
    />,
  );
  expect(screen.queryByText("Happy birthday!")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open the gift" }));
  expect(screen.getByRole("heading", { name: "Happy birthday!" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(screen.queryByText("Happy birthday!")).toBeNull();
});
it("does not open a future countdown", () => {
  render(
    <GreetingView
      config={{ ...newGreeting("forever"), countdown: Date.now() + 60000 }}
      source={() => undefined}
    />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Break the seal",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
