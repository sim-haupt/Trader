function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`ui-panel p-0 ${className}`}>
      {(title || subtitle || action) && (
        <div className="border-b-2 border-white/10 bg-[linear-gradient(90deg,rgba(28,28,28,0.95),rgba(18,18,18,0.9),rgba(10,10,10,0.88))] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="ui-title text-lg text-white">{title}</h2>}
              {subtitle && <p className="mt-2 text-sm text-white/80">{subtitle}</p>}
            </div>
            {action}
          </div>
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export default Card;
