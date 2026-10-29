import { AppError } from './errors.js'

/** Upload types identified by their first bytes as well as their declared type. */
export interface FileType {
  ext: string
  sniff: (b: Buffer) => boolean
}

export const IMAGE_TYPES: Record<string, FileType> = {
  'image/png': { ext: 'png', sniff: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', sniff: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
}

export const PDF_TYPE: Record<string, FileType> = {
  'application/pdf': { ext: 'pdf', sniff: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
}

/** Check an upload against the allowed types and size. Returns its file type. */
export function checkUpload(body: Buffer, declaredType: string, allowed: Record<string, FileType>, maxBytes: number, what: string) {
  const type = allowed[declaredType]
  if (!type) throw new AppError(415, 'UNSUPPORTED_FILE', `Upload ${what}.`)
  if (body.length === 0) throw new AppError(422, 'EMPTY_FILE', 'The file is empty.')
  if (body.length > maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', `Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`)
  if (!type.sniff(body)) throw new AppError(415, 'FILE_CONTENT_MISMATCH', 'The file’s contents do not match its type.')
  return type
}

/** A display name that is safe in a Content-Disposition header (never used as a path). */
export const safeFileName = (name: string, ext: string) => name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || `file.${ext}`
