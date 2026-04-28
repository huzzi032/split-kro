import { Routes, Route } from 'react-router'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Dashboard from './pages/Dashboard'
import Groups from './pages/Groups'
import GroupDetail from './pages/GroupDetail'
import Expenses from './pages/Expenses'
import NewExpense from './pages/NewExpense'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Notifications from './pages/Notifications'
import Settlements from './pages/Settlements'
import InviteAccept from './pages/InviteAccept'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import AppLayout from './components/AppLayout'
import { useAuth } from './hooks/useAuth'
import { Toaster } from './components/ui/sonner'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth({ redirectOnUnauthenticated: true })
  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>
  if (!isAuthenticated) return null
  return (
    <AppLayout>
      {children}
      <Toaster position="top-right" />
    </AppLayout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite" element={<InviteAccept />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
      <Route path="/groups/:id" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
      <Route path="/events/:id" element={<ProtectedRoute><EventDetail /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/expenses/new" element={<ProtectedRoute><NewExpense /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/settlements" element={<ProtectedRoute><Settlements /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
