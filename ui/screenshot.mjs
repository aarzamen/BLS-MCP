import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

// 1. Load mock test page
await page.goto('http://localhost:8080/mock-test.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000); // wait for dashboard demo to init

// Screenshot: initial state
await page.screenshot({ path: '/home/user/BLS-MCP/ui/screenshot-1-initial.png', fullPage: false });
console.log('Screenshot 1: Initial state captured');

// 2. Click "Run Full Scenario" button
await page.click('#run-btn');
console.log('Clicked Run Full Scenario');

// Wait for all 15 steps to complete (at default 1.2s speed + buffer)
await page.waitForTimeout(22000);

// Screenshot: completed test
await page.screenshot({ path: '/home/user/BLS-MCP/ui/screenshot-2-complete.png', fullPage: false });
console.log('Screenshot 2: Completed test captured');

// 3. Also screenshot the dashboard iframe alone for detail
const iframe = page.frameLocator('#dash');
const dashFrame = page.frames().find(f => f.url().includes('dashboard.html'));
if (dashFrame) {
  // Take screenshot of the full page showing final ROSC state
  await page.screenshot({ path: '/home/user/BLS-MCP/ui/screenshot-3-dashboard-final.png', fullPage: false });
  console.log('Screenshot 3: Dashboard final state captured');
}

await browser.close();
console.log('Done!');
