function LoadingState({
  label = "Loading...",
  className = "",
  panel = false,
  size = "md"
}) {
  const spinnerSize =
    size === "sm"
      ? "h-5 w-5 border-2"
      : size === "lg"
        ? "h-10 w-10 border-[3px]"
        : "h-7 w-7 border-[3px]";

  const wrapperClassName = panel
    ? "ui-panel flex min-h-[220px] items-center justify-center"
    : "flex min-h-[220px] items-center justify-center";

  return (
    <div className={`${wrapperClassName} ${className}`.trim()}>
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <span
          className={`${spinnerSize} animate-spin rounded-full border-white/14 border-t-white/80 border-r-white/30`}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-white/58">{label}</p>
      </div>
    </div>
  );
}

export default LoadingState;
