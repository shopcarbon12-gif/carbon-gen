const url = 'https://app.shopcarbon.com';
async function run() {
    const loginRes = await fetch(`${url}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Eliorp1', password: 'Carbonusa1!' })
    });
    const cookie = loginRes.headers.get('set-cookie');

    const dropboxRes = await fetch(`${url}/api/dropbox/status`, {
        headers: { cookie }
    });
    console.log('Dropbox:', await dropboxRes.text());

    const integrationsRes = await fetch(`${url}/api/integrations`, {
        headers: { cookie }
    });
    console.log('Integrations:', await integrationsRes.text());
}
run();
