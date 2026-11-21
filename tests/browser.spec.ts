import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("mobile author publishes from the real editor and guest reveals the greeting", async ({
  page,
  browser,
}) => {
  await page.goto("/account/register");
  await page.getByLabel("Display name").fill("Alex");
  await page
    .getByLabel("Username")
    .fill(`u${randomUUID().replaceAll("-", "").slice(0, 20)}`);
  await page.getByLabel("Password").fill("one-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("recovery-code")).toHaveText(
    /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/,
  );
  await expect(
    page.getByRole("button", { name: "Continue to my workspace" }),
  ).toBeDisabled();
  await page.getByLabel("I have saved my recovery code").check();
  await page.getByRole("button", { name: "Continue to my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Alex." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Start creating" }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "Surprise Me" })
    .getByRole("link", { name: "Customize" })
    .click();
  await page.getByLabel("Greeting title").fill("A little joy");
  await page.getByLabel("Message", { exact: true }).fill("You made my week.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Private draft saved.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Publish an unlisted link", { exact: false }).check();
  await page.getByRole("button", { name: "Publish greeting" }).click();
  const live = page.getByRole("link", { name: "Open live greeting" });
  await expect(live).toBeVisible();
  const guest = await browser.newContext({
    viewport: { width: 320, height: 680 },
    reducedMotion: "reduce",
  });
  try {
    const recipient = await guest.newPage();
    const response = await recipient.goto(
      new URL((await live.getAttribute("href"))!, page.url()).href,
    );
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await recipient.getByRole("button", { name: "Open the gift" }).click();
    await expect(
      recipient.getByRole("heading", { name: "A little joy" }),
    ).toBeVisible();
    await expect(
      recipient.getByText("You made my week.").first(),
    ).toBeVisible();
    expect(
      await recipient.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  } finally {
    await guest.close();
  }
});

test("a photo stays local through draft save, then the optimized crop and preview become available", async ({
  page,
  browser,
}) => {
  await page.goto("/account/register");
  await page.getByLabel("Display name").fill("Jamie");
  await page
    .getByLabel("Username")
    .fill(`u${randomUUID().replaceAll("-", "").slice(0, 20)}`);
  await page.getByLabel("Password").fill("another-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("recovery-code")).toHaveText(
    /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/,
  );
  await expect(
    page.getByRole("button", { name: "Continue to my workspace" }),
  ).toBeDisabled();
  await page.getByLabel("I have saved my recovery code").check();
  await page.getByRole("button", { name: "Continue to my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Jamie." }),
  ).toBeVisible();
  await page.goto("/app/studio/memory");
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/assets/"))
      uploads.push(r.url());
  });
  await page.getByText("Photos (0/6)", { exact: true }).click();
  const photo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#c53877";
    ctx.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Choose a photo")
    .setInputFiles({
      name: "sample.png",
      mimeType: "image/png",
      buffer: Buffer.from(photo, "base64"),
    });
  await page.getByRole("button", { name: "Add optimized crop" }).click();
  await page
    .getByRole("textbox", { name: "Photo 1 caption" })
    .fill("First memory");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Private draft saved.", { exact: false }),
  ).toBeVisible();
  expect(uploads).toHaveLength(0);
  await page.getByText("Export / advanced tools", { exact: true }).click();
  const exportEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG", exact: true }).click();
  expect((await exportEvent).suggestedFilename()).toBe("evermore.png");
  await page.getByLabel("Publish an unlisted link", { exact: false }).check();
  await page.getByRole("button", { name: "Publish greeting" }).click();
  const live = page.getByRole("link", { name: "Open live greeting" });
  await expect(live).toBeVisible();
  expect(uploads).toHaveLength(2);
  const guest = await browser.newContext();
  try {
    const url = (await live.getAttribute("href"))!;
    const recipient = await guest.newPage();
    await recipient.goto(new URL(url, page.url()).href);
    await recipient.getByRole("button", { name: "Open scrapbook" }).click();
    await expect(
      recipient.getByText("First memory", { exact: true }),
    ).toBeVisible();
    const image = recipient.getByRole("img", {
      name: "Memory 1: First memory",
    });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBe(64);
    const preview = await guest.request.get(
      new URL(`/api${url}/assets/preview`, page.url()).href,
    );
    expect(preview.status()).toBe(200);
    expect(preview.headers()["content-type"]).toContain("image/webp");
  } finally {
    await guest.close();
  }
});
