import { useStore } from '../../context/DemoStore'
import AdminDashboard from '../admin/AdminDashboard'
import MentorDashboard from '../mentor/MentorDashboard'
import StudentDashboard from '../student/StudentDashboard'
import ParentDashboard from '../parent/ParentDashboard'
import Hostel from '../admin/Hostel'
import Fees from './Fees'
import CommitteeOverview from '../committee/CommitteeOverview'

export default function Dashboard() {
  const { state } = useStore()
  const role = state.session.role
  const persona = state.session.persona
  if (persona === 'warden') return <Hostel />
  if (persona === 'accountant' || persona === 'ca') return <Fees />
  if (persona === 'committee') return <CommitteeOverview />
  if (role === 'mentor') return <MentorDashboard />
  if (role === 'student') return <StudentDashboard />
  if (role === 'parent') return <ParentDashboard />
  return <AdminDashboard />
}
