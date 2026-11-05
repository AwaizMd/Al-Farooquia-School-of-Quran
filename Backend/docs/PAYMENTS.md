# Fee payments: methods, workflows and rules

There is **no payment gateway**. Razorpay was removed in CR-01. Families pay each
madrasa **directly into its own account**, by bank transfer or UPI. The office
verifies each payment before it counts. Office staff record cash and cheques themselves.

Each madrasa sets up its own methods in **Fee Payment Settings**:

| Method | What families see | Counts toward dues when |
|---|---|---|
| Bank transfer | The madrasa's account details to copy | staff verify the reported UTR against the bank statement |
| UPI QR | The madrasa's own QR code, plus an "Open UPI app" link on phones | staff verify the reported reference |
| Cash, cheque | (paid at the office) | the office records it; a receipt is issued |

Families see a method only when it is **switched on and fully set up**. If nothing is set up, they are asked to contact the office.

All methods feed **one fee ledger**: invoices, payments, allocations (oldest invoice first), refunds and receipts. Balances are always calculated on the server from that ledger. Money is stored as whole paise (INR). A reported payment changes nothing until it is verified, and reminders keep going until then.

## Who can do what

| | Madrasa Admin / Super Admin | Accountant | Principal | CA | Parent |
|---|---|---|---|---|---|
| Bank details and UPI QR (`payments.configure`) | ✓ | — | — | — | — |
| Record cash and cheque payments, issue invoices | ✓ | ✓ | — | — | — |
| See reported payments | all | all | all (read-only) | all (read-only) | own children |
| Approve, reject or request information (`fees.verify`) | ✓ | ✓ | — | — | — |
| Waivers, corrections and refunds | ✓ | — | — | — | — |
| Report a bank or UPI payment, and see bank details and the QR | — | — | — | — | linked guardians with payment rights |

Everything is enforced by the API, per madrasa: staff of one madrasa never see another madrasa's payments. Nobody can approve a payment they reported themselves.

## Setting up (per madrasa)

### Bank transfer

Enter:
- the account holder name, bank name, account number (9–18 digits) and IFSC,
- optionally, the branch, account type, payment instructions and reference instructions.

You can also require proof of payment. The method can be switched on only when the required fields are valid.

Bank details are given only to a guardian paying for a linked child (that child's madrasa) and to fee staff for preview.

### UPI QR

Upload the madrasa's **own** QR code from its bank or UPI app as a PNG, JPEG or WebP image of up to 2 MB. The type is checked by the file's content. The app never generates or substitutes a QR code.

You can also add a UPI ID, which enables an "Open UPI app" link on phones. That link is a convenience only: not every UPI app honours it, so the QR code is always shown.

Removing the QR code switches UPI off.

## Bank transfer and UPI: verification

```
reported ──► PENDING_VERIFICATION ──► APPROVED  (payment + receipt recorded)
                 │      ▲      └────► REJECTED  (reason; family may report again)
                 ▼      │
              NEEDS_INFO (office asks; family replies)
```

1. **Report.** The guardian picks the invoices and enters the amount, payment date, UTR/transaction reference, an optional note and proof (if required).

   The report is a **claim**: no balance changes. The family is told "Payment submitted for verification". Everyone in that madrasa who can verify payments gets a "Payment to verify" notice.
2. **Check.** Staff confirm the credit in the madrasa's bank statement. A screenshot or UTR alone is **not** proof, because screenshots can be edited. Automatic matching against an imported bank statement is planned (CR-01 phase 2); until then this check is manual.
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
  - If the money exceeds the balance at approval time (for example, the office took cash meanwhile), it is still recorded. The excess is kept unallocated and flagged for review.
- **Partial payments** are allowed. They are applied oldest invoice first.
- **Duplicate UTR.**
  - References are compared ignoring spaces, dashes and case.
  - Within a madrasa, a reference that is already pending, waiting for information, approved, or in the ledger is refused. Database indexes on `(madrasaId, reference)` enforce this as well.
  - A rejected reference may be reported again, and staff see a warning listing its earlier use.
- **Proof files** are private:
  - The type is checked by content (PDF, PNG, JPEG or WebP, up to 5 MB).
  - A file can be attached only by its uploader.
  - Every download is authorised and served with `Content-Disposition` and a sandboxing CSP.
  - Files are kept with the financial record. There is no automatic deletion; set a retention policy if the madrasa needs one.
- **Separation of duties:** a staff member who reported a payment (for example, an admin who is also a parent) cannot review it.

## Receipts

Every recorded or approved payment gets a receipt number from its madrasa's own series, `<prefix>-<financial year>-<sequence>`. The prefix is set in the madrasa's configuration and defaults to `NR`. Numbers are gapless within each April–March year and unique within the madrasa.

The receipt shows:
- the madrasa and student,
- the invoices paid and the amount,
- the method and date,
- the reference (UTR, cheque number or bank reference),
- who recorded it, marked "(verified)" for reported payments.

Payments and receipts cannot be edited. Use a refund to reverse a payment. Refunds are paid back by the office (cash, cheque or transfer) and are complete when recorded.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/payments/options?studentId=` | Methods offered by the student's madrasa, with bank and UPI details for the payer |
| `GET /api/v1/payments/upi-qr?studentId=` | That madrasa's QR image (payers and fee staff) |
| `POST /api/v1/payments/proofs` | Upload proof (raw body) |
| `POST`/`GET /api/v1/payments/submissions`, `GET`/`PATCH …/:id`, `GET …/:id/proof` | Report, list, view and reply |
| `POST …/submissions/:id/approve` \| `/reject` \| `/request-info` | Verification (`fees.verify`) |
| `GET`/`PUT /api/v1/admin/payment-settings`, `PUT`/`DELETE …/upi-qr` | Settings of the active madrasa (`payments.configure`; changes need recent re-authentication) |

The full reference is at `/api/docs` when `API_DOCS_ENABLED=true`.

## Not yet built (CR-01 phase 2)

- Cheque status (received / deposited / cleared / bounced, with reversal on bounce).
- Bank statement import with automatic matching.
- A unique UPI reference per due, in the deep link.

Until these exist, record cheques as office payments and reverse a bounced cheque with a refund. Reconciliation stays manual.
