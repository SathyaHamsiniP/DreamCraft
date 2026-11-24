import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await expect(page.getByTestId("game-state")).toHaveText("ready");
  await expect(page.locator("canvas")).toHaveCount(1);
}
async function leave(page: Page, name: string) {
  const path = name === "Help" ? "/help" : "/levels";
  await page.getByRole("link", { name, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect
    .poll(
      async () =>
        (await dialog.isVisible()) || new URL(page.url()).pathname === path,
    )
    .toBe(true);
  if (await dialog.isVisible())
    await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(path + "$"));
}

test("sample game uses real keyboard controls and cleans up across navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your sketch/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Create a game →", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Try a sample game →", exact: true })
    .click();
  await ready(page);
  await expect(page.getByText("A little adventure awaits")).toBeVisible();
  await page.getByLabel("Sample level", { exact: true }).selectOption("flat");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/This level has no coins/)).toBeVisible();
  await ready(page);
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("game-state")).toHaveText("playing");
  await page.keyboard.down("ArrowRight");
  await expect(page.getByTestId("game-state")).toHaveText("completed", {
    timeout: 12000,
  });
  await page.keyboard.up("ArrowRight");
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("game-state")).toHaveText("playing");
  await page.getByRole("button", { name: "Save level", exact: true }).click();
  await expect(
    page.getByText("Saved in database", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("game-state")).toHaveText("playing");
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "Check playability" }).click();
  await expect(
    page.getByRole("heading", { name: "A route was found" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This route has not been verified in Phaser for this request.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to editor" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Create level →" }).click();
  await ready(page);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Saved in database", { exact: true }),
  ).toBeVisible();
  for (const sample of ["coins", "flat", "jump"]) {
    await page.getByLabel("Sample level", { exact: true }).selectOption(sample);
    if (await page.getByRole("dialog").isVisible())
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    await ready(page);
  }
  await leave(page, "Help");
  await expect(page.locator("canvas")).toHaveCount(0);
  await leave(page, "My Levels");
  await page.getByRole("link", { name: "Open, edit & play →" }).first().click();
  await ready(page);
  await page.reload();
  await ready(page);
  expect(errors).toEqual([]);
});
async function synthetic(page: Page, blank = false) {
  return page.evaluate((blank) => {
    const c = document.createElement("canvas");
    c.width = 960;
    c.height = 540;
    const g = c.getContext("2d")!;
    g.fillStyle = "white";
    g.fillRect(0, 0, 960, 540);
    if (!blank) {
      g.strokeStyle = "black";
      g.lineWidth = 3;
      g.strokeRect(10, 470, 940, 20);
      g.strokeRect(60, 420, 30, 30);
      g.strokeRect(850, 410, 35, 40);
      g.beginPath();
      g.arc(350, 300, 10, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(500, 380);
      g.lineTo(515, 350);
      g.lineTo(530, 380);
      g.closePath();
      g.stroke();
    }
    return c.toDataURL().split(",")[1];
  }, blank);
}
test("synthetic sketch goes through real detection, manual review, SQLite and Phaser", async ({
  page,
  request,
}) => {
  await page.goto("/studio");
  const data = await synthetic(page);
  await page.getByLabel("Upload drawing").setInputFiles({
    name: "controlled.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.getByText("controlled.png", { exact: true })).toBeVisible();
  const resultPromise = page.waitForResponse(
    (r) => r.url().includes("/api/sketch/candidates") && r.status() === 200,
  );
  await page.getByRole("button", { name: "Detect candidates" }).click();
  const result = await (await resultPromise).json();
  expect(result.model_status).toBe("unavailable");
  expect(result.candidates).toHaveLength(5);
  await expect(
    page.getByRole("button", { name: "Create level →" }),
  ).toBeDisabled();
  const target = [
    { type: "coin", x: 350, y: 436, width: 16, height: 16 },
    { type: "spike", x: 500, y: 350, width: 30, height: 30 },
    { type: "goal", x: 850, y: 424, width: 24, height: 36 },
    { type: "spawn", x: 50, y: 430, width: 20, height: 30 },
    { type: "platform", x: 0, y: 460, width: 960, height: 20 },
  ];
  for (let i = 0; i < target.length; i++) {
    await page
      .getByRole("button", {
        name: `Select object ${i + 1}: Unlabeled`,
        exact: true,
      })
      .click();
    await page
      .getByLabel("Object type", { exact: true })
      .selectOption(target[i].type);
    // Shrink first so changes near the page edge remain valid while editing.
    await page.getByLabel("Width", { exact: true }).fill("1");
    await page.getByLabel("Height", { exact: true }).fill("1");
    for (const key of ["x", "y", "width", "height"] as const)
      await page
        .getByLabel(
          key === "x" || key === "y"
            ? key.toUpperCase()
            : key[0].toUpperCase() + key.slice(1),
          { exact: true },
        )
        .fill(String(target[i][key]));
    await page.getByLabel("I reviewed this object").check();
  }
  const createdPromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/sketch/reviewed-level"),
  );
  await page.getByRole("button", { name: "Create level →" }).click();
  expect((await createdPromise).status()).toBe(200);
  await ready(page);
  const savePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/levels") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save level", exact: true }).click();
  const record = await (await savePromise).json();
  expect(record.level.objects).toHaveLength(5);
  const retrieved = await request.get(
    `http://127.0.0.1:8002/api/levels/${record.id}`,
  );
  expect((await retrieved.json()).level).toEqual(record.level);
  await page.getByRole("button", { name: "Check playability" }).click();
  await expect(
    page.getByRole("heading", { name: "A route was found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.keyboard.down("ArrowRight");
  await expect(page.getByTestId("game-state")).toHaveText("completed", {
    timeout: 12000,
  });
  await page.keyboard.up("ArrowRight");
  await expect(page.getByTestId("coin-score")).toHaveText("1");
  await leave(page, "My Levels");
  await page.reload();
  await page.locator(`a[href="/studio?level=${record.id}"]`).click();
  await ready(page);
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page.getByLabel("X", { exact: true }).fill("349");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Help", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(
    page.getByRole("group", { name: "Object editor" }),
  ).toBeVisible();
});
test("invalid uploads, blank sheets and missing labels stay editable", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByLabel("Upload drawing").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a PNG or JPEG image.",
  );
  const data = await synthetic(page, true);
  await page.getByLabel("Upload drawing").setInputFiles({
    name: "blank.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.getByText("blank.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Detect candidates" }).click();
  await expect(
    page.getByText(
      "0 candidate boxes found. Choose a type and review each one.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Add box" }).click();
  await page.getByLabel("Object type", { exact: true }).selectOption("coin");
  await page.getByLabel("I reviewed this object").check();
  await expect(page.getByLabel("Review warnings")).toContainText(
    "Add one spawn",
  );
  await expect(
    page.getByRole("button", { name: "Create level →" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Delete box" }).click();
  await expect(
    page.getByText(
      "No candidates found. Add or draw boxes to continue manually.",
    ),
  ).toBeVisible();
});
test("EXIF preview and candidate coordinates use the same pixels", async ({
  page,
  request,
}) => {
  // An oriented JPEG is generated by Python in the test setup script.
  const { execFileSync } = await import("node:child_process");
  const data = execFileSync(process.env.DREAMCRAFT_PYTHON || "python3", [
    "-c",
    "from PIL import Image; import io,sys; im=Image.new('RGB',(120,80),'white'); e=Image.Exif();e[274]=6; b=io.BytesIO();im.save(b,'JPEG',exif=e);sys.stdout.buffer.write(b.getvalue())",
  ]);
  await page.goto("/studio");
  await page.getByLabel("Upload drawing").setInputFiles({
    name: "oriented.jpg",
    mimeType: "image/jpeg",
    buffer: data,
  });
  await expect(page.getByText(/80 × 120 oriented pixels/)).toBeVisible();
  const svg = page.getByRole("group", { name: "Object editor" });
  await expect(svg).toHaveAttribute("viewBox", "0 0 80 120");
  const detection = await request.post(
    "http://127.0.0.1:8002/api/sketch/candidates",
    {
      multipart: {
        file: { name: "oriented.jpg", mimeType: "image/jpeg", buffer: data },
      },
    },
  );
  expect((await detection.json()).image).toMatchObject({
    width: 80,
    height: 120,
  });
});

test("boxes can be drawn, moved and resized with a pointer", async ({
  page,
}) => {
  await page.goto("/studio");
  const data = await synthetic(page, true);
  await page.getByLabel("Upload drawing").setInputFiles({
    name: "manual.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.getByText("manual.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Draw box", exact: true }).click();
  const svg = page.getByRole("group", { name: "Object editor" });
  await svg.scrollIntoViewIfNeeded();
  const r = (await svg.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.2, r.y + r.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.4, r.y + r.height * 0.4, {
    steps: 5,
  });
  await page.mouse.up();
  const beforeX = Number(
      await page.getByLabel("X", { exact: true }).inputValue(),
    ),
    beforeWidth = Number(
      await page.getByLabel("Width", { exact: true }).inputValue(),
    );
  expect(beforeWidth).toBeGreaterThan(100);
  await page.getByLabel("Object type", { exact: true }).selectOption("coin");
  await page.getByLabel("I reviewed this object").check();
  const box = svg.locator("g.box>rect").first();
  await box.scrollIntoViewIfNeeded();
  const b = (await box.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 10, {
    steps: 4,
  });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("X", { exact: true }).inputValue()),
  ).toBeGreaterThan(beforeX);
  await expect(page.getByLabel("I reviewed this object")).not.toBeChecked();
  const handle = svg.locator("rect.resize-handle");
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 20, h.y + h.height / 2 + 10, {
    steps: 4,
  });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("Width", { exact: true }).inputValue()),
  ).toBeGreaterThan(beforeWidth);
});

test("home and studio fit desktop and mobile screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({
    path: "/tmp/dreamcraft-studio-home.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");
  await expect(
    page.getByRole("heading", { name: "Game studio" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const data = await synthetic(page, true);
  await page.getByLabel("Upload drawing").setInputFiles({
    name: "mobile.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.getByText("mobile.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Add box" }).click();
  await page.getByLabel("Object type", { exact: true }).selectOption("spawn");
  await page.getByLabel("I reviewed this object").check();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "/tmp/dreamcraft-studio-mobile.png",
    fullPage: true,
  });
});

test("checking an unsaved sample saves it first and explains an unknown result", async ({
  page,
}) => {
  await page.goto("/studio?sample=gap");
  await ready(page);
  await page.getByRole("button", { name: "Check playability" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Save your current level",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The checker could not decide" }),
  ).toBeVisible();
  await expect(
    page.getByText("Saved in database", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/This does not mean the level is impossible/),
  ).toBeVisible();
});

test("the new sample explains the goal, coins and jumps", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Try sample level ▷" }).click();
  await expect(page).toHaveURL(/sample=trail/);
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "A little adventure awaits" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Gold coins give 1 bonus point each/),
  ).toBeVisible();
  await expect(page.getByTestId("coin-score").locator("..")).toContainText(
    "/ 4",
  );
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("game-state")).toHaveText("playing");
  await page
    .locator(".game-player")
    .screenshot({ path: "/tmp/dreamcraft-sky-trail.png" });
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "A little adventure awaits" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
