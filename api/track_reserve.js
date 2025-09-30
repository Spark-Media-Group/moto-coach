const { google } = require('googleapis');
import { Resend } from 'resend';
import { applyCors } from './_utils/cors';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
import { isLiveEnvironment } from './_utils/environment';
import { checkBotProtection } from './_utils/botid';

const resend = new Resend(process.env.RESEND_API_KEY);

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
        day: '2-digit',
        month: '2-digit',
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
                if (!calEvent.summary || !calEvent.start?.dateTime) return false;

                const calEventTitle = calEvent.summary.trim();
                const calEventStartDate = new Date(calEvent.start.dateTime);
                // Use same non-padded format as calendar.js
                const calEventDateString = `${calEventStartDate.getDate()}/${calEventStartDate.getMonth() + 1}/${calEventStartDate.getFullYear()}`;

                const submittedTitle = submittedEvent.title?.trim();
                const submittedDate = submittedEvent.dateString?.trim();
                const titleMatch = calEventTitle === submittedTitle;
                const dateMatch = calEventDateString === submittedDate;

                console.log('Track reserve validation: comparing calendar event to submitted values (details redacted)', {
                    titleMatch,
                    dateMatch,
                    submittedTitleLength: submittedTitle ? submittedTitle.length : 0,
                    submittedDateLength: submittedDate ? submittedDate.length : 0
                });

                if (!titleMatch) {
                    console.warn('⚠️  SECURITY: Event title mismatch detected (values redacted)', {
                        calendarTitleLength: calEventTitle.length,
                        submittedTitleLength: submittedTitle ? submittedTitle.length : 0
                    });
                }
                if (!dateMatch) {
                    console.warn('⚠️  SECURITY: Event date mismatch detected (values redacted)', {
                        calendarDateLength: calEventDateString.length,
                        submittedDateLength: submittedDate ? submittedDate.length : 0
                    });
                }

                return titleMatch && dateMatch;
            });

            if (!foundEvent) {
                invalidEvents.push({
                    eventName: submittedEvent.title,
                    date: submittedEvent.dateString,
                    reason: 'Event not found in calendar'
                });
                continue;
            }

            // Validate pricing if provided
            if (eventData.ratePerRider) {
                const description = foundEvent.description || '';
                const defaultRate = 190;
                
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
                const eventDateMatch = registeredEventDate === event.date;
                
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
            const eventValidation = await validateEventDetails({ events });
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
                        formData.contactFirstName || '', // Column K: Parent/Contact First Name
                        formData.contactLastName || '', // Column L: Parent/Contact Last Name
                        formData.contactEmail || '', // Column M: Parent/Contact Email
                        formData.contactPhone || '', // Column N: Parent/Contact Phone
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
                    formData.contactFirstName || '', // Column K: Parent/Contact First Name
                    formData.contactLastName || '', // Column L: Parent/Contact Last Name
                    formData.contactEmail || '', // Column M: Parent/Contact Email
                    formData.contactPhone || '', // Column N: Parent/Contact Phone
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
                formData.contactFirstName || '', // Column K: Parent/Contact First Name
                formData.contactLastName || '', // Column L: Parent/Contact Last Name
                formData.contactEmail || '', // Column M: Parent/Contact Email
                formData.contactPhone || '', // Column N: Parent/Contact Phone
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
        
        for (const rider of riders) {
            if (rider.dateOfBirth) {
                // Parse Australian date format DD/MM/YYYY
                const [day, month, year] = rider.dateOfBirth.split('/');
                const dob = new Date(year, month - 1, day);
                const today = new Date();
                
                let age = today.getFullYear() - dob.getFullYear();
                const monthDiff = today.getMonth() - dob.getMonth();
                
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                    age--;
                }
                
                // If rider is 18+ and has email, send to rider
                if (age >= 18 && rider.email && !emailRecipients.has(rider.email)) {
                    emailRecipients.set(rider.email, {
                        email: rider.email,
                        name: `${rider.firstName} ${rider.lastName}`,
                        isRider: true
                    });
                }
            }
        }
        
        // Always send to parent/emergency contact
        if (formData.contactEmail && !emailRecipients.has(formData.contactEmail)) {
            emailRecipients.set(formData.contactEmail, {
                email: formData.contactEmail,
                name: `${formData.contactFirstName} ${formData.contactLastName}`,
                isRider: false
            });
        }
        
        // Convert Map to Array for processing
        const recipients = Array.from(emailRecipients.values());
        console.log(`Sending ${recipients.length} confirmation email(s)`);
        
        // Create rider names list for email
        const riderNames = riders.map(rider => `${rider.firstName} ${rider.lastName}`).join(', ');
        
        // Send one email per unique recipient
        const emailPromises = recipients.map(recipient => 
            sendIndividualConfirmationEmail(recipient, formData, riderNames, riders)
        );
        
        await Promise.all(emailPromises);
        console.log('All confirmation emails sent successfully');
        
    } catch (error) {
        console.error('Error sending confirmation emails:', error);
        // Don't throw - we don't want email failure to break the registration
    }
}

