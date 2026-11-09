// Local-only regression mock. Examples come from the sanitized collection;
// __test routes and failure scenarios are test controls, not Telinfy endpoints.
const http = require('http');
const examples = {
  "Templates": {
    "status": "success",
    "templates": [
      {
        "template_id": "1777179214792762931",
        "template_name": "Order confirmation",
        "template_content": "Dear {#var#}, your order {#var#} has been received successfully. Thank you for choosing Bhima Jewellery.\r\n\r\nFor any assistance or support, please feel free to contact us at 854 777 1 777",
        "status": 1,
        "headers": [
          "BIMJWL"
        ]
      },
      {
        "template_id": "1777179214853851012",
        "template_name": "Shipment details",
        "template_content": "Dear  Customer, your order{#var#} has been shipped! Carrier: {#var#} | Tracking #: {#var#}\r\n\r\nThank you for choosing Bhima Jewellery.\r\n\r\nFor any assistance or support, please feel free to contact us at 854 777 1 777",
        "status": 1,
        "headers": [
          "BIMJWL"
        ]
      }
    ],
    "count": 2
  },
  "Wallet": {
    "success": true,
    "wallet": 8.08,
    "credit_expiry": "2026-10-08 17:57:18"
  },
  "Send SMS": {
    "responses": [
      {
        "status": "Success",
        "message": "SMS send successfully",
        "mobile_Number": "9876543210",
        "timestamp": "2026-11-06T06:14:15.831Z"
      }
    ]
  }
};
const example = name => JSON.parse(JSON.stringify(examples[name]));
const expectedText = 'Dear Test Customer, your order TEST1001 has been received successfully. Thank you for choosing Bhima Jewellery.For any assistance or support, please feel free to contact us at 854 777 1 777';

http.createServer(async (req, res) => {
  const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/unified\/developer/, '');
    let state = await pm.state.get('telinfy-test') || { scenario: 'success', calls: [] };
    if (pathname === '/__test/reset' && req.method === 'POST') {
      await pm.state.set('telinfy-test', { scenario: req.body?.scenario || 'success', calls: [] });
      return send(200, { reset: true });
    }
    if (pathname === '/__test/state' && req.method === 'GET') return send(200, state);
    if (req.headers['x-api-key'] !== 'fake-test-key') return send(401, { success: false });
    if (pathname === '/api/v1/sms/templates' && req.method === 'GET') {
      const result = example('Templates');
      if (state.scenario === 'template-drift') result.templates[0].template_content += '!';
      if (state.scenario === 'wrong-sender') result.templates[0].headers = ['OTHERX'];
      return send(200, result);
    }
    if (pathname === '/api/v1/sms/wallet' && req.method === 'GET') {
      const result = example('Wallet');
      if (state.scenario === 'empty-wallet') result.wallet = 0;
      if (state.scenario === 'different-expiry') result.credit_expiry = '2026-10-09 17:57:18';
      return send(200, result);
    }
    if (pathname === '/api/v1/sms/send' && req.method === 'POST') {
      const expected = { Sender_Name: 'BIMJWL', SMS_Message: expectedText, mobile_Number: '9876543210', template_id: '1777179214792762931' };
      const body = req.body;
      if (!body || Object.keys(body).length !== 4 || Object.entries(expected).some(([key, value]) => body[key] !== value)) {
        return send(400, { success: false, message: 'Request differs from the confirmed single-recipient contract' });
      }
      state.calls.push({ sender: body.Sender_Name, message: body.SMS_Message, templateId: body.template_id, recipientLast4: body.mobile_Number.slice(-4) });
      await pm.state.set('telinfy-test', state);
      if (state.scenario === 'gateway-error') { res.writeHead(502, { 'Content-Type': 'text/html' }); return res.end('Gateway failed'); }
      if (state.scenario === 'rate-limit') { res.setHeader('Retry-After', '30'); return send(429, { success: false }); }
      const result = example('Send SMS');
      if (state.scenario === 'rejected') result.responses[0].status = 'Failed';
      if (state.scenario === 'wrong-recipient') result.responses[0].mobile_Number = '8765432109';
      if (state.scenario === 'unknown-response') return send(200, { unexpected: true });
      // The provider may have accepted a send before its reply is lost.
      if (state.scenario === 'timeout-after-submit') await new Promise(resolve => setTimeout(resolve, 1500));
      return send(200, result);
    }
    return send(501, { error: 'Not modeled by this notification regression mock' });
  } catch { return send(500, { error: 'Local mock failed' }); }
}).listen(process.env.PORT || 4500, '127.0.0.1');
