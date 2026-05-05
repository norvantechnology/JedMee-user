import "./EmptyState.css";

export default function EmptyState({
  title = "No results yet",
  message = "We couldn’t find any matching records. Try adjusting filters or search terms.",
  action = null,
  actions = null,
  icon = null,
  className = ""
}) {
  const resolvedActions = actions ?? action;
  return (
    <div className={`es ${className}`.trim()} role="status" aria-live="polite">
      <div className="esInner">
        {icon ? <div className="esIcon" aria-hidden="true">{icon}</div> : null}
        <div className="esBody">
          <div className="esTitle">{title}</div>
          {message ? <div className="esMsg">{message}</div> : null}
          {resolvedActions ? <div className="esAction">{resolvedActions}</div> : null}
        </div>
      </div>
    </div>
  );
}

