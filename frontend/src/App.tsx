import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './contexts/LanguageContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SessionList from './pages/SessionList'
import SessionDetail from './pages/SessionDetail'
import LapComparison from './pages/LapComparison'
import Novedades from './pages/Novedades'

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="sessions" element={<SessionList />} />
            <Route path="sessions/:sessionId" element={<SessionDetail />} />
            <Route path="compare" element={<LapComparison />} />
            <Route path="novedades" element={<Novedades />} />
          </Route>
        </Routes>
      </LanguageProvider>
    </BrowserRouter>
  )
}

export default App
