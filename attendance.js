const axios = require('axios');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

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

// Common headers matching updated cURL request
const getHeaders = (token = null) => {
    const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'en-PK,en-US;q=0.9,en;q=0.8,ur;q=0.7',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'DNT': '1',
        'Origin': 'https://portal.skilledim.com',
        'Priority': 'u=1, i',
        'Referer': 'https://portal.skilledim.com/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        // 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
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
        <div class="section-title">API response / payload</div>
        <pre>${escapedJson}</pre>
      </div>
    </div>
    <div class="footer">
      Sent by SkilledIM attendance automation (${CONFIG.baseUrl})
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

async function getAuthToken() {
    try {
        console.log('🔐 Attempting to login...');
        const response = await axios.post(
            `${CONFIG.baseUrl}/api/auth/signin`,
            {
                email: CONFIG.email,
                password: CONFIG.password
            },
            {
                headers: getHeaders(),
                timeout: 10000
            }
        );

        const token = response.data?.token || 
                     response.data?.accessToken || 
                     response.data?.data?.token ||
                     response.data?.data?.accessToken;

        if (token) {
            console.log('✅ Login successful!');
            return token;
        } else {
            console.error('❌ Login response did not contain a token');
            console.error('Response structure:', JSON.stringify(response.data, null, 2));
            return null;
        }
    } catch (error) {
        console.error('❌ Login Failed:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('   No response received:', error.message);
        } else {
            console.error('   Error:', error.message);
        }
        return null;
    }
}

async function getCurrentAttendanceId(token) {
    try {
        console.log('📋 Fetching attendance status...');
        const response = await axios.get(
            `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/employee-self/${CONFIG.employeeId}/attendance/status`,
            {
                headers: getHeaders(token),
                timeout: 10000
            }
        );

        const attendanceId = response.data?.data?.id || 
                             response.data?.id || 
                             response.data?.attendanceId ||
                             response.data?.data?.attendanceId;

        if (attendanceId) {
            console.log(`✅ Found attendance ID: ${attendanceId}`);
            return attendanceId;
        }

        console.log('⚠️  No attendance ID found in status response');
        console.log('   Response:', JSON.stringify(response.data, null, 2));
        return null;
    } catch (error) {
        console.error('⚠️  Could not fetch attendance status:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('   Error:', error.message);
        }
        return null;
    }
}

async function markAttendance(type) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🕐 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
    console.log(`📝 Starting ${type.toUpperCase()} process...`);
    console.log('='.repeat(60));

    const token = await getAuthToken();
    if (!token) {
        console.error('❌ Cannot proceed without authentication token');
        process.exit(1);
    }

    let url;
    let attendanceId = null;

    if (type === 'check-in') {
        url = `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/attendance/employee/${CONFIG.employeeId}/check-in`;
    } else if (type === 'check-out') {
        attendanceId = await getCurrentAttendanceId(token);
        
        if (!attendanceId) {
            console.error('❌ Cannot check-out: No active attendance record found');
            console.error('   Make sure you have checked in first!');
            process.exit(1);
        }

        url = `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/attendance/employee/${CONFIG.employeeId}/attendance/${attendanceId}/check-out`;
    } else {
        console.error(`❌ Invalid attendance type: ${type}`);
        console.error('   Use "check-in" or "check-out"');
        process.exit(1);
    }

    try {
        console.log(`📤 Sending ${type} request...`);
        
        const requestBody = type === 'check-in' 
            ? {
                date: getPKTDateString(),
                location: CONFIG.location,
                medium: CONFIG.medium,
                ip: null
            }
            : {
                location: {
                    latitude: CONFIG.location.latitude,
                    longitude: CONFIG.location.longitude,
                    accuracyMeters: CONFIG.location.accuracyMeters
                },
                medium: CONFIG.medium,
                ip: null
            };
        
        const response = await axios.post(
            url,
            requestBody,
            {
                headers: getHeaders(token),
                timeout: 10000
            }
        );

        console.log(`✅ Successfully ${type === 'check-in' ? 'Checked In' : 'Checked Out'}!`);
        console.log('📄 Response:', JSON.stringify(response.data, null, 2));
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: type,
            status: 'success',
            response: response.data
        };
        logToFile(logEntry);

        await sendNotificationEmail(type, true, response.data);

        return true;
    } catch (error) {
        console.error(`❌ ${type} Request Failed:`);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('   No response received:', error.message);
        } else {
            console.error('   Error:', error.message);
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            type: type,
            status: 'error',
            error: error.response?.data || error.message
        };
        logToFile(logEntry);

        const errorPayload = error.response?.data || { message: error.message, status: error.response?.status };
        await sendNotificationEmail(type, false, errorPayload);

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