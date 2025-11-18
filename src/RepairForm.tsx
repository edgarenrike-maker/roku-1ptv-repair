// src/RepairForm.tsx
import React from "react";
import { submitRepairViaFlow } from "./lib/submitRepair";

export default function RepairForm() {
  const [sending, setSending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setSending(true);

    try {
      const form = new FormData(e.currentTarget);

      // 1) Get the FileList from the input
      const photosList = form.get("photos") as FileList | null;

      // 2) Convert FileList -> File[] OR leave undefined if empty
      const photosFiles =
        photosList && photosList.length > 0 ? Array.from(photosList) : undefined;

      // 3) Send to the Flow
      const resp = await submitRepairViaFlow({
        serial: String(form.get("serial") || "").trim(),
        model: String(form.get("model") || "").trim(),
        family: String(form.get("family") || "").trim(),
        sizeIn: Number(form.get("sizeIn") || 0),
        failureCode: String(form.get("failureCode") || "").trim(),
        disposition: String(form.get("disposition") || "").trim(),
        technician: String(form.get("technician") || "").trim(),
        notes: String(form.get("notes") || ""),
        photosFiles, // <- correct type now (File[] | undefined)
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Flow returned ${resp.status}. ${text}`);
      }

      setMsg("✅ Submitted! Check Excel (Repairs table) and the Photos folder.");
      e.currentTarget.reset();
    } catch (err: any) {
      setMsg(`❌ Submit failed: ${err?.message || err}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "32px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>1PTV Repair – Submit</h1>
      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            Serial *
            <input name="serial" required />
          </label>
          <label>
            Model *
            <input name="model" required />
          </label>
          <label>
            Family *
            <input name="family" required />
          </label>
          <label>
            Size (in) *
            <input name="sizeIn" type="number" min={1} required />
          </label>
          <label>
            Failure Code *
            <input name="failureCode" required placeholder="e.g., PSU_NO_POWER" />
          </label>
          <label>
            Disposition *
            <input name="disposition" required placeholder="e.g., Repaired / Scrap" />
          </label>
          <label>
            Technician *
            <input name="technician" required />
          </label>
          <label>
            Notes
            <textarea name="notes" rows={3} />
          </label>
          <label>
            Photos (optional)
            <input name="photos" type="file" accept="image/*" multiple />
          </label>

          <button type="submit" disabled={sending}>
            {sending ? "Sending..." : "Submit repair"}
          </button>
        </div>
      </form>

      {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
    </div>
  );
}





