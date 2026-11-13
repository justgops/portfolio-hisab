import { useEffect, useState } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The browser fires `beforeinstallprompt` once, possibly before React has rendered; keep it here so it is never missed.
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force(n => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return {
    canPrompt: deferred !== null,
    async prompt() {
      if (!deferred) return
      void deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') { deferred = null; notify() }
    },
  }
}

/** Same rule as fabric-costing-lite: show the app when installed (standalone) or on a desktop browser; phones must install first. */
export function isInstalledOrDesktop(): boolean {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  return standalone || !mobile
}
