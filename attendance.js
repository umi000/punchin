const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if today is a weekday (Monday-Friday)
 * @returns {boolean}
 */
function isWeekday() {
    const day = new Date().getDay();
    return day >= 1 && day <= 5; // Monday = 1, Friday = 5
}

/**
 * Wait for a random time within the specified window
 * @param {number} minMinutes - Minimum minutes to wait
 * @param {number} maxMinutes - Maximum minutes to wait
 */
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
    email: process.env.ATTENDANCE_EMAIL,
    password: process.env.ATTENDANCE_PASSWORD,
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

// Common headers for API requests
const getHeaders = (token = null) => {
    const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'en-PK,en-US;q=0.9,en;q=0.8,ur;q=0.7',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'DNT': '1',
        'Origin': 'https://portal.skilledim.com',
        'Referer': 'https://portal.skilledim.com/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
};

/**
 * Authenticate and get access token
 * @returns {Promise<string|null>} Access token or null if failed
 */
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
                timeout: 10000 // 10 second timeout
            }
        );

        // Try different possible token locations in response
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

/**
 * Get current attendance ID from status API for check-out
 * @param {string} token - Authentication token
 * @returns {Promise<number|null>} Attendance ID or null
 */
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

        // Extract attendance ID from response
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

/**
 * Mark attendance (check-in or check-out)
 * @param {string} type - 'check-in' or 'check-out'
 */
async function markAttendance(type) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🕐 ${new Date().toLocaleString()}`);
    console.log(`📝 Starting ${type.toUpperCase()} process...`);
    console.log('='.repeat(60));

    // Get authentication token
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
        // For check-out, get attendance ID from status API
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
        const response = await axios.post(
            url,
            {
                location: CONFIG.location,
                medium: CONFIG.medium
            },
            {
                headers: getHeaders(token),
                timeout: 10000
            }
        );

        console.log(`✅ Successfully ${type === 'check-in' ? 'Checked In' : 'Checked Out'}!`);
        console.log('📄 Response:', JSON.stringify(response.data, null, 2));
        
        // Log to file for record keeping
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: type,
            status: 'success',
            response: response.data
        };
        logToFile(logEntry);

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

        // Log error to file
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: type,
            status: 'error',
            error: error.response?.data || error.message
        };
        logToFile(logEntry);

        process.exit(1);
    }
}

/**
 * Log attendance attempts to a file
 * @param {Object} entry - Log entry object
 */
function logToFile(entry) {
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `attendance-${new Date().toISOString().split('T')[0]}.json`);
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
    // Check if it's a weekday
    if (!isWeekday()) {
        console.log('ℹ️  Today is not a weekday (Monday-Friday). Skipping attendance.');
        process.exit(0);
    }

    // Wait for random time within the window
    (async () => {
        try {
            if (action === 'check-in') {
                // Random delay between 0-14 minutes (09:00 AM to 09:14 AM window)
                await waitRandomTime(0, 14);
            } else if (action === 'check-out') {
                // Random delay between 0-15 minutes (06:45 PM to 07:00 PM window)
                await waitRandomTime(0, 15);
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
    console.log('\nExamples:');
    console.log('  node attendance.js check-in   # Mark attendance for the day');
    console.log('  node attendance.js check-out  # Mark check-out for the day');
    process.exit(1);
}

