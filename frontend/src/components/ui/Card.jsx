function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section
      className={`rounded-[10px] border-2 border-black bg-[linear-gradient(180deg,rgba(78,54,132,0.92),rgba(35,23,51,0.96))] p-0 shadow-[0_0_0_2px_rgba(82,58,140,0.85),0_0_0_6px_rgba(0,0,0,0.7)] backdrop-blur ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="border-b-2 border-black bg-[linear-gradient(180deg,rgba(95,67,164,0.95),rgba(70,47,122,0.95))] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="text-lg font-semibold uppercase tracking-[0.16em] text-[#fff8e8]">{title}</h2>}
              {subtitle && <p className="mt-1 text-sm text-[#c6bde3]">{subtitle}</p>}
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
