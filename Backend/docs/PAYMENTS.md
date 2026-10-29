# Fee payments: methods, workflows and rules

Each Madarsa chooses how families pay, in **Fee Payment Settings**. The choice takes effect immediately, with no deployment:

| Mode | What families see |
|---|---|
| Razorpay only | **Pay Online**: confirmed automatically by the gateway |
| Bank Transfer / UPI QR only | **Bank Transfer** and/or **Pay Using UPI QR**: confirmed by the office |
| Both | Families choose between them |

Families see a method only when it is **switched on and fully set up**. If nothing is set up, they are asked to contact the office.

All methods feed **one fee ledger**: invoices, payments, allocations (oldest invoice first), refunds and receipts. Balances are always calculated on the server from that ledger. Money is stored as whole paise (INR).

## Who can do what

| | Admin | Principal | Mentor / Warden | Parent | Student |
|---|---|---|---|---|---|
| Change payment settings (`payments.configure`) | ✓ | — | — | — | — |
| See reported payments | all | all (read-only) | — | own children | own |
| Approve, reject or request information (`fees.verify`) | ✓ | — | — | — | — |
| Report a bank/UPI payment, see bank details and the QR | — | — | — | linked guardians with payment rights | — |

Everything is enforced by the API. Nobody can approve a payment they reported themselves.

## Setting up

### Razorpay

1. On the server, set `SETTINGS_ENCRYPTION_KEYS` and `SETTINGS_ACTIVE_KEY_VERSION`. These seal the secrets you enter in the app (AES-256-GCM).
2. In the Razorpay Dashboard, create API keys. Add a webhook pointing to the URL shown in Fee Payment Settings, with the events `payment.captured`, `order.paid`, `payment.failed` and `refund.processed`, and a secret of your choice.
3. In Fee Payment Settings, choose **Test mode**, then enter the Key ID, Key Secret and webhook secret, and click **Save keys & validate**. The server checks the keys with Razorpay.
4. Switch Razorpay on. Test mode is ready once the keys validate.
5. For **Live mode**, enter live keys (`rzp_live_…`) and validate them. Then send a test webhook from the Razorpay Dashboard. Live mode can be switched on only after one correctly signed webhook has arrived for those keys.

How secrets are handled:
- **Never returned.** The Key Secret and webhook secret never come back from the API. The screen shows only that they are saved, and the Key ID is masked.
- **Server-managed alternative.** Setting `PAYMENT_PROVIDER=razorpay` with the `RAZORPAY_*` environment variables makes the keys server-managed; the screen then shows them as read-only.
- **Development.** `PAYMENT_PROVIDER=dev` uses a local simulator that moves no money. It is refused in production.

### Bank transfer

Enter:
- the account holder name, bank name, account number (9–18 digits) and IFSC,
- optionally, the branch, account type, payment instructions and reference instructions.

You can also require proof of payment. The method can be switched on only when the required fields are valid.

Bank details are given only to a guardian paying for a linked child, and to fee staff for preview.

### UPI QR

Upload the Madarsa's **own** QR code from its bank or UPI app as a PNG, JPEG or WebP image of up to 2 MB. The type is checked by the file's content. The app never generates or substitutes a QR code.

You can also add a UPI ID, which enables an "Open UPI app" link on phones. That link is a convenience only: not every UPI app honours it, so the QR code is always shown.

Removing the QR code switches UPI off.

## Online payment (Razorpay)

1. The parent chooses invoices. The **server** works out the amount from its own records and creates the Razorpay order. Any amount the browser sends is ignored.
2. Razorpay's checkout returns ids and a signature. The server checks the signature, then **fetches the payment from Razorpay** and credits it only if it was captured for this order with the right amount and currency.
3. The signed webhook does the same independently. Events are deduplicated, and a payment attempt can credit at most once. A delivery whose processing failed is processed again when the gateway retries.
4. A redirect or the browser saying "success" is never proof of payment.

Once a method is switched off, no new orders are created. Webhooks and refunds for earlier payments still work.

## Bank transfer and UPI: manual verification

