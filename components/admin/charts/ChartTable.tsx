export interface ChartColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

/** The "View as table" form of a chart: the same numbers, already formatted. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: ChartColumn[];
  rows: Array<Record<string, string>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-xs text-cb-muted-fg">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`py-1.5 pr-3 font-medium ${c.numeric ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-cb-border text-cb-fg">
              {columns.map((c) => (
                <td key={c.key} className={`py-1.5 pr-3 ${c.numeric ? "text-right tabular-nums" : ""}`}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
