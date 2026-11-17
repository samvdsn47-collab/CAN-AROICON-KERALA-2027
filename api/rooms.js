import { createHmac, timingSafeEqual } from 'node:crypto';

export function accessCode(id, secret) {
  return createHmac('sha256', secret).update('delegate-access-v1:' + id).digest('hex').slice(0, 24);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const secret = process.env.REGISTRATION_SECRET;
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!secret || !url || process.env.REGISTRATION_MODE !== 'test') return res.status(503).json({ error: 'Registry unavailable' });
  if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ error: 'JSON required' });
  try {
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Invalid origin' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || JSON.stringify(body).length > 2000) return res.status(400).json({error:'Invalid login request.'});
    if (body.action === 'login') {
      const email=String(body.email||'').trim().toLowerCase(),mobile=String(body.mobile||'').trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||mobile.length>32||!/^\+?[\d ()-]{7,32}$/.test(mobile)) return res.status(400).json({error:'Enter your registered email address and mobile number.'});
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,action:'login',email,mobile}),signal:AbortSignal.timeout(20000),redirect:'follow'});
      const result=await response.json();
      if(!response.ok)throw new Error();
      if(!result.ok)return res.status(401).json({ok:false,error:result.error||'Check your registered email address and mobile number.'});
      if(!/^AROI27-[A-Za-z0-9_-]{4,80}$/.test(result.record?.regId||''))throw new Error();
      return res.status(200).json({...result,accessCode:accessCode(result.record.regId,secret)});
    }
    if ( !/^AROI27-[A-Za-z0-9_-]{4,80}$/.test(body.regId || '')) throw new Error();
    const expected = accessCode(body.regId, secret);
    const given = String(body.accessCode || '').trim().toLowerCase();
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return res.status(401).json({ error: 'Check your registration ID and private access code.' });
    if (!['rooms', 'pair'].includes(body.action)) throw new Error();
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, action: body.action, regId: body.regId, partnerId: body.partnerId }),
      signal: AbortSignal.timeout(20000), redirect: 'follow'
    });
    const result = await response.json();
    if (!response.ok) throw new Error();
    return res.status(result.ok ? 200 : 409).json(result);
  } catch { return res.status(502).json({ error: 'The shared registry could not be reached. Please retry.' }); }
}
