import { Resend } from 'resend';
import { applyCors } from './_utils/cors';
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

function formatMultilineText(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
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
    const { firstName, lastName, email, phone, subject, message } = req.body;
    const botProtectionRequired = isLiveEnvironment();

    console.log('Contact form submission received:', {
      hasFirstName: !!firstName,
      hasLastName: !!lastName,
      hasEmail: !!email,
      hasSubject: !!subject,
      hasMessage: !!message
    });

    // Validate required fields
    if (!firstName || !lastName || !email || !subject || !message) {
      console.log('Missing required fields');
      return res.status(400).json({ 
        error: 'Missing required fields. Please fill in all required fields.' 
      });
    }

    if (botProtectionRequired) {
      const botCheck = await checkBotProtection(req, { feature: 'contact-form' });
      if (botCheck.isBot) {
        console.warn('BotID blocked contact form submission', {
          feature: 'contact-form',
          action: botCheck.action,
          skipped: botCheck.skipped
        });
        return res.status(403).json({
          error: 'Suspicious activity detected. Please try again later.'
        });
      }
    } else {
      console.log('Skipping bot protection in non-live environment');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Please enter a valid email address.' 
      });
    }

    // Map subject values to readable text
    const subjectMap = {
      'professional-coaching': 'Professional Coaching',
      'us-travel-program': 'US Training Camp',
      'certification': 'Coach Certification',
      'general': 'General Inquiry',
      'other': 'Other'
    };

    const subjectText = subjectMap[subject] || subject;

    const normalizedEmail = String(email).trim();
    const normalizedSubject = String(subjectText).trim();

    const plainFullName = [firstName, lastName]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join(' ');

    const fullName = [firstName, lastName]
      .filter(Boolean)
      .map((value) => escapeHtml(String(value).trim()))
      .filter(Boolean)
      .join(' ');
    const safeEmail = escapeHtml(normalizedEmail);
    const safeSubject = escapeHtml(normalizedSubject);

    const contactRows = [
      { label: 'Name', value: fullName || 'N/A' },
      {
        label: 'Email',
        value: `<a href="mailto:${safeEmail}" style="color:#ff6b35; text-decoration:none;">${safeEmail}</a>`
      }
    ];

    if (phone) {
      const phoneValue = String(phone);
      const safePhoneDisplay = escapeHtml(phoneValue);
      const phoneHref = phoneValue.replace(/[^+\d]/g, '') || phoneValue;
      contactRows.push({
        label: 'Phone',
        value: `<a href="tel:${phoneHref}" style="color:#ff6b35; text-decoration:none;">${safePhoneDisplay}</a>`
      });
    }

    contactRows.push({ label: 'Subject', value: safeSubject });

    const contactRowsHtml = contactRows
      .map((row, index) => {
        const isLastRow = index === contactRows.length - 1;
        const borderBottom = isLastRow ? '' : 'border-bottom: 1px solid #e5e7eb;';
        return `
          <tr>
            <td style="padding: 12px 16px; background-color: #f9fafb; font-weight: 600; font-size: 14px; color: #111827; border-right: 1px solid #e5e7eb; ${borderBottom}">
              ${escapeHtml(row.label)}
            </td>
            <td style="padding: 12px 16px; font-size: 14px; color: #374151; ${borderBottom}">
              ${row.value}
            </td>
          </tr>
        `;
      })
      .join('');

    const messageContent = typeof message === 'string' ? message : String(message ?? '');
    const formattedMessage = formatMultilineText(messageContent);
    const safeFirstName = escapeHtml(String(firstName || '').trim());
    const replyButtonLabel = safeFirstName || 'the sender';

    const htmlEmail = `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f7; padding:32px 0; font-family: 'Helvetica Neue', Arial, sans-serif;">
        <tr>
          <td align="center" style="padding:0 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:24px; overflow:hidden; border:1px solid #f2f4f7; box-shadow:0 18px 38px rgba(15, 23, 42, 0.12);">
              <tr>
                <td style="padding:36px 24px 28px; text-align:center; background:linear-gradient(135deg, #fef3ec 0%, #ffffff 100%); border-bottom:1px solid #f5d0c5;">
                  <img src="${LOGO_URL}" alt="Moto Coach" style="width:72px; height:auto; display:block; margin:0 auto 12px;" />
                  <p style="margin:0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#ff6b35;">Moto Coach</p>
                  <h1 style="margin:12px 0 0; font-size:24px; font-weight:700; color:#111827;">New Contact Form Submission</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px 28px;">
                  <p style="margin:0 0 20px; font-size:15px; color:#374151; line-height:1.6;">
                    You have received a new inquiry from the Moto Coach website contact page. The details are below.
                  </p>
                  <div style="margin:16px 0 24px; text-align:center;">
                    <span style="display:inline-block; padding:8px 18px; border-radius:999px; background-color:#fff3eb; color:#c2410c; font-weight:600; text-transform:uppercase; letter-spacing:1px; font-size:12px;">${safeSubject}</span>
                  </div>
                  <div style="margin:24px 0 0;">
                    <p style="margin:0 0 8px; font-size:16px; font-weight:600; color:#111827;">Contact Information</p>
                    <div style="border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                        ${contactRowsHtml}
                      </table>
                    </div>
                  </div>
                  <div style="margin-top:24px; border:1px solid #e5e7eb; border-radius:12px; padding:20px; background-color:#fdfdfd;">
                    <p style="margin:0 0 12px; font-size:16px; font-weight:600; color:#111827;">Message</p>
                    <p style="margin:0; font-size:15px; line-height:1.7; color:#374151;">${formattedMessage}</p>
                  </div>
                  <div style="margin-top:24px; text-align:center;">
                    <a href="mailto:${safeEmail}" style="display:inline-block; padding:12px 26px; border-radius:999px; background-color:#ff6b35; color:#ffffff; font-weight:600; text-decoration:none; letter-spacing:0.5px;">Reply to ${replyButtonLabel}</a>
                  </div>
                  <div style="margin-top:28px; padding:16px 20px; background-color:#f9fafb; border-radius:12px;">
                    <p style="margin:0; font-size:13px; color:#6b7280;">This email was sent because a visitor submitted the contact form on <a href="https://motocoach.com.au" style="color:#ff6b35; text-decoration:none;">motocoach.com.au</a>.</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;

    const plainTextMessage = `New Contact Form Submission - ${normalizedSubject}\n\nName: ${plainFullName}\nEmail: ${normalizedEmail}\n${phone ? `Phone: ${phone}\n` : ''}Subject: ${normalizedSubject}\n\nMessage:\n${messageContent}\n\n---\nThis message was sent from the Moto Coach website contact form.`;

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: 'Moto Coach <inquiries@motocoach.com.au>',
      to: [process.env.TO_EMAIL || 'inquiries@motocoach.com.au'],
      subject: `New Contact Form Submission - ${normalizedSubject}`,
      html: htmlEmail,
      text: plainTextMessage
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ 
        error: 'Failed to send email. Please try again later.' 
      });
    }

    // Send success response
    return res.status(200).json({ 
      message: 'Thank you for your message! We\'ll get back to you soon.',
      messageId: data.id 
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred. Please try again later.' 
    });
  }
}
