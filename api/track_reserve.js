const { google } = require('googleapis');
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper function for fetch in case it's not available globally
const fetchPolyfill = async (url, options) => {
    if (typeof fetch !== 'undefined') {
        return fetch(url, options);
    }
    // Use node-fetch or other polyfill if needed
    const https = require('https');
    const querystring = require('querystring');
    
    return new Promise((resolve, reject) => {
        const data = options.body;
        const req = https.request(url, {
            method: options.method,
            headers: options.headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: () => Promise.resolve(JSON.parse(body))
                });
            });
        });
        
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
};

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
        // Verify reCAPTCHA v3 (skip in development)
        const { recaptchaToken } = req.body;
        
        // Get the host from headers to determine if this is development
        const host = req.headers.host || '';
        const isDevelopment = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('192.168.');
        const isProduction = host.includes('vercel.app') || host.includes('motocoach.com.au');
        
        if (!isDevelopment && !recaptchaToken) {
            return res.status(400).json({ error: 'reCAPTCHA verification is required' });
        }

        // Verify reCAPTCHA v3 with Google API (skip in development)
        if (!isDevelopment && recaptchaToken && isProduction) {
            try {
                const recaptchaVerifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
                const recaptchaVerification = await fetchPolyfill(recaptchaVerifyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
                });

                const recaptchaResult = await recaptchaVerification.json();
                
                if (!recaptchaResult.success) {
                    return res.status(400).json({ 
                        error: 'reCAPTCHA verification failed',
                        details: recaptchaResult['error-codes'] || 'Unknown error'
                    });
                }
                
                // For reCAPTCHA v3, check the score (0.0 = bot, 1.0 = human)
                const score = recaptchaResult.score || 0;
                console.log('reCAPTCHA v3 score:', score);
                
                // You can set your own threshold. Google recommends 0.5
                if (score < 0.5) {
                    console.warn(`Low reCAPTCHA score: ${score}. This might be a bot.`);
                    // For now, we'll log but not block. You can decide to block if needed.
                }
                
                console.log('reCAPTCHA v3 verification successful, score:', score);
                
            } catch (error) {
                console.error('reCAPTCHA verification error:', error);
                // Continue without blocking for now - you can decide to block if needed
            }
        } else if (isDevelopment) {
            console.log('Development mode: skipping reCAPTCHA verification');
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
                    const timestamp = new Date().toLocaleDateString('en-AU', {
                        day: '2-digit',
                        month: '2-digit', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    });
                    
                    const rowData = [
                        timestamp, // Column A: Timestamp (Australian format)
                        event.title || '', // Column B: Event Name (individual event)
                        event.date || '', // Column C: Event Date (from event data)
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
            }
        } else {
            // Single event registration: one row per rider
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
        console.log(`Sending ${recipients.length} confirmation email(s) to:`, recipients.map(r => r.email));
        
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
        console.log(`Sending confirmation email to: ${recipient.email}`);
        
        const logoUrl = 'https://motocoach.com.au/images/long%20logo.png'; // URL encode the space
        
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
                        <img src="${logoUrl}" alt="Moto Coach" style="max-width: 250px; height: auto; margin-bottom: 20px;" />
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
            `
        });

        if (error) {
            console.error('Error sending email to:', recipient.email, error);
        } else {
            console.log('Confirmation email sent to:', recipient.email);
        }

    } catch (error) {
        console.error('Error sending individual email:', error);
    }
}
