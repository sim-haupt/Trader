function EmptyState({ title, description }) {
  return (
    <div className="ui-panel border-dashed px-6 py-14 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[6px] border border-[var(--line)] bg-black">
        <div className="h-3 w-3 rounded-[6px] bg-[var(--text)]" />
      </div>
      <h3 className="mt-6 text-[1.8rem] font-semibold tracking-[-0.05em] text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[var(--text-muted)]">{description}</p>
    </div>
  );
}

export default EmptyState;
