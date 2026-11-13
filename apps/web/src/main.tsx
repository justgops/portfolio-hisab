import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@onyantra-in/ui-kit/base'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { DataProvider } from './data.tsx'
import './index.css'

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <DataProvider>
          <App />
        </DataProvider>
      </BrowserRouter>
    </TooltipProvider>
  </React.StrictMode>,
)
