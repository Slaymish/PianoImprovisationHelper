import './ui.css'

type Props = {
  label?: string
}

export function Spinner({ label = 'Loading' }: Props) {
  return (
    <div className="ui-spinner" role="status" aria-live="polite">
      <span className="ui-spinner__dot" aria-hidden="true" />
      <span className="ui-spinner__label">{label}</span>
    </div>
  )
}
