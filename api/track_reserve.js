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

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
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
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

        if (!spreadsheetId) {
            throw new Error('Google Sheets ID not configured');
        }

        // Extract form data
        const formData = req.body;
        
        // Prepare row data - starting from the form structure
        const rowData = [
            new Date().toISOString(), // Timestamp
            formData.eventName || '',
            formData.contactFirstName || '',
            formData.contactLastName || '',
            formData.contactEmail || '',
            formData.contactPhone || '',
            formData.riderEmail || '', // Only filled if rider is 18+
            formData.riderPhone || '', // Only filled if rider is 18+
        ];

        // Add rider information - we need to handle multiple riders
        const riders = [];
        let riderIndex = 1;
        
        // Collect all rider data
        while (formData[`riderFirstName${riderIndex}`]) {
            const rider = {
                firstName: formData[`riderFirstName${riderIndex}`],
                lastName: formData[`riderLastName${riderIndex}`],
                bikeNumber: formData[`bikeNumber${riderIndex}`] || '',
                bikeSize: formData[`bikeSize${riderIndex}`],
                dateOfBirth: formData[`dateOfBirth${riderIndex}`]
            };
            riders.push(rider);
            riderIndex++;
        }

        // Convert riders to a string format for the sheet
        const ridersString = riders.map(rider => 
            `${rider.firstName} ${rider.lastName} (${rider.bikeSize}${rider.bikeNumber ? ', #' + rider.bikeNumber : ''}, DOB: ${rider.dateOfBirth})`
        ).join(' | ');

        rowData.push(ridersString);

        // Append the data to the sheet (starting from row 3)
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'A3:Z3', // Start from row 3, allow columns A through Z
            valueInputOption: 'RAW',
            requestBody: {
                values: [rowData],
            },
        });

        res.status(200).json({ 
            success: true, 
            message: 'Registration submitted successfully',
            sheetResponse: response.data
        });

    } catch (error) {
        console.error('Error submitting to Google Sheets:', error);
        res.status(500).json({ 
            error: 'Failed to submit registration',
            details: error.message 
        });
    }
}
