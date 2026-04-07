function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`ui-panel p-0 ${className}`}>
      {(title || subtitle || action) && (
        <div className="border-b-2 border-[#d7dbe3] bg-[linear-gradient(90deg,rgba(140,108,255,0.14),rgba(107,125,255,0.06),rgba(255,184,77,0.04))] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="ui-title text-lg text-phosphor">{title}</h2>}
              {subtitle && <p className="mt-2 text-sm text-mist">{subtitle}</p>}
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
