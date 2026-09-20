import { expect, test, type Page, type Route } from '@playwright/test';

const projectId = '11111111-1111-4111-8111-111111111111';
const mapId = '22222222-2222-4222-8222-222222222222';
const revisionId = '33333333-3333-4333-8333-333333333333';
const savedRevisionId = '44444444-4444-4444-8444-444444444444';
const editorPath = `/projects/${projectId}/maps/${mapId}/edit`;

const initialNetwork = {
  schema_version: 1 as const,
  coordinate_mode: 'legacy-normalized' as const,
  nodes: [
    { id: 'node-a', x: 20, y: 25, kind: 'waypoint' as const, label: '起点' },
    { id: 'node-b', x: 75, y: 70, kind: 'waypoint' as const, label: '终点' },
  ],
  edges: [
    { id: 'edge-a', from: 'node-a', to: 'node-b', direction: 'both' as const, max_speed_mps: null },
  ],
};

const initialRevision = revision(revisionId, 1, initialNetwork);

function revision(id: string, version: number, network: typeof initialNetwork) {
  return {
    id,
    map_id: mapId,
    version,
    schema_version: 1,
    content_type: 'application/vnd.roc.road-network+json;version=1',
    byte_size: JSON.stringify(network).length,
    sha256: `${version}`.repeat(64),
    created_by: null,
    created_by_username: 'e2e',
    created_at: `2026-09-20T0${version}:00:00Z`,
    network,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installFixtures(page: Page) {
  let savedNetwork: typeof initialNetwork | null = null;

  await page.addInitScript(() => {
    localStorage.setItem('roc_token', 'e2e-token');
    localStorage.setItem('roc_role', 'super_admin');
    localStorage.setItem('roc_username', 'e2e');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    // Source modules may contain an `/api/` path segment (for example
    // `src/shared/api/config.ts`). Only mock actual backend endpoints.
    if (!path.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (path === '/api/auth/me') {
      await json(route, { ok: true, user: { username: 'e2e', role: 'super_admin' } });
      return;
    }
    if (path === `/api/projects/${projectId}/maps/${mapId}`) {
      await json(route, {
        ok: true,
        map: {
          id: mapId,
          project_id: projectId,
          name: 'E2E 地图',
          image_url: `/api/projects/${projectId}/maps/${mapId}/image`,
          is_active: true,
          created_at: '2026-09-20T00:00:00Z',
          coordinate_origin_x: 0,
          coordinate_origin_y: 0,
          road_network: null,
          coordinate_mode: 'legacy-normalized',
          image_width: 1000,
          image_height: 600,
          resolution: null,
          origin_theta: 0,
        },
      });
      return;
    }
    if (path === `/api/projects/${projectId}/maps/${mapId}/image`) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==', 'base64'),
      });
      return;
    }
    if (path === `/api/projects/${projectId}/maps/${mapId}/road-network/revisions` && request.method() === 'GET') {
      const saved = savedNetwork ? revision(savedRevisionId, 2, savedNetwork) : null;
      await json(route, {
        ok: true,
        revisions: saved ? [saved, initialRevision] : [initialRevision],
        current_revision: saved ?? initialRevision,
      });
      return;
    }
    if (path === `/api/projects/${projectId}/maps/${mapId}/road-network/revisions` && request.method() === 'POST') {
      const payload = request.postDataJSON() as { network: typeof initialNetwork };
      savedNetwork = payload.network;
      await json(route, { ok: true, revision: revision(savedRevisionId, 2, savedNetwork) }, 201);
      return;
    }
    if (path.startsWith(`/api/projects/${projectId}/maps/${mapId}/road-network/revisions/`)) {
      const requestedId = path.split('/').at(-1);
      if (requestedId === savedRevisionId && savedNetwork) {
        await json(route, { ok: true, revision: revision(savedRevisionId, 2, savedNetwork) });
      } else {
        await json(route, { ok: true, revision: initialRevision });
      }
      return;
    }
    if (path === '/api/vehicles') {
      await json(route, { ok: true, vehicles: [] });
      return;
    }
    await json(route, { ok: false, message: `Unhandled E2E request: ${request.method()} ${path}` }, 404);
  });

  return { getSavedNetwork: () => savedNetwork };
}

async function openEditor(page: Page) {
  await page.goto(editorPath);
  await expect(page.getByRole('heading', { name: 'E2E 地图 · 路网编辑器' })).toBeVisible();
  await expect(page.locator('[data-node-id]')).toHaveCount(2);
  await expect(page.locator('[data-edge-id]')).toHaveCount(1);
}

