function EmptyState({ title, description }) {
  return (
    <div className="ui-panel border-dashed px-6 py-14 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="h-3 w-3 rounded-full bg-[var(--accent)] shadow-[0_0_0_6px_rgba(103,168,255,0.14)]" />
      </div>
      <h3 className="mt-6 text-[2rem] font-bold tracking-[-0.05em] text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-white/58">{description}</p>
    </div>
  );
}

export default EmptyState;
