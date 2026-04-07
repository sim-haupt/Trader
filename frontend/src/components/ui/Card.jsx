function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section
      className={`rounded-3xl border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-mist">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export default Card;
