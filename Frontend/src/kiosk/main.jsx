import React from 'react'
import ReactDOM from 'react-dom/client'
import KioskApp from './KioskApp'
import './kiosk.css'

// The kiosk is a separate page from the main app: no charts, animation or heavy
// styling, so it stays quick on an old phone.
ReactDOM.createRoot(document.getElementById('root')).render(<KioskApp />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/kiosk-sw.js', { scope: '/kiosk' }).catch(() => {}))
}
