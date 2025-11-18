// src/lib/submitRepair.ts

export type RepairPayloadForFlow = {
  serial: string;
  model: string;
  family: string;
  sizeIn: number;
  failureCode: string;
  disposition: string;
  technician: string;
  notes?: string;
  // Use ONE of these:
  photosFiles?: File[];        // when you have File objects
  photosDataUrls?: string[];   // when you have data URLs (e.g., "data:image/png;base64,....")
};

const FLOW_URL = (process.env.REACT_APP_FLOW_URL as string) || "";

/** Convert File[] -> [{ name, contentBytes }] */
async function filesToFlowArray(files: File[]) {
  const items = await Promise.all(
    files.map(
      (f) =>
        new Promise<{ name: string; contentBytes: string }>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const dataUrl = String(r.result || "");
            const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
            resolve({ name: f.name || "photo.png", contentBytes: base64 });
          };
          r.onerror = reject;
          r.readAsDataURL(f);
        })
    )
  );
  return items;
}

/** Convert ["data:image/...;base64,XXXX", ...] -> [{ name, contentBytes }] */
function dataUrlsToFlowArray(urls: string[]) {
  return urls
    .filter(Boolean)
    .map((u, i) => {
      const base64 = u.includes(",") ? u.split(",")[1] : u;
      return { name: `photo_${i + 1}.png`, contentBytes: base64 };
    });
}

/** Send to Flow */
export async function submitRepairViaFlow(input: RepairPayloadForFlow) {
  if (!FLOW_URL) throw new Error("Missing REACT_APP_FLOW_URL in .env.local");

  let photos: { name: string; contentBytes: string }[] = [];

  if (input.photosFiles && input.photosFiles.length) {
    photos = await filesToFlowArray(input.photosFiles);
  } else if (input.photosDataUrls && input.photosDataUrls.length) {
    photos = dataUrlsToFlowArray(input.photosDataUrls);
  }

  const body = {
    timestamp: new Date().toISOString(),
    serial: input.serial,
    model: input.model,
    family: input.family,
    sizeIn: input.sizeIn,
    failurecode: input.failureCode,
    disposition: input.disposition,
    technician: input.technician,
    notes: input.notes || "",
    photos, // array for Flow's "Apply to each"
  };

  const resp = await fetch(FLOW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return resp; // caller can check resp.ok
}



