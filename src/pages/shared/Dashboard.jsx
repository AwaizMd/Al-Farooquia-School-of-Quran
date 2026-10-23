import { useStore } from '../../context/DemoStore'
import AdminDashboard from '../admin/AdminDashboard'
import MentorDashboard from '../mentor/MentorDashboard'
import StudentDashboard from '../student/StudentDashboard'
import ParentDashboard from '../parent/ParentDashboard'

export default function Dashboard() {
  const { state } = useStore()
  const role = state.session.role
  if (role === 'mentor') return <MentorDashboard />
  if (role === 'student') return <StudentDashboard />
  if (role === 'parent') return <ParentDashboard />
  return <AdminDashboard />
}
