# Moto Coach Website

Professional motocross coaching website for Moto Coach, based in Sydney, Australia.

## Features
- Responsive design
- Professional coaching programs
- Travel programs (US & Australia)
- Contact information and calendar integration
- Google Calendar integration for scheduling

## Programs
- **Professional Coaching**: One-on-one training sessions
- **US Travel & Training Program**: Training camps in the United States
- **Australia Outback & Experience**: Adventure tours in the Australian outback

## Deployment
This site is deployed on Vercel and connected to GitHub for continuous deployment.

## Technologies Used
- HTML5
- CSS3
- JavaScript
- Google Fonts (Roboto Condensed, Oswald)
- Google Calendar embed

## Contact
Based in Sydney, Australia
- Instagram: [@sydneymotocoach](https://www.instagram.com/sydneymotocoach/)
- Facebook: [TheMotocoach](https://www.facebook.com/TheMotocoach/)

## Sheets Debug Endpoint

An optional `/api/sheets-debug` route can be enabled to help diagnose Google Sheets
integrations. The endpoint is disabled by default. To use it in a secure
environment:

- Set `SHEETS_DEBUG_ENABLED=true` to expose the route.
- Provide a comma-separated list of trusted origins in
  `SHEETS_DEBUG_ALLOWED_ORIGINS` (e.g. `https://admin.example.com`). Requests from
  other origins are rejected.
- Configure a shared secret in `SHEETS_DEBUG_API_KEY` and supply it via the
  `x-api-key` request header. Requests without the correct key receive a `401`
  response.

The endpoint continues to rely on the existing Google Sheets credentials and ID
environment variables.
