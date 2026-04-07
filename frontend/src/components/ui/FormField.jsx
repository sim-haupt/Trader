function FormField({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium tracking-[0.01em] text-white/72">{label}</span>
      {children}
      {error && <span className="mt-2 block text-sm text-coral">{error}</span>}
    </label>
  );
}

export default FormField;
