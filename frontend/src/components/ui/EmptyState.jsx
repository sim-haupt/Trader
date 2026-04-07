function EmptyState({ title, description }) {
  return (
    <div className="ui-panel border-dashed px-6 py-12 text-center">
      <h3 className="ui-title text-lg text-[#effff6]">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm text-mist">{description}</p>
    </div>
  );
}

export default EmptyState;
