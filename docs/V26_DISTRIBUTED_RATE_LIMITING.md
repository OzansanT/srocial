# V26 — Distributed & Trusted-Proxy-Aware Rate Limiting

V26 resolves `SR-P006` by separating two concerns that must both be correct in a proxy-fronted or multi-instance deployment:

1. **who the client is** for rate-limit purposes; and
2. **where the rate-limit counter lives**.

## Secure client attribution

Srocial does **not** trust forwarded client-address headers by default.

```text
TRUSTED_PROXY_IPS=
```

With the default empty value, rate limiting uses the direct socket peer address. A caller cannot escape a bucket by sending a different `X-Forwarded-For` value.

When Srocial runs behind known reverse proxies, configure their exact IPv4/IPv6 addresses as a comma-separated allowlist:

```text
TRUSTED_PROXY_IPS=10.0.0.10,10.0.0.11
```

Only when the **direct socket peer** is in this allowlist may `X-Forwarded-For` influence the rate-limit identity. The chain is evaluated from right to left; trusted proxy hops are skipped until the nearest untrusted address is found and that address becomes the client key.

Example:

```text
Direct peer:       10.0.0.10       trusted
X-Forwarded-For:   192.0.2.44, 198.51.100.7, 10.0.0.11
Trusted proxies:   10.0.0.10, 10.0.0.11
Resolved client:   198.51.100.7
```

The left-most `192.0.2.44` value cannot override the nearer untrusted hop. If the forwarding chain contains an invalid IP, Srocial fails closed to the direct peer rather than accepting ambiguous attribution. Invalid `TRUSTED_PROXY_IPS` configuration fails application-auth construction.

V26 deliberately supports exact IP addresses only. It does not silently implement CIDR ranges, proxy counts, `Forwarded`, or `X-Real-IP` semantics.

## Shared PostgreSQL enforcement

When the production PostgreSQL repository is selected, login and authenticated-API fixed-window limits use the database instead of process memory.

Migration `010_rate_limit_buckets.sql` adds:

```text
rate_limit_buckets
  scope
  client_key
  window_start_ms
  request_count
  updated_at
```

The primary key is `(scope, client_key)`, keeping login and authenticated API limits independent.

Each consumption runs in a PostgreSQL transaction. The bucket row is selected with `FOR UPDATE`, so concurrent application instances serialize updates to the same bucket. This prevents two Srocial instances from each granting an independent in-memory allowance.

The existing response contract is preserved:

```text
allowed
remaining
retryAfterSeconds
```

HTTP `429` responses continue to include `Retry-After`.

## JSON/local behavior

`DATABASE_DRIVER=json` remains suitable for local/single-process development. It continues using the existing in-process fixed-window limiter, but now uses the same trusted-proxy client-address resolution rules.

For multi-instance production enforcement, use PostgreSQL.

## Configuration

```text
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=120
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
TRUSTED_PROXY_IPS=
```

Do not add a public load balancer, ingress, CDN, or reverse proxy to `TRUSTED_PROXY_IPS` unless Srocial's direct TCP peer is actually that trusted component and it sanitizes/constructs the forwarding chain as intended.

## Verification

V26 was developed test-first.

RED coverage required:

- untrusted peers cannot spoof identity with `X-Forwarded-For`;
- trusted direct proxies expose the forwarded client;
- trusted multi-hop chains resolve right-to-left;
- invalid trusted-proxy configuration fails closed;
- malformed forwarded chains fall back to the direct peer;
- two PostgreSQL repository instances share one limiter state;
- concurrent cross-instance consumption is atomic;
- fixed windows reopen after expiry;
- HTTP login rate limiting actually uses trusted-proxy attribution.

The code-only GREEN gate on head `7a2d2b485d0ee162567e188069f5c84f346a9869`, GitHub Actions run `35072527173`, passed:

- PostgreSQL migrations `001–010`;
- `464/464` deterministic Node tests;
- JavaScript syntax verification;
- `12/12` real Chrome/CDP E2E scenarios.

A fresh exact-head gate is required after documentation/tracker promotion and before merge.
