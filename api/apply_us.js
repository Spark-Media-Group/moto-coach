const { google } = require('googleapis');
import { Resend } from 'resend';
import { applyCors } from './_utils/cors';
import { isLiveEnvironment } from './_utils/environment';

const resend = new Resend(process.env.RESEND_API_KEY);

const LOGO_URL = 'https://motocoach.com.au/images/tall-logo-black.png';

const BIKE_CHOICE_LABELS = {
    'yamaha-yz250f': 'Yamaha YZ250F - $8,500',
    'honda-crf250r': 'Honda CRF250R - $8,200',
    'husky-tc250': 'Husky TC 250 - $8,800'
};

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

function toSafeMultilineString(value) {
    const sanitized = escapeHtml(String(value ?? '').trim());
    return sanitized.replace(/\r?\n/g, '<br>');
}

function normaliseBikeChoice(choice) {
    return BIKE_CHOICE_LABELS[choice] || choice || '';
}

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
        const safeFirstName = toSafeString(formData.firstName);
        const safeLastName = toSafeString(formData.lastName);
        const safeFullName = [safeFirstName, safeLastName].filter(Boolean).join(' ').trim();
        const safeEmail = toSafeString(formData.email);
        const safeDateOfBirth = toSafeString(formData.dateOfBirth);
        const safeBikeChoice = toSafeString(normaliseBikeChoice(formData.bikeChoice));
        const bringingSupporter = formData.bringingSupporter === 'yes' ? 'Yes' : 'No';
        const safeBringingSupporter = toSafeString(bringingSupporter);
        const safeSupporterCount = toSafeString(formData.supporterCount);
        const safeApplicationId = toSafeString(applicationId);
        const safeAdditionalComments = toSafeMultilineString(formData.additionalComments);

        const { data, error } = await resend.emails.send({
            from: 'Moto Coach <noreply@motocoach.com.au>',
            to: formData.email,
            subject: 'US Travel Program Inquiry Received - Moto Coach',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
                    <div style="background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <img src="cid:logo" alt="Moto Coach" style="max-width: 200px; height: auto;">
                        </div>

                        <h2 style="color: #ff6600; text-align: center; margin-bottom: 30px;">Inquiry Received!</h2>

                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            Dear ${safeFirstName || 'Rider'},
                        </p>

                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            Thank you for sending an inquiry to the <strong>US Travel Program</strong> at ClubMX! We have successfully received your details and will be in touch if a spot becomes available.
                        </p>

                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <h3 style="color: #ff6600; margin-top: 0;">Inquiry Details:</h3>
                            <p style="margin: 5px 0;"><strong>Inquiry ID:</strong> ${safeApplicationId}</p>
                            <p style="margin: 5px 0;"><strong>Name:</strong> ${safeFullName || 'Not provided'}</p>
                            <p style="margin: 5px 0;"><strong>Email:</strong> ${safeEmail || 'Not provided'}</p>
                            <p style="margin: 5px 0;"><strong>Date of Birth:</strong> ${safeDateOfBirth || 'Not provided'}</p>
                            <p style="margin: 5px 0;"><strong>Bike Choice:</strong> ${safeBikeChoice || 'Not provided'}</p>
                            <p style="margin: 5px 0;"><strong>Bringing Supporter:</strong> ${safeBringingSupporter || 'No'}</p>
                            ${formData.bringingSupporter === 'yes' ? `<p style="margin: 5px 0;"><strong>Number of Supporters:</strong> ${safeSupporterCount || 'Not provided'}</p>` : ''}
                            ${safeAdditionalComments ? `<p style="margin: 5px 0;"><strong>Additional Comments:</strong><br>${safeAdditionalComments}</p>` : ''}
                        </div>

                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            <strong>What happens next?</strong>
                        </p>

                        <ul style="color: #333; font-size: 16px; line-height: 1.6;">
                            <li>Our team will review your inquiry within 2-3 business days.</li>
                            <li>If there is an available spot, we will contact you to discuss next steps.</li>
                            <li>We will provide detailed information about travel arrangements, accommodation, and the program schedule once a place is confirmed.</li>
                        </ul>

                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            If you have any questions or need to update your inquiry, please don't hesitate to contact us.
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
        const safeFirstName = toSafeString(formData.firstName);
        const safeLastName = toSafeString(formData.lastName);
        const safeFullName = [safeFirstName, safeLastName].filter(Boolean).join(' ').trim() || 'Applicant';
        const safeEmail = toSafeString(formData.email);
        const safeDateOfBirth = toSafeString(formData.dateOfBirth);
        const safeBikeChoice = toSafeString(normaliseBikeChoice(formData.bikeChoice));
        const safePassportNumber = toSafeString(formData.passportNumber);
        const safeSupporterCount = toSafeString(formData.supporterCount);
        const safeEmergencyContact = toSafeString(formData.emergencyContact);
        const safeEmergencyPhone = toSafeString(formData.emergencyPhone);
        const safeApplicationId = toSafeString(applicationId);
        const bringingSupporter = formData.bringingSupporter === 'yes' ? 'Yes' : 'No';
        const safeBringingSupporter = toSafeString(bringingSupporter);
        const safeAdditionalComments = toSafeMultilineString(formData.additionalComments);

        const supporterDetails = [];
        if (formData.bringingSupporter === 'yes') {
            const supporterCount = parseInt(formData.supporterCount, 10);
            for (let i = 1; i <= supporterCount; i++) {
                if (formData[`supporterFirstName${i}`]) {
                    const supporterName = [
                        toSafeString(formData[`supporterFirstName${i}`]),
                        toSafeString(formData[`supporterLastName${i}`])
                    ].filter(Boolean).join(' ').trim();
                    const supporterDob = toSafeString(formData[`supporterDateOfBirth${i}`]);
                    const supporterPassport = toSafeString(formData[`supporterPassportNumber${i}`]);

                    supporterDetails.push(`
                        <div style="margin-bottom: 12px;">
                            <div style="font-weight: 600; color: #111827;">Supporter ${i}</div>
                            <div style="color: #374151; font-size: 14px; line-height: 1.5;">
                                ${supporterName ? `<div><strong>Name:</strong> ${supporterName}</div>` : ''}
                                ${supporterDob ? `<div><strong>Date of Birth:</strong> ${supporterDob}</div>` : ''}
                                ${supporterPassport ? `<div><strong>Passport Number:</strong> ${supporterPassport}</div>` : ''}
                            </div>
                        </div>
                    `);
                }
            }
        }

        const detailRows = [
            { label: 'Applicant', value: safeFullName },
            {
                label: 'Email',
                value: safeEmail
                    ? `<a href="mailto:${safeEmail}" style="color:#ff6b35; text-decoration:none;">${safeEmail}</a>`
                    : 'N/A'
            },
            { label: 'Date of Birth', value: safeDateOfBirth || 'N/A' },
            { label: 'Bike Choice', value: safeBikeChoice || 'N/A' },
            { label: 'Passport Number', value: safePassportNumber || 'N/A' },
            { label: 'Bringing Supporter', value: safeBringingSupporter || 'No' }
        ];

        if (formData.bringingSupporter === 'yes') {
            detailRows.push({ label: 'Number of Supporters', value: safeSupporterCount || 'N/A' });
            if (supporterDetails.length > 0) {
                detailRows.push({
                    label: 'Supporter Details',
                    value: supporterDetails.join('')
                });
            }
        }

        detailRows.push({ label: 'Emergency Contact Name', value: safeEmergencyContact || 'N/A' });
        detailRows.push({ label: 'Emergency Contact Phone', value: safeEmergencyPhone || 'N/A' });
        detailRows.push({ label: 'Additional Comments', value: safeAdditionalComments || 'None provided' });

        const detailRowsHtml = detailRows
            .map((row, index) => {
                const isLastRow = index === detailRows.length - 1;
                const borderBottom = isLastRow ? '' : 'border-bottom: 1px solid #e5e7eb;';
                return `
                    <tr>
                        <td style="padding: 12px 16px; background-color: #f9fafb; font-weight: 600; font-size: 14px; color: #111827; border-right: 1px solid #e5e7eb; ${borderBottom}">
                            ${escapeHtml(row.label)}
                        </td>
                        <td style="padding: 12px 16px; font-size: 14px; color: #374151; ${borderBottom}">
                            ${row.value || 'N/A'}
                        </td>
                    </tr>
                `;
            })
            .join('');

        const replyButtonLabel = safeFirstName || 'the applicant';
        const mailtoHref = formData.email ? `mailto:${encodeURIComponent(formData.email)}` : 'mailto:inquiries@motocoach.com.au';

        const attachments = [];

        if (formData.passportPicture && formData.passportPicture.data) {
            attachments.push({
                filename: formData.passportPicture.filename || 'passport-picture',
                content: formData.passportPicture.data,
                type: formData.passportPicture.contentType || 'application/octet-stream'
            });
        }

        const html = `
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f7; padding:32px 0; font-family: 'Helvetica Neue', Arial, sans-serif;">
                <tr>
                    <td align="center" style="padding:0 16px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:24px; overflow:hidden; border:1px solid #f2f4f7; box-shadow:0 18px 38px rgba(15, 23, 42, 0.12);">
                            <tr>
                                <td style="padding:36px 24px 28px; text-align:center; background:linear-gradient(135deg, #fef3ec 0%, #ffffff 100%); border-bottom:1px solid #f5d0c5;">
                                    <img src="${LOGO_URL}" alt="Moto Coach" style="width:72px; height:auto; display:block; margin:0 auto 12px;" />
                                    <p style="margin:0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#ff6b35;">Moto Coach</p>
                                    <h1 style="margin:12px 0 0; font-size:24px; font-weight:700; color:#111827;">New Inquiry - US Training Camp</h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:32px 28px;">
                                    <p style="margin:0 0 20px; font-size:15px; color:#374151; line-height:1.6;">
                                        ${safeFullName} has sent an inquiry for the US Training Camp at ClubMX.
                                    </p>
                                    <div style="margin:16px 0 24px; text-align:center;">
                                        <span style="display:inline-block; padding:8px 18px; border-radius:999px; background-color:#fff3eb; color:#c2410c; font-weight:600; text-transform:uppercase; letter-spacing:1px; font-size:12px;">Inquiry ID: ${safeApplicationId}</span>
                                    </div>
                                    <div style="margin:24px 0 0;">
                                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                                            <tbody>
                                                ${detailRowsHtml}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p style="margin:28px 0 24px; font-size:15px; color:#374151; line-height:1.6;">
                                        Please review the inquiry and respond to the applicant at your earliest convenience.
                                    </p>
                                    ${safeEmail ? `
                                        <div style="text-align:center; margin-bottom:24px;">
                                            <a href="${mailtoHref}" style="display:inline-block; padding:12px 28px; border-radius:999px; background-color:#ff6b35; color:#ffffff; font-weight:600; text-decoration:none;">Reply to ${replyButtonLabel}</a>
                                        </div>
                                    ` : ''}
                                    <p style="margin:0; font-size:13px; color:#6b7280; text-align:center;">
                                        This inquiry was submitted via the US Training Camp inquiry page on the Moto Coach website.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        `;

        const emailOptions = {
            from: 'Moto Coach Inquiries <inquiries@motocoach.com.au>',
            to: process.env.TO_EMAIL,
            subject: 'New Inquiry - US Training Camp',
            html,
            ...(attachments.length ? { attachments } : {})
        };

        const { data, error } = await resend.emails.send(emailOptions);

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
        const recaptchaRequired = isLiveEnvironment();
        console.log('Received US Travel Program inquiry (details redacted)');

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

        if (!formData.passportPicture || !formData.passportPicture.data) {
            return res.status(400).json({
                error: 'Missing passport picture',
                details: 'Please include your passport picture with the inquiry.'
            });
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

        if (recaptchaRequired) {
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
        } else {
            console.log('Skipping reCAPTCHA verification in non-live environment');
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

        const additionalComments = typeof formData.additionalComments === 'string'
            ? formData.additionalComments.trim()
            : '';

        formData.additionalComments = additionalComments;

        const rowData = [
            timestamp, // Column A: Timestamp
            applicationId, // Column B: Application ID
            formData.firstName, // Column C: First Name
            formData.lastName, // Column D: Last Name
            formData.dateOfBirth, // Column E: Date of Birth
            formData.email, // Column F: Email
            normaliseBikeChoice(formData.bikeChoice), // Column G: Bike Choice
            formData.passportNumber, // Column H: Passport Number
            formData.bringingSupporter, // Column I: Bringing Supporter (Yes/No)
            formData.supporterCount || '', // Column J: Number of Supporters
            supporterData, // Column K: Supporter Details
            formData.emergencyContact, // Column L: Emergency Contact Name
            formData.emergencyPhone, // Column M: Emergency Contact Phone
            additionalComments, // Column N: Additional Comments
            'Pending Review' // Column O: Application Status
        ];

        // Write to Google Sheets (create new sheet if it doesn't exist)
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'US Travel Applications!A2:O', // Start from row 2, columns A through O
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
                    'Emergency Contact Phone', 'Additional Comments', 'Application Status'
                ];

                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: 'US Travel Applications!A1:O1',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [headers],
                    },
                });

                // Now add the application data
                await sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: 'US Travel Applications!A2:O',
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
            message: "Inquiry submitted successfully! Thank you for your inquiry. We'll be in touch if there are openings.",
            applicationId: applicationId,
            emailStatus: {
                applicantEmail: applicantEmailSent,
                adminEmail: adminEmailSent
            }
        });

    } catch (error) {
        console.error('Error processing US Travel Program inquiry:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: 'An error occurred while processing your inquiry. Please try again or contact support.'
        });
    }
}
