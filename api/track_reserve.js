const { google } = require('googleapis');
import { Resend } from 'resend';
import { applyCors } from './_utils/cors';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
import { isLiveEnvironment } from './_utils/environment';
import { checkBotProtection } from './_utils/botid';

const resend = new Resend(process.env.RESEND_API_KEY);

const LOGO_URL = 'https://motocoach.com.au/images/tall-logo-black.png';

const HTML_ESCAPE_LOOKUP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char] || char);
}

function toSafeString(value) {
    return escapeHtml(String(value ?? '').trim());
}

function toPlainText(value) {
    return String(value ?? '').replace(/\r?\n/g, '\n').trim();
}

function toSafeMultilineString(value) {
    return toSafeString(value).replace(/\r?\n/g, '<br>');
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const numericValue = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));

    if (!Number.isFinite(numericValue)) {
        return '';
    }

    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD'
    }).format(numericValue);
}

function formatPhoneHref(value) {
    if (!value) {
        return '';
    }

    return String(value).replace(/[^+\d]/g, '');
}

function renderDetailRows(rows = []) {
    return rows
        .map((row, index) => {
            const isLastRow = index === rows.length - 1;
            const borderBottom = isLastRow ? '' : 'border-bottom: 1px solid #e5e7eb;';
            return `
                <tr>
                    <td style="padding: 12px 16px; background-color: #f9fafb; font-weight: 600; font-size: 14px; color: #111827; border-right: 1px solid #e5e7eb; ${borderBottom}">
                        ${toSafeString(row.label)}
                    </td>
                    <td style="padding: 12px 16px; font-size: 14px; color: #374151; ${borderBottom}">
                        ${row.value || 'N/A'}
                    </td>
                </tr>
            `;
        })
        .join('');
}

function parseDateInput(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashMatch) {
            const [, day, month, year] = slashMatch;
            const dayNum = parseInt(day, 10);
            const monthNum = parseInt(month, 10);
            const yearNum = year.length === 2 ? 2000 + parseInt(year, 10) : parseInt(year, 10);
            const parsed = new Date(yearNum, monthNum - 1, dayNum);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }

        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function formatAustralianDate(value) {
    const parsed = parseDateInput(value);
    if (!parsed) {
        return typeof value === 'string' ? value : '';
    }

    return parsed.toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
    });
}

function formatAustralianTimestamp(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const formatted = formatter.format(date);
    return formatted.replace(', ', ' ');
}

