export default async function handler(req, res) {
  const { order_id } = req.query;
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  const env = process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';

  if (!appId || !secretKey || !order_id) {
    return res.status(400).json({ paid: false });
  }

  const baseUrl = env === 'production'
    ? `https://api.cashfree.com/pg/orders/${encodeURIComponent(order_id)}`
    : `https://sandbox.cashfree.com/pg/orders/${encodeURIComponent(order_id)}`;

  try {
    const cfRes = await fetch(baseUrl, {
      headers: {
        'x-api-version': '2023-08-01',
        'x-client-id': appId,
        'x-client-secret': secretKey,
      },
    });
    const data = await cfRes.json();
    return res.status(200).json({
      paid: data.order_status === 'PAID',
      order_status: data.order_status,
      payment_id: data.cf_order_id || order_id,
    });
  } catch (err) {
    return res.status(500).json({ paid: false, error: err.message });
  }
}
