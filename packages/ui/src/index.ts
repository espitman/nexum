export type BadgeTone = "neutral" | "success" | "warning" | "danger";

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
};

export const badgeToneClassName: Record<BadgeTone, string> = {
  neutral: "nexum-badge-neutral",
  success: "nexum-badge-success",
  warning: "nexum-badge-warning",
  danger: "nexum-badge-danger"
};
