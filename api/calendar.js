const { google } = require('googleapis');

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Handle both GET (calendar events) and POST (registration count) requests
    if (req.method === 'GET') {
        return handleGetEvents(req, res);
    } else if (req.method === 'POST') {
        return handleGetRegistrationCount(req, res);
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}

// Handle GET requests for calendar events
async function handleGetEvents(req, res) {
    try {
        const { mode, eventName, eventDate, timeMin, timeMax, maxResults = 50 } = req.query;

        // Handle single event validation request
        if (mode === 'single' && eventName && eventDate) {
            return handleSingleEventValidation(req, res, eventName, eventDate);
        }

        // Get environment variables (these are secure on the server)
        const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (!apiKey || !calendarId) {
            console.error('Missing environment variables');
            return res.status(500).json({ 
                error: 'Server configuration error',
                fallback: true 
            });
        }

        // Validate required parameters for normal calendar requests
        if (!timeMin || !timeMax) {
            return res.status(400).json({ 
                error: 'timeMin and timeMax parameters are required' 
            });
        }

        // Build Google Calendar API URL
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
            `key=${apiKey}&` +
            `timeMin=${encodeURIComponent(timeMin)}&` +
            `timeMax=${encodeURIComponent(timeMax)}&` +
            `maxResults=${maxResults}&` +
            `singleEvents=true&` +
            `orderBy=startTime`;

        // Fetch events from Google Calendar
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Google Calendar API error: ${response.status} ${response.statusText}`);
            
            // Return fallback response
            return res.status(response.status).json({
                error: `Google Calendar API error: ${response.status}`,
                fallback: true
            });
        }

        const data = await response.json();

        // Return the events data
        res.status(200).json({
            success: true,
            events: data.items || [],
            total: data.items?.length || 0
        });

    } catch (error) {
        console.error('Calendar API error:', error);
        
        res.status(500).json({
            error: 'Internal server error',
            fallback: true
        });
    }
}

// Handle single event validation for track reservation
async function handleSingleEventValidation(req, res, eventName, eventDate) {
    try {
        // Get environment variables
        const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (!apiKey || !calendarId) {
            console.error('Missing environment variables');
            return res.status(500).json({ 
                success: false,
                error: 'Server configuration error'
            });
        }

        // Get calendar events for a reasonable time range to find the specific event
        const now = new Date();
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(now.getMonth() + 6);

        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
            `key=${apiKey}&` +
            `timeMin=${now.toISOString()}&` +
            `timeMax=${sixMonthsFromNow.toISOString()}&` +
            `maxResults=250&` +
            `singleEvents=true&` +
            `orderBy=startTime`;

        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Google Calendar API error: ${response.status} ${response.statusText}`);
            return res.status(response.status).json({
                success: false,
                error: `Google Calendar API error: ${response.status}`
            });
        }

        const data = await response.json();
        const events = data.items || [];

        // Find the specific event
        const foundEvent = events.find(event => {
            if (!event.summary || !event.start?.dateTime) return false;
            
            const eventTitle = event.summary.trim();
            const eventStartDate = new Date(event.start.dateTime);
            const eventDateString = eventStartDate.toLocaleDateString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            
            return eventTitle === eventName.trim() && eventDateString === eventDate.trim();
        });

        if (!foundEvent) {
            return res.status(404).json({
                success: false,
                error: 'Event not found'
            });
        }

        // Parse event details
        const description = foundEvent.description || '';
        const defaultRate = 190;

        // Extract pricing from description (look for "rate = $X" or "$X")
        let rate = defaultRate;
        const rateMatch = description.match(/rate\s*[=:]\s*\$?(\d+)/i) || description.match(/\$(\d+)/);
        if (rateMatch) {
            rate = parseInt(rateMatch[1]);
        }

        // Extract max spots from description (look for "spots = X")
        let maxSpots = 10; // Default capacity
        const spotsMatch = description.match(/spots\s*[=:]\s*(\d+)/i);
        if (spotsMatch) {
            maxSpots = parseInt(spotsMatch[1]);
        }

        // Calculate remaining spots using registration data
        const eventStartDate = new Date(foundEvent.start.dateTime);
        const eventDateString = eventStartDate.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        let remainingSpots = maxSpots;

        try {
            // Get registration count from Google Sheets API
            const { google } = require('googleapis');
            
            // Get Google Sheets credentials
            const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });

            const sheets = google.sheets({ version: 'v4', auth });
            const sheetData = await sheets.spreadsheets.values.get({
                spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                range: 'Event Registrations!A3:C',
            });

            const registrations = sheetData.data.values || [];
            const registrationCount = registrations.filter(row => {
                const registeredEventName = row[1] || '';
                const registeredEventDate = row[2] || '';
                return registeredEventName.trim().toLowerCase() === eventName.trim().toLowerCase() &&
                       registeredEventDate === eventDateString;
            }).length;

            remainingSpots = Math.max(0, maxSpots - registrationCount);
            
            console.log(`Event validation: ${eventName} on ${eventDate} - ${registrationCount}/${maxSpots} registered, ${remainingSpots} remaining`);
            
        } catch (sheetsError) {
            console.error('Error getting registration count:', sheetsError);
            // Continue with default remainingSpots = maxSpots
        }

        return res.status(200).json({
            success: true,
            event: {
                name: foundEvent.summary,
                date: eventDateString,
                rate: rate,
                maxSpots: maxSpots,
                remainingSpots: remainingSpots,
                description: description
            }
        });

    } catch (error) {
        console.error('Error validating single event:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to validate event data'
        });
    }
}

// Handle POST requests for registration count
async function handleGetRegistrationCount(req, res) {
    try {
        const { eventName, eventDate } = req.body;

        if (!eventName || !eventDate) {
            return res.status(400).json({ 
                error: 'eventName and eventDate are required' 
            });
        }

        // Validate required environment variables for Google Sheets
        const requiredEnvVars = [
            'GOOGLE_SHEETS_ID',
            'GOOGLE_PROJECT_ID', 
            'GOOGLE_CLIENT_EMAIL',
            'GOOGLE_PRIVATE_KEY',
            'GOOGLE_CLIENT_ID'
        ];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                return res.status(500).json({ error: `Missing required environment variable: ${envVar}` });
            }
        }

        // Get the Google Sheets credentials from environment variables
        const credentials = {
            type: 'service_account',
            project_id: process.env.GOOGLE_PROJECT_ID,
            private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            client_id: process.env.GOOGLE_CLIENT_ID,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
            client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/moto-coach-sheet%40moto-coach-test.iam.gserviceaccount.com`,
            universe_domain: 'googleapis.com'
        };

        // Initialize Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

        // Get all data from the sheet (starting from row 3 where data begins)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'A3:C', // Get columns A (timestamp), B (event name), C (event date)
        });

        const rows = response.data.values || [];
        
        // Count matching registrations (eventName in column B, eventDate in column C)
        const registrationCount = rows.filter(row => {
            const sheetEventName = row[1] || ''; // Column B
            const sheetEventDate = row[2] || '';  // Column C
            
            return sheetEventName.trim() === eventName.trim() && 
                   sheetEventDate.trim() === eventDate.trim();
        }).length;

        res.status(200).json({
            success: true,
            registrationCount: registrationCount
        });

    } catch (error) {
        console.error('Error getting registration count:', error);
        res.status(500).json({
            error: 'Failed to get registration count',
            registrationCount: 0
        });
    }
}
