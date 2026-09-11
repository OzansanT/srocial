import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { signS3Request } from '../server/media/s3-signer.js';

test('signs deterministic path-style S3 request with AWS Signature V4', () => {
  const payloadHash = createHash('sha256').update('hello').digest('hex');
  const signed = signS3Request({
    method: 'PUT',
    url: new URL('https://objects.example.com/media-bucket/media/test.jpg?z=2&a=hello%20world'),
    region: 'us-east-1',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secretExampleKey',
    headers: { 'content-type': 'image/jpeg', 'content-length': '5' },
    payloadHash,
    now: new Date('2026-09-11T12:34:56.000Z')
  });

  assert.equal(signed['x-amz-date'], '20260911T123456Z');
  assert.equal(signed['x-amz-content-sha256'], payloadHash);
  assert.equal(signed.host, 'objects.example.com');
  assert.equal(
    signed.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260911/us-east-1/s3/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-content-sha256;x-amz-date, Signature=82268d500354ae25d70b8886a41ec8912df666ae193a3e0653e6b1bf17e2ab5d'
  );
});

test('canonical query ordering is stable regardless of input parameter order', () => {
  const common = {
    method: 'GET', region: 'auto', accessKeyId: 'key', secretAccessKey: 'secret',
    headers: {}, payloadHash: createHash('sha256').update('').digest('hex'),
    now: new Date('2026-09-11T00:00:00.000Z')
  };
  const first = signS3Request({ ...common, url: new URL('https://r2.example.test/bucket?prefix=a%2Fb&list-type=2') });
  const second = signS3Request({ ...common, url: new URL('https://r2.example.test/bucket?list-type=2&prefix=a%2Fb') });
  assert.equal(first.authorization, second.authorization);
});

test('rejects missing signing credentials and invalid dates', () => {
  const base = {
    method: 'GET', url: new URL('https://objects.example.com/bucket'), region: 'us-east-1',
    accessKeyId: 'key', secretAccessKey: 'secret', headers: {}, payloadHash: '0'.repeat(64),
    now: new Date('2026-09-11T00:00:00.000Z')
  };
  assert.throws(() => signS3Request({ ...base, accessKeyId: '' }), /MEDIA_S3_ACCESS_KEY_REQUIRED/);
  assert.throws(() => signS3Request({ ...base, secretAccessKey: '' }), /MEDIA_S3_SECRET_KEY_REQUIRED/);
  assert.throws(() => signS3Request({ ...base, now: new Date('invalid') }), /MEDIA_S3_SIGNING_DATE_INVALID/);
});
