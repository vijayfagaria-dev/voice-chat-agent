import { Fragment } from "react";
import { FieldStatus } from "@voice-chat-agent/shared/protocol";
import { fieldLabel, formatField, readField } from "../../lib/record";

export function FieldList({ fields }: { fields: Record<string, unknown> }) {
  return (
    <dl>
      {Object.entries(fields).map(([name, field]) => {
        const { value, status, flagged } = readField(field);
        // Nothing was given for it: say so plainly, not with a red "missing" tag (an optional field left empty is normal).
        if (status === FieldStatus.MISSING)
          return (
            <Fragment key={name}>
              <dt>{fieldLabel(name)}</dt>
              <dd className="none">Not provided</dd>
            </Fragment>
          );
        return (
          <Fragment key={name}>
            <dt>{fieldLabel(name)}</dt>
            <dd className={flagged ? "flagged" : undefined}>
              {formatField(name, value)}
              {flagged && <span className="status">needs checking</span>}
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}
