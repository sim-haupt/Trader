function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`ui-panel p-0 ${className}`}>
      {(title || subtitle || action) && (
        <div className="border-b-2 border-mint/30 bg-[linear-gradient(90deg,rgba(138,103,255,0.24),rgba(83,189,255,0.08),rgba(255,180,77,0.04))] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="ui-title text-lg text-[#fff8df]">{title}</h2>}
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
