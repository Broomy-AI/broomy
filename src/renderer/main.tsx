/**
 * React entry point that mounts the application into the DOM.
 *
 * Creates a React root on the #root element, renders the App component inside
 * React.StrictMode, and imports the global Tailwind CSS stylesheet.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
