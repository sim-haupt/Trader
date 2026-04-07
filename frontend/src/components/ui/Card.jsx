function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section
      className={`rounded-[24px] border border-mint/15 bg-[linear-gradient(180deg,rgba(10,15,13,0.95),rgba(6,10,8,0.95))] p-5 shadow-crt backdrop-blur ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-phosphor">{title}</h2>}
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
