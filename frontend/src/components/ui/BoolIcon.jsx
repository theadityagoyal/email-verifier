import { Check, X } from 'lucide-react'

export default function BoolIcon({ value }) {
  return value
    ? <Check className="w-4 h-4 text-emerald-400" />
    : <X className="w-4 h-4 text-slate-600" />
}
