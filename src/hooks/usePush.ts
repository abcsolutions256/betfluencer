'use client'
import { useState, useEffect } from 'react'

export type PushStatus = 'unsupported' | 'denied' | 'granted' | 'prompt' | 'loading'

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('loading')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported'); return
    }
    const p = Notification.permission
    setStatus(p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt')
  }, [])

  async function requestPermission(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) return false
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const result = await Notification.requestPermission()
      if (result !== 'granted') { setStatus('denied'); return false }
      setStatus('granted')
      // Store subscription keyed to phone number
      const phone = localStorage.getItem('bf_phone')
      if (phone) {
        localStorage.setItem(`bf_push_${phone}`, 'true')
      }
      return true
    } catch {
      return false
    }
  }

  // Send a local push notification (simulates server push for demo)
  function sendLocalPush(title: string, body: string, url: string = '/') {
    if (Notification.permission !== 'granted') return
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // // vibrate: [200, 100, 200],
        data: { url },
      })
    })
  }

  return { status, requestPermission, sendLocalPush }
}