// Function to send individual confirmation email
async function sendIndividualConfirmationEmail(recipient, formData, riderNames, riders) {
    try {
        console.log('Sending confirmation email to recipient (address redacted)');
        
        // Create a subject line that indicates multi-event if applicable
        const subjectLine = formData.multiEventRegistration && formData.events && formData.events.length > 1 
            ? `Track Reservation Confirmation - ${formData.events.length} Events` 
            : `Track Reservation Confirmation - ${formData.eventName || formData.events?.[0]?.title || 'Event'}`;
        
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
            to: [recipient.email],
            subject: subjectLine,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #ff6b35 0%, #ff8a5c 100%); padding: 40px 30px; text-align: center;">
                        <img src="cid:moto-coach-logo" alt="Moto Coach" style="max-width: 250px; height: auto; margin-bottom: 20px;" />
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 1px;">Registration Confirmed</h1>
                    </div>
                    
                    <!-- Main Content -->
                    <div style="padding: 40px 30px;">
                        <p style="font-size: 18px; color: #333; margin: 0 0 30px 0; line-height: 1.6;">
                            Hi ${recipient.name},<br><br>
                            Your registration is confirmed! We're excited to see ${riderNames} on the track.
                        </p>
                        
                        <!-- Event Details -->
                        <h3 style="color: #ff6b35; margin: 30px 0 20px 0; font-size: 20px; border-bottom: 2px solid #ff6b35; padding-bottom: 8px;">
                            ${formData.multiEventRegistration && formData.events && formData.events.length > 1 ? 'Your Events' : 'Event Details'}
                        </h3>
                        ${formData.multiEventRegistration && formData.events ? 
                            // Multi-event registration - simple list
                            formData.events.map(event => `
                                <div style="margin: 20px 0; padding: 15px 0; border-bottom: 1px solid #eee;">
                                    <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 8px;">${event.title}</div>
                                    <div style="color: #666; font-size: 16px;">
                                        ${event.date}${event.time ? ` at ${event.time}` : ''}
                                        ${event.location ? `<br>${event.location}` : ''}
                                    </div>
                                </div>
                            `).join('')
                            :
                            // Single event registration - simple layout
                            `<div style="margin: 20px 0;">
                                <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 8px;">${formData.eventName}</div>
                                <div style="color: #666; font-size: 16px; line-height: 1.6;">
                                    ${formData.eventDate}${formData.eventTime ? ` at ${formData.eventTime}` : ''}
                                    ${formData.eventLocation ? `<br>${formData.eventLocation}` : ''}
                                </div>
                            </div>`
                        }
                        
                        <!-- Riders -->
                        <h3 style="color: #333; margin: 40px 0 20px 0; font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">Registered Riders</h3>
                        ${riders.map(rider => `
                            <div style="margin: 15px 0; padding: 10px 0;">
                                <span style="font-weight: 600; color: #333; font-size: 16px;">${rider.firstName} ${rider.lastName}</span>
                                <span style="color: #666; font-size: 14px; margin-left: 15px;">${rider.bikeSize}${rider.bikeNumber ? ` • #${rider.bikeNumber}` : ''}</span>
                            </div>
                        `).join('')}
                        
                        <!-- Next Steps -->
                        <h3 style="color: #333; margin: 40px 0 20px 0; font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">What's Next?</h3>
                        <div style="color: #333; line-height: 1.8; font-size: 15px; margin: 20px 0;">
                            • We'll confirm availability and send session details<br>
                            • Arrive 15 minutes early for check-in<br>
                            • Bring safety gear (helmet, boots, gloves)
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background-color: #2c3e50; padding: 30px; text-align: center; color: #95a5a6;">
                        <div style="font-size: 16px; margin-bottom: 10px;">
                            Questions? <a href="mailto:leigh@motocoach.com.au" style="color: #ff6b35; text-decoration: none;">leigh@motocoach.com.au</a>
                        </div>
                        <div style="font-size: 13px; opacity: 0.8;">
                            Moto Coach Track Reservation System
                        </div>
                    </div>
                </div>
            `,
            text: `
MOTO COACH - REGISTRATION CONFIRMED

Hi ${recipient.name},

Your registration is confirmed! We're excited to see ${riderNames} on the track.

EVENT DETAILS:
${formData.multiEventRegistration && formData.events ? 
    formData.events.map(event => `${event.title}
${event.date}${event.time ? ` at ${event.time}` : ''}${event.location ? ` - ${event.location}` : ''}`).join('\n\n')
    :
    `${formData.eventName}
${formData.eventDate}${formData.eventTime ? ` at ${formData.eventTime}` : ''}${formData.eventLocation ? ` - ${formData.eventLocation}` : ''}`
}

REGISTERED RIDERS:
${riders.map(rider => `${rider.firstName} ${rider.lastName} (${rider.bikeSize}${rider.bikeNumber ? `, #${rider.bikeNumber}` : ''})`).join('\n')}

WHAT'S NEXT?
• We'll confirm availability and send session details
• Arrive 15 minutes early for check-in
• Bring safety gear (helmet, boots, gloves)

Questions? Contact us at leigh@motocoach.com.au

---
Moto Coach Track Reservation System
            `,
            attachments: [
                {
                    path: 'https://motocoach.com.au/images/long%20logo.png',
                    filename: 'moto-coach-logo.png',
                    contentId: 'moto-coach-logo',
                }
            ]
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
