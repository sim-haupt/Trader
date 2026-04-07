function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`ui-panel p-0 ${className}`}>
      {(title || subtitle || action) && (
        <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="ui-title text-sm text-white">{title}</h2>}
              {subtitle ? <p className="mt-2 max-w-2xl text-sm text-white/52">{subtitle}</p> : null}
            </div>
            {action}
          </div>
        </div>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}

export default Card;
