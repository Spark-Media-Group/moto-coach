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
        // Debug: Log environment variables (without sensitive data)
        console.log('Environment check:', {
            hasGoogleSheetsId: !!process.env.GOOGLE_SHEETS_ID,
            hasGoogleProjectId: !!process.env.GOOGLE_PROJECT_ID,
            hasGoogleClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
            hasGooglePrivateKey: !!process.env.GOOGLE_PRIVATE_KEY
        });

        // Validate required environment variables
        const requiredEnvVars = [
            'GOOGLE_SHEETS_ID',
            'GOOGLE_PROJECT_ID', 
            'GOOGLE_CLIENT_EMAIL',
            'GOOGLE_PRIVATE_KEY',
            'GOOGLE_CLIENT_ID'
        ];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
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
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

        if (!spreadsheetId) {
            throw new Error('Google Sheets ID not configured');
        }

        // Extract form data
        const formData = req.body;
        
        // Prepare row data - properly structured for the spreadsheet
        const rowData = [
            new Date().toISOString(), // Column A: Timestamp
            formData.eventName || '', // Column B: Event
            formData.contactFirstName || '', // Column C: Contact First Name  
            formData.contactLastName || '', // Column D: Contact Last Name
            formData.contactEmail || '', // Column E: Contact Email
            formData.contactPhone || '', // Column F: Contact Phone
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

        // Add first rider details (main rider)
        if (riders.length > 0) {
            const mainRider = riders[0];
            rowData.push(mainRider.firstName); // Column G: Rider First Name
            rowData.push(mainRider.lastName);  // Column H: Rider Last Name
            rowData.push(mainRider.bikeNumber); // Column I: Bike Number
            rowData.push(mainRider.bikeSize);   // Column J: Bike Size
            rowData.push(mainRider.dateOfBirth); // Column K: Date of Birth
            rowData.push(formData.riderEmail || ''); // Column L: Rider Email (18+)
            rowData.push(formData.riderPhone || ''); // Column M: Rider Phone (18+)
        } else {
            // Fill empty columns if no rider data
            rowData.push('', '', '', '', '', '', '');
        }

        // Add additional riders as a combined string if there are multiple
        if (riders.length > 1) {
            const additionalRiders = riders.slice(1).map(rider => 
                `${rider.firstName} ${rider.lastName} (${rider.bikeSize}${rider.bikeNumber ? ', #' + rider.bikeNumber : ''}, DOB: ${rider.dateOfBirth})`
            ).join(' | ');
            rowData.push(additionalRiders); // Column N: Additional Riders
        } else {
            rowData.push(''); // No additional riders
        }

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
        
        // Provide more detailed error information
        let errorMessage = 'Failed to submit registration';
        let errorDetails = error.message;
        
        if (error.message.includes('GOOGLE_SHEETS_ID')) {
            errorMessage = 'Google Sheets configuration error';
            errorDetails = 'GOOGLE_SHEETS_ID environment variable not set';
        } else if (error.message.includes('credentials')) {
            errorMessage = 'Authentication error';
            errorDetails = 'Google service account credentials not properly configured';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'Network error';
            errorDetails = 'Unable to connect to Google Sheets API';
        }
        
        res.status(500).json({ 
            error: errorMessage,
            details: errorDetails,
            timestamp: new Date().toISOString()
        });
    }
}
