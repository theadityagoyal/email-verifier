import clsx from 'clsx'

export default function StatusBadge({ status }) {
  const map = {
    verified: 'badge-verified',
    invalid: 'badge-invalid',
    risky: 'badge-risky',
    processing: 'badge-processing',
  }
  return (
    <span className={clsx(map[status] || 'badge-processing')}>
      {status}
    </span>
  )
}
