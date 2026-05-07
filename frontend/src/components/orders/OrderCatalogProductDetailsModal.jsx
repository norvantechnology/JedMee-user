import { fmtMoney, fmtCurrency } from "../../utils/format.js";
import { AppButton } from "../ui/buttons.jsx";
import CommonModal from "../CommonModal.jsx";
import ModalFooterShell from "../ui/ModalFooterShell.jsx";
import { IconChevronsDown, IconChevronsUp, IconPill, IconStore } from "../ui/AppIcons.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import "./OrderCatalogProductDetailsModal.css";

export default function OrderCatalogProductDetailsModal({ open, onClose, row }) {
  const { taxLabel, taxIdLabel } = useLocale();
  const wholesalerName = row?.wholesaler_name || "";
  const addressLines = [
    row?.wholesaler_address_line1,
    row?.wholesaler_address_line2,
    [row?.wholesaler_city, row?.wholesaler_state].filter(Boolean).join(", "),
    row?.wholesaler_pincode,
  ].filter(Boolean);
  const addressText = addressLines.join("\n") || "";

  return (
    <CommonModal
      open={open}
      ariaLabel="order-catalog-product-details"
      onClose={onClose}
      size="lg"
      title="Catalog Product Details"
      footer={
        <ModalFooterShell variant="appActions">
          <AppButton variant="secondary" type="button" onClick={onClose}>
            Close
          </AppButton>
        </ModalFooterShell>
      }
    >
      <div className="cpd_wrap">

        {/* ── Wholesaler Section ─────────────────────────────── */}
        <div className="cpd_section">
          <div className="cpd_sectionHeader">
            <div className="cpd_sectionIcon cpd_iconBlue">
              <IconStore />
            </div>
            <span className="cpd_sectionTitle">Wholesaler Details</span>
          </div>

          <div className="cpd_grid">
            <div className="cpd_field cpd_span12">
              <div className="cpd_label">Wholesaler Name</div>
              <div className="cpd_value cpd_valueLarge">{wholesalerName}</div>
            </div>

            <div className="cpd_field cpd_span6">
              <div className="cpd_label">Contact Person</div>
              <div className="cpd_value">{row?.wholesaler_contact_name || ""}</div>
            </div>

            <div className="cpd_field cpd_span6">
              <div className="cpd_label">Phone</div>
              <div className="cpd_value">
                {`${row?.wholesaler_phone_country_code || ""} ${row?.wholesaler_phone_number || ""}`.trim() || ""}
              </div>
            </div>

            <div className="cpd_field cpd_span6">
              <div className="cpd_label">Email</div>
              <div className="cpd_value">{row?.wholesaler_email || ""}</div>
            </div>

            <div className="cpd_field cpd_span6">
              <div className="cpd_label">{taxIdLabel}</div>
              <div className="cpd_value cpd_mono">{row?.wholesaler_gst_number || ""}</div>
            </div>

            <div className="cpd_field cpd_span12">
              <div className="cpd_label">Address</div>
              <div className="cpd_value cpd_multiline">{addressText}</div>
            </div>
          </div>
        </div>

        {/* ── Product Section ────────────────────────────────── */}
        <div className="cpd_section">
          <div className="cpd_sectionHeader">
            <div className="cpd_sectionIcon cpd_iconGreen">
              <IconPill />
            </div>
            <span className="cpd_sectionTitle">Product Details</span>
          </div>

          <div className="cpd_grid">
            <div className="cpd_field cpd_span12">
              <div className="cpd_label">Product Name</div>
              <div className="cpd_value cpd_valueLarge">{row?.product_name || ""}</div>
            </div>

            <div className="cpd_field cpd_span4">
              <div className="cpd_label">Product Code</div>
              <div className="cpd_value cpd_mono">{row?.product_code || ""}</div>
            </div>

            <div className="cpd_field cpd_span4">
              <div className="cpd_label">Drug Name</div>
              <div className="cpd_value">{row?.drug_name || ""}</div>
            </div>

            <div className="cpd_field cpd_span4">
              <div className="cpd_label">Packing</div>
              <div className="cpd_value">{row?.packing || ""}</div>
            </div>
          </div>

          {/* Pricing & stock chips */}
          <div className="cpd_statsRow">
            <div className="cpd_statChip cpd_chipPrimary">
              <div className="cpd_statLabel">Catalog Price</div>
              <div className="cpd_statValue">{fmtCurrency(row?.catalog_price || 0)}</div>
            </div>
            <div className="cpd_statChip">
              <div className="cpd_statLabel">MRP</div>
              <div className="cpd_statValue">
                {row?.mrp == null ? "" : fmtCurrency(row?.mrp || 0)}
              </div>
            </div>
            <div className="cpd_statChip">
              <div className="cpd_statLabel">{taxLabel}</div>
              <div className="cpd_statValue">
                {row?.sales_gst == null ? "" : `${Number(row?.sales_gst || 0)}%`}
              </div>
            </div>
            <div className="cpd_statChip cpd_chipStock">
              <div className="cpd_statLabel">Current Stock</div>
              <div className="cpd_statValue">{Number(row?.current_stock || 0)}</div>
            </div>
          </div>

          {/* Order qty limits */}
          <div className="cpd_qtyLimitRow">
            <div className="cpd_qtyLimitCard">
              <IconChevronsUp />
              <div>
                <div className="cpd_qtyLimitLabel">Minimum Order Qty</div>
                <div className="cpd_qtyLimitValue">{Number(row?.min_order_qty || 1)} units</div>
              </div>
            </div>
            <div className="cpd_qtyLimitCard">
              <IconChevronsDown />
              <div>
                <div className="cpd_qtyLimitLabel">Maximum Order Qty</div>
                <div className="cpd_qtyLimitValue">
                  {row?.max_order_qty == null ? "No limit" : `${Number(row?.max_order_qty || 0)} units`}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {row?.catalog_notes && row.catalog_notes !== "" && (
            <div className="cpd_notes">
              <div className="cpd_notesLabel">Wholesaler Notes</div>
              <div className="cpd_notesText">{row.catalog_notes}</div>
            </div>
          )}
          {!row?.catalog_notes && (
            <div className="cpd_notes cpd_notesEmpty">
              <div className="cpd_notesLabel">Wholesaler Notes</div>
              <div className="cpd_notesText cpd_notesNone">No notes provided</div>
            </div>
          )}
        </div>

      </div>
    </CommonModal>
  );
}