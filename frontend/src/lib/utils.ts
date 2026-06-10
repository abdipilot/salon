import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string, currency = 'KES'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(num)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function daysUntil(date: string | Date): number {
  const now = new Date()
  const target = new Date(date)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    CONFIRMED: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
    NO_SHOW: 'bg-gray-100 text-gray-800',
    PAID: 'bg-green-100 text-green-800',
    PARTIAL: 'bg-orange-100 text-orange-800',
    OVERDUE: 'bg-red-100 text-red-800',
    ACTIVE: 'bg-blue-100 text-blue-800',
    TRIAL: 'bg-purple-100 text-purple-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    CANCELLED_SHOP: 'bg-gray-100 text-gray-800',
  }
  return map[status] || 'bg-gray-100 text-gray-800'
}