```
reported ──► PENDING_VERIFICATION ──► APPROVED  (payment + receipt recorded)
                 │      ▲      └────► REJECTED  (reason; family may report again)
                 ▼      │
              NEEDS_INFO (office asks; family replies)
```

1. **Report.** The guardian picks the invoices and enters the amount, payment date, UTR/transaction reference, an optional note and proof (if required).

   The report is a **claim**: no balance changes. The family is told "Payment submitted for verification", and fee staff get a "Payment to verify" notice.
2. **Check.** Staff confirm the credit in the Madarsa's bank statement. A screenshot or UTR alone is **not** proof, because screenshots can be edited. The app does not reconcile with the bank automatically.
3. **Approve.** In one database transaction:
   - the submission row is locked and must still be pending,
   - the reference is checked against approved claims and the ledger,
   - the amount is applied through the same ledger path as office payments (oldest invoice first),
   - a receipt is issued, the approver and time are recorded, it is audited, and the family is notified.

   Concurrent approvals apply a payment exactly once.
4. **Reject**, with a reason. The record and its history are kept, the balance is unchanged, and the family sees the reason and can report the payment again.

### Business rules (approved defaults)

- **Amount.**
  - A family can claim at most the outstanding balance of the chosen invoices, *minus* their claims already waiting for verification.
  - Staff confirm the amount actually received. It is pre-filled; if it differs, a note is required.
  - If the money exceeds the balance at approval time (for example, the office took cash meanwhile), it is still recorded. The excess is kept unallocated and flagged for review, as for online payments.
- **Partial payments** are allowed. They are applied oldest invoice first.
- **Duplicate UTR.**
  - References are compared ignoring spaces, dashes and case.
  - A reference already pending, waiting for information, approved, or already in the ledger is refused. A database index enforces this as well.
  - A rejected reference may be reported again, and staff see a warning listing its earlier use.
- **Proof files** are private:
  - The type is checked by content (PDF, PNG, JPEG or WebP, up to 5 MB).
  - A file can be attached only by its uploader.
  - Every download is authorised and served with `Content-Disposition` and a sandboxing CSP.
  - Files are kept with the financial record. There is no automatic deletion; set a retention policy if the Madarsa needs one.
- **Separation of duties:** a staff member who reported a payment (for example, an admin who is also a parent) cannot review it.

## Receipts

Every approved or confirmed payment gets one receipt number, `NR-<financial year>-<sequence>`, gapless within each April–March year. The receipt shows:
- the institution and student,
- the invoices paid and the amount,
- the method and date,
- the reference (UTR or gateway payment id),
- who recorded it, marked "(verified)" for manual payments.

Payments and receipts cannot be edited. Use a refund to reverse a payment.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/payments/options?studentId=` | Methods offered, with bank and UPI details for the payer |
| `GET /api/v1/payments/upi-qr` | QR image (payers and fee staff) |
| `POST /api/v1/payments/attempts`, `POST …/attempts/:id/verify`, `GET …/attempts/:id` | Online checkout |
| `POST /api/v1/payments/webhooks/razorpay` | Signed gateway callback |
| `POST /api/v1/payments/proofs` | Upload proof (raw body) |
| `POST`/`GET /api/v1/payments/submissions`, `GET`/`PATCH …/:id`, `GET …/:id/proof` | Report, list, view and reply |
| `POST …/submissions/:id/approve` \| `/reject` \| `/request-info` | Verification (`fees.verify`) |
| `GET`/`PUT /api/v1/admin/payment-settings`, `POST …/razorpay/validate`, `PUT`/`DELETE …/upi-qr` | Settings (`payments.configure`; changes need recent re-authentication) |

The full reference is at `/api/docs` when `API_DOCS_ENABLED=true`.

## Not yet verified

- **Razorpay:** the adapter is tested against a local fake of Razorpay's API, not against Razorpay itself. Run it in **test mode** with a real test account before going live.
- **Bank reconciliation** is manual. The app doesn't connect to a bank.
- **Notifications** for these events are in-app. Email for payment events isn't sent separately.
