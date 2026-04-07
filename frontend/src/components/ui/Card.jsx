function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "",
  headerClassName = ""
}) {
  return (
    <section className={`ui-panel flex h-full flex-col p-0 ${className}`}>
      {(title || subtitle || action) && (
        <div className={`border-b border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] px-6 py-5 ${headerClassName}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              {title && <h2 className="ui-title text-[11px] text-white/76">{title}</h2>}
              {subtitle ? <p className="ui-subtitle mt-2 max-w-2xl">{subtitle}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </div>
      )}
      <div className={`flex-1 p-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export default Card;
