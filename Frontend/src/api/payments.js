import { blobUrl, get, patch, post, put, del, upload } from './client'

// Fee payment methods (Razorpay, bank transfer, UPI QR) and reported manual payments.

export const paymentOptions = (studentUuid) => get(`/payments/options?studentId=${studentUuid}`)
export const upiQrUrl = () => blobUrl('/payments/upi-qr')

export const uploadProof = (file) => upload('/payments/proofs', file, { method: 'POST' })
export const submitManualPayment = (body) => post('/payments/submissions', body)
export const listSubmissions = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  return get(`/payments/submissions${q.toString() ? `?${q}` : ''}`)
}
export const getSubmission = (id) => get(`/payments/submissions/${id}`)
export const proofUrl = (id) => blobUrl(`/payments/submissions/${id}/proof?inline=1`)
export const respondToSubmission = (id, body) => patch(`/payments/submissions/${id}`, body)
export const approveSubmission = (id, body) => post(`/payments/submissions/${id}/approve`, body)
export const rejectSubmission = (id, reason) => post(`/payments/submissions/${id}/reject`, { reason })
export const requestInfo = (id, message) => post(`/payments/submissions/${id}/request-info`, { message })

export const getPaymentSettings = () => get('/admin/payment-settings')
export const savePaymentSettings = (body) => put('/admin/payment-settings', body)
export const validateRazorpay = () => post('/admin/payment-settings/razorpay/validate', {})
export const uploadUpiQr = (file) => upload('/admin/payment-settings/upi-qr', file)
export const removeUpiQr = () => del('/admin/payment-settings/upi-qr')

export const SUBMISSION_STATUS = {
  PENDING_VERIFICATION: { label: 'Pending verification', tone: 'gold' },
  NEEDS_INFO: { label: 'More information needed', tone: 'amber' },
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
}
export const MANUAL_METHOD = { BANK_TRANSFER: 'Bank transfer', UPI: 'UPI' }

/** Rupees typed by a person → integer paise (no floating-point arithmetic on money). */
export function toMinor(value) {
  const m = /^\s*(\d{1,9})(?:\.(\d{1,2}))?\s*$/.exec(String(value ?? ''))
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}
