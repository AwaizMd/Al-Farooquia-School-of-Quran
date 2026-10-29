import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Lenis from 'lenis'

// Gentle wheel smoothing on desktop only. Touch scrolling stays native, and
// users who prefer reduced motion get the browser's default behaviour.
export function useSmoothScroll() {
  const lenisRef = useRef(null)
  const { pathname } = useLocation()

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (reduce || coarse) return
    const lenis = new Lenis({ duration: 0.9, smoothWheel: true, syncTouch: false })
    lenisRef.current = lenis
    let id
    const raf = (t) => { lenis.raf(t); id = requestAnimationFrame(raf) }
    id = requestAnimationFrame(raf)
    return () => { cancelAnimationFrame(id); lenis.destroy(); lenisRef.current = null }
  }, [])

  useEffect(() => {
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }, [pathname])
}
