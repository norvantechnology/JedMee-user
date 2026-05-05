import CommonLoading from "../CommonLoading.jsx";
import "./ReportUi.css";

export function ReportPageIntro({ title, subtitle }) {
  return (
    <div className="raTop">
      <div>
        <div className="raTitle">{title}</div>
        {subtitle != null && subtitle !== false ? <div className="raSub">{subtitle}</div> : null}
      </div>
    </div>
  );
}

export function ReportCard({ children, className = "", busy = false }) {
  return (
    <div className={`pageCard rptCard ${className}`.trim()}>
      {busy ? (
        <div className="rptCardBusyBar" aria-hidden="true">
          <CommonLoading variant="bar" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function ReportToolbar({ children, className = "" }) {
  return <div className={`rptToolbar ${className}`.trim()}>{children}</div>;
}

export function ReportToolbarLeft({ children, className = "" }) {
  return <div className={`rptToolbarLeft ${className}`.trim()}>{children}</div>;
}

export function ReportToolbarPrim({ children, className = "" }) {
  return <div className={`rptToolbarPrim ${className}`.trim()}>{children}</div>;
}

export function ReportToolbarFilters({ children, className = "" }) {
  return <div className={`rptToolbarFilters ${className}`.trim()}>{children}</div>;
}

export function ReportToolbarHint({ children, className = "" }) {
  return <span className={`rptToolbarHint ${className}`.trim()}>{children}</span>;
}

export function ReportSearchInput(props) {
  const { className = "", ...rest } = props;
  return <input {...rest} type="search" className={`rptSearchInput ${className}`.trim()} />;
}

export function ReportCountChip({ busy, children, loadingText = "Loading…" }) {
  return (
    <span className="rptCountChip" aria-busy={busy}>
      {busy ? <CommonLoading variant="inline" size="sm" text={loadingText} /> : children}
    </span>
  );
}

export function ReportListEmpty({ busy, children, loadingText = "Loading report…" }) {
  return (
    <div className="rptListEmpty">
      {busy ? (
        <span className="rptListEmptyLoad">
          <CommonLoading variant="inline" size="md" text={loadingText} />
        </span>
      ) : (
        children
      )}
    </div>
  );
}

export function ReportTableScroll({ children, className = "" }) {
  return <div className={`rptTableScroll ${className}`.trim()}>{children}</div>;
}

export function ReportPane({ "aria-label": ariaLabel, children, className = "" }) {
  return (
    <div className={`rptPane ${className}`.trim()} aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function ReportPaneHead({ children, className = "" }) {
  return <div className={`rptPaneHead ${className}`.trim()}>{children}</div>;
}

export function ReportPaneTitle({ children, className = "" }) {
  return <h3 className={`rptPaneTitle ${className}`.trim()}>{children}</h3>;
}

export function ReportPaneSub({ children, className = "" }) {
  return <span className={`rptPaneSub ${className}`.trim()}>{children}</span>;
}

export function ReportPaneBody({ children, className = "" }) {
  return <div className={`rptPaneBody ${className}`.trim()}>{children}</div>;
}

export function ReportToolbarCheck({ children, className = "" }) {
  return <label className={`rptToolbarHint rptToolbarCheck ${className}`.trim()}>{children}</label>;
}
