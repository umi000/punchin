# Attendance Automation

Automated attendance check-in and check-out system for SkilledIM portal.

## Features

- ✅ Automatic check-in during the configured PKT window with a short random delay
- ✅ Automatic checkout flow via the portal UI login/logout action
- ✅ Runs only on weekdays (Monday-Friday)
- ✅ GitHub Actions pipeline integration
- ✅ Secure credential management via GitHub Secrets
- ✅ Playwright browser automation for Cloudflare-protected login flows
- ✅ Gmail notifications: check-in/check-out API responses emailed to configured recipients

## Setup

### 1. Install Dependencies

```bash
npm install
```

This project now uses Playwright, which requires Node 20 or higher.

### 2. Configure GitHub Secrets

Go to your repository settings → Secrets and variables → Actions, and add:

- `ATTENDANCE_EMAIL`: Your login email
- `ATTENDANCE_PASSWORD`: Your login password
- `APP_PASS`: (Optional) Gmail app password for `uaslam1004@gmail.com` to send notification emails. Create at [Google Account → Security → App passwords](https://myaccount.google.com/apppasswords) (requires 2-Step Verification). For local runs you can use `GMAIL_APP_PASSWORD` instead.

### 3. Timezone Configuration

The GitHub Actions workflows are configured for **UTC timezone**. If you're in a different timezone, adjust the cron schedules in:

- `.github/workflows/attendance-checkin.yml` (currently set to 02:30 UTC = 07:30 PKT)
- `.github/workflows/attendance-checkout.yml` (currently set to 13:45 UTC = 18:45 PKT)

**Timezone Conversion:**
- Pakistan Time (PKT) = UTC + 5
- To convert: `Local Time - 5 hours = UTC Time`

> Playwright is automatically run in headless mode on GitHub Actions, because CI runners do not have an X server.

### 4. Manual Testing

You can test the script locally:

```bash
# Test check-in
npm run check-in

# Test check-out
npm run check-out
```

## How It Works

1. **Check-In Workflow**: Runs weekdays at 07:30 PKT and waits briefly before the login step.
2. **Checkout Workflow**: Uses the portal UI flow to log in and click the actual checkout/logout action if the page is available.
3. **Weekday Check**: The script automatically skips weekends.
4. **Random Timing**: Each execution uses a small delay before continuing, helping keep the flow less robotic.
5. **Cloudflare fallback**: If the direct API login is challenged, the script falls back to a Playwright browser session.

## Workflow Schedule

- **Check-In**: Every weekday at 07:30 PKT
- **Check-Out**: Every weekday around 18:45 PKT, with the script gate checking the actual PKT time window before continuing

## Logs

Attendance logs are saved in the `logs/` directory with daily JSON files for tracking.

## Gmail Notifications

When the `APP_PASS` secret is set in GitHub Actions (or `GMAIL_APP_PASSWORD` locally), each check-in and check-out (success or failure) sends a formatted email from **uaslam1004@gmail.com** to **junaidaslam.muet@gmail.com** and **uaslam1000@gmail.com**. The email includes the full API response or error payload in a readable HTML format.

## Important Note

The SkilledIM portal is protected by Cloudflare and may block direct API authentication from automation. The project therefore includes a Playwright fallback that attempts the login through the browser UI. In GitHub Actions this fallback runs headless automatically because CI has no graphical display.

## Security Notes

- Never commit credentials to the repository
- Always use GitHub Secrets for sensitive information
- The script uses environment variables for credentials

