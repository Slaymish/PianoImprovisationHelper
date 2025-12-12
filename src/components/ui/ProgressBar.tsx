import './ui.css'

type Props = {
  value: number
  label?: string
}

export function ProgressBar({ value, label }: Props) {
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <div className="ui-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped * 100)}>
      {label && <div className="ui-progress__label">{label}</div>}
      <div className="ui-progress__track">
        <div className="ui-progress__fill" style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  )
}
