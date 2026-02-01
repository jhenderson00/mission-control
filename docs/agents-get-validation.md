# agents:get ID validation

## Summary
The `agents:get` Convex query now accepts any string ID and validates it server-side before calling `ctx.db.get`. Invalid IDs are normalized to `null`, and the query returns `null` instead of throwing, preventing dashboard crashes when malformed IDs reach the backend.

## Behavior
- Input argument changed from `v.id('agents')` to `v.string()`.
- The handler uses `ctx.db.normalizeId('agents', id)`.
- If normalization fails, the query returns `null`.
- If normalization succeeds, the query loads the agent by ID.

## Rationale
This guards the query against invalid or user-supplied IDs that would otherwise throw at the database layer.
