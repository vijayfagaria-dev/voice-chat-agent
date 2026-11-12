import { Outcome, type FinalRecord } from "@voice-chat-agent/shared/protocol";
import { isPlainObject } from "../../lib/record";
import { FieldList } from "./FieldList";

// What the customer is told about their claim; the record's own outcome and reason stay in the record (the API has them).
const STATUS: Record<string, string> = {
  [Outcome.COMPLETED]: "Submitted",
  [Outcome.PARTIAL]: "Saved, with some details still missing",
  [Outcome.OPTED_OUT]: "Stopped at your request",
  [Outcome.NEEDS_REVIEW]: "With our team for a check",
};

export function RecordCard({ record }: { record: FinalRecord }) {
  const { outcome, fields }: Partial<FinalRecord> = isPlainObject(record) ? record : {};
  const status = outcome ? STATUS[String(outcome)] : undefined;
  return (
    <section className="record" aria-label="Your claim">
      <h2>
        Your claim
        {status && <span className={`badge outcome-${outcome}`}>{status}</span>}
      </h2>
      {isPlainObject(fields) && <FieldList fields={fields} />}
    </section>
  );
}
