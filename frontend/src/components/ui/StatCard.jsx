import Card from "./Card";

function StatCard({ label, value, accent = "mint" }) {
  const accentMap = {
    mint: "text-mint",
    coral: "text-coral",
    gold: "text-mint",
    warning: "text-mint",
    neutral: "text-phosphor"
  };

  return (
    <Card className="h-full">
      <p className="ui-title text-[11px] text-white/56">{label}</p>
      <p className={`mt-4 text-[2.1rem] font-bold tracking-[-0.05em] ${accentMap[accent] || "text-phosphor"}`}>
        {value}
      </p>
    </Card>
  );
}

export default StatCard;
