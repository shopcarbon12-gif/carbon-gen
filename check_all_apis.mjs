const url = 'https://app.shopcarbon.com';
async function run() {
    const loginRes = await fetch(`${url}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Eliorp1', password: 'Carbonusa1!' })
    });

    const cookies = loginRes.headers.get('set-cookie') || '';
    const cookie = cookies.split(',').map(c => c.split(';')[0]).join('; ');

    const integrationsRes = await fetch(`${url}/api/integrations`, { headers: { cookie } });
    console.log('/api/integrations output:\n', await integrationsRes.text(), '\n');

    const shopifyRes = await fetch(`${url}/api/shopify/status`, { headers: { cookie } });
    console.log('/api/shopify/status output:\n', await shopifyRes.text(), '\n');

    const lsRes = await fetch(`${url}/api/lightspeed/status`, { headers: { cookie } });
    console.log('/api/lightspeed/status output:\n', await lsRes.text(), '\n');

    const dpRes = await fetch(`${url}/api/dropbox/status`, { headers: { cookie } });
    console.log('/api/dropbox/status output:\n', await dpRes.text(), '\n');
}
run();
