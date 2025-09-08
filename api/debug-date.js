// Debug endpoint to see exact date formatting
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Test the exact date from the calendar event
    const testDate = "2025-09-11T03:30:00+10:00"; // clubmx event date
    const eventStartDate = new Date(testDate);

    const formats = {
        'raw_date': testDate,
        'parsed_date': eventStartDate.toString(),
        'en_AU_format': eventStartDate.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }),
        'en_US_format': eventStartDate.toLocaleDateString('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }),
        'manual_dd_mm_yyyy': `${String(eventStartDate.getDate()).padStart(2, '0')}/${String(eventStartDate.getMonth() + 1).padStart(2, '0')}/${eventStartDate.getFullYear()}`,
        'manual_d_m_yyyy': `${eventStartDate.getDate()}/${eventStartDate.getMonth() + 1}/${eventStartDate.getFullYear()}`
    };

    res.status(200).json({
        success: true,
        message: 'Date format testing',
        formats: formats,
        test_comparisons: {
            'en_AU_vs_manual_padded': formats.en_AU_format === formats.manual_dd_mm_yyyy,
            'en_AU_vs_manual_unpadded': formats.en_AU_format === formats.manual_d_m_yyyy
        }
    });
}
