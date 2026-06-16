interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  /** Optioneel element naast de titel, bv. een status-badge ("Voormalig"). */
  titleBadge?: React.ReactNode
}

export function PageHeader({ title, description, actions, titleBadge }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {titleBadge}
        </div>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
