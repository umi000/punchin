const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'Asia/Karachi'
  });

  await context.addInitScript(() => {
    Object.defineProperty(window, 'navigator', {
      value: Object.create(window.navigator, {
        webdriver: { value: undefined, configurable: true },
        languages: { value: ['en-US', 'en'], configurable: true },
        plugins: { value: [{ name: 'Chrome PDF Viewer', description: 'Portable Document Format' }], configurable: true },
        mimeTypes: { value: [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }], configurable: true }
      })
    });
  });

  const page = await context.newPage();

  page.on('console', msg => {
    console.log('[BROWSER CONSOLE]', msg.type(), msg.text());
  });

  page.on('pageerror', err => {
    console.log('[PAGE ERROR]', err.message);
  });

  page.on('request', request => {
    const url = request.url();
    if (/portal\.skilledim\.com|skilledim\.com|api\./i.test(url)) {
      console.log('[REQUEST]', request.method(), url);
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (/portal\.skilledim\.com|skilledim\.com|api\./i.test(url)) {
      console.log('[RESPONSE]', response.status(), response.request().method(), url);
      try {
        const text = await response.text();
        if (text) {
          const preview = text.replace(/\s+/g, ' ').slice(0, 800);
          console.log('   BODY PREVIEW:', preview);
        }
      } catch (e) {
        // ignore body read errors for non-text responses
      }
    }
  });

  page.on('requestfailed', request => {
    console.log('[REQUEST FAILED]', request.method(), request.url(), request.failure()?.errorText || 'unknown');
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log('[NAVIGATED]', frame.url());
    }
  });

  try {
    await page.goto('https://portal.skilledim.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[TITLE]', await page.title());
    console.log('[URL]', page.url());

    const navigatorInfo = await page.evaluate(() => ({
      webdriver: !!navigator.webdriver,
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      chrome: !!window.chrome
    }));
    console.log('[NAVIGATOR]', JSON.stringify(navigatorInfo, null, 2));

    await page.locator('input[name="email"]').fill('uaslam@innovatixinc.com');
    await page.locator('input[name="password"]').fill('Hasnain@123');

    const submit = page.locator('button[type="submit"], button:has-text("Sign In")').first();
    console.log('[SUBMIT COUNT]', await submit.count());
    if (await submit.count()) {
      console.log('[SUBMIT TEXT]', await submit.textContent());
      await submit.click({ timeout: 20000, force: true });
      console.log('[CLICKED SUBMIT]');
    }

    await page.waitForTimeout(15000);

    console.log('[FINAL URL]', page.url());
    console.log('[BODY TEXT]', (await page.locator('body').innerText()).slice(0, 4000));
    console.log('[HTML SNIP]', (await page.locator('body').innerHTML()).slice(0, 3000));
  } catch (err) {
    console.log('[FATAL]', err.message);
  }

  console.log('=== END DEBUG RUN ===');
  await page.waitForTimeout(30000);
  await browser.close();
})();
