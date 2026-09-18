import type { HTMLAttributes } from "react";

type ResponsiveTableCellAttributes = HTMLAttributes<HTMLTableCellElement> & {
  "data-card-width"?: "full";
  "data-label": string;
};

export function responsiveTableCell(label: string, width?: "full"): ResponsiveTableCellAttributes {
  return {
    "data-label": label,
    ...(width ? { "data-card-width": width } : {}),
  };
}
