function EmptyState({ title, description }) {
  return (
    <div className="ui-panel border-dashed px-6 py-14 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#e5e7eb42] bg-white/[0.04]">
        <div className="h-2.5 w-2.5 rounded-full bg-white/80" />
      </div>
      <h3 className="mt-5 text-2xl font-bold tracking-[-0.04em] text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-white/60">{description}</p>
    </div>
  );
}

export default EmptyState;
