import { accessCode } from './rooms.js';
// Test-only receiver bridge. Google credentials must never reach the browser.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (process.env.REGISTRATION_MODE !== 'test') {
    return res.status(503).json({ error: 'Test registration is not enabled.' });
  }
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.REGISTRATION_SECRET;
  if (!url || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) || !secret) {
    return res.status(503).json({ error: 'The organizer has not finished connecting Google Sheets.' });
  }
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    return res.status(415).json({ error: 'JSON required' });
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Invalid origin' });
    } catch { return res.status(403).json({ error: 'Invalid origin' }); }
  }
  let record;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    record = body?.record;
    if (!record || JSON.stringify(body).length > 16000) throw new Error();
    const b = record.basicData;
    if (!/^AROI27-[A-Za-z0-9_-]{4,80}$/.test(record.regId || '') ||
        !b || typeof b.fullName !== 'string' || !b.fullName.trim() || b.fullName.length > 200 ||
        typeof b.email !== 'string' || b.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
        !Number.isFinite(record.totalFee) || record.totalFee < 0) throw new Error();
    record = { ...record, tailoredData: { ...record.tailoredData, preferredRoommateId: '', preferredRoommateLabel: '' }, payment: { method: 'Test submission', txnId: '', status: 'TEST_UNVERIFIED' } };
  } catch {
    return res.status(400).json({ error: 'Enter a valid name and email address before submitting.' });
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, record }),
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true || result.regId !== record.regId) {
      return res.status(502).json({ error: 'Google Sheets did not confirm the save. Check the connection settings and retry.' });
    }
    return res.status(200).json({ ok: true, regId: record.regId, test: true, duplicate: !!result.duplicate, accessCode: accessCode(record.regId, secret) });
  } catch {
    return res.status(502).json({ error: 'Could not confirm the Google Sheets save. Retry with the same registration.' });
  }
}
