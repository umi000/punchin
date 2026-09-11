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

function isWithinScheduledWindow(action) {
    const { hour, minute } = getPKTParts();
    const now = hour * 60 + minute;
    if (action === 'check-in') {
        return now >= (7 * 60 + 30) && now < (10 * 60);
    }
    return now >= (18 * 60) && now < (20 * 60 + 30);
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
        args: useHeadless ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto('https://portal.skilledim.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);

        const emailField = page.locator('input[name="email"], input[type="email"], input[autocomplete="username"], input[id*="email"]').first();
        const passwordField = page.locator('input[name="password"], input[type="password"]').first();
        const submitButton = page.locator('button[type="submit"], button:has-text("Sign In")').first();

        if (await emailField.count()) {
            await emailField.fill(CONFIG.email);
        }

        if (await passwordField.count()) {
            await passwordField.fill(CONFIG.password);
        }

        console.log('📱 Attempting Sign In through the portal UI...');

        try {
            await submitButton.click({ timeout: 20000, force: true });
        } catch (clickError) {
            console.log('⚠️ Regular click blocked; falling back to force submit.');
            await submitButton.dispatchEvent('click');
        }

        await page.waitForTimeout(5000);
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
    const selectors = [
        `button:has-text("${action === 'check-in' ? 'Check In' : 'Check Out'}")`,
        `button:has-text("${action === 'check-in' ? 'Check-In' : 'Check-Out'}")`,
        `button:has-text("${action === 'check-in' ? 'Check in' : 'Check out'}")`,
        `button:has-text("${action === 'check-in' ? 'Sign In' : 'Sign Out'}")`,
        `button:has-text("${action === 'check-in' ? 'Logout' : 'Logout'}")`,
        'button[type="button"]',
        'button'
    ];

    let clicked = false;

    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        const count = await locator.count();
        if (!count) continue;

        try {
            const isVisible = await locator.isVisible();
            if (!isVisible) continue;

            console.log(`🎯 Clicking portal action using selector: ${selector}`);
            await locator.click({ force: true, timeout: 15000 });
            clicked = true;
            break;
        } catch (error) {
            console.log(`⚠️ Selector ${selector} did not work: ${error.message}`);
        }
    }

    await page.waitForTimeout(5000);
    await browser.close();

    if (!clicked) {
        throw new Error(`Could not find or click the ${action} button in the portal UI.`);
    }

    console.log(`✅ Portal ${action} action was triggered successfully.`);
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

    const isScheduled = process.env.GITHUB_EVENT_NAME === 'schedule';
    if (isScheduled && !isWithinScheduledWindow(action)) {
        const { hour, minute } = getPKTParts();
        const window = action === 'check-in' ? '07:30–10:00' : '18:00–20:30';
        console.log(`ℹ️  ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} PKT is outside ${window} PKT. Skipping scheduled ${action}.`);
        process.exit(0);
    }

    (async () => {
        try {
            if (action === 'check-in' || action === 'check-out') {
                await waitRandomTime(0, 5);
            }

            if (isScheduled && !isWithinScheduledWindow(action)) {
                console.log('ℹ️  Random wait pushed this run outside the PKT window. Skipping.');
                process.exit(0);
            }

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