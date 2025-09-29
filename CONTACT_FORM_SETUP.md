# Moto Coach Contact Form Setup### 4. Domain Verification (Important!)
For production use, you need to verify a domain with Resend:
1. In your Resend dashboard, go to Domains
2. Add your domain (e.g., motocoach.com.au)
3. Follow the DNS verification steps
4. Update the `FROM_EMAIL` environment variable to use your verified domain

### 5. Deploy to Vercel
## Overview
Your contact form is now set up to work with Vercel and Resend for email functionality.

## Setup Steps

### 1. Set up your Resend API Key
1. Go to [Resend.com](https://resend.com) and create an account if you haven't already
2. Navigate to API Keys in your dashboard
3. Create a new API key (it will start with `re_`)
4. Copy this API key

### 2. Enable Vercel BotID (Security Protection)
Vercel's BotID protection is baked into the platform. No manual keys or console setup is required—just deploy to Vercel and the codebase will automatically initialise BotID for protected routes.

- BotID is invisible to end users and does not require a challenge widget.
- The codebase registers the `/api/contact`, `/api/apply_us`, and `/api/track_reserve` endpoints for protection.
- No environment variables or dashboard configuration is needed for BotID.

### 3. Configure Vercel Environment Variables
1. Go to your Vercel dashboard
2. Select your Moto Coach project
3. Go to Settings > Environment Variables
4. Add these environment variables:
   - `RESEND_API_KEY`: Your Resend API key (the one starting with `re_`)
   - `FROM_EMAIL`: `Moto Coach Website <noreply@yourdomain.com>` (replace yourdomain.com with your actual domain)
   - *(No BotID-related variables are required)*

### 3. Domain Verification (Important!)
For production use, you need to verify a domain with Resend:
1. In your Resend dashboard, go to Domains
2. Add your domain (e.g., motocoach.com.au)
3. Follow the DNS verification steps
4. Update the `FROM_EMAIL` environment variable to use your verified domain

### 4. Deploy to Vercel
1. Commit and push your changes to your git repository
2. Vercel will automatically deploy the new version
3. The contact form will now be functional!

## File Structure Added
```
/api/contact.js          # Serverless function to handle form submissions
/scripts/contact.js      # Client-side JavaScript for contact form with Vercel BotID
package.json             # Dependencies (Resend)
.env.local              # Local environment variables (for development)
```

## What Happens When Someone Submits the Form
1. Form data is sent to `/api/contact`
2. The serverless function validates the data
3. An email is sent to leigh@motocoach.com.au using Resend
4. A success/error message is shown to the user
5. The form is reset on successful submission

## Testing
- Test locally: Run `npm install` then `vercel dev` to test locally
- Test in production: Submit the form on your live site after deployment

## Email Template
The emails will include:
- Sender's name and contact information
- Subject line based on their selection
- Full message content
- Professional HTML formatting
- Plain text fallback

## Security Features
- **Vercel BotID Protection**: Blocks automated submissions without user friction
- CORS headers configured
- Form validation (client and server-side)
- Rate limiting through Vercel's built-in protections
- Environment variables for sensitive data

## Notes
- No reCAPTCHA keys are required—BotID handles bot protection automatically on Vercel
- Make sure to update the `FROM_EMAIL` with your actual verified domain
- The form will work immediately after deployment with proper environment variables
- All form submissions will be sent to leigh@motocoach.com.au
- BotID protection mitigates automated submissions without user friction
