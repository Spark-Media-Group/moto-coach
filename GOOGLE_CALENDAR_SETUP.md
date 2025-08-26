# Google Calendar API Setup Instructions

## Step 1: Google Cloud Console Setup

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create or Select Project**
   - Create a new project or select an existing one
   - Name it something like "Moto Coach Calendar"

3. **Enable Google Calendar API**
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click on it and press "Enable"

4. **Create API Key**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy your API key (keep it secure!)

## Step 2: Get Your Calendar ID

### For Public Calendar:
1. Open Google Calendar
2. Go to your calendar settings (gear icon > Settings)
3. Click on your calendar name
4. Scroll down to "Integrate calendar"
5. Copy the "Calendar ID" (looks like: your-email@gmail.com or random-string@group.calendar.google.com)

### For Private Calendar:
- You'll need OAuth 2.0 setup (more complex)
- Or make your calendar public (easier but less secure)

## Step 3: Update Your Environment Variables

1. **Local Development**:
   - Open `.env.local` in your project root
   - Replace the placeholder values:
   ```bash
   GOOGLE_CALENDAR_API_KEY=your-actual-api-key
   GOOGLE_CALENDAR_ID=your-actual-calendar-id
   ```

2. **Vercel Deployment**:
   - Go to your Vercel dashboard
   - Select your project
   - Go to Settings > Environment Variables
   - Add both variables:
     - `GOOGLE_CALENDAR_API_KEY` = your API key
     - `GOOGLE_CALENDAR_ID` = your calendar ID
   - Redeploy your project

## Step 4: Test the Integration

1. **Local Testing**:
   ```bash
   vercel dev
   ```
   Then visit http://localhost:3000/calendar.html

2. **Production Testing**:
   - Deploy to Vercel
   - Visit your live site's calendar page
   - Check browser console for any errors
   - Events should appear on your custom calendar

## Security Notes

- **API Key**: Keep your API key secure, don't commit it to public repositories
- **Rate Limits**: Google Calendar API has usage limits
- **Public Calendar**: Only use for non-sensitive events

## Troubleshooting

### Common Issues:
1. **403 Error**: API key not configured or calendar not public
2. **Events not showing**: Check calendar ID and date ranges
3. **CORS Error**: API should work from any domain for public calendars

### Browser Console:
- Check for errors in browser developer tools
- Look for successful "Loaded X events" message

## Optional: Environment Variables

For better security, consider using environment variables:

```javascript
// In your calendar.js
this.apiKey = process.env.GOOGLE_CALENDAR_API_KEY || 'fallback-key';
this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'fallback-id';
```

## Event Categories

The calendar automatically categorizes events based on keywords in titles:
- **coaching**: "coaching", "lesson"
- **training**: "training", "practice" 
- **group**: "group", "session"
- **info**: "info", "meeting"
- **open**: "track", "open"
- **event**: everything else

Add these keywords to your Google Calendar event titles for proper categorization.
