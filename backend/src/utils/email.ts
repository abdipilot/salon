import { env } from '../config/env.js'

interface EmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[EMAIL SKIP] To: ${opts.to} | Subject: ${opts.subject}`)
    return
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'SalonHub <noreply@salon.somict.com>',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })
  } catch (err) {
    console.error('Email send failed:', err)
  }
}

export function welcomeEmailHtml(firstName: string, dashboardUrl: string): string {
  return `
    <h2>Welcome to SalonHub, ${firstName}!</h2>
    <p>Your 14-day free trial has started. Explore all features without any commitment.</p>
    <a href="${dashboardUrl}" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
      Go to Dashboard
    </a>
    <p>Your trial ends in 14 days. Upgrade anytime to keep your data and features.</p>
  `
}

export function trialExpiryEmailHtml(firstName: string, daysLeft: number, upgradeUrl: string): string {
  return `
    <h2>Hi ${firstName}, your trial ${daysLeft <= 0 ? 'has expired' : `ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}!</h2>
    <p>${daysLeft <= 0
      ? 'Your SalonHub trial has ended. Upgrade now to continue managing your salon.'
      : `You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} left on your SalonHub trial.`
    }</p>
    <a href="${upgradeUrl}" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
      Upgrade Now
    </a>
  `
}
