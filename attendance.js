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
    email: process.env.ATTENDANCE_EMAIL || "uaslam@innovatixinc.com",
    password: process.env.ATTENDANCE_PASSWORD || "Hasnain@123",
    organizationId: 2,
    employeeId: 441,
    baseUrl: "https://api.skilledim.com",
    location: {
        latitude: 28.0009,
        longitude: 69.3169,
        accuracyMeters: 76431,
        address: null
    },
    medium: "WEBSITE",
    // Allow manual override of attendance ID via environment variable
    manualAttendanceId: process.env.ATTENDANCE_ID ? Number.parseInt(process.env.ATTENDANCE_ID, 10) : null
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
 * Get current attendance record to find attendance ID for check-out
 * @param {string} token - Authentication token
 * @returns {Promise<number|null>} Attendance ID or null
 */
async function getCurrentAttendanceId(token) {
    try {
        console.log('📋 Fetching current attendance record...');
        
        // Try multiple possible endpoints with different query parameters
        const today = new Date().toISOString().split('T')[0];
        const endpoints = [
            // Base endpoint - might return all records or today's record
            `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/attendance/employee/${CONFIG.employeeId}`,
            // With date query parameter
            `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/attendance/employee/${CONFIG.employeeId}?date=${today}`,
            // With today query parameter
            `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/attendance/employee/${CONFIG.employeeId}?today=true`,
            // Specific today endpoint
            `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/attendance/employee/${CONFIG.employeeId}/today`,
            // Current/active endpoint
            `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/attendance/employee/${CONFIG.employeeId}/current`,
            // With limit to get recent records
            `${CONFIG.baseUrl}/api/organizations/${CONFIG.organizationId}/attendance/employee/${CONFIG.employeeId}?limit=10&sort=desc`
        ];

        let response = null;
        let lastError = null;

        // Try each endpoint until one works
        for (const endpoint of endpoints) {
            try {
                console.log(`   Trying endpoint: ${endpoint}`);
                response = await axios.get(endpoint, {
                    headers: getHeaders(token),
                    timeout: 10000,
                    validateStatus: function (status) {
                        // Don't throw for any status, we'll check it manually
                        return status < 600;
                    }
                });
                
                // Check if response indicates an error
                if (response.status >= 400 || response.data?.success === false || response.data?.status >= 400) {
                    console.log(`   ⚠️  Endpoint returned error: ${response.status} - ${response.data?.message || 'Unknown error'}`);
                    lastError = { response: { status: response.status, data: response.data } };
                    response = null;
                    continue;
                }
                
                console.log(`   ✅ Successfully fetched from endpoint`);
                break;
            } catch (err) {
                lastError = err;
                console.log(`   ⚠️  Endpoint failed: ${err.response?.status || err.message}`);
                response = null;
                continue;
            }
        }

        if (!response) {
            console.error('⚠️  All endpoints failed. Last error:', lastError?.response?.data?.message || lastError?.message);
            return null;
        }

        // Log the full response structure for debugging
        console.log('📄 API Response structure:', JSON.stringify(response.data, null, 2));

        // Try to find today's check-in record
        const todayLocal = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
        
        // Handle different response structures
        let attendance = response.data?.data || response.data?.attendance || response.data;
        
        // If it's an array, find today's record
        if (Array.isArray(attendance)) {
            console.log(`   Found ${attendance.length} attendance records`);
            
            // Try multiple strategies to find today's record
            const todayRecord = attendance.find(record => {
                if (!record) return false;
                
                // Strategy 1: Check if checkOutTime is null/undefined and date matches
                const recordDate = record.checkInTime 
                    ? new Date(record.checkInTime).toISOString().split('T')[0]
                    : record.createdAt 
                    ? new Date(record.createdAt).toISOString().split('T')[0]
                    : null;
                
                const isToday = recordDate === today || recordDate === todayLocal;
                const notCheckedOut = !record.checkOutTime || record.checkOutTime === null;
                
                console.log(`   Record ID ${record.id}: date=${recordDate}, today=${today}, checkedOut=${!!record.checkOutTime}`);
                
                return isToday && notCheckedOut;
            });
            
            if (todayRecord) {
                console.log(`✅ Found today's attendance record (ID: ${todayRecord.id})`);
                return todayRecord.id;
            }
            
            // Strategy 2: If no exact match, get the most recent record without check-out
            const recentRecord = attendance
                .filter(record => !record.checkOutTime || record.checkOutTime === null)
                .sort((a, b) => {
                    const dateA = new Date(a.checkInTime || a.createdAt || 0);
                    const dateB = new Date(b.checkInTime || b.createdAt || 0);
                    return dateB - dateA;
                })[0];
            
            if (recentRecord) {
                const recordDate = recentRecord.checkInTime 
                    ? new Date(recentRecord.checkInTime).toISOString().split('T')[0]
                    : recentRecord.createdAt 
                    ? new Date(recentRecord.createdAt).toISOString().split('T')[0]
                    : null;
                
                console.log(`⚠️  Using most recent unchecked-out record (ID: ${recentRecord.id}, Date: ${recordDate})`);
                return recentRecord.id;
            }
        } 
        // If it's a single object
        else if (attendance && typeof attendance === 'object') {
            // Check if it has an ID and is today's record
            if (attendance.id) {
                const recordDate = attendance.checkInTime 
                    ? new Date(attendance.checkInTime).toISOString().split('T')[0]
                    : attendance.createdAt 
                    ? new Date(attendance.createdAt).toISOString().split('T')[0]
                    : null;
                
                const isToday = recordDate === today || recordDate === todayLocal;
                const notCheckedOut = !attendance.checkOutTime || attendance.checkOutTime === null;
                
                if (isToday && notCheckedOut) {
                    console.log(`✅ Found today's attendance record (ID: ${attendance.id})`);
                    return attendance.id;
                } else if (notCheckedOut) {
                    console.log(`⚠️  Found unchecked-out record (ID: ${attendance.id}, Date: ${recordDate})`);
                    return attendance.id;
                }
            }
        }

        console.log('⚠️  No active attendance record found for today');
        console.log('   Full response data:', JSON.stringify(response.data, null, 2));
        return null;
    } catch (error) {
        console.error('⚠️  Could not fetch attendance record:');
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
        // For check-out, we need the attendance ID from today's check-in
        // Priority order:
        // 1. Manual override via environment variable
        // 2. Stored file from check-in
        // 3. API query (if endpoint works)
        
        if (CONFIG.manualAttendanceId) {
            attendanceId = CONFIG.manualAttendanceId;
            console.log(`🔧 Using manually specified attendance ID: ${attendanceId}`);
        } else {
            // First, try to get it from stored file (faster and more reliable)
            attendanceId = getStoredAttendanceId();
            
            // If not found in file, try to fetch from API
            if (!attendanceId) {
                console.log('📡 Stored attendance ID not found, querying API...');
                attendanceId = await getCurrentAttendanceId(token);
            }
        }
        
        if (!attendanceId) {
            console.error('❌ Cannot check-out: No active attendance record found for today');
            console.error('   Options to fix this:');
            console.error('   1. Run check-in first to store the attendance ID');
            console.error('   2. Set ATTENDANCE_ID environment variable: ATTENDANCE_ID=1104 npm run check-out');
            console.error('   3. Manually create data/attendance-YYYY-MM-DD.json with: {"date":"YYYY-MM-DD","attendanceId":1104}');
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
        
        // If check-in was successful, extract and store the attendance ID
        if (type === 'check-in') {
            const responseData = response.data?.data || response.data;
            
            // Try multiple possible locations for the attendance ID
            const newAttendanceId = responseData?.id || 
                                   responseData?.attendanceId || 
                                   responseData?.attendance?.id ||
                                   responseData?.attendanceId ||
                                   response.data?.id ||
                                   response.data?.attendanceId;
            
            if (newAttendanceId) {
                storeAttendanceId(newAttendanceId);
                console.log(`💾 Stored attendance ID: ${newAttendanceId} for check-out`);
            } else {
                console.log('⚠️  Could not extract attendance ID from check-in response');
                console.log('   Response structure:', JSON.stringify(response.data, null, 2));
                console.log('   You may need to manually check-out if the API query fails');
                console.log('   Or manually create data/attendance-YYYY-MM-DD.json with the attendance ID');
            }
        }
        
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
 * Store attendance ID for today's check-in
 * @param {number} attendanceId - The attendance ID to store
 */
function storeAttendanceId(attendanceId) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const dataFile = path.join(dataDir, `attendance-${today}.json`);
    
    const data = {
        date: today,
        attendanceId: attendanceId,
        checkInTime: new Date().toISOString()
    };
    
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    console.log(`💾 Stored attendance ID ${attendanceId} for today`);
}

/**
 * Retrieve stored attendance ID for today
 * @returns {number|null} Attendance ID or null if not found
 */
function getStoredAttendanceId() {
    const today = new Date().toISOString().split('T')[0];
    const dataFile = path.join(__dirname, 'data', `attendance-${today}.json`);
    
    if (fs.existsSync(dataFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
            if (data.attendanceId && data.date === today) {
                console.log(`📂 Found stored attendance ID: ${data.attendanceId}`);
                return data.attendanceId;
            }
        } catch (e) {
            console.log(`⚠️  Could not read stored attendance ID: ${e.message}`);
        }
    }
    
    return null;
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

