import Card from "./Card";

function StatCard({ label, value, accent = "mint" }) {
  const accentMap = {
    mint: "text-mint",
    coral: "text-coral",
    gold: "text-[#f6c453]",
    warning: "text-[#f6c453]",
    neutral: "text-phosphor"
  };

  return (
    <Card className="h-full overflow-hidden">
      <p className="ui-title text-[11px] text-white/64">{label}</p>
      <p className={`mt-4 text-4xl font-bold tracking-[-0.03em] ${accentMap[accent] || "text-phosphor"}`}>
        {value}
      </p>
    </Card>
  );
}

export default StatCard;
