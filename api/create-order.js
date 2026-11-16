export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  const env = process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';

  if (!appId || !secretKey) {
    return res.status(200).json({ demo: true });
  }

  const baseUrl = env === 'production'
    ? 'https://api.cashfree.com/pg/orders'
    : 'https://sandbox.cashfree.com/pg/orders';

  const { amount, customerName, customerEmail, customerPhone, category } = req.body || {};
  const orderId = 'AROI27_' + Date.now() + '_' + Math.floor(100 + Math.random() * 900);

  try {
    const cfRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2023-08-01',
        'x-client-id': appId,
        'x-client-secret': secretKey,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: Number(amount),
        order_currency: 'INR',
        customer_details: {
          customer_id: 'DEL_' + Date.now(),
          customer_name: customerName || 'Delegate',
          customer_email: customerEmail || 'delegate@aroi.org',
          customer_phone: String(customerPhone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999',
        },
        order_note: `CAN Kerala AROICON 2027 - ${category || 'Registration'}`,
      }),
    });

    const data = await cfRes.json();
    if (!cfRes.ok) return res.status(cfRes.status).json(data);
    return res.status(200).json({
      order_id: data.order_id,
      payment_session_id: data.payment_session_id,
      mode: env,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
