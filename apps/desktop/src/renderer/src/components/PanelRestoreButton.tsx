type PanelRestoreButtonProps = {
  direction: "left" | "right";
  label: string;
  onClick: () => void;
};

export const PanelRestoreButton = ({
  direction,
  label,
  onClick,
}: PanelRestoreButtonProps) => (
  <button
    className={`panel-restore panel-restore-${direction}`}
    type="button"
    aria-label={label}
    onClick={onClick}
  >
    <span
      className={`panel-arrow ${
        direction === "left" ? "panel-arrow-right" : "panel-arrow-left"
      }`}
    />
  </button>
);