// Function to validate event details against Google Calendar
async function validateEventDetails(eventData) {
    try {
        console.log('Validating event details against Google Calendar...');
        
        // Get environment variables
        const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (!apiKey || !calendarId) {
            console.warn('Google Calendar API not configured, skipping event validation');
            return { success: true }; // Allow through if calendar not configured
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

        const response = await fetch(url);
        
        if (!response.ok) {
            console.warn(`Google Calendar API error: ${response.status}, skipping validation`);
            return { success: true }; // Allow through if API fails
        }

        const data = await response.json();
        const calendarEvents = data.items || [];

        console.log(`Found ${calendarEvents.length} calendar events`);
        if (calendarEvents.length > 0) {
            console.log('First 3 calendar events:', calendarEvents.slice(0, 3).map(e => ({
                summary: e.summary,
                start: e.start?.dateTime || e.start?.date
            })));
        }

        // Validate each event in the submission
        const eventsToValidate = eventData.events || [{
            title: eventData.eventName,
            dateString: eventData.eventDate,
            location: eventData.eventLocation,
            time: eventData.eventTime
        }];

        const invalidEvents = [];

        for (const submittedEvent of eventsToValidate) {
            // Find matching event in Google Calendar
            const foundEvent = calendarEvents.find(calEvent => {
                const calendarTitle = calEvent.summary?.trim();
                const calendarDateValue = calEvent.start?.dateTime || calEvent.start?.date;

                if (!calendarTitle || !calendarDateValue) {
                    return false;
                }

                const submittedTitle = submittedEvent.title?.trim();
                const submittedDateRaw = submittedEvent.dateString || submittedEvent.date;
                const calendarDate = formatAustralianDate(calendarDateValue);
                const submittedDate = formatAustralianDate(submittedDateRaw);

                const titleMatch = calendarTitle.toLowerCase() === (submittedTitle ? submittedTitle.toLowerCase() : '');
                const dateMatch = calendarDate === submittedDate;

                console.log('Track reserve validation: comparing calendar event to submitted values', {
                    calendarTitle: JSON.stringify(calendarTitle),
                    submittedTitle: JSON.stringify(submittedTitle),
                    calendarDate: JSON.stringify(calendarDate),
                    submittedDate: JSON.stringify(submittedDate),
                    titleMatch,
                    dateMatch,
                    submittedTitleLength: submittedTitle ? submittedTitle.length : 0,
                    submittedDateLength: submittedDate ? submittedDate.length : 0,
                    calendarDateLength: calendarDate.length
                });

                if (!titleMatch) {
                    console.warn('⚠️  SECURITY: Event title mismatch detected', {
                        calendarTitle: JSON.stringify(calendarTitle),
                        submittedTitle: JSON.stringify(submittedTitle),
                        calendarTitleLength: calendarTitle.length,
                        submittedTitleLength: submittedTitle ? submittedTitle.length : 0
                    });
                }
                if (!dateMatch) {
                    console.warn('⚠️  SECURITY: Event date mismatch detected', {
                        calendarDate: JSON.stringify(calendarDate),
                        submittedDate: JSON.stringify(submittedDate),
                        calendarDateLength: calendarDate.length,
                        submittedDateLength: submittedDate ? submittedDate.length : 0
                    });
                }

                return titleMatch && dateMatch;
            });

            if (!foundEvent) {
                invalidEvents.push({
                    eventName: submittedEvent.title,
                    date: formatAustralianDate(submittedEvent.dateString || submittedEvent.date),
                    reason: 'Event not found in calendar'
                });
                continue;
            }

            // Validate pricing if provided
            if (eventData.ratePerRider) {
                const description = foundEvent.description || '';
                const defaultRate = 195;
                
                let actualRate = defaultRate;
                const rateMatch = description.match(/rate\s*[=:]\s*\$?(\d+)/i) || description.match(/\$(\d+)/);
                if (rateMatch) {
                    actualRate = parseInt(rateMatch[1]);
                }

                // For multi-event, check if the submitted rate makes sense
                const submittedRate = parseFloat(eventData.ratePerRider);
                const tolerance = 50; // Allow some variance for bundling/discounts
                
                if (Math.abs(submittedRate - actualRate) > tolerance && !eventData.multiEventRegistration) {
                    invalidEvents.push({
                        eventName: submittedEvent.title,
                        date: submittedEvent.dateString,
                        reason: `Rate mismatch: submitted $${submittedRate}, actual $${actualRate}`
                    });
                }
            }

            console.log('Event validated: submitted selection matched calendar event (details redacted)');
        }

        if (invalidEvents.length > 0) {
            console.warn('Event validation failed for submitted data (details redacted)');
            return {
                success: false,
                message: 'Event validation failed',
                invalidEvents: invalidEvents
            };
        }

        console.log('All events validated successfully');
        return { success: true };

    } catch (error) {
        console.error('Error validating event details:', error);
        // Don't block registration for validation errors, just log them
        return { success: true };
    }
}

// Function to check event availability before registration
async function checkEventAvailability(formData, riderCount) {
    try {
        // Initialize Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

        // Get current registration data
        const sheetData = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Event Registrations!A3:C', // Get timestamps, event names, and dates from Event Registrations sheet
        });

        const registrations = sheetData.data.values || [];
        
        // Determine which events to check
        let eventsToCheck = [];
        
        if (formData.events && Array.isArray(formData.events)) {
            // Events from frontend (URL parameters or calendar selection)
            eventsToCheck = formData.events.map(event => ({
                title: event.title || event.eventName,
                date: event.dateString || event.date,
                // Default capacity if not specified - you can adjust this or get from calendar
                maxSpots: event.maxSpots || 10 // Default to 10 spots per event
            }));
        } else {
            // Single event registration (legacy format)
            eventsToCheck = [{
                title: formData.eventName,
                date: formData.eventDate,
                maxSpots: formData.maxSpots || 10 // Default to 10 spots
            }];
        }

        const unavailableEvents = [];
        
        // Check each event
        for (const event of eventsToCheck) {
            // Count current registrations for this event by matching event name and date
            const currentRegistrations = registrations.filter(row => {
                const registeredEventName = row[1] || ''; // Column B: Event Name
                const registeredEventDate = row[2] || ''; // Column C: Event Date

                // Match by both event name and date for accuracy
                const eventNameMatch = registeredEventName.trim().toLowerCase() === event.title.trim().toLowerCase();
                const eventDateMatch = formatAustralianDate(registeredEventDate) === formatAustralianDate(event.date);

                return eventNameMatch && eventDateMatch;
            }).length;

            const spotsRemaining = event.maxSpots - currentRegistrations;
            
            console.log('Event availability summary (user selections redacted):', {
                maxSpots: event.maxSpots,
                currentRegistrations,
                spotsRemaining,
                requestedRiders: riderCount
            });
            
            if (spotsRemaining < riderCount) {
                unavailableEvents.push({
                    eventName: event.title,
                    date: event.date,
                    maxSpots: event.maxSpots,
                    currentRegistrations,
                    spotsRemaining,
                    ridersRequested: riderCount
                });
            }
        }

        if (unavailableEvents.length > 0) {
            // Generate detailed error message
            let message = `Registration failed due to insufficient availability:\n\n`;
            
            unavailableEvents.forEach(event => {
                if (event.spotsRemaining === 0) {
                    message += `• ${event.eventName} (${event.date}) is completely full (${event.currentRegistrations}/${event.maxSpots} spots taken)\n`;
                } else {
                    message += `• ${event.eventName} (${event.date}) only has ${event.spotsRemaining} spot${event.spotsRemaining !== 1 ? 's' : ''} remaining, but you're trying to register ${event.ridersRequested} rider${event.ridersRequested !== 1 ? 's' : ''}\n`;
                }
            });

            return {
                success: false,
                message: message.trim(),
                unavailableEvents
            };
        }

        return { success: true };

    } catch (error) {
        console.error('Error checking event availability:', error);
        // If there's an error checking availability, allow the registration to proceed
        // to avoid blocking legitimate registrations due to technical issues
        return { success: true };
    }
}

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['GET', 'POST', 'OPTIONS'],
        headers: ['Content-Type']
    });

    if (cors.handled) {
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check if this is an availability check request
        if (req.body.checkAvailability) {
            const { events, riderCount } = req.body;
            
            if (!events || events.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'No events selected' 
                });
            }

            if (!riderCount || riderCount < 1) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid rider count' 
                });
            }

            // Validate event details before checking availability
            console.log('Validating events:', JSON.stringify(events, null, 2));
            const eventValidation = await validateEventDetails({ events });
            console.log('Validation result:', JSON.stringify(eventValidation, null, 2));
            if (!eventValidation.success) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Event validation failed: ' + eventValidation.message,
                    invalidEvents: eventValidation.invalidEvents
                });
            }

            // Check availability for the selected events
            const availabilityResult = await checkEventAvailability(req.body, riderCount);
            
            if (!availabilityResult.success) {
                return res.status(200).json(availabilityResult);
            }
            
            return res.status(200).json({ 
                success: true, 
                message: 'Availability confirmed',
                availableSpots: availabilityResult.availableSpots 
            });
        }

        // Continue with regular registration processing
        const host = req.headers.host || '';
        const isDevelopment = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('192.168.');
        const botProtectionRequired = isLiveEnvironment() && !isDevelopment;

        if (botProtectionRequired) {
            const botCheck = await checkBotProtection(req, { feature: 'track-reserve' });
            if (botCheck.isBot) {
                console.warn('BotID blocked track reservation submission', {
                    feature: 'track-reserve',
                    action: botCheck.action,
                    skipped: botCheck.skipped
                });
                return res.status(403).json({
                    error: 'Suspicious activity detected. Please try again later.',
                    success: false
                });
            }
        } else {
            console.log('Skipping bot protection in non-live environment');
        }

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
        console.log('Received track reservation form submission (details redacted)');

        // **EVENT VALIDATION** - Validate event details against Google Calendar
        const eventValidation = await validateEventDetails(formData);
        if (!eventValidation.success) {
            return res.status(400).json({ 
                error: 'Event validation failed',
                details: eventValidation.message,
                invalidEvents: eventValidation.invalidEvents
            });
        }

        // Verify payment before processing registration
        if (!formData.paymentIntentId) {
            return res.status(400).json({ 
                error: 'Payment required',
                details: 'Payment must be completed before registration can be processed.'
            });
        }

        // Verify payment with Stripe
        try {
            const paymentIntent = await stripe.paymentIntents.retrieve(formData.paymentIntentId);
            
            if (paymentIntent.status !== 'succeeded') {
                return res.status(400).json({ 
                    error: 'Payment not completed',
                    details: 'Payment must be completed successfully before registration can be processed.',
                    paymentStatus: paymentIntent.status
                });
            }

            // Verify payment amount matches expected amount
            const expectedAmount = Math.round(parseFloat(formData.totalAmount) * 100); // Convert to cents
            if (paymentIntent.amount !== expectedAmount) {
                return res.status(400).json({ 
                    error: 'Payment amount mismatch',
                    details: 'Payment amount does not match registration total.'
                });
            }

            const maskedPaymentIntentId = typeof paymentIntent.id === 'string' && paymentIntent.id.length > 8
                ? `${paymentIntent.id.slice(0, 4)}...${paymentIntent.id.slice(-4)}`
                : '[redacted]';
            console.log('Payment verified successfully:', maskedPaymentIntentId);
        } catch (paymentError) {
            console.error('Payment verification error:', paymentError);
            return res.status(400).json({ 
                error: 'Payment verification failed',
                details: 'Unable to verify payment. Please try again or contact support.'
            });
        }
        
        // Collect all rider data
        const riders = [];
        let riderIndex = 1;
        
        while (formData[`riderFirstName${riderIndex}`]) {
            const rider = {
                firstName: formData[`riderFirstName${riderIndex}`] || '',
                lastName: formData[`riderLastName${riderIndex}`] || '',
                bikeNumber: formData[`bikeNumber${riderIndex}`] || '', // Optional field
                bikeSize: formData[`bikeSize${riderIndex}`] || '',
                dateOfBirth: formData[`dateOfBirth${riderIndex}`] || '', // Australian format DD/MM/YYYY
                email: formData[`riderEmail${riderIndex}`] || '', // Individual rider email
                phone: formData[`riderPhone${riderIndex}`] || ''  // Individual rider phone
            };
            riders.push(rider);
            riderIndex++;
        }

        // Prepare rows - one row per rider per event for multi-event, or one row per rider for single event
        const rows = [];
        
        // Check if this is a multi-event registration
        if (formData.multiEventRegistration && formData.events && Array.isArray(formData.events)) {
            // Multi-event registration: create one row for each event-rider combination
            for (const event of formData.events) {
                for (const rider of riders) {
                    const timestamp = formatAustralianTimestamp();
                    const formattedEventDate = formatAustralianDate(event.date || event.dateString);
                    const rowData = [
                        timestamp, // Column A: Timestamp (Australian format)
                        event.title || '', // Column B: Event Name (individual event)
                        formattedEventDate, // Column C: Event Date (from event data)
                        rider.firstName, // Column D: Rider First Name
                        rider.lastName, // Column E: Rider Last Name
                        rider.bikeNumber, // Column F: Bike Number (optional - empty if not provided)
                        rider.bikeSize, // Column G: Bike Size
                        rider.dateOfBirth, // Column H: Date of Birth
                        rider.email, // Column I: Rider Email (individual per rider, 18+ only)
                        rider.phone, // Column J: Rider Phone (individual per rider, 18+ only)
                        formData.contactFirstName || '', // Column K: Point of Contact First Name
                        formData.contactLastName || '', // Column L: Point of Contact Last Name
                        formData.contactEmail || '', // Column M: Point of Contact Email
                        formData.contactPhone || '', // Column N: Point of Contact Phone
                        formData.comments || '', // Column O: Additional Comments
                    ];
                    rows.push(rowData);
                }
            }
        } else {
            // Single event registration: one row per rider
            for (const rider of riders) {
                // Format dates in Australian format (DD/MM/YYYY)
                const timestamp = formatAustralianTimestamp();

                // Format event date - handle both Australian format (DD/MM/YYYY) and ISO format
                const formattedEventDate = formatAustralianDate(formData.eventDate);

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
                    formData.contactFirstName || '', // Column K: Point of Contact First Name
                    formData.contactLastName || '', // Column L: Point of Contact Last Name
                    formData.contactEmail || '', // Column M: Point of Contact Email
                    formData.contactPhone || '', // Column N: Point of Contact Phone
                    formData.comments || '', // Column O: Additional Comments
                ];
                rows.push(rowData);
            }
        }

        // If no riders, create one empty row with just contact info
        if (riders.length === 0) {
            const rowData = [
                formatAustralianTimestamp(), // Column A: Timestamp
                formData.eventName || '', // Column B: Event Name
                formatAustralianDate(formData.eventDate), // Column C: Event Date
                '', '', '', '', '', // Empty rider info (columns D-H)
                formData.riderEmail || '', // Column I: Rider Email
                formData.riderPhone || '', // Column J: Rider Phone
                formData.contactFirstName || '', // Column K: Point of Contact First Name
                formData.contactLastName || '', // Column L: Point of Contact Last Name
                formData.contactEmail || '', // Column M: Point of Contact Email
                formData.contactPhone || '', // Column N: Point of Contact Phone
                formData.comments || '', // Column O: Additional Comments
            ];
            rows.push(rowData);
        }

        // **AVAILABILITY CHECK** - Check current registrations and availability before proceeding
        const availabilityCheck = await checkEventAvailability(formData, riders.length);
        if (!availabilityCheck.success) {
            return res.status(400).json({ 
                error: 'Registration failed due to insufficient availability',
                details: availabilityCheck.message,
                unavailableEvents: availabilityCheck.unavailableEvents
            });
        }

        // Append all rows to the sheet
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Event Registrations!A3:O', // Start from row 3, columns A through O in Event Registrations sheet
            valueInputOption: 'RAW',
            requestBody: {
                values: rows, // Multiple rows for multiple riders
            },
        });

        // Send confirmation emails
        await sendConfirmationEmails(riders, formData);

        res.status(200).json({ 
            success: true, 
            message: 'Registration submitted successfully',
            sheetResponse: response.data,
            rowsCreated: rows.length
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

// Function to send confirmation emails
async function sendConfirmationEmails(riders, formData) {
    try {
        console.log('Sending confirmation emails for registration...');
        
        // Use a Map to track unique email addresses and their details
        const emailRecipients = new Map();

        const contactEmail = (formData.contactEmail || '').trim();

        if (contactEmail) {
            const contactName = `${formData.contactFirstName || ''} ${formData.contactLastName || ''}`.trim();
            emailRecipients.set(contactEmail, {
                email: contactEmail,
                name: contactName || 'Point of Contact',
                isRider: false
            });
        }

        const adminNotificationEmail = process.env.TO_EMAIL || 'inquiries@motocoach.com.au';

        if (adminNotificationEmail && !emailRecipients.has(adminNotificationEmail)) {
            emailRecipients.set(adminNotificationEmail, {
                email: adminNotificationEmail,
                name: 'Moto Coach Team',
                isRider: false
            });
        }

        // Convert Map to Array for processing
        const recipients = Array.from(emailRecipients.values());
        console.log(`Sending ${recipients.length} confirmation email(s)`);
        
        // Create rider names list for email
        
        // Send one email per unique recipient
        const emailPromises = recipients.map(recipient => 
            sendIndividualConfirmationEmail(recipient, formData, riders)
        );
        
        await Promise.all(emailPromises);
        console.log('All confirmation emails sent successfully');
        
    } catch (error) {
        console.error('Error sending confirmation emails:', error);
        // Don't throw - we don't want email failure to break the registration
    }
}

// Function to send individual confirmation email

async function sendIndividualConfirmationEmail(recipient, formData, riders) {
    try {
        console.log('Sending confirmation email to recipient (address redacted)');

        const multiEventRegistration = Boolean(formData.multiEventRegistration && Array.isArray(formData.events));
        const eventsSource = multiEventRegistration && Array.isArray(formData.events) && formData.events.length > 0
            ? formData.events
            : (Array.isArray(formData.events) && formData.events.length > 0
                ? formData.events
                : [{
                    title: formData.eventName,
                    dateString: formData.eventDate,
                    time: formData.eventTime,
                    location: formData.eventLocation
                }]);

        const normalizedEvents = eventsSource.map((event) => {
            const eventTitleRaw = event.title || formData.eventName || 'Track Session';
            const eventDateRaw = formatAustralianDate(event.dateString || event.date || formData.eventDate);
            const eventTimeRaw = event.time || formData.eventTime || '';
            const eventLocationRaw = event.location || formData.eventLocation || '';

            return {
                titleHtml: toSafeString(eventTitleRaw || 'Track Session'),
                titleText: toPlainText(eventTitleRaw || 'Track Session') || 'Track Session',
                dateHtml: toSafeString(eventDateRaw),
                dateText: toPlainText(eventDateRaw),
                timeHtml: toSafeString(eventTimeRaw),
                timeText: toPlainText(eventTimeRaw),
                locationHtml: toSafeString(eventLocationRaw),
                locationText: toPlainText(eventLocationRaw)
            };
        });

        const normalizedRiders = riders.map((rider, index) => {
            const safeFirstName = toSafeString(rider.firstName || '');
            const safeLastName = toSafeString(rider.lastName || '');
            const safeFullName = [safeFirstName, safeLastName].filter(Boolean).join(' ').trim() || toSafeString(`Rider ${index + 1}`);
            const plainFullName = toPlainText(`${rider.firstName || ''} ${rider.lastName || ''}`) || `Rider ${index + 1}`;
            const safeBikeSize = toSafeString(rider.bikeSize || '');
            const safeBikeNumber = rider.bikeNumber ? toSafeString(rider.bikeNumber) : '';
            const plainBikeSize = toPlainText(rider.bikeSize || '');
            const plainBikeNumber = rider.bikeNumber ? `#${toPlainText(rider.bikeNumber)}` : '';
            const riderEmail = (rider.email || '').trim();
            const riderPhone = (rider.phone || '').trim();
            const safeRiderEmail = riderEmail ? toSafeString(riderEmail) : '';
            const safeRiderPhone = riderPhone ? toSafeString(riderPhone) : '';

            return {
                label: `Rider ${index + 1}`,
                nameHtml: safeFullName,
                nameText: plainFullName,
                bikeHtml: [safeBikeSize, rider.bikeNumber ? `#${safeBikeNumber}` : ''].filter(Boolean).join(' • '),
                bikeText: [plainBikeSize, plainBikeNumber].filter(Boolean).join(' • '),
                emailHtml: riderEmail ? `<a href="mailto:${encodeURIComponent(riderEmail)}" style="color:#ff6b35; text-decoration:none;">${safeRiderEmail}</a>` : '',
                emailText: riderEmail ? riderEmail : '',
                phoneHtml: riderPhone ? `<a href="tel:${formatPhoneHref(riderPhone)}" style="color:#ff6b35; text-decoration:none;">${safeRiderPhone}</a>` : '',
                phoneText: riderPhone ? riderPhone : ''
            };
        });

        const recipientNameHtml = toSafeString(recipient.name || '') || toSafeString(recipient.isRider ? 'Rider' : 'Moto Coach Family');
        const recipientNameText = toPlainText(recipient.name || '') || (recipient.isRider ? 'Rider' : 'Moto Coach Family');

        const contactFullNameRaw = `${formData.contactFirstName || ''} ${formData.contactLastName || ''}`.trim();
        const contactFullNameHtml = toSafeString(contactFullNameRaw);
        const contactFullNameText = toPlainText(contactFullNameRaw);

        const contactEmail = (formData.contactEmail || '').trim();
        const contactEmailHtml = contactEmail ? toSafeString(contactEmail) : '';
        const contactEmailHref = contactEmail ? `mailto:${encodeURIComponent(contactEmail)}` : '';
        const contactPhone = (formData.contactPhone || '').trim();
        const contactPhoneHtml = contactPhone ? toSafeString(contactPhone) : '';
        const contactPhoneHref = contactPhone ? `tel:${formatPhoneHref(contactPhone)}` : '';

        const riderCount = riders.length;
        const safeRiderCount = toSafeString(String(riderCount));

        const totalAmountFormatted = formatCurrency(formData.totalAmount);
        const totalAmountHtml = totalAmountFormatted ? toSafeString(totalAmountFormatted) : '';
        const totalAmountText = totalAmountFormatted || '';

        const bookingSummaryRows = [
            { label: 'Point of Contact', value: contactFullNameHtml || 'N/A' },
            {
                label: 'Email',
                value: contactEmail && contactEmailHref
                    ? `<a href="${contactEmailHref}" style="color:#ff6b35; text-decoration:none;">${contactEmailHtml}</a>`
                    : 'N/A'
            },
            {
                label: 'Phone',
                value: contactPhone && contactPhoneHref
                    ? `<a href="${contactPhoneHref}" style="color:#ff6b35; text-decoration:none;">${contactPhoneHtml}</a>`
                    : 'N/A'
            },
            { label: 'Riders Registered', value: safeRiderCount || '0' },
            { label: 'Total Paid', value: totalAmountHtml || 'See payment receipt for details' }
        ];

        const bookingSummaryHtml = renderDetailRows(bookingSummaryRows);

        const eventsHtml = normalizedEvents.map((event, index) => {
            const scheduleParts = [event.dateHtml, event.timeHtml].filter(Boolean).join(' at ');
            return `
                <div style="padding: 16px 20px; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 12px; background-color: #f9fafb;">
                    <div style="font-size: 16px; font-weight: 600; color: #111827;">${event.titleHtml}</div>
                    ${scheduleParts ? `<div style="margin-top: 6px; font-size: 14px; color: #374151;">${scheduleParts}</div>` : ''}
                    ${event.locationHtml ? `<div style="margin-top: 6px; font-size: 14px; color: #6b7280;">${event.locationHtml}</div>` : ''}
                    <div style="margin-top: 10px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #9ca3af;">${toSafeString(`Event ${index + 1}`)}</div>
                </div>
            `;
        }).join('');

        const ridersHtml = normalizedRiders.length > 0
            ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                ${normalizedRiders.map((rider) => `
                    <tr>
                        <td style="width:140px; padding: 14px 16px; background-color:#f9fafb; font-weight:600; font-size:13px; color:#111827; border-right:1px solid #e5e7eb;">${toSafeString(rider.label)}</td>
                        <td style="padding:14px 18px; font-size:14px; color:#374151;">
                            <div style="font-weight:600; font-size:15px; color:#111827;">${rider.nameHtml}</div>
                            ${rider.bikeHtml ? `<div style="margin-top:6px; color:#6b7280; font-size:13px;">${rider.bikeHtml}</div>` : ''}
                            ${rider.emailHtml ? `<div style="margin-top:8px; font-size:13px;"><strong style="color:#111827;">Email:</strong> ${rider.emailHtml}</div>` : ''}
                            ${rider.phoneHtml ? `<div style="margin-top:4px; font-size:13px;"><strong style="color:#111827;">Phone:</strong> ${rider.phoneHtml}</div>` : ''}
                        </td>
                    </tr>
                `).join('')}
            </table>`
            : '<p style="margin:0; font-size:14px; color:#6b7280;">Rider information will be finalised shortly.</p>';

        const commentsPlain = toPlainText(formData.comments || '');
        const commentsHtml = commentsPlain
            ? `<div style="margin-top:24px; border:1px solid #e5e7eb; border-radius:12px; padding:20px; background-color:#fdfdfd;">
                    <p style="margin:0 0 12px; font-size:15px; font-weight:600; color:#111827;">Additional Notes</p>
                    <p style="margin:0; font-size:14px; line-height:1.7; color:#374151;">${toSafeMultilineString(formData.comments)}</p>
               </div>`
            : '';



        const eventsPlain = normalizedEvents.map((event, index) => {
            const scheduleParts = [event.dateText, event.timeText].filter(Boolean).join(' at ');
            const locationPart = event.locationText ? ` - ${event.locationText}` : '';
            const summary = scheduleParts ? `${scheduleParts}${locationPart}` : (event.locationText ? event.locationText : '');
            return [`Event ${index + 1}: ${event.titleText}`, summary].filter(Boolean).join('\n');
        }).join('\n\n');

        const ridersPlain = normalizedRiders.map((rider) => {
            const lines = [rider.nameText];
            if (rider.bikeText) {
                lines.push(rider.bikeText);
            }
            if (rider.emailText) {
                lines.push(`Email: ${rider.emailText}`);
            }
            if (rider.phoneText) {
                lines.push(`Phone: ${rider.phoneText}`);
            }
            return lines.join('\n');
        }).join('\n\n');

        const baseSubject = 'Moto Coach Event Reservation Confirmation';
        const subjectContext = normalizedEvents.length > 1
            ? `${normalizedEvents.length} Events`
            : (normalizedEvents[0]?.titleText || '');
        const subjectLine = subjectContext ? `${baseSubject} - ${subjectContext}` : baseSubject;

        const htmlEmail = `
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f7; padding:32px 0; font-family: 'Helvetica Neue', Arial, sans-serif;">
                <tr>
                    <td align="center" style="padding:0 16px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:24px; overflow:hidden; border:1px solid #f2f4f7; box-shadow:0 18px 38px rgba(15, 23, 42, 0.12);">
                            <tr>
                                <td style="padding:36px 24px 28px; text-align:center; background:linear-gradient(135deg, #fef3ec 0%, #ffffff 100%); border-bottom:1px solid #f5d0c5;">
                                    <img src="${LOGO_URL}" alt="Moto Coach" style="width:72px; height:auto; display:block; margin:0 auto 12px;" />
                                    <p style="margin:0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#ff6b35;">Moto Coach</p>
                                    <h1 style="margin:12px 0 0; font-size:24px; font-weight:700; color:#111827;">Event Reservation Confirmed</h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:32px 28px;">
                                    <p style="margin:0 0 20px; font-size:15px; color:#374151; line-height:1.6;">
                                        Hi ${recipientNameHtml},
                                    </p>
                                    <p style="margin:0 0 24px; font-size:15px; color:#374151; line-height:1.7;">
                                        Thank you for reserving your track time with Moto Coach. We've received your booking ${normalizedEvents.length > 1 ? 'for the events listed below.' : 'and locked in the details for your upcoming session.'}
                                    </p>
                                    <div style="margin:24px 0 0;">
                                        <p style="margin:0 0 8px; font-size:16px; font-weight:600; color:#111827;">Booking Summary</p>
                                        <div style="border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                                                ${bookingSummaryHtml}
                                            </table>
                                        </div>
                                    </div>
                                    <div style="margin-top:28px;">
                                        <p style="margin:0 0 8px; font-size:16px; font-weight:600; color:#111827;">Event Schedule</p>
                                        ${eventsHtml || '<p style="margin:0; font-size:14px; color:#6b7280;">Event details will be shared soon.</p>'}
                                    </div>
                                    <div style="margin-top:28px;">
                                        <p style="margin:0 0 8px; font-size:16px; font-weight:600; color:#111827;">Registered Riders</p>
                                        ${ridersHtml}
                                    </div>
                                    ${commentsHtml}
                                    <div style="margin-top:32px; padding:18px 20px; background-color:#f9fafb; border-radius:12px;">
                                        <p style="margin:0 0 12px; font-size:16px; font-weight:600; color:#111827;">What's Next?</p>
                                        <ul style="margin:0; padding-left:20px; color:#374151; line-height:1.6; font-size:14px;">
                                            <li>Final instructions will be sent out by email the day before training.</li>
                                            <li>Please arrive 15 minutes early for rider check-in.</li>
                                            <li>Bring full safety gear (helmet, boots, gloves).</li>
                                        </ul>
                                    </div>
                                    <div style="margin-top:28px; padding:16px 20px; background-color:#fef3ec; border-radius:12px;">
                                        <p style="margin:0; font-size:13px; color:#b45309;">Need to confirm your time slot? Email <a href="mailto:leigh@motocoach.com.au" style="color:#ff6b35; text-decoration:none;">leigh@motocoach.com.au</a> or contact us via <a href="https://motocoach.com.au/contact" style="color:#ff6b35; text-decoration:none;">motocoach.com.au/contact</a>.</p>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:20px 24px 28px; text-align:center; background-color:#111827; color:#f9fafb;">
                                    <p style="margin:0 0 8px; font-size:14px;">Questions? Email <a href="mailto:leigh@motocoach.com.au" style="color:#f97316; text-decoration:none;">leigh@motocoach.com.au</a></p>
                                    <p style="margin:0; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:rgba(249, 250, 251, 0.7);">Moto Coach Event Reservation</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        `;


        const plainTextLines = [
            'Moto Coach Event Reservation Confirmation',
            '',
            `Hi ${recipientNameText},`,
            '',
            normalizedEvents.length > 1
                ? 'Thank you for reserving your spot for the following Moto Coach events:'
                : 'Thank you for reserving your Moto Coach track session.',
            '',
            'Booking Summary:',
            `Point of Contact: ${contactFullNameText || 'N/A'}`,
            `Email: ${contactEmail || 'N/A'}`,
            `Phone: ${contactPhone || 'N/A'}`,
            `Riders: ${riderCount}`,
            totalAmountText ? `Total Paid: ${totalAmountText}` : '',
            '',
            'Event Schedule:',
            eventsPlain || 'Event details will be confirmed shortly.',
            '',
            'Registered Riders:',
            ridersPlain || 'Rider information is being finalised.',
            '',
            commentsPlain ? `Additional Notes:
${commentsPlain}` : '',
            commentsPlain ? '' : null,
            "What's Next?",
            "• Final instructions will be sent out by email the day before training",
            '• Arrive 15 minutes early for check-in',
            '• Bring full safety gear (helmet, boots, gloves)',
            '',
            'Questions? Email leigh@motocoach.com.au',
            '',
            '---',
            'Moto Coach Event Reservation'
        ].filter(Boolean);

        const plainTextMessage = plainTextLines.join('\n');

        const { error } = await resend.emails.send({
            from: 'Moto Coach <noreply@motocoach.com.au>',
            to: [recipient.email],
            subject: subjectLine,
            html: htmlEmail,
            text: plainTextMessage
        });

        if (error) {
            console.error('Error sending email to:', recipient.email, error);
        } else {
            console.log('Confirmation email sent successfully (recipient redacted)');
        }

    } catch (error) {
        console.error('Error sending individual email:', error);
    }
}

