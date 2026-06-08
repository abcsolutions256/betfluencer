'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Tip } from '@/types'

export interface NotifItem {
  id:          string
  tipster_id:  string
  tipsterName: string
  tip:         Tip
  read:        boolean
  received_at: string
}

const STORAGE_KEY = 'bf_notifs'

function loadNotifs(): NotifItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveNotifs(items: NotifItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)))
}

export function useNotifications() {
  const [notifs, setNotifs] = useState<NotifItem[]>([])

  useEffect(() => {
    setNotifs(loadNotifs())
  }, [])

  const unreadCount = notifs.filter(n => !n.read).length

  const markAllRead = useCallback(() => {
    const updated = notifs.map(n => ({ ...n, read: true }))
    setNotifs(updated)
    saveNotifs(updated)
  }, [notifs])

  const markRead = useCallback((id: string) => {
    const updated = notifs.map(n => n.id === id ? { ...n, read: true } : n)
    setNotifs(updated)
    saveNotifs(updated)
  }, [notifs])

  const addNotif = useCallback((item: Omit<NotifItem, 'id' | 'read' | 'received_at'>) => {
    const newItem: NotifItem = {
      ...item,
      id:          crypto.randomUUID(),
      read:        false,
      received_at: new Date().toISOString(),
    }
    const updated = [newItem, ...loadNotifs()]
    setNotifs(updated)
    saveNotifs(updated)
  }, [])

  const clearAll = useCallback(() => {
    setNotifs([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { notifs, unreadCount, markAllRead, markRead, addNotif, clearAll }
}
