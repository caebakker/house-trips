import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import SignIn from './pages/SignIn'
import Trips from './pages/Trips'
import Terms from './pages/Terms'
import { m } from './i18n/t'

const TripDetail = lazy(() => import('./pages/TripDetail'))
const TripFormPage = lazy(() => import('./pages/TripFormPage'))
const ListingFormPage = lazy(() => import('./pages/ListingFormPage'))
const AdminQueue = lazy(() => import('./pages/AdminQueue'))
const AdminCredits = lazy(() => import('./pages/AdminCredits'))
const DevPreview = import.meta.env.DEV ? lazy(() => import('./dev/M2Preview')) : null

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <p className="p-6 text-stone-600">{m.common.loading}</p>
  if (!session) return <Navigate to="/sign-in" replace />
  return children
}

function Loading() {
  return <p className="p-6 text-stone-600">{m.common.loading}</p>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/terms" element={<Terms />} />
            <Route
              path="/trips"
              element={
                <RequireAuth>
                  <Trips />
                </RequireAuth>
              }
            />
            <Route
              path="/trips/new"
              element={
                <RequireAuth>
                  <TripFormPage />
                </RequireAuth>
              }
            />
            <Route
              path="/trips/:tripId/edit"
              element={
                <RequireAuth>
                  <TripFormPage />
                </RequireAuth>
              }
            />
            <Route
              path="/trips/:tripId/listings/new"
              element={
                <RequireAuth>
                  <ListingFormPage />
                </RequireAuth>
              }
            />
            <Route
              path="/trips/:tripId/listings/:tripListingId/edit"
              element={
                <RequireAuth>
                  <ListingFormPage />
                </RequireAuth>
              }
            />
            <Route
              path="/trips/:tripId"
              element={
                <RequireAuth>
                  <TripDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/queue"
              element={
                <RequireAuth>
                  <AdminQueue />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/credits"
              element={
                <RequireAuth>
                  <AdminCredits />
                </RequireAuth>
              }
            />
            {DevPreview && <Route path="/dev/m2" element={<DevPreview />} />}
            <Route path="*" element={<Navigate to="/trips" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
