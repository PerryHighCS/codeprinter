import { expect, test, type Page } from '@playwright/test';

// The page settings panel lives behind a gear button by default (to keep
// the front preview visible without scrolling), so any test touching its
// fields has to open it first.
function openSettings(page: Page) {
    return page.getByRole('button', { name: 'Page settings' }).click();
}

test.describe('TraceLift editor', () => {
    test('renders the default worksheet and reacts to page settings changes', async ({ page }) => {
        await page.goto('/tracelift');

        await expect(page.getByRole('heading', { name: 'TraceLift' })).toBeVisible();

        // Default Round 4 source produces 3 flap cut guides on the front preview.
        // Scoped to the on-screen preview: the print document (hidden via
        // CSS, but still in the DOM) renders the worksheet too.
        await expect(page.locator('#tracelift-preview path[data-flap-id]')).toHaveCount(3);

        // No overflow warning for the default program.
        await expect(page.getByRole('alert')).toHaveCount(0);

        await openSettings(page);

        // Changing paper size to Tabloid applies its preset font size.
        await page.getByLabel('Paper').selectOption('tabloid');
        await expect(page.getByLabel('Font size (pt)')).toHaveValue('32');

        // Switching orientation applies its own preset too.
        await page.getByLabel('Orientation').selectOption('landscape');
        await expect(page.getByLabel('Font size (pt)')).toHaveValue('36');

        // Use valid settings plus enough source lines to trigger the
        // overflow warning. The field commits on blur rather than on every
        // keystroke (so clearing it to retype doesn't immediately snap to
        // the minimum), so the change isn't applied until it loses focus.
        await page.getByLabel('Source').fill(
            Array.from({ length: 12 }, (_, index) => `score${index} = ${index};`).join('\n'),
        );
        const fontInput = page.getByLabel('Font size (pt)');
        await fontInput.fill('72');
        await fontInput.blur();
        await expect(page.getByRole('alert')).toContainText('does not fit');

        // Bringing it back down clears the warning.
        await fontInput.fill('24');
        await fontInput.blur();
        await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('keeps settings collapsed and the front preview visible without scrolling by default', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/tracelift');

        await expect(page.getByLabel('Font size (pt)')).not.toBeVisible();
        await expect(page.getByRole('button', { name: 'Front' })).toHaveAttribute('aria-pressed', 'true');

        const preview = page.locator('#tracelift-preview svg').first();
        await expect(preview).toBeVisible();

        const previewBox = await preview.boundingBox();
        expect(previewBox).not.toBeNull();
        // The full rendered page fits within the viewport height: nothing
        // below its bottom edge should require scrolling to reach.
        expect(previewBox!.y + previewBox!.height).toBeLessThanOrEqual(800);

        const bodyScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(bodyScrollHeight).toBeLessThanOrEqual(800);
    });

    test('editing the source updates the number of flaps rendered', async ({ page }) => {
        await page.goto('/tracelift');

        await expect(page.locator('#tracelift-preview path[data-flap-id]')).toHaveCount(3);

        await page.getByLabel('Source').fill('total = [[price]] * [[quantity]];');

        await expect(page.locator('#tracelift-preview path[data-flap-id]')).toHaveCount(2);
    });

    test('switches the preview between front, back, and side by side', async ({ page }) => {
        await page.goto('/tracelift');

        await page.getByRole('button', { name: 'Back' }).click();
        // Only the back page's rotated labels are shown; front-page line
        // number groups disappear.
        await expect(page.locator('#tracelift-preview g')).toHaveCount(0);
        await expect(page.locator('#tracelift-preview svg text', { hasText: 'score' }).first()).toBeVisible();

        await page.getByRole('button', { name: 'Front' }).click();
        await expect(page.locator('#tracelift-preview g')).toHaveCount(4);
    });

    test('Prettify reformats the source and leaves it untouched on invalid code', async ({ page }) => {
        await page.goto('/tracelift');

        const source = page.getByLabel('Source');
        await source.fill('Title: Round 4\n\nscore=3;\nscore=[[score]]+10;');

        await page.getByRole('button', { name: 'Prettify' }).click();
        await expect(source).toHaveValue('Title: Round 4\n\nscore = 3;\nscore = [[score]] + 10;\n');
        await expect(page.getByRole('alert')).toHaveCount(0);

        await source.fill('not[[valid javascript');
        await page.getByRole('button', { name: 'Prettify' }).click();
        await expect(page.getByRole('alert')).toContainText('Could not prettify');
        await expect(source).toHaveValue('not[[valid javascript');
    });

    test('Print Worksheet invokes window.print()', async ({ page }) => {
        await page.goto('/tracelift');

        await page.evaluate(() => {
            (window as unknown as { __printed?: boolean }).__printed = false;
            window.print = () => {
                (window as unknown as { __printed?: boolean }).__printed = true;
            };
        });

        await page.getByRole('button', { name: 'Print Worksheet' }).click();

        const printed = await page.evaluate(() => (window as unknown as { __printed?: boolean }).__printed);
        expect(printed).toBe(true);
    });

    test('the print document renders at the selected paper size, and the app UI hides, under print media', async ({
        page,
    }) => {
        await page.goto('/tracelift');
        await openSettings(page);

        const configs: Array<[string, string, string, string]> = [
            ['letter', 'portrait', '8.5in', '11in'],
            ['letter', 'landscape', '11in', '8.5in'],
            ['tabloid', 'portrait', '11in', '17in'],
            ['tabloid', 'landscape', '17in', '11in'],
        ];

        for (const [paperSize, orientation, expectedWidth, expectedHeight] of configs) {
            await page.getByLabel('Paper').selectOption(paperSize);
            await page.getByLabel('Orientation').selectOption(orientation);
            await page.emulateMedia({ media: 'print' });

            const printDoc = page.locator('.print-document');
            await expect(printDoc).toBeVisible();
            await expect(printDoc.locator('.print-page')).toHaveCount(2);

            const svgs = printDoc.locator('svg');
            await expect(svgs.first()).toHaveAttribute('width', expectedWidth);
            await expect(svgs.first()).toHaveAttribute('height', expectedHeight);

            await expect(page.getByRole('heading', { name: 'TraceLift' })).not.toBeVisible();

            await page.emulateMedia({ media: 'screen' });
        }
    });

    test('calibrating a duplex mode persists it to localStorage, applies it to the worksheet, and survives a reload', async ({
        page,
    }) => {
        await page.goto('/tracelift');

        await page.getByRole('button', { name: 'calibration' }).click();
        await expect(page.locator('#tracelift-calibration')).toContainText('Duplex Calibration');
        await expect(page.locator('#tracelift-calibration path[data-flap-id]')).toHaveCount(5);

        await page.getByLabel(/Short-edge/).check();

        await expect
            .poll(() => page.evaluate(() => localStorage.getItem('tracelift.duplexPreferences')))
            .toBe(JSON.stringify({ 'letter-portrait': 'short-edge' }));

        // The worksheet's own back preview picks up the calibrated mode too.
        await page.getByRole('button', { name: 'editor' }).click();
        await page.getByRole('button', { name: 'Back' }).click();
        const backLabel = page.locator('#tracelift-preview text[data-flap-id]').first();
        const xBeforeReload = await backLabel.getAttribute('x');

        await page.reload();

        // The choice survives the reload...
        await expect
            .poll(() => page.evaluate(() => localStorage.getItem('tracelift.duplexPreferences')))
            .toBe(JSON.stringify({ 'letter-portrait': 'short-edge' }));

        // ...and the calibration UI reflects it when reopened.
        await page.getByRole('button', { name: 'calibration' }).click();
        await expect(page.getByLabel(/Short-edge/)).toBeChecked();

        // ...and the worksheet preview still renders with that same mode.
        await page.getByRole('button', { name: 'editor' }).click();
        await page.getByRole('button', { name: 'Back' }).click();
        await expect(page.locator('#tracelift-preview text[data-flap-id]').first()).toHaveAttribute(
            'x',
            xBeforeReload!,
        );
    });
});
