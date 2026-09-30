import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// @ts-ignore
import './index.css' // 🌟 FILLED FIXED PATH: May tuldok at slash na para basahin si src/index.css mo!
// After index.css, so its transitions win over Tailwind's transition-* utilities.
import './styles/motion.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
