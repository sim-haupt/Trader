function EmptyState({ title, description }) {
  return (
    <div className="ui-panel border-dashed px-6 py-14 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[18px] border border-[var(--line)] bg-white/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="h-3 w-3 rounded-full bg-[var(--accent)] shadow-[0_0_0_6px_rgba(124,156,255,0.12)]" />
      </div>
      <h3 className="mt-6 text-[1.8rem] font-semibold tracking-[-0.05em] text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-white/54">{description}</p>
    </div>
  );
}

export default EmptyState;
