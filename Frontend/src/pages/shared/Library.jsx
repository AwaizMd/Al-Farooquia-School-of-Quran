import { t } from "../../i18n/I18nProvider"
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, FileText, Headphones, NotebookPen, FileSpreadsheet, Upload, Download, Eye, Lock, Info, Library as LibIcon } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useAuth } from '../../context/AuthContext'
import { post, upload } from '../../api/client'
import { AUDIENCE_CODE } from '../../api/people'
import { useToast } from '../../context/ToastContext'
import { useQueryState } from '../../hooks/useQueryState'
import { useActiveChild } from '../../hooks/useScope'
import { PageHeader, Card, SearchInput, Select, Button, Modal, Input, Textarea, Badge, EmptyState, Notice, Stagger, staggerItem, cx, StarMotif } from '../../components/ui'
import { RESOURCE_CATEGORIES, RESOURCE_TYPES } from '../../constants/labels'
import { fmtDate } from '../../utils/date'

const TYPE_ICON = { 'PDF Book': BookOpen, 'Study Notes': NotebookPen, 'Tajweed Guide': FileText, Worksheet: FileSpreadsheet, 'Audio Guide': Headphones }
const CAT_TONE = { Hifz: 'bg-primary-700', Nazira: 'bg-primary-500', Tajweed: 'bg-gold-600', Arabic: 'bg-slateblue-500', 'Islamic Studies': 'bg-forest', 'General Learning': 'bg-sage-400' }

// The server decides who may open each item (canOpen); this mirrors it only for older cached items.
function canAccess(r, role, student) {
  if (typeof r.canOpen === 'boolean') return r.canOpen
  if (role === 'admin' || role === 'mentor') return true
  if (r.access === 'Staff only') return false
  if (r.access === 'All students') return true
  if (!student) return false
  if (r.access === 'Hifz groups') return student.track === 'hifz'
  if (r.access === 'Alimiyyah') return student.track === 'alim'
  return true
}

export default function Library() {
  const { state } = useStore()
  const role = state.session.role
  const { child } = useActiveChild()
  const [q, setQ] = useQueryState('q')
  const [cat, setCat] = useQueryState('cat')
  const [type, setType] = useQueryState('type')
  const [openId, setOpenId] = useQueryState('open')
  const [upload, setUpload] = useState(false)

  const all = state.library.filter((r) => role !== 'student' && role !== 'parent' ? true : r.access !== 'Staff only')
  const list = useMemo(() => all.filter((r) => (!cat || r.category === cat) && (!type || r.type === type) && (!q || `${r.title} ${r.author} ${r.description}`.toLowerCase().includes(q.toLowerCase()))), [all, cat, type, q])
  const open = state.library.find((r) => r.id === openId)

  return (
    <div>
      <PageHeader title={t("Digital Library")} subtitle={t("Books, notes and Tajweed guides for students and mentors")}
        actions={(state.session.persona === 'admin' || role === 'mentor') && <Button icon={Upload} onClick={() => setUpload(true)}>{t("Add resource")}</Button>} />
      <Notice tone="gold" icon={Info} className="mb-4">{t("All titles are fictional samples. Two sample PDFs are included; other items show a description only.")}</Notice>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_200px]">
        <SearchInput value={q} onChange={setQ} placeholder={t("Search title, author or topic")} />
        <Select aria-label={t("Resource type")} value={type} onChange={(e) => setType(e.target.value)} placeholder={t("All types")} options={RESOURCE_TYPES} />
      </div>
      <div className="-mx-4 mb-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <div className="flex gap-1.5">
          {['', ...RESOURCE_CATEGORIES].map((c) => (
            <button key={c || 'all'} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
              className={cx('min-h-[40px] shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition', cat === c ? 'border-primary-700 bg-primary-700 text-white' : 'border-line-strong bg-white text-ink-soft hover:border-primary-300')}>
              {t(c || 'All')} <span className="opacity-70">{(c ? all.filter((r) => r.category === c) : all).length}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length ? (
        <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => {
            const Icon = TYPE_ICON[r.type] || FileText
            const ok = canAccess(r, role, child)
            return (
              <motion.button variants={staggerItem} key={r.id} type="button" onClick={() => setOpenId(r.id)} className="card group flex h-full flex-col overflow-hidden text-start transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className={cx('pattern-stars-light relative flex h-20 items-end justify-between px-4 pb-3', CAT_TONE[r.category] || 'bg-primary-600')}>
                  <StarMotif className="absolute end-3 top-2 h-10 w-10 text-white/20" />
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur"><Icon size={20} /></span>
                  <span className="text-[11.5px] font-bold text-white/90">{t(r.category)}</span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="line-clamp-2 text-[15px] font-bold text-forest">{r.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">{r.author}</p>
                  <p className="mt-2 line-clamp-2 text-[13px] text-ink-soft">{r.description}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                    <Badge>{r.type}</Badge>
                    {r.file ? <Badge tone="green">{t(r.mimeType?.startsWith('audio') ? "Audio" : "PDF")}</Badge> : <Badge tone="neutral">{t("Description only")}</Badge>}
                    {!ok && <Badge tone="red" icon={Lock}>{r.access}</Badge>}
                  </div>
                </div>
              </motion.button>
            )
          })}
        </Stagger>
      ) : <Card><EmptyState icon={LibIcon} title={t("No resources found")}>{t("Try a different search or category.")}</EmptyState></Card>}

      <ResourceDetail resource={open} onClose={() => setOpenId('')} canOpen={open && canAccess(open, role, child)} />
      <UploadModal open={upload} onClose={() => setUpload(false)} />
    </div>
  )
}

