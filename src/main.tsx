import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Portfolio from './Portfolio'
import './index.css'

const isPortfolio = window.location.pathname.replace(/\/+$/, '') === '/portfolio'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isPortfolio ? <Portfolio /> : <App />}
  </React.StrictMode>,
)
