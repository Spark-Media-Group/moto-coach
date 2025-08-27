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
        // Verify reCAPTCHA first (skip in development)
        const { recaptchaResponse } = req.body;
        
        // Get the host from headers to determine if this is development
        const host = req.headers.host || '';
        const isDevelopment = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('192.168.');
        const isProduction = host.includes('vercel.app') || host.includes('motocoach.com.au');
        
        if (!isDevelopment && !recaptchaResponse) {
            return res.status(400).json({ error: 'reCAPTCHA verification is required' });
        }

        // Verify reCAPTCHA with Google (skip in development)
        if (!isDevelopment && recaptchaResponse && isProduction) {
            const recaptchaVerifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
            const recaptchaVerification = await fetchPolyfill(recaptchaVerifyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaResponse}`
            });

            const recaptchaResult = await recaptchaVerification.json();
            
            if (!recaptchaResult.success) {
                return res.status(400).json({ 
                    error: 'reCAPTCHA verification failed',
                    details: recaptchaResult['error-codes'] 
                });
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

        // Send confirmation emails
        await sendConfirmationEmails(riders, formData);

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

// Function to send confirmation emails
async function sendConfirmationEmails(riders, formData) {
    try {
        // Calculate age for each rider to determine email recipients
        const emailRecipients = new Set(); // Use Set to avoid duplicate emails
        
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
                if (age >= 18 && rider.email) {
                    emailRecipients.add({
                        email: rider.email,
                        name: `${rider.firstName} ${rider.lastName}`,
                        isRider: true
                    });
                }
            }
        }
        
        // Always send to parent/emergency contact if we have young riders or as backup
        if (formData.contactEmail) {
            emailRecipients.add({
                email: formData.contactEmail,
                name: `${formData.contactFirstName} ${formData.contactLastName}`,
                isRider: false
            });
        }
        
        // Create rider names list for email
        const riderNames = riders.map(rider => `${rider.firstName} ${rider.lastName}`).join(', ');
        
        // Send emails to all recipients
        const emailPromises = Array.from(emailRecipients).map(recipient => 
            sendIndividualConfirmationEmail(recipient, formData, riderNames, riders)
        );
        
        await Promise.all(emailPromises);
        
    } catch (error) {
        console.error('Error sending confirmation emails:', error);
        // Don't throw - we don't want email failure to break the registration
    }
}

// Function to send individual confirmation email
async function sendIndividualConfirmationEmail(recipient, formData, riderNames, riders) {
    try {
        const logoUrl = 'https://motocoach.com.au/images/long%20logo.png'; // URL encode the space
        
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
            to: [recipient.email],
            subject: `Track Reservation Confirmation - ${formData.eventName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <!-- Header with Logo -->
                    <div style="text-align: center; margin-bottom: 30px;">
                        <img src="${logoUrl}" alt="Moto Coach" style="max-width: 300px; height: auto;" />
                    </div>
                    
                    <h2 style="color: #ff6b35; border-bottom: 2px solid #ff6b35; padding-bottom: 10px; text-align: center;">
                        Track Reservation Confirmation
                    </h2>
                    
                    <p style="font-size: 16px; color: #333;">
                        Dear ${recipient.name},
                    </p>
                    
                    <p style="font-size: 16px; color: #333; line-height: 1.6;">
                        Thank you for your track reservation! We're excited to have ${riderNames} join us for this training session.
                    </p>
                    
                    <!-- Event Details -->
                    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff6b35;">
                        <h3 style="margin-top: 0; color: #ff6b35;">Session Details</h3>
                        <p><strong>Event:</strong> ${formData.eventName}</p>
                        <p><strong>Date:</strong> ${formData.eventDate}</p>
                        ${formData.eventTime ? `<p><strong>Time:</strong> ${formData.eventTime}</p>` : ''}
                        ${formData.eventLocation ? `<p><strong>Location:</strong> ${formData.eventLocation}</p>` : ''}
                    </div>
                    
                    <!-- Rider Information -->
                    <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #333;">Registered Riders</h3>
                        ${riders.map(rider => `
                            <div style="margin-bottom: 15px; padding: 10px; background-color: #f8f8f8; border-radius: 4px;">
                                <p style="margin: 5px 0;"><strong>Name:</strong> ${rider.firstName} ${rider.lastName}</p>
                                <p style="margin: 5px 0;"><strong>Bike Size:</strong> ${rider.bikeSize}</p>
                                ${rider.bikeNumber ? `<p style="margin: 5px 0;"><strong>Bike Number:</strong> ${rider.bikeNumber}</p>` : ''}
                                <p style="margin: 5px 0;"><strong>Date of Birth:</strong> ${rider.dateOfBirth}</p>
                            </div>
                        `).join('')}
                    </div>
                    
                    <!-- Contact Information -->
                    <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #333;">Emergency Contact</h3>
                        <p><strong>Name:</strong> ${formData.contactFirstName} ${formData.contactLastName}</p>
                        <p><strong>Email:</strong> ${formData.contactEmail}</p>
                        <p><strong>Phone:</strong> ${formData.contactPhone}</p>
                    </div>
                    
                    <!-- What's Next -->
                    <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffeeba;">
                        <h3 style="margin-top: 0; color: #856404;">What's Next?</h3>
                        <ul style="color: #856404; line-height: 1.6;">
                            <li>We will review your registration and confirm availability</li>
                            <li>You'll receive a follow-up email with detailed session information</li>
                            <li>Please arrive 15 minutes early for check-in</li>
                            <li>Bring appropriate safety gear (helmet, boots, gloves, etc.)</li>
                        </ul>
                    </div>
                    
                    <!-- Footer -->
                    <div style="margin-top: 30px; padding: 20px; background-color: #1a1a1a; color: #ccc; border-radius: 8px; text-align: center;">
                        <p style="margin: 0; font-size: 14px;">
                            Questions? Contact us at <a href="mailto:leigh@motocoach.com.au" style="color: #ff6b35;">leigh@motocoach.com.au</a>
                        </p>
                        <p style="margin: 10px 0 0 0; font-size: 12px;">
                            This confirmation was sent from Moto Coach Track Reservation System
                        </p>
                    </div>
                </div>
            `,
            text: `
TRACK RESERVATION CONFIRMATION

Dear ${recipient.name},

Thank you for your track reservation! We're excited to have ${riderNames} join us for this training session.

SESSION DETAILS:
Event: ${formData.eventName}
Date: ${formData.eventDate}
${formData.eventTime ? `Time: ${formData.eventTime}` : ''}
${formData.eventLocation ? `Location: ${formData.eventLocation}` : ''}

REGISTERED RIDERS:
${riders.map(rider => `
- ${rider.firstName} ${rider.lastName}
  Bike Size: ${rider.bikeSize}
  ${rider.bikeNumber ? `Bike Number: ${rider.bikeNumber}` : ''}
  Date of Birth: ${rider.dateOfBirth}
`).join('')}

EMERGENCY CONTACT:
Name: ${formData.contactFirstName} ${formData.contactLastName}
Email: ${formData.contactEmail}
Phone: ${formData.contactPhone}

WHAT'S NEXT?
- We will review your registration and confirm availability
- You'll receive a follow-up email with detailed session information
- Please arrive 15 minutes early for check-in
- Bring appropriate safety gear (helmet, boots, gloves, etc.)

Questions? Contact us at leigh@motocoach.com.au

This confirmation was sent from Moto Coach Track Reservation System
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
