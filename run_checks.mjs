import fs from 'fs/promises';
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
    const shopifyRes = await fetch(`${url}/api/shopify/status`, { headers: { cookie } });
    const lsRes = await fetch(`${url}/api/lightspeed/status`, { headers: { cookie } });
    const dpRes = await fetch(`${url}/api/dropbox/status`, { headers: { cookie } });

    const logoutRes = await fetch(`${url}/api/logout`, {
        method: 'POST',
        headers: { cookie }
    });

    const data = {
        auth_flow: {
            login_status: loginRes.status,
            login_ok: loginRes.ok,
            logout_status: logoutRes.status,
            logout_ok: logoutRes.ok
        },
        integrations: await integrationsRes.json(),
        shopify: await shopifyRes.json(),
        lightspeed: await lsRes.json(),
        dropbox: await dpRes.json()
    };
    await fs.writeFile('api_stats.json', JSON.stringify(data, null, 2));
}
run();
