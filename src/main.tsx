import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './css/tokens.css'
import './css/layout.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
