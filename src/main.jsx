import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './components/Toast/ToastProvider'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'  // ← Thêm dòng này

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>  {/* ← Thêm vào đây */}
      <SettingsProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </SettingsProvider>
    </ErrorBoundary>  {/* ← Đóng ở đây */}
  </StrictMode>,
)


