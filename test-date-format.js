// Test script to check date formatting
console.log('Testing date formatting...');

// Simulate the Google Calendar event date
const eventDateTime = "2025-09-11T03:30:00+10:00"; // From the calendar API response
const eventStartDate = new Date(eventDateTime);

console.log('Raw date from Google Calendar:', eventDateTime);
console.log('Parsed as Date object:', eventStartDate);

// Test the backend formatting
const backendFormat = eventStartDate.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});
console.log('Backend format (en-AU with 2-digit):', backendFormat);

// Test different frontend formats
const frontendFormat1 = `${eventStartDate.getDate()}/${eventStartDate.getMonth() + 1}/${eventStartDate.getFullYear()}`;
console.log('Frontend format 1 (no padding):', frontendFormat1);

const frontendFormat2 = `${String(eventStartDate.getDate()).padStart(2, '0')}/${String(eventStartDate.getMonth() + 1).padStart(2, '0')}/${eventStartDate.getFullYear()}`;
console.log('Frontend format 2 (with padding):', frontendFormat2);

// Test what we're actually sending
console.log('\nTest comparisons:');
console.log('Backend === Frontend 1:', backendFormat === frontendFormat1);
console.log('Backend === Frontend 2:', backendFormat === frontendFormat2);

// Try different locale settings
const usFormat = eventStartDate.toLocaleDateString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});
console.log('US format:', usFormat);

console.log('Backend === US format:', backendFormat === usFormat);
