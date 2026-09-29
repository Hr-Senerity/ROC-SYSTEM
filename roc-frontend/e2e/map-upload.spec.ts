import { expect, test, type Page, type Route } from '@playwright/test';

const projectId = '11111111-1111-4111-8111-111111111111';
const mapsPath = `/projects/${projectId}/maps`;

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installFixtures(page: Page) {
  let uploadBody = '';
  await page.addInitScript(() => {
    localStorage.setItem('roc_token', 'e2e-token');
    localStorage.setItem('roc_role', 'super_admin');
    localStorage.setItem('roc_username', 'e2e');
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) {
      await route.continue();
      return;
    }
    if (path === '/api/auth/me') {
      await json(route, { ok: true, user: { username: 'e2e', role: 'super_admin' } });
      return;
    }
    if (path === `/api/projects/${projectId}`) {
      await json(route, { ok: true, project: {
        id: projectId, user_id: projectId, owner_username: 'e2e', name: 'T18 项目',
        description: '', status: 'active', created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z',
      } });
      return;
    }
    if (path === `/api/projects/${projectId}/maps` && request.method() === 'GET') {
      await json(route, { ok: true, maps: [] });
      return;
    }
    if (path === `/api/projects/${projectId}/maps/upload` && request.method() === 'POST') {
      uploadBody = request.postData() ?? '';
      await json(route, { ok: true, map: { id: 'map-1' } }, 201);
      return;
    }
    await json(route, { ok: false, message: `Unhandled E2E request: ${request.method()} ${path}` }, 404);
  });
  return { uploadBody: () => uploadBody };
}

test('地图上传向导覆盖 PGM+YAML 与人工标定模式', async ({ page }) => {
  const fixtures = await installFixtures(page);
  await page.goto(mapsPath);
  await page.getByRole('button', { name: '上传地图', exact: true }).first().click();

  await expect(page.getByRole('radio', { name: /普通图片/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /图片并标定/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /PGM \+ YAML/ })).toBeVisible();

  await page.getByRole('radio', { name: /PGM \+ YAML/ }).click();
  await page.getByLabel('选择 PGM 地图文件').setInputFiles({
    name: 'warehouse.pgm', mimeType: 'image/x-portable-graymap', buffer: Buffer.from('P2\n1 1\n255\n0\n'),
  });
  await page.getByLabel('选择地图 YAML 文件').setInputFiles({
    name: 'warehouse.yaml', mimeType: 'application/yaml', buffer: Buffer.from('image: warehouse.pgm'),
  });
  await expect(page.getByLabel('地图名称')).toHaveValue('warehouse');
  await page.getByRole('button', { name: '上传地图', exact: true }).click();
  await expect(page.getByRole('heading', { name: '上传地图' })).toBeHidden();
  expect(fixtures.uploadBody()).toContain('pgm-yaml');
  expect(fixtures.uploadBody()).toContain('map-source.pgm');
  expect(fixtures.uploadBody()).toContain('map-source.yaml');

  await page.getByRole('button', { name: '上传地图', exact: true }).first().click();
  await page.getByRole('radio', { name: /图片并标定/ }).click();
  await page.getByLabel('选择地图图片文件').setInputFiles({
    name: 'calibrated.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==', 'base64'),
  });
  await page.getByLabel('分辨率（米/像素）').fill('0');
  await page.getByRole('button', { name: '上传地图', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('分辨率必须是大于 0');
});
