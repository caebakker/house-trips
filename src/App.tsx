import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import SignIn from './pages/SignIn'
import Trips from './pages/Trips'
import Terms from './pages/Terms'
import OptOut from './pages/OptOut'
import { SiteFooter } from './components/SiteFooter'
import { m } from './i18n/t'

const TripDetail = lazy(() => import('./pages/TripDetail'))
const TripFormPage = lazy(() => import('./pages/TripFormPage'))
const ListingFormPage = lazy(() => import('./pages/ListingFormPage'))
const AdminQueue = lazy(() => import('./pages/AdminQueue'))
const AdminCredits = lazy(() => import('./pages/AdminCredits'))
const TripPlan = lazy(() => import('./pages/TripPlan'))
const AdminOptOuts = lazy(() => import('./pages/AdminOptOuts'))
const DevPreview = import.meta.env.DEV ? lazy(() => import('./dev/M2Preview')) : null
const DevPlan = import.meta.env.DEV ? lazy(() => import('./dev/M3Preview')) : null
const DevOptOut = import.meta.env.DEV ? lazy(() => import('./dev/OptOutPreview')) : null

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
        <div className="flex min-h-svh flex-col bg-stone-50">
          <div className="flex-1">
            <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy/opt-out" element={<OptOut />} />
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
              path="/trips/:tripId/plan"
              element={
                <RequireAuth>
                  <TripPlan />
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
            <Route
              path="/admin/opt-outs"
              element={
                <RequireAuth>
                  <AdminOptOuts />
                </RequireAuth>
              }
            />
            {DevPreview && <Route path="/dev/m2" element={<DevPreview />} />}
            {DevPlan && <Route path="/dev/m3" element={<DevPlan />} />}
            {DevOptOut && <Route path="/dev/opt-out" element={<DevOptOut />} />}
            <Route path="*" element={<Navigate to="/trips" replace />} />
          </Routes>
            </Suspense>
          </div>
          <SiteFooter />
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
