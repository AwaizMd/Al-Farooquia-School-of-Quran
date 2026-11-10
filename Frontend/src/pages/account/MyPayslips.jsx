import { t } from '../../i18n/I18nProvider'
import { useEffect, useState } from 'react'
import { Printer, Wallet } from 'lucide-react'
import { get } from '../../api/client'
import { Badge, Button, Card, EmptyState, Modal, Notice, PageHeader } from '../../components/ui'
import { money } from '../../utils/format'
import { SlipLines } from '../admin/Payroll'

export default function MyPayslips() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  useEffect(() => { get('/payroll/me').then(setData, (e) => setError(e.message)) }, [])
  return (
    <div className="space-y-4">
      <PageHeader title={t('My Payslips')} subtitle={t('Your approved payslips. Only you and the payroll office can see these.')} />
      {error && <Notice tone="red">{error}</Notice>}
      {data && !data.items.length && <EmptyState icon={Wallet} title={t('No payslips yet')}>{t('A payslip appears here once the month is approved.')}</EmptyState>}
      {data?.items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {data.items.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setOpen(s)} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-start hover:bg-ivory-50 sm:px-5">
                  <span className="min-w-0 flex-1 text-[14px] font-bold text-forest">{s.month}</span>
                  <span className="font-bold tabular text-forest">{money(s.netMinor / 100, 'INR')}</span>
                  <Badge tone={s.status === 'PAID' ? 'green' : 'blue'}>{s.status === 'PAID' ? 'Paid' : 'Approved'}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={t('Payslip')} subtitle={open?.month}
        footer={<><Button variant="secondary" onClick={() => setOpen(null)}>{t('Close')}</Button><Button icon={Printer} onClick={() => window.print()}>{t('Print')}</Button></>}>
        {open && <div className="print-area"><SlipLines lines={open.lines} net={open.netMinor} />{open.paidOn && <p className="mt-2 text-[12.5px] text-ink-muted">{t('Paid on')} {open.paidOn}</p>}</div>}
      </Modal>
    </div>
  )
}
