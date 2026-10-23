import { useStore } from '../context/DemoStore'
import { visibleStudents } from '../services/selectors'

// Returns the student whose data a student/parent page should show.
// Parents choose among linked children only; other students are never reachable.
export function useActiveChild() {
  const { state, idx, dispatch } = useStore()
  const list = visibleStudents(state, idx)
  const s = state.session
  let child = null
  if (s?.role === 'student') child = list[0] || null
  else if (s?.role === 'parent') child = list.find((c) => c.id === s.childId) || list[0] || null
  const select = (id) => dispatch({ type: 'SELECT_CHILD', childId: id })
  return { child, children: list, select, isParent: s?.role === 'parent' }
}

export function useVisibleStudents() {
  const { state, idx } = useStore()
  return visibleStudents(state, idx)
}
