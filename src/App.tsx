import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import SignIn from './pages/SignIn'
import Trips from './pages/Trips'
import { m } from './i18n/t'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <p className="p-6 text-stone-600">{m.common.loading}</p>
  if (!session) return <Navigate to="/sign-in" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route
            path="/trips"
            element={
              <RequireAuth>
                <Trips />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/trips" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
