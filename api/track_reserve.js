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
        
        // Collect all rider data
        const riders = [];
        let riderIndex = 1;
        
        while (formData[`riderFirstName${riderIndex}`]) {
            const rider = {
                firstName: formData[`riderFirstName${riderIndex}`] || '',
                lastName: formData[`riderLastName${riderIndex}`] || '',
                bikeNumber: formData[`bikeNumber${riderIndex}`] || '', // Optional field
                bikeSize: formData[`bikeSize${riderIndex}`] || '',
                dateOfBirth: formData[`dateOfBirth${riderIndex}`] || '',
                email: formData[`riderEmail${riderIndex}`] || '', // Individual rider email
                phone: formData[`riderPhone${riderIndex}`] || ''  // Individual rider phone
            };
            riders.push(rider);
            riderIndex++;
        }

        // Prepare rows - one row per rider, all sharing same contact info
        const rows = [];
        
        for (const rider of riders) {
            // Format dates in Australian format (DD/MM/YYYY)
            const timestamp = new Date().toLocaleDateString('en-AU', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            // Format event date - handle both Australian format (DD/MM/YYYY) and ISO format
            let formattedEventDate = '';
            if (formData.eventDate) {
                // Check if it's already in DD/MM/YYYY format (from calendar)
                if (formData.eventDate.includes('/') && formData.eventDate.split('/').length === 3) {
                    formattedEventDate = formData.eventDate; // Already in DD/MM/YYYY format
                } else {
                    // Convert from ISO or other format to DD/MM/YYYY
                    const eventDate = new Date(formData.eventDate);
                    if (!isNaN(eventDate.getTime())) {
                        formattedEventDate = eventDate.toLocaleDateString('en-AU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        });
                    } else {
                        formattedEventDate = formData.eventDate; // Use as-is if parsing fails
                    }
                }
            }

            const rowData = [
                timestamp, // Column A: Timestamp (Australian format)
                formData.eventName || '', // Column B: Event Name
                formattedEventDate, // Column C: Event Date (Australian format DD/MM/YYYY)
                rider.firstName, // Column D: Rider First Name
                rider.lastName, // Column E: Rider Last Name
                rider.bikeNumber, // Column F: Bike Number (optional - empty if not provided)
                rider.bikeSize, // Column G: Bike Size
                rider.dateOfBirth, // Column H: Date of Birth
                rider.email, // Column I: Rider Email (individual per rider, 18+ only)
                rider.phone, // Column J: Rider Phone (individual per rider, 18+ only)
                formData.contactFirstName || '', // Column K: Parent/Contact First Name
                formData.contactLastName || '', // Column L: Parent/Contact Last Name
                formData.contactEmail || '', // Column M: Parent/Contact Email
                formData.contactPhone || '', // Column N: Parent/Contact Phone
            ];
            rows.push(rowData);
        }

        // If no riders, create one empty row with just contact info
        if (riders.length === 0) {
            const rowData = [
                new Date().toISOString(), // Column A: Timestamp
                formData.eventName || '', // Column B: Event Name
                formData.eventDate || '', // Column C: Event Date
                '', '', '', '', '', // Empty rider info (columns D-H)
                formData.riderEmail || '', // Column I: Rider Email
                formData.riderPhone || '', // Column J: Rider Phone
                formData.contactFirstName || '', // Column K: Parent/Contact First Name
                formData.contactLastName || '', // Column L: Parent/Contact Last Name
                formData.contactEmail || '', // Column M: Parent/Contact Email
                formData.contactPhone || '', // Column N: Parent/Contact Phone
            ];
            rows.push(rowData);
        }

        // Append all rows to the sheet
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'A3:N', // Start from row 3, columns A through N
            valueInputOption: 'RAW',
            requestBody: {
                values: rows, // Multiple rows for multiple riders
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
