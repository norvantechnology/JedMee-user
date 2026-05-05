import "./InlineAlert.css";

export default function InlineAlert({
  tone = "info", // info | success | warn | danger
  title,
  message,
  icon = null,
  actions = null,
  className = ""
}) {
  const t = String(tone || "info");
  return (
    <div className={`ia ia_${t} ${className}`.trim()} role="status" aria-live="polite">
      <div className="iaInner">
        {icon ? <div className="iaIcon" aria-hidden="true">{icon}</div> : <div className="iaDot" aria-hidden="true" />}
        <div className="iaBody">
          {title ? <div className="iaTitle">{title}</div> : null}
          {message ? <div className="iaMsg">{message}</div> : null}
          {actions ? <div className="iaActions">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

