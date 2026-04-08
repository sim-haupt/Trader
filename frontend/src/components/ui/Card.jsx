function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "",
  headerClassName = "",
  headerInnerClassName = ""
}) {
  return (
    <section className={`ui-panel flex h-full flex-col p-0 ${className}`}>
      {(title || subtitle || action) && (
        <div className={`border-b border-[var(--line)] bg-black/[0.02] px-6 py-4 ${headerClassName}`}>
          <div className={`flex flex-col gap-4 md:flex-row md:items-center md:justify-between ${headerInnerClassName}`}>
            <div className="min-w-0">
              {title && <h2 className="ui-title text-[11px] text-white/72">{title}</h2>}
              {subtitle ? <p className="ui-subtitle mt-2 max-w-2xl text-[0.92rem] text-white/44">{subtitle}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </div>
      )}
      <div className={`flex-1 p-5 lg:p-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export default Card;
