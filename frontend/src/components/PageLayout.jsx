import "./PageLayout.css";

/**
 * PageLayout
 * Outer shell + elevated surface for pages that host CommonTable or forms.
 *
 * Props:
 * - wrapClassName?: extra class for outer wrapper
 * - cardClassName?: extra class for inner surface
 * - flushTable?: if true, strips inner CommonTable chrome (padding/border)
 */
export default function PageLayout({ children, wrapClassName = "", cardClassName = "", flushTable = false }) {
  return (
    <div className={`wpx ${wrapClassName}`.trim()}>
      <div className={`wpxShell ${cardClassName}`.trim()}>
        <div className={`wpxMain ${flushTable ? "wpxMain_flush" : ""}`.trim()}>{children}</div>
      </div>
    </div>
  );
}
