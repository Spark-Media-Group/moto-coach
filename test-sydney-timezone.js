// Test Sydney timezone date formatting
const eventDateTime = "2025-09-11T03:30:00+10:00"; // From Google Calendar
const eventStartDate = new Date(eventDateTime);

console.log('Raw Google Calendar date:', eventDateTime);
console.log('Parsed Date object:', eventStartDate);

// Test current method (no timezone specified)
const currentFormat = eventStartDate.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'numeric', 
    year: 'numeric'
});
console.log('Current format (no timezone):', currentFormat);

// Test with Sydney timezone
const sydneyFormat = eventStartDate.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'numeric', 
    year: 'numeric',
    timeZone: 'Australia/Sydney'
});
console.log('Sydney timezone format:', sydneyFormat);

// Test what we expect from sheet
const expectedFromSheet = "10/9/2025";
console.log('Expected from sheet:', expectedFromSheet);

console.log('Sydney format matches sheet:', sydneyFormat === expectedFromSheet);

// Test manual calculation
const sydneyDate = new Date(eventDateTime);
const manualFormat = `${sydneyDate.getDate()}/${sydneyDate.getMonth() + 1}/${sydneyDate.getFullYear()}`;
console.log('Manual format:', manualFormat);
console.log('Manual matches sheet:', manualFormat === expectedFromSheet);
