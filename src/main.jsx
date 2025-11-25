import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const currentPath = window.location.pathname
const lowercasePath = currentPath.toLowerCase()
if (currentPath !== lowercasePath && currentPath !== '/') {
  window.location.replace(window.location.origin + lowercasePath + window.location.search + window.location.hash)
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
