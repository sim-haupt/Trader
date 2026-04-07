function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`ui-panel flex h-full flex-col border-[#e5e7eb42] p-0 ${className}`}>
      {(title || subtitle || action) && (
        <div className="border-b border-[#e5e7eb42] bg-[linear-gradient(180deg,rgba(255,255,255,0.026),rgba(255,255,255,0.008))] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="ui-title text-[11px] text-white/78">{title}</h2>}
              {subtitle ? <p className="mt-2 max-w-2xl text-[15px] leading-6 text-white/54">{subtitle}</p> : null}
            </div>
            {action}
          </div>
        </div>
      )}
      <div className="flex-1 p-6">{children}</div>
    </section>
  );
}

export default Card;
