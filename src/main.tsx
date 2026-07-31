import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const redirectedPath = sessionStorage.getItem('spa-redirect')
if (redirectedPath) {
  sessionStorage.removeItem('spa-redirect')
  history.replaceState(null, '', redirectedPath)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
