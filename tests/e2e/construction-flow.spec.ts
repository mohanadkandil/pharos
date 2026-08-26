import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
});

test('commission to authored intervention, completion, passport and v2 save', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'HYPATIA' })).toBeVisible();
    await page.getByRole('button', { name: /Memory Commission/ }).click();
    await expect(page.getByRole('heading', { name: "Dockworkers' House" })).toBeVisible();
    await page.getByRole('button', { name: 'Review riverside site' }).click();
    await expect(page.getByRole('radio')).toHaveCount(3);

    await page.locator('.plan-row[data-plan-id=\"compact\"]').click();
    const begin = page.getByRole('button', { name: 'Begin Compact House' });
    await begin.scrollIntoViewIfNeeded();
    await expect(begin).toBeVisible();
    await begin.click();
    await expect(page.getByRole('progressbar')).toBeVisible();

    for (const phase of ['Foundation', 'Structure', 'Walls', 'Fit-out']) {
        await page.getByRole('button', { name: 'Next phase' }).click();
        await expect(page.locator('.phase-markers .active')).toHaveText(phase);
    }

    await expect(page.getByRole('heading', { name: /western rooms overheat/i })).toBeVisible();
    await page.getByRole('radio', { name: /Add mashrabiya shade/i }).click();
    await page.getByRole('button', { name: 'Next phase' }).click();
    await expect(page.locator('.phase-markers .active')).toHaveText('Open');
    await page.getByRole('button', { name: 'Next phase' }).click();

    await expect(page.getByRole('button', { name: 'Building passport' })).toBeVisible();
    await page.getByRole('button', { name: 'Building passport' }).click();
    await expect(page.locator('.building-passport')).toContainText('Memory');
    await expect(page.locator('.building-passport')).toContainText('Add mashrabiya shade');
    await expect(page.locator('.building-passport')).toContainText('Mariam Hassan');

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pharos.save.v1') ?? '{}'));
    expect(save.v).toBe(2);
    expect(save.productBrand).toBe('HYPATIA');
    expect(save.constructions).toHaveLength(1);
    expect(errors).toEqual([]);
});
