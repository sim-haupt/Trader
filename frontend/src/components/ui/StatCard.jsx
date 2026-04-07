import Card from "./Card";

function StatCard({ label, value, accent = "mint" }) {
  const accentMap = {
    mint: "text-mint",
    coral: "text-coral",
    gold: "text-[#ffc14d]",
    warning: "text-[#ffc14d]",
    neutral: "text-phosphor"
  };

  return (
    <Card className="h-full overflow-hidden">
      <p className="ui-title text-xs uppercase text-white">{label}</p>
      <p className={`mt-4 text-4xl font-semibold tracking-[0.05em] ${accentMap[accent] || "text-phosphor"}`}>
        {value}
      </p>
    </Card>
  );
}

export default StatCard;
