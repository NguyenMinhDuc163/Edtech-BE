const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { RevenueCatService } = require('../dist/services/revenuecat.service');

const authToken = 'test-webhook-auth';
const hmacSecret = 'test-hmac-secret';
const body = Buffer.from(JSON.stringify({ api_version: '1.0', event: { id: 'evt_1' } }));

function signature(timestamp, payload = body) {
  const digest = crypto
    .createHmac('sha256', hmacSecret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

test.beforeEach(() => {
  process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN = authToken;
  process.env.REVENUECAT_WEBHOOK_HMAC_SECRET = hmacSecret;
});

test('accepts a valid RevenueCat authorization and raw-body signature', () => {
  const service = new RevenueCatService({});
  const timestamp = Math.floor(Date.now() / 1000);
  assert.doesNotThrow(() =>
    service.verifyWebhook(`Bearer ${authToken}`, signature(timestamp), body),
  );
});

test('rejects an invalid authorization token', () => {
  const service = new RevenueCatService({});
  const timestamp = Math.floor(Date.now() / 1000);
  assert.throws(() =>
    service.verifyWebhook('Bearer invalid', signature(timestamp), body),
  );
});

test('rejects a modified payload and an expired signature', () => {
  const service = new RevenueCatService({});
  const timestamp = Math.floor(Date.now() / 1000);
  assert.throws(() =>
    service.verifyWebhook(authToken, signature(timestamp), Buffer.from('{}')),
  );

  const staleTimestamp = timestamp - 301;
  assert.throws(() =>
    service.verifyWebhook(authToken, signature(staleTimestamp), body),
  );
});
