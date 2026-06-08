'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TipsterPage() {
  const router = useRouter()

  useEffect(() => {
    // Check if already logged in
    const stored = localStorage.getItem('bf_tipster')
    if (stored) {
      router.replace('/tipster/dashboard')
    } else {
      router.replace('/tipster/signup')
    }
  }, [router])

  return null
}
