import { Resend } from 'resend';
import { applyCors } from './_utils/cors';

let resendClient;

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
    if (!process.env.RESEND_API_KEY) {
      console.error('Missing RESEND_API_KEY environment variable');
      return res.status(500).json({
        error: 'Email service is not configured. Please try again later.'
      });
    }

    if (!resendClient) {
      resendClient = new Resend(process.env.RESEND_API_KEY);
    }

    const { firstName, lastName, email, phone, subject, message, recaptchaToken } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !subject || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please fill in all required fields.' 
      });
    }

    // Validate reCAPTCHA
    if (!recaptchaToken) {
      return res.status(400).json({ 
        error: 'Please complete the reCAPTCHA verification.' 
      });
    }

    // Verify reCAPTCHA with Google
    const recaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!recaptchaSecretKey) {
      console.error('Missing RECAPTCHA_SECRET_KEY environment variable');
      return res.status(500).json({ 
        error: 'Server configuration error. Please try again later.' 
      });
    }

    const recaptchaVerifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${recaptchaSecretKey}&response=${recaptchaToken}`
    });

    const recaptchaResult = await recaptchaVerifyResponse.json();
    
    if (!recaptchaResult.success) {
      console.error('reCAPTCHA verification failed:', recaptchaResult);
      return res.status(400).json({ 
        error: 'reCAPTCHA verification failed. Please try again.' 
      });
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

    const fromAddress = process.env.FROM_EMAIL || 'Moto Coach <contact@motocoach.com.au>';
    const senderName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const replyToAddress = senderName ? `${senderName} <${email}>` : email;

    const emailPayload = {
      from: fromAddress,
      to: [process.env.TO_EMAIL || 'leigh@motocoach.com.au'],
      subject: `New Contact Form Submission - ${subjectText}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #ff6b35 0%, #ff8a5c 100%); padding: 20px; text-align: center; margin-bottom: 20px;">
            <img src="cid:moto-coach-logo" alt="Moto Coach" style="max-width: 200px; height: auto; margin-bottom: 10px;" />
          </div>

          <h2 style="color: #ff6600; border-bottom: 2px solid #ff6600; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Contact Information</h3>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            ${phone ? `<p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
            <p><strong>Subject:</strong> ${subjectText}</p>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin-top: 0; color: #333;">Message</h3>
            <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
          </div>

          <div style="margin-top: 20px; padding: 15px; background-color: #e8f4fd; border-radius: 8px;">
            <p style="margin: 0; font-size: 14px; color: #666;">
              This message was sent from the Moto Coach website contact form.
            </p>
          </div>
        </div>
      `,
      text: `
New Contact Form Submission

Name: ${firstName} ${lastName}
Email: ${email}
${phone ? `Phone: ${phone}` : ''}
Subject: ${subjectText}

Message:
${message}

---
This message was sent from the Moto Coach website contact form.
      `,
      attachments: [
        {
          path: 'https://motocoach.com.au/images/long%20logo.png',
          filename: 'moto-coach-logo.png',
          contentId: 'moto-coach-logo',
        }
      ]
    };

    if (replyToAddress) {
      emailPayload.reply_to = [replyToAddress];
    }

    // Send email using Resend
    const { data, error } = await resendClient.emails.send(emailPayload);

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
