# Scale integration rollout (draft PR #4)

This feature is **not deployed** and does not change the original ReadSerialToAPIN.exe.

## Contract
- POST /api/scale/weight, JSON `{"weightKg":12345}`
- Header `Authorization: Bearer <SCALE_API_TOKEN>` (secret, >=24 characters).
- GET /api/scale/latest requires an authenticated web session.
- The UI button copies a reading into the editable gross-weight input only if its timestamp is within 15 seconds.
- Original CirclesSoft endpoint must continue to receive its existing request independently.

## Required steps before production
1. Run typecheck, tests and build on branch `feature/scale-dual-delivery`.
2. Set `SCALE_API_TOKEN` in Cloudflare Pages production secrets; never commit or paste its value into the repository.
3. Apply `migrations/0003_scale_latest.sql` to the **existing** D1 DB. Do not reset the database.
4. Confirm an authenticated browser session can read `/api/scale/latest`, and unauthenticated clients cannot.
5. Modify or rebuild the existing Windows application to send the same parsed weight to both endpoints, with independent timeouts, logging and retries. **Do not start a second process opening COM6 while the original owns it.**
6. Verify actual scale units and parser behavior before sending any weight. Check weight updates, manual edits, stale readings, auth failure and network outage.
7. Merge and deploy only after these checks.

## Integration note
The uploaded executable is a compiled .NET Framework 4.5.1 binary, not source code. Its current serial settings are COM6 / 9600 / parity 2 / 8 data bits / 1000ms. Do not replace its existing sending logic without confirming its framing and request behavior. A decompiler and Windows runtime testing are needed to produce a safe modified binary.
