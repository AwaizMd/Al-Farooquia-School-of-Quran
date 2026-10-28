import { Router } from 'express'
import { z } from 'zod'
import { ConcessionKind, Gender, StaffStatus, StudentStatus } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission } from '../../middleware/auth.js'
import { body, query } from '../../middleware/validate.js'
import * as students from './students.service.js'
import * as staff from '../staff/staff.service.js'

export const peopleRouter = Router()

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((s) => !Number.isNaN(Date.parse(s)), 'Not a valid date.')
const Phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number.')
const Id = z.string().uuid()
const Page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(100) }
const NewGuardian = z.object({ name: z.string().trim().min(2).max(120), relation: z.string().trim().min(2).max(40), phone: Phone, email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)), occupation: z.string().trim().max(80).optional() })
const GuardianRef = z.union([z.object({ existingId: Id }), NewGuardian])
const today = () => new Date().toISOString().slice(0, 10)

const StudentFields = {
  name: z.string().trim().min(3).max(120),
  gender: z.enum(Gender),
  dob: Iso.refine((d) => d < today(), 'Date of birth must be in the past.'),
  admissionDate: Iso,
  groupId: Id,
  phone: Phone,
  address: z.string().trim().max(300).optional(),
  hostelResident: z.boolean(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '']).optional(),
  medicalNotes: z.string().trim().max(1000).optional(),
  feePlanId: Id.optional(),
  concession: z.enum(ConcessionKind).nullable().optional(),
}
const CreateStudent = z.object({ ...StudentFields, guardian: GuardianRef, confirmDuplicate: z.boolean().optional() })
const UpdateStudent = z.object({ ...Object.fromEntries(Object.entries(StudentFields).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof StudentFields]: z.ZodOptional<(typeof StudentFields)[K]> }, status: z.enum(StudentStatus).optional(), primaryGuardian: NewGuardian.partial().optional() })
const ListStudents = z.object({ search: z.string().trim().max(100).optional(), groupId: Id.optional(), status: z.enum(StudentStatus).optional(), hostel: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), ...Page })
const Ref = z.object({ ref: z.string().min(1).max(64) })
const LinkGuardian = z.intersection(GuardianRef, z.object({ isPrimary: z.boolean().optional() }))
const CreateStaff = z.object({ displayName: z.string().trim().min(3).max(120), title: z.string().trim().min(2).max(80), phone: Phone.optional(), email: z.string().trim().email().optional(), joinedOn: Iso.optional(), qualification: z.string().trim().max(120).optional(), specialisation: z.string().trim().max(120).optional() })
const T = 'People'

doc('get', '/students', T, 'Students visible to the caller (row-level scoped)', { query: ListStudents })
peopleRouter.get('/students', requireAuth, async (req, res) => {
  res.json(await students.listStudents(req, query(req, ListStudents)))
})

doc('get', '/students/:ref', T, 'One student by id or admission number (404 if outside your scope)')
peopleRouter.get('/students/:ref', requireAuth, async (req, res) => {
  res.json(await students.getStudent(req, Ref.parse(req.params).ref))
})

doc('post', '/students', T, 'Admit a student', { body: CreateStudent, auth: 'students.write (+ concessions.manage for a concession)' })
peopleRouter.post('/students', requireAuth, requirePermission('students.write'), async (req, res) => {
  res.status(201).json(await students.createStudent(req, body(req, CreateStudent)))
})

doc('patch', '/students/:ref', T, 'Update a student record', { body: UpdateStudent, auth: 'students.write' })
peopleRouter.patch('/students/:ref', requireAuth, requirePermission('students.write'), async (req, res) => {
  res.json(await students.updateStudent(req, Ref.parse(req.params).ref, body(req, UpdateStudent)))
})

doc('post', '/students/:ref/guardians', T, 'Link a guardian', { body: LinkGuardian, auth: 'students.write' })
peopleRouter.post('/students/:ref/guardians', requireAuth, requirePermission('students.write'), async (req, res) => {
  res.json(await students.linkGuardian(req, Ref.parse(req.params).ref, body(req, LinkGuardian)))
})

doc('delete', '/students/:ref/guardians/:guardianId', T, 'Unlink a (non-primary) guardian', { auth: 'students.write' })
peopleRouter.delete('/students/:ref/guardians/:guardianId', requireAuth, requirePermission('students.write'), async (req, res) => {
  res.json(await students.unlinkGuardian(req, Ref.parse(req.params).ref, Id.parse(req.params.guardianId)))
})

doc('get', '/groups', T, 'Halqas (families see only their children’s)')
peopleRouter.get('/groups', requireAuth, async (req, res) => {
  res.json(await staff.listGroups(req))
})

doc('put', '/groups/:id/mentor', T, 'Assign the halqa’s mentor', { body: z.object({ staffId: Id }), auth: 'groups.manage' })
peopleRouter.put('/groups/:id/mentor', requireAuth, requirePermission('groups.manage'), async (req, res) => {
  res.json(await staff.assignMentor(req, Id.parse(req.params.id), body(req, z.object({ staffId: Id })).staffId))
})

doc('get', '/staff', T, 'Staff directory (limited without staff.read)')
peopleRouter.get('/staff', requireAuth, async (req, res) => {
  res.json(await staff.listStaff(req))
})

doc('post', '/staff', T, 'Create a staff profile', { body: CreateStaff, auth: 'staff.manage' })
peopleRouter.post('/staff', requireAuth, requirePermission('staff.manage'), async (req, res) => {
  res.status(201).json(await staff.createStaff(req, body(req, CreateStaff)))
})

doc('post', '/staff/:id/status', T, 'Mark staff active/inactive', { body: z.object({ status: z.enum(StaffStatus) }), auth: 'staff.manage' })
peopleRouter.post('/staff/:id/status', requireAuth, requirePermission('staff.manage'), async (req, res) => {
  res.json(await staff.setStaffStatus(req, Id.parse(req.params.id), body(req, z.object({ status: z.enum(StaffStatus) })).status))
})

const ListGuardians = z.object({ search: z.string().trim().max(100).optional(), ...Page })
doc('get', '/guardians', T, 'Guardian directory', { query: ListGuardians, auth: 'guardians.read' })
peopleRouter.get('/guardians', requireAuth, requirePermission('guardians.read'), async (req, res) => {
  res.json(await staff.listGuardians(query(req, ListGuardians)))
})

doc('get', '/fee-plans', T, 'Active fee plans')
peopleRouter.get('/fee-plans', requireAuth, async (_req, res) => {
  res.json(await staff.listFeePlans())
})
