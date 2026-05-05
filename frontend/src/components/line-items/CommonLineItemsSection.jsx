import "./CommonLineItemsSection.css";
import CommonInlineAddButton from "../CommonInlineAddButton.jsx";

export default function CommonLineItemsSection({
  title = "Line Items",
  hint = "",
  wrapRef = null,
  className = "",
  onAddLine = null,
  addLineLabel = "Add line item",
  addLineTitle = "Add line item",
  footerRight = null,
  children
}) {
  return (
    <div className={`cliSection ${className}`.trim()}>
      <div className="cliSectionHead">
        <div className="cliSectionTitle">{title}</div>
        {hint ? <div className="cliSectionHint">{hint}</div> : null}
      </div>
      <div className="cliItemsWrap" ref={wrapRef}>
        {children}
      </div>
      {onAddLine || footerRight ? (
        <div className="cliFooter">
          <div className="cliFooterLeft">
            {onAddLine ? (
              <CommonInlineAddButton
                className="cliAddLineBtn"
                label={addLineLabel}
                title={addLineTitle}
                onClick={onAddLine}
              />
            ) : null}
          </div>
          <div className="cliFooterRight">{footerRight}</div>
        </div>
      ) : null}
    </div>
  );
}

