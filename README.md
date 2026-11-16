# CAN Kerala AROICON 2027

The Vercel portal saves test registrations to a private Google Sheet. Payment collection is paused; reported fees are not verified revenue. Existing pricing is unchanged, including Friday accommodation at INR 1,750 per person.

## Configuration
Vercel production variables: REGISTRATION_MODE=test, GOOGLE_SHEETS_WEBHOOK_URL (Apps Script /exec URL), REGISTRATION_SECRET (matching private script property). Never put the secret in browser code or GitHub.

## Organizer dashboard
The Apps Script web app at /exec?view=dashboard contains responsive cards, clickable food/accommodation/category charts, searchable delegate lists, CSV export, Friday unpaired contacts and organizer partner assignment. It refreshes every minute and can be embedded in the private Google Site. It checks the active Google user against the script owner on every dashboard read and assignment. An empty or different identity is denied. The registration Sheet must remain restricted.

## Room sharing
Delegates retrieve their registration from any device using the registration ID and private access code shown on their pass. Codes are derived server-side and are never included in candidate lists. Candidate records expose only name, institution, stay dates and pairing availability. A script lock guards validation and a single RoomPairs row reserves both delegates atomically. Self-pairing, mismatched stay dates and occupied partners are rejected. Repeating the same pair is idempotent. Delegate selection ends on 31 December 2026 at 23:59:59 India time; organizers can assign afterward. Organizers should confirm suitability with delegates before assignment. A saved pairing is locked; changes currently require organizer maintenance of the RoomPairs sheet.

Friday follow-up includes Friday + Saturday delegates without a paired delegate. Saturday-included counts cover both Saturday-only and Friday + Saturday registrations. Food charts count registered delegates; accompanying guests do not have individual food preferences collected. No fabricated registrations are displayed. Test-only verification records are clearly named when present.

## Deployment and validation
Upload api/save-registration.js and api/rooms.js to api/, then index.html to the root. Deploy the matching Apps Script source as a new version of the existing deployment. Local tests use node --test tests/*.test.mjs. Google Sheet receiver acknowledgements are required before confirming saves. Retried saves keep the same ID to prevent duplicate rows.

## Before live payments
Email alerts are not configured. The dashboard shows new registrations on refresh. Local-only legacy records are not imported. Cashfree code is retained but checkout does not call it. Production launch requires server-calculated pricing, verified payments bound to registrations, recovery/webhooks, and end-to-end testing. To move accounts, deploy a new private registry under the organizer account and update the Vercel URL and secret.
