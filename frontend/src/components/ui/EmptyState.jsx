function EmptyState({ title, description }) {
  return (
    <div className="rounded-[10px] border-2 border-dashed border-cyan/40 bg-[linear-gradient(180deg,rgba(49,33,83,0.9),rgba(25,18,44,0.96))] px-6 py-12 text-center shadow-[0_0_0_2px_rgba(0,0,0,0.55)]">
      <h3 className="text-lg font-semibold uppercase tracking-[0.12em] text-[#fff8e8]">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-[#c6bde3]">{description}</p>
    </div>
  );
}

export default EmptyState;
