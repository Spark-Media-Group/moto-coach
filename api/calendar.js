const { google } = require('googleapis');

export default async function handler(req, res) {
    // Set strict CORS headers - only allow specific domains
    const origin = req.headers.origin || "";
    const allowedDomains = new Set([
        "https://motocoach.com.au",
        "https://www.motocoach.com.au",
        "https://sydneymotocoach.com",
        "https://www.sydneymotocoach.com",
        "https://smg-mc.vercel.app"
    ]);
    
    const isVercelPreview = /\.vercel\.app$/.test(new URL(origin || "http://localhost").hostname || "");
    
    if (allowedDomains.has(origin) || isVercelPreview) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Key, X-Requested-With');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Security: Require API key for POST requests
    const APP_KEY = process.env.APP_KEY;
    if (req.method === 'POST') {
        const providedKey = req.headers['x-app-key'];
        if (!APP_KEY || providedKey !== APP_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        // CSRF protection: validate Origin/Referer for POST requests
        const referer = req.headers.referer || '';
        const isValidRequest = allowedDomains.has(origin) || isVercelPreview || 
                              [...allowedDomains].some(domain => referer.startsWith(domain));
        
        if (!isValidRequest) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }

    // Input validation
    const MAX_RESULTS = 100;
    const maxResults = req.query.maxResults || 50;
    const maxResultsNum = Math.min(Number(maxResults), MAX_RESULTS);
    if (Number.isNaN(maxResultsNum) || maxResultsNum < 1) {
        return res.status(400).json({ error: 'Invalid maxResults' });
    }

    // Validate mode parameter
    const mode = req.query.mode;
    if (mode && !['single', 'batchCounts'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
    }

    // Handle both GET (calendar events) and POST (registration count) requests
    if (req.method === 'GET') {
        return handleGetEvents(req, res);
    } else if (req.method === 'POST') {
        // Check if this is a batch counts request
        if (req.query.mode === 'batchCounts') {
            return handleBatchRegistrationCounts(req, res);
        }
        return handleGetRegistrationCount(req, res);
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}

// Handle GET requests for calendar events
async function handleGetEvents(req, res) {
    try {
        const { mode, eventName, eventDate, timeMin, timeMax } = req.query;
        
        // Get validated maxResults from main handler
        const MAX_RESULTS = 100;
        const maxResults = Math.min(Number(req.query.maxResults || 50), MAX_RESULTS);

        // Add cache control headers for performance
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

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

        // Use the new listEvents helper to get all events with pagination
        const { items, error, status } = await listEvents({ 
            timeMin, 
            timeMax, 
            apiKey, 
            calendarId 
        });

        if (error) {
            console.error('Google Calendar API error');
            return res.status(500).json({
                error: 'Calendar service unavailable',
                fallback: true
            });
        }

        // Return the events data
        res.status(200).json({
            success: true,
            events: items || [],
            total: items?.length || 0
        });

    } catch (error) {
        console.error('Calendar API error');
        
        res.status(500).json({
            error: 'Internal server error',
            fallback: true
        });
    }
}

// Helper function to fetch all calendar events with pagination and field optimization
async function listEvents({ timeMin, timeMax, apiKey, calendarId }) {
    let pageToken;
    let items = [];
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const fields = 'items(summary,description,location,start,end),nextPageToken';
    
    do {
        const url = `${base}?key=${apiKey}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250&fields=${fields}${pageToken ? `&pageToken=${pageToken}` : ''}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            return { error: true, status: response.status };
        }
        
        const data = await response.json();
        items = items.concat(data.items || []);
        pageToken = data.nextPageToken;
    } while (pageToken);
    
    return { items };
}

// Handle single event validation for track reservation
async function handleSingleEventValidation(req, res, eventName, eventDate) {
    try {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`Single event validation requested for: "${eventName}" on "${eventDate}"`);
        }
        
        // Get environment variables
        const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (!apiKey || !calendarId) {
            console.error('Missing environment variables for single event validation');
            return res.status(500).json({ 
                success: false,
                error: 'Server configuration error'
            });
        }

        // Parse eventDate (d/m/yyyy) to build exact day range
        const [day, month, year] = eventDate.split('/').map(Number);
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day + 1, 0, 0, 0);

        // Use the new listEvents helper to query the exact day with pagination
        const { items, error, status } = await listEvents({
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            apiKey,
            calendarId
        });

        if (error) {
            console.error('Calendar API error in single event validation');
            return res.status(500).json({
                success: false,
                error: 'Calendar service unavailable'
            });
        }

        const events = items || [];

        // Find the specific event with strict title match
        const foundEvent = events.find(event => {
            if (!event.summary || !event.start?.dateTime) return false;
            return event.summary.trim() === eventName.trim();
        });

        if (process.env.NODE_ENV !== 'production') {
            console.log(`Found ${events.length} calendar events on ${eventDate}, looking for: "${eventName}"`);
            if (!foundEvent) {
                console.log('Available events on this date:', events.map(e => ({
                    title: e.summary,
                    time: e.start?.dateTime
                })));
            }
        }

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
        // Use calendar date exactly as it appears, no timezone conversion
        const eventDateString = `${eventStartDate.getDate()}/${eventStartDate.getMonth() + 1}/${eventStartDate.getFullYear()}`;

        let remainingSpots = maxSpots;

        try {
            // Get registration count from Google Sheets API using same method as POST endpoint
            // Get the Google Sheets credentials from environment variables (same as POST method)
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
            
            if (process.env.NODE_ENV !== 'production') {
                console.log(`Event validation: ${eventName} on ${eventDate} - ${registrationCount}/${maxSpots} registered, ${remainingSpots} remaining`);
            }
            
        } catch (sheetsError) {
            console.error('Error in single validation sheets access');
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

// Handle batch registration counts
async function handleBatchRegistrationCounts(req, res) {
    try {
        const { items } = req.body; // [{name, date}] with date "d/m/yyyy"
        
        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: 'items array required' });
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

        // Read the sheet once for all events
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range: 'Event Registrations!A3:C',
        });

        const rows = response.data.values || [];

        // Create key function for consistent matching
        const createKey = (name, date) => `${name.trim().toLowerCase()}__${date.trim()}`;

        // Initialize counts map for all requested items
        const counts = {};
        for (const { name, date } of items) {
            counts[createKey(name, date)] = 0;
        }

        // Count registrations for each requested event
        for (const row of rows) {
            if (row.length >= 3) {
                const sheetEventName = (row[1] || '').trim().toLowerCase();
                const sheetEventDate = (row[2] || '').trim();
                const key = `${sheetEventName}__${sheetEventDate}`;
                
                if (key in counts) {
                    counts[key] += 1;
                }
            }
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log(`Batch registration count: processed ${items.length} events from ${rows.length} sheet rows`);
        }

        return res.status(200).json({
            success: true,
            counts: counts
        });

    } catch (error) {
        console.error('Error getting batch registration counts:', error);
        return res.status(500).json({
            error: 'Failed to get batch registration counts'
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
            range: 'Event Registrations!A3:C', // Get columns A (timestamp), B (event name), C (event date)
        });

        const rows = response.data.values || [];
        
        // Only show debug logging in development
        if (process.env.NODE_ENV !== 'production') {
            console.log(`=== DEBUG: Google Sheets Registration Count ===`);
            console.log(`Looking for: "${eventName}" on "${eventDate}"`);
            console.log(`Found ${rows.length} rows in sheet`);
            console.log('Sheet data:');
            rows.forEach((row, index) => {
                console.log(`Row ${index + 3}: [${row[0] || 'empty'}, "${row[1] || 'empty'}", "${row[2] || 'empty'}"]`);
            });
        }
        
        // Count matching registrations (eventName in column B, eventDate in column C)
        const registrationCount = rows.filter(row => {
            const sheetEventName = row[1] || ''; // Column B
            const sheetEventDate = row[2] || '';  // Column C
            
            const nameMatch = sheetEventName.trim() === eventName.trim();
            const dateMatch = sheetEventDate.trim() === eventDate.trim();
            
            if (process.env.NODE_ENV !== 'production') {
                console.log(`Comparing row: "${sheetEventName}" vs "${eventName}" (name: ${nameMatch}) and "${sheetEventDate}" vs "${eventDate}" (date: ${dateMatch})`);
            }
            
            return nameMatch && dateMatch;
        }).length;

        if (process.env.NODE_ENV !== 'production') {
            console.log(`Final registration count: ${registrationCount}`);
            console.log(`=== END DEBUG ===`);
        }

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
