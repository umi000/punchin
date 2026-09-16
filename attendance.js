const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { chromium } = require('playwright');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get YYYY-MM-DD formatted specifically for PKT
 */
function getPKTDateString() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

/**
 * Current hour/minute/weekday in Pakistan Standard Time
 */
function getPKTParts() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return {
        weekday: map.weekday,
        hour: Number(map.hour),
        minute: Number(map.minute)
    };
}

function isWeekday() {
    const { weekday } = getPKTParts();
    return !['Sat', 'Sun'].includes(weekday);
}

async function waitRandomTime(minMinutes, maxMinutes) {
    const minMs = minMinutes * 60 * 1000;
    const maxMs = maxMinutes * 60 * 1000;
    const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    const waitMinutes = Math.round(randomMs / 60000);
    
    console.log(`⏳ Waiting ${waitMinutes} minutes before ${process.argv[2]}...`);
    await sleep(randomMs);
    console.log(`✅ Wait complete! Proceeding with ${process.argv[2]}...`);
}

// Configuration
const CONFIG = {
    email: process.env.ATTENDANCE_EMAIL || 'uaslam@innovatixinc.com',
    password: process.env.ATTENDANCE_PASSWORD || 'Hasnain@123',
    organizationId: 2,
    employeeId: 441,
    baseUrl: "https://api.skilledim.com",
    location: {
        latitude: 28.0009,
        longitude: 69.3169,
        accuracyMeters: 76431,
        address: null
    },
    medium: "WEBSITE"
};

const GMAIL = {
    from: 'uaslam1004@gmail.com',
    to: ['junaidaslam.muet@gmail.com', 'uaslam1000@gmail.com'],
    appPassword: process.env.APP_PASS || process.env.GMAIL_APP_PASSWORD
};