function ResourceDetail({ resource: r, onClose, canOpen }) {
  if (!r) return null
  const url = r.file
  return (
    <Modal open={!!r} onClose={onClose} title={r.title} subtitle={`${r.category} · ${r.type}`}
      footer={canOpen && url ? (
        <>{r.mimeType === 'application/pdf' && <Button variant="secondary" icon={Eye} href={`${url}?inline=1`} target="_blank" rel="noopener noreferrer">{t("Preview")}</Button>}<Button icon={Download} href={url}>{t("Download")}</Button></>
      ) : <Button variant="secondary" onClick={onClose}>{t("Close")}</Button>}>
      <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
        {[['Author / source', r.author], ['Uploaded', fmtDate(r.uploaded)], ['Access', r.access], ['Length', r.pages ? `${r.pages} pages` : '—']].map(([k, v]) => (
          <div key={k}><dt className="text-[12px] text-ink-muted">{t(k)}</dt><dd className="font-semibold text-forest">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-4 text-[14px] text-ink-soft">{r.description}</p>
      {!canOpen && <Notice tone="red" icon={Lock} className="mt-4">{t("This resource is restricted to:")} {r.access}.</Notice>}
      {canOpen && !url && <Notice tone="gold" icon={Info} className="mt-4">{t("No file has been uploaded for this item yet.")}</Notice>}
    </Modal>
  )
}

function UploadModal({ open, onClose }) {
  const { refreshCampus } = useAuth()
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const [f, setF] = useState({ title: '', category: 'Tajweed', type: 'Study Notes', author: '', access: 'All students', description: '' })
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async () => {
    const e = {}
    if (f.title.trim().length < 4) e.title = 'Enter a title (at least 4 characters).'
    if (!f.author.trim()) e.author = 'Enter the author or source.'
    if (file && file.size > 15 * 1024 * 1024) e.file = 'Files must be 15 MB or smaller.'
    if (file && !['application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-m4a'].includes(file.type)) e.file = 'Upload a PDF or an audio file (MP3, M4A, OGG or WAV).'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const r = await post('/library', { title: f.title.trim(), category: f.category, type: f.type, author: f.author.trim(), ...(f.description.trim() ? { description: f.description.trim() } : {}), audience: AUDIENCE_CODE[f.access] })
      if (file) await uploadFile(r.id, file)
      await refreshCampus()
      toast('Resource added', { description: file ? 'The file is stored securely.' : 'Saved without a file.' })
      setF({ title: '', category: 'Tajweed', type: 'Study Notes', author: '', access: 'All students', description: '' }); setFile(null)
      onClose()
    } catch (err) {
      setErrors({ file: err.message })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("Add library resource")} footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button icon={Upload} onClick={submit} loading={saving}>{t("Add resource")}</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Input className="sm:col-span-2" label={t("Title")} required value={f.title} onChange={set('title')} error={errors.title} />
        <Select label={t("Category")} value={f.category} onChange={set('category')} options={RESOURCE_CATEGORIES} />
        <Select label={t("Type")} value={f.type} onChange={set('type')} options={RESOURCE_TYPES} />
        <Input label={t("Author / source")} required value={f.author} onChange={set('author')} error={errors.author} />
        <Select label={t("Access")} value={f.access} onChange={set('access')} options={['All students', 'Hifz groups', 'Alimiyyah', 'Staff only']} />
        <Textarea className="sm:col-span-2" label={t("Short description")} value={f.description} onChange={set('description')} />
        <div className="sm:col-span-2">
          <span className="label">{t("File (optional, PDF or audio)")}</span>
          <input type="file" accept=".pdf,audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-[13px] file:me-3 file:min-h-[40px] file:rounded-xl file:border-0 file:bg-sage-100 file:px-4 file:font-semibold file:text-primary-800" />
          {errors.file && <p className="mt-1 text-[12.5px] text-clay-600">{errors.file}</p>}
        </div>
      </div>
    </Modal>
  )
}

/** Sends the file's raw bytes; the server checks its type by content and stores it privately. */
async function uploadFile(id, file) {
  await upload(`/library/${id}/file`, file, { type: file.type === 'audio/x-m4a' ? 'audio/mp4' : file.type })
}
