import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { DemoStoreProvider } from '../context/DemoStore'
import { AuthProvider } from '../context/AuthContext'
import { ToastProvider } from '../context/ToastContext'
import { I18nProvider } from '../i18n/I18nProvider'
import AppRoutes from './router'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <DemoStoreProvider>
          <AuthProvider>
            <ToastProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </ToastProvider>
          </AuthProvider>
        </DemoStoreProvider>
      </I18nProvider>
    </MotionConfig>
  )
}
