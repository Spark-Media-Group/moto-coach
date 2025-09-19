const { google } = require('googleapis');
import { Resend } from 'resend';
import { applyCors } from './_utils/cors';

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper function for reCAPTCHA verification
async function verifyRecaptcha(token) {
    try {
        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`
        });

        const data = await response.json();
        return data.success && data.score > 0.5; // reCAPTCHA v3 score threshold
    } catch (error) {
        console.error('reCAPTCHA verification error:', error);
        return false;
    }
}

// Function to send confirmation email to applicant
async function sendApplicantConfirmationEmail(formData, applicationId) {
    try {
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL,
            to: formData.email,
            subject: 'US Travel Program Application Received - Moto Coach',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
                    <div style="background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <img src="cid:logo" alt="Moto Coach" style="max-width: 200px; height: auto;">
                        </div>
                        
                        <h2 style="color: #ff6600; text-align: center; margin-bottom: 30px;">Application Received!</h2>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            Dear ${formData.firstName},
                        </p>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            Thank you for applying to the <strong>US Training Camp</strong> at ClubMX! 
                            We have successfully received your application.
                        </p>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <h3 style="color: #ff6600; margin-top: 0;">Application Details:</h3>
                            <p style="margin: 5px 0;"><strong>Application ID:</strong> ${applicationId}</p>
                            <p style="margin: 5px 0;"><strong>Name:</strong> ${formData.firstName} ${formData.lastName}</p>
                            <p style="margin: 5px 0;"><strong>Email:</strong> ${formData.email}</p>
                            <p style="margin: 5px 0;"><strong>Date of Birth:</strong> ${formData.dateOfBirth}</p>
                            <p style="margin: 5px 0;"><strong>Bike Choice:</strong> ${formData.bikeChoice}</p>
                            <p style="margin: 5px 0;"><strong>Bringing Supporter:</strong> ${formData.bringingSupporter === 'yes' ? 'Yes' : 'No'}</p>
                            ${formData.bringingSupporter === 'yes' ? `<p style="margin: 5px 0;"><strong>Number of Supporters:</strong> ${formData.supporterCount}</p>` : ''}
                        </div>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            <strong>What happens next?</strong>
                        </p>
                        
                        <ul style="color: #333; font-size: 16px; line-height: 1.6;">
                            <li>Our team will review your application within 2-3 business days</li>
                            <li>If there is an available spot, we will contact you to discuss next steps</li>
                            <li>We will provide detailed information about travel arrangements, accommodation, and program schedule</li>
                            <li>Payment and final confirmation details will be shared once your application is approved</li>
                        </ul>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            If you have any questions or need to update your application, please don't hesitate to contact us.
                        </p>
                        
                        <div style="background: #ff6600; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                            <h3 style="margin: 0 0 10px 0;">Ready for the Adventure?</h3>
                            <p style="margin: 0; font-size: 16px;">
                                Get ready for an unforgettable motorcycle training experience at ClubMX in the USA!
                            </p>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
                            Best regards,<br>
                            <strong>The Moto Coach Team</strong><br>
                            Sydney, Australia
                        </p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: 'logo.png',
                    path: './images/long-logo.png',
                    cid: 'logo'
                }
            ]
        });

        if (error) {
            console.error('Error sending applicant confirmation email:', error);
            return false;
        }

        console.log('Applicant confirmation email sent successfully:', data);
        return true;
    } catch (error) {
        console.error('Error in sendApplicantConfirmationEmail:', error);
        return false;
    }
}

// Function to send notification email to admin
async function sendAdminNotificationEmail(formData, applicationId) {
    try {
        // Format supporter information if applicable
        let supporterInfo = '';
        if (formData.bringingSupporter === 'yes') {
            supporterInfo = `
                <h3 style="color: #ff6600;">Supporter Information:</h3>
                <p><strong>Number of Supporters:</strong> ${formData.supporterCount}</p>
            `;
            
            // Add individual supporter details if they exist
            for (let i = 1; i <= parseInt(formData.supporterCount); i++) {
                if (formData[`supporterFirstName${i}`]) {
                    supporterInfo += `
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;">
                            <h4 style="margin-top: 0;">Supporter ${i}:</h4>
                            <p><strong>Name:</strong> ${formData[`supporterFirstName${i}`]} ${formData[`supporterLastName${i}`]}</p>
                            <p><strong>Date of Birth:</strong> ${formData[`supporterDateOfBirth${i}`]}</p>
                            <p><strong>Passport Number:</strong> ${formData[`supporterPassportNumber${i}`]}</p>
                        </div>
                    `;
                }
            }
        }

        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL,
            to: process.env.TO_EMAIL,
            subject: `New US Travel Program Application - ${formData.firstName} ${formData.lastName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
                    <div style="background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <img src="cid:logo" alt="Moto Coach" style="max-width: 200px; height: auto;">
                        </div>
                        
                        <h2 style="color: #ff6600; text-align: center; margin-bottom: 30px;">New US Travel Program Application</h2>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <p style="margin: 0; font-size: 18px; font-weight: bold; color: #ff6600;">Application ID: ${applicationId}</p>
                        </div>
                        
                        <h3 style="color: #ff6600;">Personal Information:</h3>
                        <p><strong>Name:</strong> ${formData.firstName} ${formData.lastName}</p>
                        <p><strong>Date of Birth:</strong> ${formData.dateOfBirth}</p>
                        <p><strong>Email:</strong> ${formData.email}</p>
                        <p><strong>Passport Number:</strong> ${formData.passportNumber}</p>
                        
                        <h3 style="color: #ff6600;">Program Details:</h3>
                        <p><strong>Bike Choice:</strong> ${formData.bikeChoice}</p>
                        <p><strong>Bringing Supporter:</strong> ${formData.bringingSupporter === 'yes' ? 'Yes' : 'No'}</p>
                        
                        ${supporterInfo}
                        
                        <h3 style="color: #ff6600;">Emergency Contact:</h3>
                        <p><strong>Name:</strong> ${formData.emergencyContact}</p>
                        <p><strong>Phone:</strong> ${formData.emergencyPhone}</p>
                        
                        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 30px 0;">
                            <h3 style="color: #28a745; margin-top: 0;">Next Steps:</h3>
                            <ul style="margin: 0;">
                                <li>Review the application details</li>
                                <li>Check availability for the program dates</li>
                                <li>Contact the applicant within 2-3 business days</li>
                                <li>Process passport documentation if approved</li>
                            </ul>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
                            Application submitted via Moto Coach website
                        </p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: 'logo.png',
                    path: './images/long-logo.png',
                    cid: 'logo'
                }
            ]
        });

        if (error) {
            console.error('Error sending admin notification email:', error);
            return false;
        }

        console.log('Admin notification email sent successfully:', data);
        return true;
    } catch (error) {
        console.error('Error in sendAdminNotificationEmail:', error);
        return false;
    }
}

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['POST', 'OPTIONS'],
        headers: ['Content-Type']
    });

    if (cors.handled) {
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const formData = req.body;
        console.log('Received US Travel Program application (details redacted)');

        // Validate required fields
        const requiredFields = [
            'firstName', 'lastName', 'dateOfBirth', 'email', 'bikeChoice',
            'passportNumber', 'bringingSupporter', 'emergencyContact', 'emergencyPhone'
        ];

        for (const field of requiredFields) {
            if (!formData[field]) {
                return res.status(400).json({ 
                    error: `Missing required field: ${field}`,
                    details: 'Please fill in all required fields.'
                });
            }
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            return res.status(400).json({ 
                error: 'Invalid email format',
                details: 'Please enter a valid email address.'
            });
        }

        // Validate supporter information if applicable
        if (formData.bringingSupporter === 'yes') {
            if (!formData.supporterCount) {
                return res.status(400).json({ 
                    error: 'Missing supporter count',
                    details: 'Please specify the number of supporters.'
                });
            }

            // Validate individual supporter details
            for (let i = 1; i <= parseInt(formData.supporterCount); i++) {
                const requiredSupporterFields = [
                    `supporterFirstName${i}`, `supporterLastName${i}`, 
                    `supporterDateOfBirth${i}`, `supporterPassportNumber${i}`
                ];
                
                for (const field of requiredSupporterFields) {
                    if (!formData[field]) {
                        return res.status(400).json({ 
                            error: `Missing supporter ${i} information`,
                            details: `Please fill in all details for supporter ${i}.`
                        });
                    }
                }
            }
        }

        // Verify reCAPTCHA
        if (!formData.recaptchaToken) {
            return res.status(400).json({ 
                error: 'Missing reCAPTCHA verification',
                details: 'Please complete the security verification.'
            });
        }

        const recaptchaValid = await verifyRecaptcha(formData.recaptchaToken);
        if (!recaptchaValid) {
            return res.status(400).json({ 
                error: 'reCAPTCHA verification failed',
                details: 'Security verification failed. Please try again.'
            });
        }

        // Generate unique application ID
        const applicationId = `USTRAV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // Initialize Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials: {
                type: 'service_account',
                project_id: process.env.GOOGLE_PROJECT_ID,
                private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                client_id: process.env.GOOGLE_CLIENT_ID,
                auth_uri: 'https://accounts.google.com/o/oauth2/auth',
                token_uri: 'https://oauth2.googleapis.com/token',
                auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL}`
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

        // Prepare data for Google Sheets
        const timestamp = new Date().toLocaleString('en-AU', {
            timeZone: 'Australia/Sydney',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        // Prepare supporter data
        let supporterData = '';
        if (formData.bringingSupporter === 'yes') {
            const supporters = [];
            for (let i = 1; i <= parseInt(formData.supporterCount); i++) {
                if (formData[`supporterFirstName${i}`]) {
                    supporters.push(`${formData[`supporterFirstName${i}`]} ${formData[`supporterLastName${i}`]} (DOB: ${formData[`supporterDateOfBirth${i}`]}, Passport: ${formData[`supporterPassportNumber${i}`]})`);
                }
            }
            supporterData = supporters.join('; ');
        }

        const rowData = [
            timestamp, // Column A: Timestamp
            applicationId, // Column B: Application ID
            formData.firstName, // Column C: First Name
            formData.lastName, // Column D: Last Name
            formData.dateOfBirth, // Column E: Date of Birth
            formData.email, // Column F: Email
            formData.bikeChoice, // Column G: Bike Choice
            formData.passportNumber, // Column H: Passport Number
            formData.bringingSupporter, // Column I: Bringing Supporter (Yes/No)
            formData.supporterCount || '', // Column J: Number of Supporters
            supporterData, // Column K: Supporter Details
            formData.emergencyContact, // Column L: Emergency Contact Name
            formData.emergencyPhone, // Column M: Emergency Contact Phone
            'Pending Review' // Column N: Application Status
        ];

        // Write to Google Sheets (create new sheet if it doesn't exist)
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'US Travel Applications!A2:N', // Start from row 2, columns A through N
                valueInputOption: 'RAW',
                requestBody: {
                    values: [rowData],
                },
            });
        } catch (sheetError) {
            // If sheet doesn't exist, create it
            if (sheetError.code === 400) {
                console.log('Creating new sheet for US Travel Applications...');
                
                // Create the new sheet
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: 'US Travel Applications'
                                }
                            }
                        }]
                    }
                });

                // Add headers
                const headers = [
                    'Timestamp', 'Application ID', 'First Name', 'Last Name', 'Date of Birth',
                    'Email', 'Bike Choice', 'Passport Number', 'Bringing Supporter',
                    'Number of Supporters', 'Supporter Details', 'Emergency Contact Name',
                    'Emergency Contact Phone', 'Application Status'
                ];

                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: 'US Travel Applications!A1:N1',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [headers],
                    },
                });

                // Now add the application data
                await sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: 'US Travel Applications!A2:N',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [rowData],
                    },
                });
            } else {
                throw sheetError;
            }
        }

        // Send confirmation emails
        const applicantEmailSent = await sendApplicantConfirmationEmail(formData, applicationId);
        const adminEmailSent = await sendAdminNotificationEmail(formData, applicationId);

        // Log email status
        console.log('Email Status:', {
            applicantEmail: applicantEmailSent ? 'sent' : 'failed',
            adminEmail: adminEmailSent ? 'sent' : 'failed'
        });

        res.status(200).json({ 
            success: true, 
            message: 'Application submitted successfully! You will receive a confirmation email shortly.',
            applicationId: applicationId,
            emailStatus: {
                applicantEmail: applicantEmailSent,
                adminEmail: adminEmailSent
            }
        });

    } catch (error) {
        console.error('Error processing US Travel Program application:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: 'An error occurred while processing your application. Please try again or contact support.'
        });
    }
}
