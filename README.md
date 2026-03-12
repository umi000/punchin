# Attendance Automation

Automated attendance check-in and check-out system for SkilledIM portal.

## Features

- ✅ Automatic check-in between **09:00 AM - 09:14 AM** (random time)
- ✅ Automatic check-out between **06:45 PM - 07:00 PM** (random time)
- ✅ Runs only on weekdays (Monday-Friday)
- ✅ GitHub Actions pipeline integration
- ✅ Secure credential management via GitHub Secrets
- ✅ Gmail notifications: check-in/check-out API responses emailed to configured recipients

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure GitHub Secrets

Go to your repository settings → Secrets and variables → Actions, and add:

- `ATTENDANCE_EMAIL`: Your login email
- `ATTENDANCE_PASSWORD`: Your login password
- `APP_PASS`: (Optional) Gmail app password for `uaslam1004@gmail.com` to send notification emails. Create at [Google Account → Security → App passwords](https://myaccount.google.com/apppasswords) (requires 2-Step Verification). For local runs you can use `GMAIL_APP_PASSWORD` instead.

### 3. Timezone Configuration

The GitHub Actions workflows are configured for **UTC timezone**. If you're in a different timezone, adjust the cron schedules in:

- `.github/workflows/attendance-checkin.yml` (currently set to 04:00 UTC = 09:00 PKT)
- `.github/workflows/attendance-checkout.yml` (currently set to 13:45 UTC = 18:45 PKT)

**Timezone Conversion:**
- Pakistan Time (PKT) = UTC + 5
- To convert: `Local Time - 5 hours = UTC Time`

### 4. Manual Testing

You can test the script locally:

```bash
# Test check-in
npm run check-in

# Test check-out
npm run check-out
```

## How It Works

1. **Check-In Workflow**: Runs daily at 09:00 AM (local time), waits for a random delay (0-14 minutes), then performs check-in
2. **Check-Out Workflow**: Runs daily at 06:45 PM (local time), waits for a random delay (0-15 minutes), then performs check-out
3. **Weekday Check**: The script automatically skips weekends
4. **Random Timing**: Each execution waits for a random time within the specified window to appear more natural

## Workflow Schedule

- **Check-In**: Every weekday at 09:00 AM (with random delay up to 14 minutes)
- **Check-Out**: Every weekday at 06:45 PM (with random delay up to 15 minutes)

## Logs

Attendance logs are saved in the `logs/` directory with daily JSON files for tracking.

## Gmail Notifications

When the `APP_PASS` secret is set in GitHub Actions (or `GMAIL_APP_PASSWORD` locally), each check-in and check-out (success or failure) sends a formatted email from **uaslam1004@gmail.com** to **junaidaslam.muet@gmail.com** and **uaslam1000@gmail.com**. The email includes the full API response or error payload in a readable HTML format.

## Security Notes

- Never commit credentials to the repository
- Always use GitHub Secrets for sensitive information
- The script uses environment variables for credentials