function buildNotificationEmailBody(type, success, data) {
    const actionLabel = type === 'check-in' ? 'Check-in' : 'Check-out';
    const statusLabel = success ? 'Success' : 'Failed';
    const statusColor = success ? '#198754' : '#dc3545';
    const timestamp = new Date().toLocaleString('en-PK', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: 'Asia/Karachi'
    });
    const jsonPretty = typeof data === 'object'
        ? JSON.stringify(data, null, 2)
        : String(data);
    const escapedJson = jsonPretty
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 24px; background: #f5f5f5; }
    .container { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
    .header { padding: 20px 24px; background: #1a1a2e; color: #fff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .header .meta { margin-top: 8px; font-size: 13px; opacity: 0.9; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .content { padding: 24px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 8px; font-weight: 600; }
    pre { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 16px; font-size: 12px; overflow-x: auto; margin: 0; }
    .footer { padding: 16px 24px; background: #f8f9fa; font-size: 12px; color: #6c757d; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Attendance ${actionLabel} – ${statusLabel}</h1>
      <div class="meta">
        <span class="badge" style="background: ${statusColor}; color: #fff;">${statusLabel}</span>
        &nbsp; ${timestamp}
      </div>
    </div>
    <div class="content">
      <div class="section">
        <div class="section-title">Portal action result</div>
        <pre>${escapedJson}</pre>
      </div>
    </div>
    <div class="footer">
      Sent by SkilledIM attendance automation
    </div>
  </div>
</body>
</html>`;
}

async function sendNotificationEmail(type, success, data) {
    if (!GMAIL.appPassword) {
        console.warn('⚠️  APP_PASS / GMAIL_APP_PASSWORD not set – skipping email notification');
        return;
    }

    const actionLabel = type === 'check-in' ? 'Check-in' : 'Check-out';
    const statusLabel = success ? 'Success' : 'Failed';
    const subject = `[Attendance] ${actionLabel} – ${statusLabel} – ${getPKTDateString()}`;

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: GMAIL.from,
            pass: GMAIL.appPassword
        }
    });

    try {
        await transporter.sendMail({
            from: `"Attendance Bot" <${GMAIL.from}>`,
            to: GMAIL.to.join(', '),
            subject,
            html: buildNotificationEmailBody(type, success, data),
            text: `Attendance ${actionLabel}: ${statusLabel}\n\nResponse:\n${JSON.stringify(data, null, 2)}`
        });
        console.log('📧 Notification email sent to', GMAIL.to.join(', '));
    } catch (err) {
        console.error('⚠️  Failed to send notification email:', err.message);
    }
}

function extractTokenFromStorageSnapshot(snapshot) {
    const flattened = [];

    for (const value of Object.values(snapshot || {})) {
        if (typeof value === 'string') {
            flattened.push(value);
        }
    }

    const allText = flattened.join(' ');
    const jwtMatch = allText.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
    if (jwtMatch && jwtMatch[0]) {
        return jwtMatch[0];
    }

    const tokenMatch = allText.match(/(?:token|accessToken|authToken|jwt)["':= ]+([A-Za-z0-9._-]+)/i);
    if (tokenMatch && tokenMatch[1]) {
        return tokenMatch[1];
    }

    return null;
}

async function loginWithPlaywright() {
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';
    const useHeadless = isGitHubActions || process.env.PLAYWRIGHT_HEADLESS === 'true';

    console.log(`🧭 Launching Playwright UI to sign in through the portal... (headless=${useHeadless})`);

    const browser = await chromium.launch({
        headless: useHeadless,
        channel: 'chrome',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=AutomationControlled',
            ...(useHeadless ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'Asia/Karachi'
    });

    await context.addInitScript(() => {
        Object.defineProperty(window.navigator, 'webdriver', {
            get: () => false,
            configurable: true
        });
    });

    const page = await context.newPage();

    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', error => console.log('[PAGE ERROR]', error.message));
    page.on('request', req => {
        const url = req.url();
        if (url.includes('portal.skilledim.com') || url.includes('skilledim.com') || url.includes('api.')) {
            console.log('[REQUEST]', req.method(), url);
        }
    });
    page.on('response', async res => {
        const url = res.url();
        if (url.includes('portal.skilledim.com') || url.includes('skilledim.com') || url.includes('api.')) {
            console.log('[RESPONSE]', res.status(), res.request().method(), url);
            try {
                const text = await res.text();
                if (text && text.length < 1200) {
                    console.log('   BODY PREVIEW:', text.replace(/\s+/g, ' ').slice(0, 300));
                }
            } catch (e) {
                // ignore
            }
        }
    });
    page.on('requestfailed', req => console.log('[REQUEST FAILED]', req.method(), req.url(), req.failure()?.errorText || 'unknown'));

    try {
        await context.grantPermissions(['geolocation'], { origin: 'https://portal.skilledim.com' }).catch(() => {});
        await context.setGeolocation({
            latitude: CONFIG.location.latitude,
            longitude: CONFIG.location.longitude,
            accuracy: CONFIG.location.accuracyMeters
        }).catch(() => {});

        await page.goto('https://portal.skilledim.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);

        const emailField = page.locator('input[name="email"], input[type="email"], input[autocomplete="username"], input[id="email"]').first();
        const passwordField = page.locator('input[name="password"], input[type="password"], input[id="password"]').first();
        const submitButtonSelector = 'button[type="submit"]:has-text("Sign In")';
        const submitButton = page.getByRole('button', { name: /^Sign In$/i })
            .or(page.locator(submitButtonSelector))
            .first();
        const loginForm = page.locator('form').filter({ has: emailField }).first();

        if (await emailField.count()) {
            await emailField.fill(CONFIG.email);
        }

        if (await passwordField.count()) {
            await passwordField.fill(CONFIG.password);
        }

        console.log('📱 Attempting Sign In through the portal UI...');
        console.log(`🔎 Sign-in candidate selector: ${submitButtonSelector}`);
        console.log(`🧭 Sign-in button matches found: ${await submitButton.count()}`);
        console.log(`🧭 Login form matches found: ${await loginForm.count()}`);

        try {
            if (await loginForm.count()) {
                console.log('🧿 Triggering actual form submit via requestSubmit().');
                await loginForm.evaluate((form) => form.requestSubmit());
            }

            if (await submitButton.count()) {
                console.log('🖱️ Fallback: clicking the submit button directly.');
                await submitButton.click({ timeout: 20000, force: true });
            }
        } catch (clickError) {
            console.log('⚠️ Form submission failed; retrying with force click.');
            if (await submitButton.count()) {
                await submitButton.click({ timeout: 20000, force: true });
            }
            console.log('🖱️ Force-clicked the Sign In button.');
            await submitButton.dispatchEvent('click');
            console.log('🖱️ Dispatched click event on the Sign In button.');
        }

        await page.waitForTimeout(8000);
        console.log('[FINAL URL AFTER SIGN-IN CLICK]', page.url());

        const authState = await page.evaluate(() => ({
            url: window.location.href,
            hasLocalStorage: !!window.localStorage,
            localKeys: Object.keys(window.localStorage || {}),
            sessionKeys: Object.keys(window.sessionStorage || {}),
            cookies: document.cookie || ''
        }));
        console.log('[AUTH STATE]', JSON.stringify(authState, null, 2));

        await page.waitForURL(/\/self-service|\/dashboard|\/home/i, { timeout: 120000 }).catch(() => {});

        const snapshot = await page.evaluate(() => {
            const values = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const val = key ? localStorage.getItem(key) : null;
                if (val) values.push(val);
            }
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const val = key ? sessionStorage.getItem(key) : null;
                if (val) values.push(val);
            }
            return {
                storage: values.join(' '),
                cookies: document.cookie || ''
            };
        });

        const token = extractTokenFromStorageSnapshot(snapshot);
        const cookies = await context.cookies();
        const cookieHeader = cookies
            .filter((cookie) => cookie.name && cookie.value)
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join('; ');

        console.log('[AUTH TOKEN FOUND]', !!token);
        console.log('[AUTH COOKIE HEADER FOUND]', !!cookieHeader);

        if (token || cookieHeader) {
            console.log('✅ Playwright login succeeded and session data was captured.');
            return { page, context, browser, token, cookieHeader };
        }

        console.error('❌ Playwright opened, but no auth token or session cookie was detected after sign-in.');
        await browser.close();
        return null;
    } catch (error) {
        console.error('❌ Playwright login failed:', error.message);
        await browser.close();
        return null;
    }
}

async function performPortalAction(action) {
    const auth = await loginWithPlaywright();
    if (!auth || !auth.page) {
        throw new Error('Portal login failed before action could be performed.');
    }

    const { page, browser } = auth;
    const actionLabel = action === 'check-in' ? 'Check In' : 'Check Out';
    const actionAliases = action === 'check-in'
        ? ['Check In', 'Check-In', 'check in', 'Check in', 'Punch In', 'Punch-In', 'Clock In', 'Clock-In', 'Start Shift']
        : ['Check Out', 'Check-Out', 'check out', 'Check out', 'Punch Out', 'Punch-Out', 'Clock Out', 'Clock-Out', 'End Shift'];
    const nextStateLabel = action === 'check-in' ? 'Check Out' : 'Check In';
    const selectors = [
        ...actionAliases.map((alias) => `button:has-text("${alias}")`),
        ...actionAliases.map((alias) => `button:has-text("${alias.toLowerCase()}")`),
        action === 'check-in' ? 'button.btn-success' : 'button.btn-warning',
        'button[type="button"]',
        'button'
    ];

    const visibleButtons = await page.locator('button, [role="button"]').evaluateAll((buttons) =>
        buttons
            .map((button) => (button.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
    );
    console.log('📋 Buttons currently visible on page:', visibleButtons);

    let clicked = false;
    console.log(`🧭 Looking for ${action} button using ${selectors.length} selector candidates...`);

    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        const count = await locator.count();
        if (!count) {
            console.log(`🔎 No matches for selector: ${selector}`);
            continue;
        }

        console.log(`🔎 Selector ${selector} matched ${count} button(s)`);

        try {
            const isVisible = await locator.isVisible();
            if (!isVisible) {
                console.log(`⚠️ Selector ${selector} matched but is not visible.`);
                continue;
            }

            console.log(`🎯 Clicking portal action using selector: ${selector}`);
            await locator.click({ force: true, timeout: 15000 });
            console.log(`✅ Successfully clicked via selector: ${selector}`);
            clicked = true;
            break;
        } catch (error) {
            console.log(`⚠️ Selector ${selector} did not work: ${error.message}`);
        }
    }

    if (!clicked) {
        await browser.close();
        throw new Error(`Could not find or click the ${action} button in the portal UI.`);
    }

    const waitForStateText = async () => {
        try {
            await page.waitForFunction((expectedText) => {
                const buttonText = Array.from(document.querySelectorAll('button'))
                    .map((btn) => (btn.textContent || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                return buttonText.some((text) => text.toLowerCase().includes(expectedText.toLowerCase()));
            }, nextStateLabel, { timeout: 120000 });
            console.log(`✅ Button text changed to '${nextStateLabel}' as expected.`);
            return true;
        } catch (error) {
            console.log(`⚠️ Timed out waiting for button text to change to '${nextStateLabel}'.`);
            return false;
        }
    };

    const result = await waitForStateText();
    await page.waitForTimeout(2000);
    await browser.close();

    if (!result) {
        throw new Error(`Attendance ${action} was clicked, but the button never changed to '${nextStateLabel}'.`);
    }

    console.log(`✅ Portal ${action} action was triggered successfully and the UI changed to ${nextStateLabel}.`);
    return true;
}

async function markAttendance(type) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🕐 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
    console.log(`📝 Starting ${type.toUpperCase()} process...`);
    console.log('='.repeat(60));

    try {
        await performPortalAction(type);
        console.log(`✅ ${type === 'check-in' ? 'Check-in' : 'Check-out'} action completed in the portal UI.`);

        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            status: 'success',
            response: { source: 'portal_ui_action', action: type }
        };
        logToFile(logEntry);

        return true;
    } catch (error) {
        console.error(`❌ Portal ${type} action failed:`, error.message);

        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            status: 'error',
            error: error.message
        };
        logToFile(logEntry);

        await sendNotificationEmail(type, false, { message: error.message, source: 'portal_ui_action' });
        process.exit(1);
    }
}

function logToFile(entry) {
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `attendance-${getPKTDateString()}.json`);
    let logs = [];

    if (fs.existsSync(logFile)) {
        try {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        } catch (e) {
            logs = [];
        }
    }
    logs.push(entry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

// Main execution
const action = process.argv[2];

if (action === 'check-in' || action === 'check-out') {
    if (!isWeekday()) {
        console.log('ℹ️  Today is not a weekday (Monday-Friday). Skipping attendance.');
        process.exit(0);
    }

    (async () => {
        try {
            await markAttendance(action);
            console.log('\n✅ Process completed successfully!');
            process.exit(0);
        } catch (error) {
            console.error('\n❌ Process failed:', error.message);
            process.exit(1);
        }
    })();
} else {
    console.log('Usage: node attendance.js [check-in|check-out]');
    process.exit(1);
}
