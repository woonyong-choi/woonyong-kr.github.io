import { expect, test } from '@playwright/test';
// browser-pages.json 은 /wiki/ permalink 만 담는 계약이므로(select-ci-verification)
// 프로젝트 경로는 여기에 둔다. generated/projects/** 변경은 경로 규칙상 이미
// CI 전체 검증을 강제한다.
const index = '/projects/';
const detail = '/projects/lrn-malloc/';

test('@core 상단 탭이 위키와 프로젝트를 오간다', async ({ page }) => {
  await page.goto('/wiki/home/');
  const tabs = page.locator('.main-header .wn-site-tabs');
  await expect(tabs.locator('.wn-site-tab')).toHaveCount(2);
  await expect(tabs.locator('.wn-site-tab--current')).toHaveText('위키');
  // articles_enabled 가 false 이면 아티클 탭은 렌더하지 않는다.
  await expect(tabs.getByText('아티클')).toHaveCount(0);

  await tabs.getByRole('link', { name: '프로젝트' }).click();
  await expect(page).toHaveURL(new RegExp(`${index}$`, 'u'));
  await expect(page.locator('.main-header .wn-site-tabs .wn-site-tab--current')).toHaveText('프로젝트');
});

test('@core 프로젝트 목록이 카드 그리드를 보여준다', async ({ page }) => {
  await page.goto(index);
  const cards = page.locator('.wn-project-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(10);
  const first = cards.first();
  await expect(first.locator('.wn-project-card__title a')).toBeVisible();
  await expect(first.locator('.wn-status')).toBeVisible();
  await expect(first.locator('.wn-project-card__meta')).toContainText('~');
  // 프로젝트는 위키 트리에 섞이지 않는다.
  await expect(page.locator('.side-bar')).toHaveCount(0);
});

test('@core 프로젝트 페이지가 얇은 헤더와 README 본문을 함께 보여준다', async ({ page }) => {
  await page.goto(detail);
  const header = page.locator('.wn-project-header');
  await expect(header.locator('.wn-status')).toBeVisible();
  await expect(header.locator('.wn-project-header__cell')).toHaveCount(3);
  await expect(header.locator('.wn-project-header__cell dd a')).toHaveCount(3);
  await expect(page.locator('.side-bar')).toHaveCount(0);

  // 헤더의 개념 링크는 실제 위키 문서로 내려간다.
  const concept = header.locator('.wn-project-header__cell dd a').first();
  await expect(concept).toHaveAttribute('href', /^\/wiki\/[a-z0-9-]+\/$/u);

  // 본문은 저장소 README 이고 코드 링크는 고정 커밋을 가리킨다.
  await expect(page.locator('#main-content h2').first()).toBeVisible();
  const pinned = page.locator('#main-content a[href*="/blob/"]').first();
  await expect(pinned).toHaveAttribute('href', /github\.com\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\//u);
});

test('JavaScript 가 없으면 카드가 전체 페이지로 이동한다', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(index);
  const title = page.locator('.wn-project-card__title a').first();
  const href = await title.getAttribute('href');
  await title.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`, 'u'));
  await expect(page.locator('.wn-project-header')).toBeVisible();
  await context.close();
});

test('카드를 눌러 전체 페이지로 이동한다', async ({ page }) => {
  await page.goto(index);
  const title = page.locator('.wn-project-card__title a').first();
  const href = await title.getAttribute('href');
  await title.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`, 'u'));
  await expect(page.locator('.wn-project-header')).toBeVisible();
});
