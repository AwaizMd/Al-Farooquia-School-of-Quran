# Public website

A separate Next.js app in `public-website/`. It has no database: it reads published content and sends applications through the API.

## How a request finds its madrasa

```
Visitor -> Caddy -> Next.js server -> /api/v1/public (with PUBLIC_SITE_TOKEN and the request's hostname)
                                         |
                                         SiteDomain: hostname -> madrasa
```

The browser never talks to `/api/v1/public` and never sends a madrasa ID; one sent anyway is ignored. Caddy blocks `/api/v1/public` from outside.

## Setting up a madrasa's site

1. Under Madrasas, switch on **Public website** and, if used, **Halaqa programs**.
2. Sign in as the Principal. Under Public Website > Settings: add the address, branding, contact details, privacy notice and the forms to open.
3. Under Content: create the Home, About and Admissions pages, then programs, announcements, events and FAQs. Publish them.
4. On a Halaqa, tick **Show on the public website** to list it, with only the fields chosen for publication.

Nothing appears until published, and unpublishing takes effect at once: the website keeps no copy of its own. A page or section with nothing published is left out.

## Publishing

Draft, waiting for approval, published, archived. An administrator can draft and send for approval; only the Principal publishes. If an administrator edits something already live it goes back to draft, so nothing unreviewed stays public. Items can have a publish date and an expiry. **Preview** makes a link valid for one hour.

## Applications

Admission, Halaqa, Mureed, event and enquiry forms post to the same system. Each gets a random reference. Only the Principal of that madrasa can see or decide them: not administrators and not Super Admin. If a madrasa has no Principal, applications wait unread.

| Decision | Result |
|---|---|
| Approve admission | Creates the student and guardian using the normal admission service; the Principal chooses the class. No login |
| Approve Halaqa | Creates or links a participant and adds them to the Halaqa |
| Approve Mureed | Creates or links a participant and records them as a Mureed. Applying never does this by itself |
| Same phone or email already registered | Approval stops and asks to link to the existing person, so nobody is entered twice |
| Request information | Emails a one-use link valid for 14 days; with no email, the Principal is shown the link once |
| Reject | The reason stays internal; the applicant gets a general message if notifications are on |

The review history cannot be changed. Personal data can be removed on request, or automatically after the retention period set in Settings; the reference and history remain.

## Anti-spam

A hidden honeypot field, a signed token proving the form was open at least 3 seconds, rate limits per address, and configurable duplicate detection. **No CAPTCHA**: it needs an outside service and keys. Add Cloudflare Turnstile if spam gets through.

## Uploads

PDF, PNG, JPEG or WebP, up to 5 MB each and 5 per application, checked by file contents. They are stored privately and can only be opened by the Principal through the API, and each opening is audited. Website images are separate and public by design: never upload private files as website images.

## Deployment

See `deploy/madarsa-website.service` and the Caddyfile. Set the same `PUBLIC_SITE_TOKEN` in the API's and the website's environment. Point each madrasa's domain at the server and add a Caddy block for it. A site with no matching `SiteDomain` shows a plain not-found page.

## Limits

- Text only: no rich-text editor. A blank line starts a paragraph. This also means no HTML can be injected.
- Arabic is entered by hand and falls back to English. Nothing is machine-translated. Urdu is not included.
- No photographs are supplied: upload real ones in the CMS.
- WhatsApp and SMS are not connected; applicants are notified by email only.
