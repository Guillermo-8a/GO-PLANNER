import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import TeamTrackerPage from './TeamTrackerPage.jsx'
import AboutPage from './AboutPage.jsx'
import { GlobalProvider } from './context/GlobalContext'
import { GoBotProvider } from './context/GoBotContext'
import './Index.css'
import './utils/loadBar.js'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/team-tracker" element={<TeamTrackerPage />} />
        <Route path="/" element={<GlobalProvider><GoBotProvider><AboutPage /></GoBotProvider></GlobalProvider>} />
        <Route path="/about" element={<Navigate to="/" replace />} />
        <Route path="/app/*" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
