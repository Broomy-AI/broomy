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
import { applyAppearanceToDocument } from './shared/hooks/useAppearance'

// Set the theme before React paints. The store is already seeded synchronously
// from the preload snapshot, and main has already painted the window frame in the
// right colour — three layers, so a light-mode user never sees a dark flash.
applyAppearanceToDocument()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
