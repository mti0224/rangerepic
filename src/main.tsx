import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { preloadFonts } from './lib/fonts'
import { installGameCursor } from './lib/gameCursor'

void preloadFonts()
installGameCursor()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
