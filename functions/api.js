const ENDPOINTS = {
  core:   'https://script.google.com/macros/s/AKfycbzsCExtMK78a5k2yUQ1ZhJxMDzb5vgpQ7xFO6rqO7QfN1WwDEl81VpyX6kES_ss7y-3/exec',
  bast:   'https://script.google.com/macros/s/AKfycbywfvfpdkeskEOPgmULA0F_MFfqfSDFOqN9C3S8Z5_h63OqiBIAR7zAUKpS8hLiF00O/exec',
  arsip:  'https://script.google.com/macros/s/AKfycbxmTTF_X2QrMTcqxjWGgUqW6_yIqx5moTa0VR-yA7kMn6JK--Nm8MHtMcfUFYN_d1m5sg/exec',
  dbr:    'https://script.google.com/macros/s/AKfycbwGvVsRCuw318mSQcOdD5OrKUMaamxP6aIIIgaLjPt4vvhhrRjXKYWIpkbTrplN2O86/exec',
  calbmn: 'https://script.google.com/macros/s/AKfycby97bDb14KPzd_cvY_7FNeyKuce1IMbARqSGvzZTX3EcUds2lgPQ6xzYASVVmBq9K44UQ/exec'
};

function cleanHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const mod = url.searchParams.get('module') || 'core';
  const target = ENDPOINTS[mod];
  if (!target || target.includes('MASUKKAN_URL')) {
    return new Response(JSON.stringify({ ok: false, error: 'URL Apps Script untuk modul "' + mod + '" belum diatur di functions/api.js' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  try {
    const res = await fetch(target + '?ping=1', { redirect: 'follow' });
    const text = await res.text();
    return new Response(JSON.stringify({
      ok: true,
      module: mod,
      status: res.status,
      butuh_login_google: res.url.includes('accounts.google.com'),
      balasan: text.trim().startsWith('<') ? cleanHtml(text) : text
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const mod = url.searchParams.get('module') || 'core';
  const target = ENDPOINTS[mod];

  if (!target || target.includes('MASUKKAN_URL')) {
    return new Response(JSON.stringify({ ok: false, error: 'Endpoint modul "' + mod + '" belum dikonfigurasi di functions/api.js' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const body = await context.request.text();
    let response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'manual'
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const loc = response.headers.get('location');
      if (!loc) throw new Error('Redirect tanpa lokasi dari Apps Script.');
      if (loc.includes('accounts.google.com')) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Web App modul "' + mod + '" masih meminta login Google. Setel Who has access ke Anyone.'
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      }
      response = await fetch(loc, { method: 'GET', redirect: 'follow' });
    }

    const text = await response.text();
    if (text.trim().startsWith('<')) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Balasan HTML dari modul "' + mod + '": ' + cleanHtml(text)
      }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }

    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'Gagal menghubungi modul "' + mod + '": ' + err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
