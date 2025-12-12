import type { ReactNode } from 'react'

import './ui.css'

type Props = {
  title?: string
  subtitle?: string
  children: ReactNode
}

export function Card({ title, subtitle, children }: Props) {
  return (
    <section className="ui-card">
      {(title || subtitle) && (
        <header className="ui-card__header">
          {title && <h2 className="ui-card__title">{title}</h2>}
          {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
        </header>
      )}
      <div className="ui-card__body">{children}</div>
    </section>
  )
}
