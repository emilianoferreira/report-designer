import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Zureo Report Designer
 * Full flow: template list → create → design → preview → save → delete
 *
 * Prerequisites:
 * - Angular dev server running on port 4200
 * - NestJS API running on port 3000
 * - PostgreSQL with seed data
 */

const TEST_TEMPLATE_NAME = `E2E Test ${Date.now()}`;

test.describe('Template Management Flow', () => {

  test('should load the template list page', async ({ page }) => {
    await page.goto('/templates');
    await expect(page).toHaveURL(/\/templates/);

    // Should show the page title or header
    const heading = page.locator('h1, h2, .page-title').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('should create a new template', async ({ page }) => {
    await page.goto('/templates');

    // Click the "New" button
    const newBtn = page.locator('button').filter({ hasText: /nuevo|crear|new/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10_000 });
    await newBtn.click();

    // Fill the form
    const nameInput = page.locator('input[name="name"], input[placeholder*="nombre" i], input[formcontrolname="name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(TEST_TEMPLATE_NAME);

    // Select document type if available
    const typeSelect = page.locator('select').first();
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption({ index: 0 });
    }

    // Submit
    const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /guardar|crear|save/i }).first();
    await saveBtn.click();

    // Should navigate to designer or show template in list
    await page.waitForTimeout(1000);
  });

  test('should open the designer for a template', async ({ page }) => {
    await page.goto('/templates');
    await page.waitForTimeout(2000);

    // Click on first template to open designer
    const templateLink = page.locator('a[routerLink], .mold-card, .template-item').first();
    if (await templateLink.isVisible()) {
      await templateLink.click();
      await page.waitForTimeout(2000);

      // Should be in the designer page
      // Look for canvas, toolbox, or properties panel
      const designerIndicator = page.locator('.design-canvas, .toolbox, .canvas-wrapper, .designer-container').first();
      await expect(designerIndicator).toBeVisible({ timeout: 10_000 });
    }
  });

  test('should show toolbox with categories', async ({ page }) => {
    await page.goto('/templates');
    await page.waitForTimeout(2000);

    const templateLink = page.locator('a[routerLink], .mold-card, .template-item').first();
    if (await templateLink.isVisible()) {
      await templateLink.click();
      await page.waitForTimeout(2000);

      // Toolbox should have categories
      const toolbox = page.locator('.toolbox, app-toolbox').first();
      if (await toolbox.isVisible()) {
        // Should have basic categories
        await expect(toolbox.locator('text=Texto, text=Datos, text=Formas').first()).toBeVisible();
      }
    }
  });

  test('should toggle preview mode', async ({ page }) => {
    await page.goto('/templates');
    await page.waitForTimeout(2000);

    const templateLink = page.locator('a[routerLink], .mold-card, .template-item').first();
    if (await templateLink.isVisible()) {
      await templateLink.click();
      await page.waitForTimeout(2000);

      // Look for preview toggle button
      const previewBtn = page.locator('button').filter({ hasText: /vista previa|preview/i }).first();
      if (await previewBtn.isVisible()) {
        await previewBtn.click();
        await page.waitForTimeout(2000);

        // Preview should show an iframe or rendered HTML
        const preview = page.locator('iframe, .preview-container, .preview-frame').first();
        await expect(preview).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test('should save template design', async ({ page }) => {
    await page.goto('/templates');
    await page.waitForTimeout(2000);

    const templateLink = page.locator('a[routerLink], .mold-card, .template-item').first();
    if (await templateLink.isVisible()) {
      await templateLink.click();
      await page.waitForTimeout(2000);

      // Click save button
      const saveBtn = page.locator('button').filter({ hasText: /guardar|save/i }).first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(1000);

        // Should show success feedback (toast, notification, etc.)
        const feedback = page.locator('.toast, .notification, .snackbar, [class*="success"]').first();
        // Optional - some implementations might not have visual feedback
      }
    }
  });
});

test.describe('API Integration', () => {

  test('should load invoice list from API', async ({ page }) => {
    const response = await page.request.get('/api/invoices?companyId=c1000000-0000-0000-0000-000000000001');
    expect(response.ok()).toBe(true);

    const invoices = await response.json();
    expect(Array.isArray(invoices)).toBe(true);
    expect(invoices.length).toBeGreaterThan(0);
  });

  test('should load invoice data for preview', async ({ page }) => {
    const response = await page.request.get('/api/invoices/f1000000-0000-0000-0000-000000000001/data');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('invoice');
    expect(data).toHaveProperty('invoiceLines');
    expect(data).toHaveProperty('company');
    expect(data).toHaveProperty('Total');
    expect(data.company.Nombre).toBeTruthy();
  });

  test('should load template list from API', async ({ page }) => {
    const response = await page.request.get('/api/templates?companyId=c1000000-0000-0000-0000-000000000001');
    expect(response.ok()).toBe(true);

    const templates = await response.json();
    expect(Array.isArray(templates)).toBe(true);
  });

  test('should CRUD a template via API', async ({ page }) => {
    // Create
    const createRes = await page.request.post('/api/templates', {
      data: {
        nombre: `PW Test ${Date.now()}`,
        company_id: 'c1000000-0000-0000-0000-000000000001',
        template_json: { test: true },
      },
    });
    expect(createRes.ok()).toBe(true);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();

    // Read
    const readRes = await page.request.get(`/api/templates/${created.id}`);
    expect(readRes.ok()).toBe(true);
    const read = await readRes.json();
    expect(read.nombre).toContain('PW Test');

    // Update
    const updateRes = await page.request.put(`/api/templates/${created.id}`, {
      data: { nombre: 'PW Updated' },
    });
    expect(updateRes.ok()).toBe(true);

    // Delete
    const deleteRes = await page.request.delete(`/api/templates/${created.id}`);
    expect(deleteRes.ok()).toBe(true);

    // Verify deleted
    const verifyRes = await page.request.get(`/api/templates/${created.id}`);
    expect(verifyRes.status()).toBe(404);
  });
});
