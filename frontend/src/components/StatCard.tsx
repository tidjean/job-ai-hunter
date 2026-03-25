interface StatCardProps {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn";
}

export function StatCard({ label, value, tone = "neutral" }: StatCardProps) {
  return (
    <div className={`stat-card stat-${tone} card border-0`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
