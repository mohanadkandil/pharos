import { test, expect } from '@playwright/test';

test('mobile opens seeded completed building in read-only replay mode', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');

    await expect(page.getByRole('button', { name: /Memory Commission/ })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Building passport' })).toBeVisible();
    await page.getByRole('button', { name: 'Building passport' }).click();
    await expect(page.locator('.building-passport')).toContainText("Dockworkers' House");
    await expect(page.locator('.building-passport')).toContainText('A fictional memory');

    await page.locator('.building-passport').getByRole('button', { name: 'Replay construction' }).click();
    await expect(page.getByRole('button', { name: 'Stop replay' })).toBeVisible();
});

test('tablet uses bottom drafting tray without hiding the city', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await page.getByRole('button', { name: /Memory Commission/ }).click();

    const rail = page.locator('.construction-rail');
    await expect(rail).toBeVisible();
    const railBox = await rail.boundingBox();
    const canvasBox = await page.locator('#game-canvas').boundingBox();
    expect(railBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    expect(railBox!.width).toBeGreaterThanOrEqual(760);
    expect(railBox!.y).toBeGreaterThan(500);
    expect(canvasBox!.height).toBeGreaterThan(500);
});
