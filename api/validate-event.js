// Dedicated API endpoint for validating single events
const { google } = require('googleapis');
import { applyCors } from './_utils/cors';

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['GET', 'OPTIONS'],
        headers: ['Content-Type']
    });

    if (cors.handled) {
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { eventName, eventDate } = req.query;

        if (!eventName || !eventDate) {
            return res.status(400).json({
                success: false,
                error: 'eventName and eventDate parameters are required'
            });
        }

        console.log(`Validating event: "${eventName}" on "${eventDate}"`);

        // Get environment variables
        const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (!apiKey || !calendarId) {
            console.error('Missing Google Calendar configuration');
            return res.status(500).json({ 
                success: false,
                error: 'Calendar configuration missing'
            });
        }

        // Get calendar events for validation
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

        console.log('Fetching calendar events...');
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Google Calendar API error: ${response.status} ${response.statusText}`);
            const errorText = await response.text();
            console.error('API Error details:', errorText);
            return res.status(500).json({
                success: false,
                error: `Calendar API error: ${response.status}`
            });
        }

        const data = await response.json();
        const events = data.items || [];

        console.log(`Found ${events.length} calendar events`);

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
            
            const searchTitle = eventName.trim();
            const searchDate = eventDate.trim();
            
            console.log(`Comparing: "${eventTitle}" vs "${searchTitle}" and "${eventDateString}" vs "${searchDate}"`);
            
            return eventTitle === searchTitle && eventDateString === searchDate;
        });

        if (!foundEvent) {
            console.log('Event not found. Available events:');
            events.forEach(event => {
                if (event.summary && event.start?.dateTime) {
                    const date = new Date(event.start.dateTime).toLocaleDateString('en-AU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    });
                    console.log(`  - "${event.summary}" on ${date}`);
                }
            });
            
            return res.status(404).json({
                success: false,
                error: 'Event not found in calendar'
            });
        }

        // Parse event details
        const description = foundEvent.description || '';
        const defaultRate = 190;

        // Extract pricing from description
        let rate = defaultRate;
        const rateMatch = description.match(/rate\s*[=:]\s*\$?(\d+)/i) || description.match(/\$(\d+)/);
        if (rateMatch) {
            rate = parseInt(rateMatch[1]);
        }

        // Extract max spots from description
        let maxSpots = 10;
        const spotsMatch = description.match(/spots\s*[=:]\s*(\d+)/i);
        if (spotsMatch) {
            maxSpots = parseInt(spotsMatch[1]);
        }

        // Calculate remaining spots using Google Sheets
        const eventStartDate = new Date(foundEvent.start.dateTime);
        const eventDateString = eventStartDate.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        let remainingSpots = maxSpots;

        try {
            // Get registration count from Google Sheets API using the same method as calendar.js
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
            console.log(`Registration count: ${registrationCount}, Remaining spots: ${remainingSpots}`);
        } catch (sheetsError) {
            console.error('Error getting registration count:', sheetsError);
            // Continue with default remainingSpots
        }

        console.log(`Event validated successfully: ${foundEvent.summary}`);

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
        console.error('Error validating event:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during validation'
        });
    }
}
