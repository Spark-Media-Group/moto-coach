// Test Printful order creation with correct payload structure

const apiKey = 'bpgDgOSocyQ37e80QBdRwRv51imYFRBGD3PCTDgL';
const storeId = '17005241';

const orderPayload = {
    recipient: {
        name: 'Test Customer',
        address1: '10748 Hellebore Rd',
        city: 'Charlotte',
        state_code: 'NC',
        country_code: 'US',
        zip: '28213'
    },
    items: [
        {
            sync_variant_id: 5008952970,  // Circle ornament sync ID
            quantity: 1
        }
    ]
};

console.log('Testing order creation with payload:');
console.log(JSON.stringify(orderPayload, null, 2));
console.log('\n');

fetch(`https://api.printful.com/orders?confirm=false`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderPayload)
})
.then(async (response) => {
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:');
    console.log(JSON.stringify(data, null, 2));
    
    if (!response.ok) {
        console.log('\n❌ Order creation FAILED');
        if (data.error) {
            console.log('Error:', data.error.message || data.error);
        }
    } else {
        console.log('\n✅ Order creation SUCCESS');
        if (data.result) {
            console.log('Order ID:', data.result.id);
        }
    }
})
.catch(error => {
    console.error('❌ Request failed:', error.message);
});
