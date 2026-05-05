export default function CommonLineItemsTable({
  className = "",
  columns = [],
  children
}) {
  const visible = (columns || []).filter((c) => !c?.hidden);
  return (
    <table className={`cliItemsTable ${className}`.trim()}>
      <thead>
        <tr>
          {visible.map((col) => (
            <th
              key={col.key || col.label}
              className={col.className || ""}
              data-required={col.required ? "true" : undefined}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

