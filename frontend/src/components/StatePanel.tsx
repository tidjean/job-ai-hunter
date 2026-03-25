type StatePanelProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

export function StatePanel({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction
}: StatePanelProps) {
  return (
    <div className="panel state-panel card border-0">
      <h3 className="mb-0">{title}</h3>
      <p className="mb-0">{description}</p>
      {actionLabel || secondaryActionLabel ? (
        <div className="state-actions d-flex flex-wrap">
          {actionLabel && onAction ? <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button> : null}
          {secondaryActionLabel && onSecondaryAction ? (
            <button className="secondary btn btn-outline-info" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
