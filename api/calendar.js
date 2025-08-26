export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { timeMin, timeMax, maxResults = 50 } = req.query;

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

        // Validate required parameters
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
