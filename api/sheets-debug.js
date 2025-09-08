// Debug endpoint to see Google Sheets data
const { google } = require('googleapis');

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Get Google Sheets credentials
        const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

        // Get all data from the sheet
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Event Registrations!A1:C20', // Get more rows to see headers and data
        });

        const rows = response.data.values || [];
        
        // Also test the specific range we use in production
        const prodResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Event Registrations!A3:C', // Production range
        });

        const prodRows = prodResponse.data.values || [];

        res.status(200).json({
            success: true,
            message: 'Google Sheets debug data',
            sheet_info: {
                spreadsheet_id: spreadsheetId,
                total_rows_A1_C20: rows.length,
                production_range_rows: prodRows.length
            },
            all_data_A1_C20: rows.map((row, index) => ({
                row_number: index + 1,
                column_A: row[0] || 'empty',
                column_B: row[1] || 'empty', 
                column_C: row[2] || 'empty'
            })),
            production_data_A3_C: prodRows.map((row, index) => ({
                row_number: index + 3,
                column_A: row[0] || 'empty',
                column_B: row[1] || 'empty',
                column_C: row[2] || 'empty'
            })),
            search_test: {
                looking_for_event: 'clubmx',
                looking_for_date: '11/09/2025',
                matches: prodRows.filter(row => {
                    const sheetEventName = row[1] || '';
                    const sheetEventDate = row[2] || '';
                    return sheetEventName.trim().toLowerCase() === 'clubmx' && 
                           sheetEventDate.trim() === '11/09/2025';
                })
            }
        });

    } catch (error) {
        console.error('Error accessing Google Sheets:', error);
        res.status(500).json({
            error: 'Failed to access Google Sheets',
            details: error.message
        });
    }
}