test('画布支持添加、拖动、连边、删除、撤销重做、保存和历史加载', async ({ page }) => {
  const fixtures = await installFixtures(page);
  await openEditor(page);

  const canvas = page.getByLabel('E2E 地图 路网编辑画布');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  await page.getByRole('button', { name: '节点' }).click();
  await canvas.click({ position: { x: bounds.width * 0.38, y: bounds.height * 0.35 } });
  await canvas.click({ position: { x: bounds.width * 0.57, y: bounds.height * 0.6 } });
  await expect(page.locator('[data-node-id]')).toHaveCount(4);

  await page.getByRole('button', { name: '选择' }).click();
  const createdNodes = page.locator('[data-node-id]');
  await createdNodes.nth(2).locator('circle').click();
  const xBeforeDrag = Number(await page.getByLabel('X').inputValue());
  await createdNodes.nth(2).locator('circle').dragTo(canvas, { targetPosition: { x: bounds.width * 0.46, y: bounds.height * 0.42 } });
  const xAfterDrag = Number(await page.getByLabel('X').inputValue());
  expect(xAfterDrag).not.toBeCloseTo(xBeforeDrag);

  await page.getByRole('button', { name: '连边' }).click();
  await createdNodes.nth(2).locator('circle').click();
  await createdNodes.nth(3).locator('circle').click();
  await expect(page.locator('[data-edge-id]')).toHaveCount(2);

  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.locator('[data-edge-id]').nth(1).locator('line').nth(1).click();
  await expect(page.locator('[data-edge-id]')).toHaveCount(1);

  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('[data-edge-id]')).toHaveCount(2);
  await page.getByRole('button', { name: '重做' }).click();
  await expect(page.locator('[data-edge-id]')).toHaveCount(1);

  await page.getByRole('button', { name: '保存新版本' }).click();
  await expect(page.getByText('已保存为不可变版本 v2。')).toBeVisible();
  const saved = fixtures.getSavedNetwork();
  expect(saved?.nodes).toHaveLength(4);
  expect(saved?.nodes.every((node) => node.x >= 0 && node.x <= 100 && node.y >= 0 && node.y <= 100)).toBe(true);

  await page.reload();
  await expect(page.locator('[data-node-id]')).toHaveCount(4);
  await page.getByRole('button', { name: '加载此版本' }).nth(1).click();
  await expect(page.locator('[data-node-id]')).toHaveCount(2);
  await expect(page.getByText('已加载 v1；继续修改并保存会创建新版本。')).toBeVisible();
});

test('键盘操作覆盖工具切换、输入保护、删除、撤销重做与对话框焦点恢复', async ({ page }) => {
  await installFixtures(page);
  await openEditor(page);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '退出路网编辑器' })).toBeFocused();

  const connectButton = page.getByRole('button', { name: '连边' });
  await connectButton.focus();
  await page.keyboard.press('Space');
  await expect(connectButton).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-node-id]').first().locator('circle').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '选择' })).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-node-id]').first().locator('circle').click();
  const label = page.getByLabel('标签');
  await label.focus();
  await page.keyboard.press('Backspace');
  await expect(page.locator('[data-node-id]')).toHaveCount(2);

  await page.getByLabel('E2E 地图 路网编辑画布').click({ position: { x: 20, y: 20 } });
  await page.locator('[data-node-id]').last().locator('circle').click();
  await page.getByLabel('路网编辑工作区').focus();
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-node-id]')).toHaveCount(1);
  await page.getByLabel('路网编辑工作区').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-node-id]')).toHaveCount(2);
  await page.getByLabel('路网编辑工作区').focus();
  await page.keyboard.press('Control+y');
  await expect(page.locator('[data-node-id]')).toHaveCount(1);
  await page.getByLabel('路网编辑工作区').focus();
  await page.keyboard.press('Control+z');

  // Reload the immutable current revision so deployment is enabled after the
  // intentionally dirty label/delete shortcut checks above.
  await page.reload();
  await expect(page.locator('[data-node-id]')).toHaveCount(2);
  const deployButton = page.getByRole('button', { name: '下发 v1' });
  await deployButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '路网版本下发' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '路网版本下发' })).toBeHidden();
  await expect(deployButton).toBeFocused();
});
