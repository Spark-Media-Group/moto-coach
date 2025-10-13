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

## Printful Integration
The online store uses Printful's v2 API for catalog browsing and order
fulfilment. Configure the following environment variables in Vercel (or your
local `.env` file) before deploying changes that touch the storefront:

- `PRINTFUL_API_KEY` – a Printful personal access token. Store only the raw
  token value; **do not** prefix it with `Bearer` because the serverless
  handlers add that prefix automatically when sending requests.
- `PRINTFUL_STORE_ID` – the numeric identifier of the Printful store to target.
- `PRINTFUL_STORE_NAME` *(optional)* – friendly name shown in diagnostics.
- `PRINTFUL_SELLING_REGION_NAME` *(optional)* – region slug (e.g. `worldwide`)
  used when requesting product availability.

After updating any of these values in Vercel, trigger a redeploy so the
serverless functions pick up the new configuration.

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
