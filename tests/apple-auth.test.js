const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');

test('Apple identity tokens require a trusted signature, issuer, audience, and nonce', async () => {
  const previousClientIds = process.env.APPLE_CLIENT_IDS;
  const originalAxiosGet = axios.get;
  process.env.APPLE_CLIENT_IDS = 'com.sabiguy.ios,com.sabiguy.web';

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'test-apple-key',
    use: 'sig',
    alg: 'RS256',
  };
  axios.get = async () => ({ data: { keys: [publicJwk] } });

  try {
    const { appleHelper } = require('../src/shared/utils/auth.helpers');
    const rawNonce = 'client-generated-nonce';
    const claims = {
      iss: 'https://appleid.apple.com',
      aud: 'com.sabiguy.ios',
      sub: 'apple-subject-123',
      email: 'person@example.com',
      email_verified: 'true',
      nonce: crypto.createHash('sha256').update(rawNonce).digest('hex'),
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    const validToken = jwt.sign(claims, privateKey, {
      algorithm: 'RS256',
      keyid: publicJwk.kid,
    });

    const identity = await appleHelper.verifyToken(validToken, {
      nonce: rawNonce,
    });
    assert.deepEqual(identity, {
      appleId: claims.sub,
      email: claims.email,
      emailVerified: true,
    });

    const invalidAudienceToken = jwt.sign(
      { ...claims, aud: 'com.attacker.app' },
      privateKey,
      { algorithm: 'RS256', keyid: publicJwk.kid },
    );
    await assert.rejects(
      appleHelper.verifyToken(invalidAudienceToken),
      (error) => error.status === 401,
    );
    await assert.rejects(
      appleHelper.verifyToken(validToken, { nonce: 'wrong-nonce' }),
      (error) => error.status === 401,
    );
    const tokenWithoutExpiry = jwt.sign(
      Object.fromEntries(
        Object.entries(claims).filter(([claim]) => claim !== 'exp'),
      ),
      privateKey,
      { algorithm: 'RS256', keyid: publicJwk.kid },
    );
    await assert.rejects(
      appleHelper.verifyToken(tokenWithoutExpiry),
      (error) => error.status === 401,
    );
  } finally {
    axios.get = originalAxiosGet;
    if (previousClientIds === undefined) {
      delete process.env.APPLE_CLIENT_IDS;
    } else {
      process.env.APPLE_CLIENT_IDS = previousClientIds;
    }
  }
});
