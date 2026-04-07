function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`ui-panel p-0 ${className}`}>
      {(title || subtitle || action) && (
        <div className="border-b-2 border-[#2a2240] bg-[linear-gradient(90deg,rgba(68,52,103,0.72),rgba(42,34,64,0.52),rgba(24,19,34,0.12))] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="ui-title text-lg text-[#f7f7fb]">{title}</h2>}
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
