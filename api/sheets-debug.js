// Debug endpoint to see Google Sheets data
const { google } = require('googleapis');
import { applyCors } from './_utils/cors';

const isSheetsDebugEnabled = () => process.env.SHEETS_DEBUG_ENABLED === 'true';

const getAllowedOrigins = () => {
    const origins = process.env.SHEETS_DEBUG_ALLOWED_ORIGINS;
    if (!origins) {
        return [];
    }

    return origins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
};

const isOriginAllowed = (origin, allowedOrigins) => {
    if (!origin) {
        return false;
    }

    return allowedOrigins.includes(origin);
};

const getRequiredApiKey = () => process.env.SHEETS_DEBUG_API_KEY;

const extractApiKeyFromRequest = (req) => {
    const headerValue = req.headers['x-api-key'];
    if (Array.isArray(headerValue)) {
        return headerValue[0];
    }
    return headerValue;
};

export default async function handler(req, res) {
    if (!isSheetsDebugEnabled()) {
        res.status(404).json({ error: 'Not found' });
        return;
    }

    const allowedOrigins = getAllowedOrigins();
    const requestOrigin = req.headers.origin || '';

    if (!isOriginAllowed(requestOrigin, allowedOrigins)) {
        res.status(403).json({ error: 'Origin not allowed' });
        return;
    }

    const requiredApiKey = getRequiredApiKey();
    if (!requiredApiKey) {
        res.status(500).json({ error: 'Debug endpoint is not configured' });
        return;
    }

    // Set CORS headers for allowed origins
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    if (cors.handled) {
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const providedApiKey = extractApiKeyFromRequest(req);

    if (!providedApiKey || providedApiKey !== requiredApiKey) {
        res.status(401).json({ error: 'Invalid API key' });
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
