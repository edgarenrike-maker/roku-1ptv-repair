import React, { useMemo, useState, useEffect } from 'react';
import jsPDF from 'jspdf';

/**********************************************
 * ROKU 1PTV Repair – Full Single-File App (Traceability Ready)
 *
 * Tabs
 *  • Intake  – full pre-repair checklist (incl. cosmetics & accessories) + photos
 *  • Repair  – standardized dropdowns (failure/actions with custom add) + photos
 *  • Dashboard – KPIs, 7-day throughput, Pareto, recent repairs (jump to History)
 *  • History – search by Serial, individual/combined viewer + CSV/PDF export
 *  • Admin   – pass-key protected lists editor (sizes/sources/reasons)
 *
 * Storage: IndexedDB (intakes/repairs) + localStorage (admin lists)
 * Theme: Roku purple header, white bg, white title, bold 3D nav buttons
 **********************************************/

// ===== Theme =====
const theme = {
  primary: '#6F1AB1',
  primaryDark: '#4E1180',
  bg: '#FFFFFF',
  card: '#F8F8F8',
  text: '#111111',
  subtext: '#555555',
  border: '#CCCCCC',
  chipBg: '#E0D9EF'
} as const;
const baseFont: React.CSSProperties = {
  fontFamily:
    'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Roku Sans", sans-serif'
};

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  margin: '4px 0 12px',
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: '#FFF',
  color: theme.text,
  ...baseFont
};
const btnStyle: React.CSSProperties = {
  background: theme.primary,
  color: '#fff',
  padding: '10px 18px',
  borderRadius: 12,
  border: 0,
  cursor: 'pointer',
  fontWeight: 800,
  boxShadow: '0 3px 0 #4E1180',
  transform: 'translateY(0)',
  transition: 'transform 0.1s, box-shadow 0.1s',
  ...baseFont
};
const btnGhost: React.CSSProperties = {
  background: '#fff',
  color: theme.text,
  padding: '8px 12px',
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  cursor: 'pointer',
  fontWeight: 800,
  boxShadow: '0 2px 0 #ddd',
  ...baseFont
};
const card: React.CSSProperties = {
  background: theme.card,
  border: `1px solid ${theme.border}`,
  borderRadius: 16,
  padding: 16,
  ...baseFont
};
const chip: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  background: theme.chipBg,
  fontSize: 12,
  color: theme.text,
  ...baseFont
};

// ===== Runtime guard =====
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// ===== Types =====
type ChecklistStatus = 'Pass' | 'Conditional' | 'Fail' | 'N/A';

type Intake = {
  serial: string;
  family: string; // free typed
  model: string;
  sizeIn: number | '';
  mac?: string;
  returnSource: string;
  returnReason: string;
  conditionIn: string;
  notes?: string;
  checklist: {
    labels_match: ChecklistStatus;
    safety_ok: ChecklistStatus;
    ports_intact: ChecklistStatus;
    power_symptom: ChecklistStatus;
    esd_ok: Exclude<ChecklistStatus, 'Conditional' | 'N/A'>;
    cosmetic_backcover: ChecklistStatus;
    cosmetic_screen: ChecklistStatus;
    cosmetic_bezel: ChecklistStatus;
    cosmetic_base: ChecklistStatus;
    accessory_remote: ChecklistStatus;
    accessory_stand: ChecklistStatus;
    accessory_powercord: ChecklistStatus;
    accessory_screws: ChecklistStatus;
  };
  photos: string[];
  createdAt: string; // ISO
};

type RepairDisposition = 'Repaired' | 'Scrap' | 'NTF' | 'BER';

type Repair = {
  serial: string; // links to Intake
  startAt: string; // ISO
  endAt?: string; // ISO
  technician?: string;
  failureCode: string; // pick or typed
  actions: string[]; // pick or typed
  disposition: RepairDisposition;
  notes?: string;
  photos: string[];
};

type CombinedRecord = { serial: string; intake?: Intake; repairs: Repair[] };

// ===== Defaults =====
const DEFAULT_TV_SIZES: number[] = [
  24, 28, 32, 39, 40, 42, 43, 48, 49, 50, 55, 58, 60, 65, 70, 75, 77, 82, 83, 85, 86, 98
];
const DEFAULT_RETURN_SOURCE_SUGGESTIONS = [
  'Retail Return – Best Buy',
  'Retail Return – Costco',
  'Retail Return – Walmart',
  'Amazon',
  'Direct RMA',
  'Rev-Log',
  'TPV Service',
  'Other'
];
const DEFAULT_RETURN_REASON_SUGGESTIONS = [
  'No power',
  'Boot loop',
  'No image',
  'No backlight',
  'Lines on screen',
  'Damaged screen',
  'No sound',
  'HDMI not working',
  'Wi-Fi weak',
  'Cosmetic damage',
  'Remote missing',
  'Stand missing',
  'Other'
];
const FAILURE_CODES = [
  'PSU_NO_POWER',
  'PSU_CYCLING',
  'MB_NO_BOOT',
  'TCON_NO_IMAGE',
  'PANEL_LINES',
  'WIFI_WEAK',
  'HDMI_FAIL',
  'AUDIO_NO_SOUND',
  'OTHER'
];
const ACTION_CODES = [
  'RESEAT_FFC',
  'REPLACE_CAPS',
  'REPLACE_MB',
  'REPLACE_PSU',
  'REPLACE_TCON',
  'FW_REFLASH',
  'CLEAN_CONNECTOR',
  'REWORK_SOLDER'
];

// ===== Criteria text =====
const CRITERIA: Record<string, { title: string; bullets: string[] }> = {
  labels_match: {
    title: 'Labels match',
    bullets: [
      'Carton/rear/RMA match model/size/market; serial readable.',
      'Regulatory marks present (UL/FCC/ICES/RCM).',
      'Mismatch → Conditional; missing/altered → Fail.'
    ]
  },
  safety_ok: {
    title: 'Safety',
    bullets: [
      'Cord insulation intact; ground prong present.',
      'Rear cover fully seated; EMI shields in place.',
      'Any safety defect → Fail.'
    ]
  },
  ports_intact: {
    title: 'Ports',
    bullets: [
      'HDMI/USB/Coax/Optical aligned; no bent pins.',
      'Minor scuff → Conditional; cracked/bent → Fail.'
    ]
  },
  power_symptom: {
    title: 'Power symptom',
    bullets: [
      'Reproduce symptom; log LED/boot code if any.',
      'Not reproducible after 2 cycles → N/A note.'
    ]
  },
  esd_ok: {
    title: 'ESD setup',
    bullets: ['Wrist strap verified; mat ground <10MΩ.', 'Any breach → Fail.']
  },
  cosmetic_backcover: {
    title: 'Cosmetic – Back cover',
    bullets: [
      'No cracks/dents; tabs not broken.',
      'Scratch ≤30mm → Conditional; cracks/gouges → Fail.'
    ]
  },
  cosmetic_screen: {
    title: 'Cosmetic – Screen',
    bullets: [
      'No cracks, lines, pressure mura.',
      'Hairline scratch ≤10mm outside AA → Conditional.'
    ]
  },
  cosmetic_bezel: {
    title: 'Cosmetic – Bezel',
    bullets: ['No cracks/chips; light scuffs okay.', 'Gaps >1.5mm/deformation → Fail.']
  },
  cosmetic_base: {
    title: 'Cosmetic – Base/Stand',
    bullets: ['Stable; no cracks; scuffs okay → Conditional.', 'Structural damage → Fail.']
  },
  accessory_remote: {
    title: 'Accessory – Remote',
    bullets: [
      'Correct model; housing intact; battery door present.',
      'Missing → Fail; wrong model → Conditional.'
    ]
  },
  accessory_stand: {
    title: 'Accessory – Stand parts',
    bullets: ['All legs/feet/trims present; fits firmly.', 'Missing structural piece → Fail.']
  },
  accessory_powercord: {
    title: 'Accessory – Power cord',
    bullets: ['OEM spec; no cuts; strain relief OK.', 'Non-OEM but compatible → Conditional; damage → Fail.']
  },
  accessory_screws: {
    title: 'Accessory – Screws',
    bullets: ['Correct count/thread; heads not stripped.', 'Missing critical screw(s) → Fail.']
  }
};

// ===== IndexedDB Hook =====
function useIndexedDB<T>(key: string, initial: T[]): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [data, setData] = useState<T[]>(initial);
  useEffect(() => {
    if (!isBrowser || !('indexedDB' in window)) return;
    const req = indexedDB.open('RokuRepairDB', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('data', { keyPath: 'key' });
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction('data', 'readonly');
        const store = tx.objectStore('data');
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          if (getReq.result) setData(getReq.result.value);
        };
      } catch {}
    };
  }, [key]);
  useEffect(() => {
    if (!isBrowser || !('indexedDB' in window)) return;
    const req = indexedDB.open('RokuRepairDB', 1);
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put({ key, value: data });
      } catch {}
    };
  }, [data, key]);
  return [data, setData];
}

// ===== Utilities =====
function downloadCSV(filename: string, rows: Array<Record<string, any>>) {
  if (!isBrowser || !rows.length) return;
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [headers.join(',')]
    .concat(rows.map((r) => headers.map((h) => escape(r[h])).join(',')))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isIntakeRecord(x: any): x is Intake {
  return x && typeof x === 'object' && 'checklist' in x && 'createdAt' in x;
}
function isRepairRecord(x: any): x is Repair {
  return x && typeof x === 'object' && 'failureCode' in x && 'disposition' in x;
}

// ===== PDF helpers =====
function downloadPDF(record: any) {
  try {
    const doc = new jsPDF();
    const line = (t: string, x = 10, y?: number) => {
      const c = (doc as any)._cursorY || 20;
      const yy = y ?? c;
      doc.text(t, x, yy);
      (doc as any)._cursorY = yy + 6;
      if ((doc as any)._cursorY > 280) {
        doc.addPage();
        (doc as any)._cursorY = 10;
      }
    };
    const header = (t: string) => {
      doc.setFontSize(14);
      line(t, 10, 12);
      doc.setFontSize(10);
    };

    header('ROKU 1PTV Repair Record');

    if (isIntakeRecord(record)) {
      line('— Intake');
      line(`Serial: ${record.serial}`);
      line(`Family/Model/Size: ${record.family} / ${record.model} / ${record.sizeIn}"`);
      line(`Return: ${record.returnSource} — ${record.returnReason}`);
      line(`Incoming condition: ${record.conditionIn}`);
      line(`Created: ${new Date(record.createdAt).toLocaleString()}`);
      line('Checklist:');
      Object.entries(record.checklist).forEach(([k, v]) => line(`  • ${k}: ${v}`));
      if (record.notes) line(`Notes: ${record.notes}`);
      if (record.photos?.length) {
        line('Photos:');
        record.photos.slice(0, 3).forEach((p, idx) => {
          try {
            doc.addImage(p, 'JPEG', 10 + idx * 60, (doc as any)._cursorY, 50, 38);
          } catch {}
        });
        (doc as any)._cursorY = ((doc as any)._cursorY || 20) + 44;
      }
    } else if (isRepairRecord(record)) {
      line('— Repair');
      line(`Serial: ${record.serial}`);
      line(`Failure: ${record.failureCode}`);
      line(`Actions: ${(record.actions || []).join(', ')}`);
      line(`Disposition: ${record.disposition}`);
      if (record.technician) line(`Technician: ${record.technician}`);
      if (record.startAt) line(`Start: ${new Date(record.startAt).toLocaleString()}`);
      if (record.endAt) line(`End: ${new Date(record.endAt).toLocaleString()}`);
      if (record.notes) line(`Notes: ${record.notes}`);
      if (record.photos?.length) {
        line('Photos:');
        record.photos.slice(0, 3).forEach((p, idx) => {
          try {
            doc.addImage(p, 'JPEG', 10 + idx * 60, (doc as any)._cursorY, 50, 38);
          } catch {}
        });
        (doc as any)._cursorY = ((doc as any)._cursorY || 20) + 44;
      }
    } else {
      line('Unknown record type');
    }

    doc.save(`${record.serial || 'repair_record'}.pdf`);
  } catch (err) {
    console.error(err);
    alert('PDF export failed.');
  }
}

function downloadCombinedPDF(rec: CombinedRecord) {
  try {
    const doc = new jsPDF();
    const line = (t: string, x = 10, y?: number) => {
      const c = (doc as any)._cursorY || 20;
      const yy = y ?? c;
      doc.text(t, x, yy);
      (doc as any)._cursorY = yy + 6;
      if ((doc as any)._cursorY > 280) {
        doc.addPage();
        (doc as any)._cursorY = 10;
      }
    };
    const header = (t: string) => {
      doc.setFontSize(14);
      line(t, 10, 12);
      doc.setFontSize(10);
    };

    header(`ROKU 1PTV Repair – Combined Report (${rec.serial})`);

    if (rec.intake) {
      const i = rec.intake;
      line('— Intake');
      line(`Serial: ${i.serial}`);
      line(`Family/Model/Size: ${i.family} / ${i.model} / ${i.sizeIn}"`);
      line(`Return: ${i.returnSource} — ${i.returnReason}`);
      line(`Incoming condition: ${i.conditionIn}`);
      line(`Created: ${new Date(i.createdAt).toLocaleString()}`);
      line('Checklist:');
      Object.entries(i.checklist).forEach(([k, v]) => line(`  • ${k}: ${v}`));
      if (i.notes) line(`Notes: ${i.notes}`);
      if (i.photos?.length) {
        line('Photos:');
        i.photos.slice(0, 3).forEach((p, idx) => {
          try {
            doc.addImage(p, 'JPEG', 10 + idx * 60, (doc as any)._cursorY, 50, 38);
          } catch {}
        });
        (doc as any)._cursorY = ((doc as any)._cursorY || 20) + 44;
      }
    } else {
      line('No intake record.');
    }

    if (rec.repairs.length) {
      rec.repairs.forEach((r, idx) => {
        doc.addPage();
        header(`Repair #${idx + 1}`);
        line(`Serial: ${r.serial}`);
        line(`Start: ${new Date(r.startAt).toLocaleString()}`);
        if (r.endAt) line(`End: ${new Date(r.endAt).toLocaleString()}`);
        line(`Failure: ${r.failureCode}`);
        line(`Actions: ${(r.actions || []).join(', ')}`);
        line(`Disposition: ${r.disposition}`);
        if (r.technician) line(`Technician: ${r.technician}`);
        if (r.notes) line(`Notes: ${r.notes}`);
        if (r.photos?.length) {
          line('Photos:');
          r.photos.slice(0, 3).forEach((p, idx2) => {
            try {
              doc.addImage(p, 'JPEG', 10 + idx2 * 60, (doc as any)._cursorY, 50, 38);
            } catch {}
          });
          (doc as any)._cursorY = ((doc as any)._cursorY || 20) + 44;
        }
      });
    } else {
      doc.addPage();
      header('Repairs');
      line('No repairs recorded.');
    }

    doc.save(`${rec.serial}_combined.pdf`);
  } catch (err) {
    console.error(err);
    alert('PDF export failed.');
  }
}

// ===== Shared standardized inputs =====
function UiSelect({
  value,
  onChange,
  placeholder,
  options,
  required
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  options: string[];
  required?: boolean;
}) {
  const showPlaceholder = placeholder && (value === '' || !options.includes(value));
  return (
    <select
      style={fieldStyle}
      value={showPlaceholder ? '' : value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function UiCombo({
  value,
  setValue,
  options,
  placeholder,
  allowCustomLabel = 'Custom…'
}: {
  value: string;
  setValue: (v: string) => void;
  options: string[];
  placeholder?: string;
  allowCustomLabel?: string;
}) {
  const [isCustom, setIsCustom] = useState<boolean>(() => value !== '' && !options.includes(value));
  useEffect(() => {
    setIsCustom(value !== '' && !options.includes(value));
  }, [value, options]);
  const CUSTOM = '__custom__';
  const selectVal = isCustom ? CUSTOM : value || '';
  function onSelect(v: string) {
    if (v === CUSTOM) {
      setIsCustom(true);
      setValue('');
    } else {
      setIsCustom(false);
      setValue(v);
    }
  }
  return (
    <div>
      <select style={fieldStyle} value={selectVal} onChange={(e) => onSelect(e.target.value)}>
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={CUSTOM}>{allowCustomLabel}</option>
      </select>
      {isCustom && (
        <input
          style={fieldStyle}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type custom value"
        />
      )}
    </div>
  );
}

// ONE (and only one) definition of UiMultiCombo
function UiMultiCombo({
  value,
  setValue,
  options,
  placeholder = 'Select actions…'
}: {
  value: string[];
  setValue: (v: string[]) => void;
  options: string[];
  placeholder?: string;
}) {
  const CUSTOM = '__custom__';
  const available = options.filter((o) => !value.includes(o));
  const [choice, setChoice] = useState('');
  const [custom, setCustom] = useState('');

  function pick(v: string) {
    if (v === '') return;
    if (v === CUSTOM) {
      setChoice(CUSTOM);
      return;
    }
    if (!value.includes(v)) setValue([...value, v]);
    setChoice('');
  }
  function addCustom() {
    const v = custom.trim();
    if (!v) return;
    if (!value.includes(v)) setValue([...value, v]);
    setCustom('');
    setChoice('');
  }
  function remove(item: string) {
    setValue(value.filter((x) => x !== item));
  }

  return (
    <div>
      <select style={fieldStyle} value={choice} onChange={(e) => pick(e.target.value)}>
        <option value="">{placeholder}</option>
        {available.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {choice === CUSTOM && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...fieldStyle, flex: 1, marginBottom: 0 }}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Type custom action"
          />
          <button type="button" style={btnGhost} onClick={addCustom}>
            Add
          </button>
        </div>
      )}
      {value.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {value.map((v) => (
            <span key={v} style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {v}
              <button type="button" onClick={() => remove(v)} style={{ ...btnGhost, padding: '2px 6px' }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Small helpers =====
function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: theme.subtext }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
function smallBar(value: number, max: number) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: '#E8E8E8', borderRadius: 6, height: 12 }}>
      <div style={{ width: pct + '%', height: 12, background: theme.primary, borderRadius: 6 }} />
    </div>
  );
}

function PhotoPicker({ onPick }: { onPick: (dataUrl: string) => void }) {
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onPick(reader.result);
    };
    reader.readAsDataURL(f);
    e.currentTarget.value = '';
  }
  return <input type="file" accept="image/*" onChange={onChange} />;
}

function RecordViewer({ record }: { record: any }) {
  if (isIntakeRecord(record)) {
    const i = record as Intake;
    return (
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Intake</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <b>Serial:</b> {i.serial}
          </div>
          <div>
            <b>Created:</b> {new Date(i.createdAt).toLocaleString()}
          </div>
          <div>
            <b>Family:</b> {i.family}
          </div>
          <div>
            <b>Model:</b> {i.model}
          </div>
          <div>
            <b>Size:</b> {i.sizeIn}"
          </div>
          <div>
            <b>Return:</b> {i.returnSource} — {i.returnReason}
          </div>
          <div>
            <b>Incoming condition:</b> {i.conditionIn}
          </div>
          {i.mac ? (
            <div>
              <b>MAC:</b> {i.mac}
            </div>
          ) : null}
        </div>
        {/* 🔥 Show Intake Notes in viewer */}
        {i.notes ? (
          <div style={{ marginTop: 12 }}>
            <b>Notes:</b> {i.notes}
          </div>
        ) : null}
        {i.photos?.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Photos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {i.photos.map((p, idx) => (
                <img
                  key={idx}
                  src={p}
                  alt={`i${idx}`}
                  style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: `1px solid ${theme.border}` }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  if (isRepairRecord(record)) {
    const r = record as Repair;
    return (
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Repair</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <b>Serial:</b> {r.serial}
          </div>
          <div>
            <b>Start:</b> {new Date(r.startAt).toLocaleString()}
          </div>
          {r.endAt ? (
            <div>
              <b>End:</b> {new Date(r.endAt).toLocaleString()}
            </div>
          ) : null}
          <div>
            <b>Failure:</b> {r.failureCode}
          </div>
          <div>
            <b>Actions:</b> {r.actions.join(', ')}
          </div>
          <div>
            <b>Disposition:</b> {r.disposition}
          </div>
          {r.technician ? (
            <div>
              <b>Technician:</b> {r.technician}
            </div>
          ) : null}
        </div>
        {/* 🔥 Show Repair Notes in viewer */}
        {r.notes ? (
          <div style={{ marginTop: 12 }}>
            <b>Notes:</b> {r.notes}
          </div>
        ) : null}
        {r.photos?.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Photos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {r.photos.map((p, idx) => (
                <img
                  key={idx}
                  src={p}
                  alt={`r${idx}`}
                  style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: `1px solid ${theme.border}` }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  return <div>Unknown record type</div>;
}

function CombinedViewer({ rec }: { rec: CombinedRecord }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rec.intake ? (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Intake</div>
          <RecordViewer record={rec.intake} />
        </div>
      ) : (
        <div style={{ ...card, color: theme.subtext, fontSize: 12 }}>No intake record stored for this serial.</div>
      )}

      {rec.repairs.length
        ? rec.repairs
            .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
            .map((r, idx) => (
              <div key={idx} style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Repair #{idx + 1}</div>
                <RecordViewer record={r} />
              </div>
            ))
        : (
          <div style={{ ...card, color: theme.subtext, fontSize: 12 }}>No repairs recorded yet.</div>
          )}
    </div>
  );
}

// ===== Intake Form =====
function IntakeForm({
  onSaved,
  sizes,
  sources,
  reasons
}: {
  onSaved: (intake: Intake) => void;
  sizes: number[];
  sources: string[];
  reasons: string[];
}) {
  const [v, setV] = useState<Intake>({
    serial: '',
    family: '',
    model: '',
    sizeIn: '',
    mac: '',
    returnSource: '',
    returnReason: '',
    conditionIn: '',
    notes: '',
    checklist: {
      labels_match: 'Pass',
      safety_ok: 'Pass',
      ports_intact: 'Pass',
      power_symptom: 'Pass',
      esd_ok: 'Pass',
      cosmetic_backcover: 'Pass',
      cosmetic_screen: 'Pass',
      cosmetic_bezel: 'Pass',
      cosmetic_base: 'Pass',
      accessory_remote: 'Pass',
      accessory_stand: 'Pass',
      accessory_powercord: 'Pass',
      accessory_screws: 'Pass'
    },
    photos: [],
    createdAt: new Date().toISOString()
  });
  const [openHelp, setOpenHelp] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const toggleHelp = (k: string) => setOpenHelp((prev) => ({ ...prev, [k]: !prev[k] }));
  const set = <K extends keyof Intake>(k: K, val: Intake[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));
  const setC = <K extends keyof Intake['checklist']>(
    k: K,
    val: Intake['checklist'][K]
  ) => setV((prev) => ({ ...prev, checklist: { ...prev.checklist, [k]: val } }));

  const blockers =
    v.checklist.labels_match === 'Fail' ||
    v.checklist.safety_ok === 'Fail' ||
    v.checklist.ports_intact === 'Fail' ||
    v.checklist.power_symptom === 'Fail' ||
    v.checklist.esd_ok === 'Fail';

  function removePhoto(idx: number) {
    setV((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved({ ...v, sizeIn: v.sizeIn === '' ? '' : Number(v.sizeIn) });
      alert(blockers ? 'Repair blocked: Hold – QE Review' : 'Intake saved. Proceed to Repair.');
      setV({
        ...v,
        serial: '',
        family: '',
        model: '',
        sizeIn: '',
        mac: '',
        returnSource: '',
        returnReason: '',
        conditionIn: '',
        notes: '',
        photos: []
      });
    } finally {
      setSaving(false);
    }
  }

  const checklistItems = [
    ['labels_match', 'Labels match'],
    ['safety_ok', 'Safety OK'],
    ['ports_intact', 'Ports intact'],
    ['power_symptom', 'Power symptom reproduced'],
    ['esd_ok', 'ESD setup OK'],
    ['cosmetic_backcover', 'Cosmetic – Back cover'],
    ['cosmetic_screen', 'Cosmetic – Screen'],
    ['cosmetic_bezel', 'Cosmetic – Bezel'],
    ['cosmetic_base', 'Cosmetic – Base / Stand'],
    ['accessory_remote', 'Accessory – Remote'],
    ['accessory_stand', 'Accessory – Stand parts'],
    ['accessory_powercord', 'Accessory – Power cord'],
    ['accessory_screws', 'Accessory – Screws']
  ] as const;

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Identification</div>
        <label style={{ fontSize: 12, color: theme.subtext }}>Serial Number</label>
        <input style={fieldStyle} value={v.serial} onChange={(e) => set('serial', e.target.value)} required />

        <label style={{ fontSize: 12, color: theme.subtext }}>Family</label>
        <input
          style={fieldStyle}
          value={v.family}
          onChange={(e) => set('family', e.target.value)}
          placeholder="Enter Family (e.g., Abilene, Burton, Proper…)"
          required
        />

        <label style={{ fontSize: 12, color: theme.subtext }}>Model</label>
        <input style={fieldStyle} value={v.model} onChange={(e) => set('model', e.target.value)} required />

        <label style={{ fontSize: 12, color: theme.subtext }}>Size (in)</label>
        <UiSelect
          value={String(v.sizeIn)}
          onChange={(val) => set('sizeIn', val === '' ? '' : (Number(val) as any))}
          placeholder="Select size…"
          options={sizes.map((s) => String(s))}
          required
        />

        <label style={{ fontSize: 12, color: theme.subtext }}>MAC (optional)</label>
        <input
          style={fieldStyle}
          value={v.mac}
          onChange={(e) => set('mac', e.target.value)}
          placeholder="e.g., AA:BB:CC:DD:EE:FF"
        />

        <label style={{ fontSize: 12, color: theme.subtext }}>Return Source</label>
        <UiCombo
          value={v.returnSource}
          setValue={(val) => set('returnSource', val)}
          options={sources}
          placeholder="Select return source…"
        />

        <label style={{ fontSize: 12, color: theme.subtext }}>Return Reason</label>
        <UiCombo
          value={v.returnReason}
          setValue={(val) => set('returnReason', val)}
          options={reasons}
          placeholder="Select return reason…"
        />

        <label style={{ fontSize: 12, color: theme.subtext }}>Incoming Condition</label>
        <UiSelect
          value={v.conditionIn}
          onChange={(val) => set('conditionIn', val)}
          placeholder="Incoming Condition…"
          options={['OK', 'Minor cosmetic', 'Major cosmetic', 'Functional fail', 'Unknown']}
          required
        />

        <label style={{ fontSize: 12, color: theme.subtext }}>Notes</label>
        <textarea style={{ ...fieldStyle, height: 80 }} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Pre-Repair Checklist</div>
        {checklistItems.map(([k, label]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 260, fontSize: 12, color: theme.text }}>{label}</div>
              <UiSelect
                value={String(v.checklist[k])}
                onChange={(val) => setC(k as any, val as any)}
                options={['Pass', 'Conditional', 'Fail', 'N/A']}
              />
              <button
                type="button"
                onClick={() => toggleHelp(k)}
                style={{ ...btnGhost, padding: '4px 8px' }}
              >
                {openHelp[k] ? 'Hide criteria' : 'View criteria'}
              </button>
            </div>
            {openHelp[k] && (
              <div
                style={{
                  marginTop: 6,
                  background: '#FFF',
                  border: `1px dashed ${theme.border}`,
                  padding: 8,
                  borderRadius: 8
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{CRITERIA[k]?.title || label}</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(CRITERIA[k]?.bullets || ['Define criteria']).map((b, i) => (
                    <li key={i} style={{ marginBottom: 4, fontSize: 12 }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600 }}>Photos</div>
          <div style={{ fontSize: 12, color: theme.subtext }}>{v.photos.length}</div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <PhotoPicker onPick={(d) => setV((prev) => ({ ...prev, photos: [...prev.photos, d] }))} />
          {v.photos.map((p, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={p}
                alt={`p${i}`}
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`
                }}
              />
              {/* 🔥 delete photo button */}
              <button
                type="button"
                onClick={() => removePhoto(i)}
                title="Remove photo"
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: '0',
                  background: '#fff',
                  boxShadow: '0 0 0 1px #ccc',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={saving} style={btnStyle}>
          {saving ? 'Saving…' : 'Save Intake & Continue'}
        </button>
        {blockers && (
          <span style={{ fontSize: 12, color: '#c00', alignSelf: 'center' }}>
            Repair will be blocked (Hold – QE Review)
          </span>
        )}
      </div>
    </form>
  );
}

// ===== Repair Form =====
function RepairForm({ serials, onSaved }: { serials: string[]; onSaved: (repair: Repair) => void }) {
  const [serial, setSerial] = useState('');
  const [startAt, setStartAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [endAt, setEndAt] = useState<string>('');
  const [technician, setTechnician] = useState('');
  const [failureCode, setFailureCode] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<RepairDisposition>('Repaired');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!serial) return alert('Serial is required');
    onSaved({
      serial,
      startAt: new Date(startAt).toISOString(),
      endAt: endAt ? new Date(endAt).toISOString() : undefined,
      technician: technician || undefined,
      failureCode: failureCode || 'OTHER',
      actions,
      disposition,
      notes: notes || undefined,
      photos
    });
    setSerial('');
    setStartAt(new Date().toISOString().slice(0, 16));
    setEndAt('');
    setTechnician('');
    setFailureCode('');
    setActions([]);
    setDisposition('Repaired');
    setNotes('');
    setPhotos([]);
  }

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Repair – Identification</div>
        <label style={{ fontSize: 12, color: theme.subtext }}>Serial</label>
        <UiCombo value={serial} setValue={setSerial} options={serials} placeholder="Select or type serial…" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: theme.subtext }}>Start</label>
            <input type="datetime-local" style={fieldStyle} value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: theme.subtext }}>End</label>
            <input type="datetime-local" style={fieldStyle} value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>
        <label style={{ fontSize: 12, color: theme.subtext }}>Technician</label>
        <input style={fieldStyle} value={technician} onChange={(e) => setTechnician(e.target.value)} placeholder="Tech name or ID" />
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Diagnosis & Actions</div>
        <label style={{ fontSize: 12, color: theme.subtext }}>Failure Code</label>
        <UiCombo value={failureCode} setValue={setFailureCode} options={FAILURE_CODES} placeholder="Select failure code…" />
        <label style={{ fontSize: 12, color: theme.subtext }}>Actions</label>
        <UiMultiCombo value={actions} setValue={setActions} options={ACTION_CODES} placeholder="Add actions…" />
        <label style={{ fontSize: 12, color: theme.subtext }}>Disposition</label>
        <UiSelect value={disposition} onChange={(val) => setDisposition(val as RepairDisposition)} options={['Repaired', 'Scrap', 'NTF', 'BER']} />
        <label style={{ fontSize: 12, color: theme.subtext }}>Notes</label>
        <textarea style={{ ...fieldStyle, height: 80 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Root cause, parts replaced, observations…" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600 }}>Photos</div>
          <div style={{ fontSize: 12, color: theme.subtext }}>{photos.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <PhotoPicker onPick={(d) => setPhotos((prev) => [...prev, d])} />
          {photos.map((p, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={p}
                alt={`r${i}`}
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`
                }}
              />
              {/* 🔥 delete photo button */}
              <button
                type="button"
                onClick={() => removePhoto(i)}
                title="Remove photo"
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: '0',
                  background: '#fff',
                  boxShadow: '0 0 0 1px #ccc',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnStyle}>Save Repair</button>
      </div>
    </form>
  );
}

// ===== Dashboard =====
function Dashboard({
  intakes,
  repairs,
  onViewSerial
}: {
  intakes: Intake[];
  repairs: Repair[];
  onViewSerial: (serial: string) => void;
}) {
  const todayStr = new Date().toDateString();
  const processedToday = intakes.filter((i) => new Date(i.createdAt).toDateString() === todayStr).length;
  const bySerialRepairs = repairs.reduce<Record<string, Repair[]>>((acc, r) => {
    (acc[r.serial] ||= []).push(r);
    return acc;
  }, {});
  const repeatRepairs30d = Object.values(bySerialRepairs).filter(
    (arr) => arr.filter((r) => Date.now() - new Date(r.startAt).getTime() <= 30 * 24 * 3600 * 1000).length > 1
  ).length;
  const last30 = repairs.filter((r) => Date.now() - new Date(r.startAt).getTime() <= 30 * 24 * 3600 * 1000);
  const repaired = last30.filter((r) => r.disposition === 'Repaired').length;
  const scrapped = last30.filter((r) => r.disposition === 'Scrap').length;
  const yieldPct = repaired + scrapped ? Math.round((repaired / (repaired + scrapped)) * 100) : 0;
  const openHolds = intakes.filter(
    (v) =>
      v.checklist.labels_match === 'Fail' ||
      v.checklist.safety_ok === 'Fail' ||
      v.checklist.ports_intact === 'Fail' ||
      v.checklist.power_symptom === 'Fail' ||
      v.checklist.esd_ok === 'Fail'
  ).length;

  const days = [...Array(7)].map((_, d) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - d));
    const dayEnd = new Date(date);
    dayEnd.setDate(date.getDate() + 1);
    const count = repairs.filter((r) => new Date(r.startAt) >= date && new Date(r.startAt) < dayEnd).length;
    return { label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), count };
  });
  const maxCount = Math.max(0, ...days.map((d) => d.count));

  const failCount: Record<string, number> = {};
  last30.forEach((r) => {
    failCount[r.failureCode] = (failCount[r.failureCode] || 0) + 1;
  });
  const pareto = Object.entries(failCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 600 }}>Repair Dashboard</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <KpiCard label="Processed Today" value={processedToday} />
        <KpiCard label="Repair Yield (30d)" value={`${yieldPct}%`} />
        <KpiCard label="Open Holds" value={openHolds} />
        <KpiCard label="Repeat Repairs (30d)" value={repeatRepairs30d} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>7-Day Throughput</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {days.map((d) => (
              <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 40px', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, color: theme.subtext }}>{d.label}</div>
                {smallBar(d.count, maxCount)}
                <div style={{ textAlign: 'right', fontSize: 12 }}>{d.count}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Top Fail Codes (30d)</div>
          {pareto.length === 0 ? (
            <div style={{ fontSize: 12, color: theme.subtext }}>No data yet</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {pareto.map(([code, count]) => (
                <div key={code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={chip}>{code}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Recent Repairs</div>
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6, fontSize: 12, color: theme.subtext }}>Serial</th>
                <th style={{ textAlign: 'left', padding: 6, fontSize: 12, color: theme.subtext }}>Failure</th>
                <th style={{ textAlign: 'left', padding: 6, fontSize: 12, color: theme.subtext }}>Actions</th>
                <th style={{ textAlign: 'left', padding: 6, fontSize: 12, color: theme.subtext }}>Disposition</th>
                <th style={{ textAlign: 'left', padding: 6, fontSize: 12, color: theme.subtext }}>Start</th>
                <th style={{ textAlign: 'left', padding: 6, fontSize: 12, color: theme.subtext }}>View</th>
              </tr>
            </thead>
            <tbody>
              {repairs
                .slice()
                .reverse()
                .slice(0, 20)
                .map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: 6, borderTop: `1px solid ${theme.border}` }}>{r.serial}</td>
                    <td style={{ padding: 6, borderTop: `1px solid ${theme.border}` }}>{r.failureCode}</td>
                    <td style={{ padding: 6, borderTop: `1px solid ${theme.border}` }}>{r.actions.join(', ')}</td>
                    <td style={{ padding: 6, borderTop: `1px solid ${theme.border}` }}>{r.disposition}</td>
                    <td style={{ padding: 6, borderTop: `1px solid ${theme.border}` }}>{new Date(r.startAt).toLocaleString()}</td>
                    <td style={{ padding: 6, borderTop: `1px solid ${theme.border}` }}>
                      <button style={btnGhost} onClick={() => onViewSerial(r.serial)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ===== History (lookup, view, export) =====
function History({
  intakes,
  repairs,
  initialSerial
}: {
  intakes: Intake[];
  repairs: Repair[];
  initialSerial?: string;
}) {
  const [q, setQ] = useState(initialSerial || '');
  const [selected, setSelected] = useState<any | null>(null);
  const [showCombined, setShowCombined] = useState(false);

  type Row = { type: 'intake' | 'repair'; when: string; data: Intake | Repair };

  const list = useMemo<Row[]>(() => {
    const serial = q.trim();
    if (!serial) return [];
    const a: Row[] = intakes
      .filter((i) => i.serial === serial)
      .map((i) => ({ type: 'intake', when: i.createdAt, data: i }));
    const b: Row[] = repairs
      .filter((r) => r.serial === serial)
      .map((r) => ({ type: 'repair', when: r.startAt, data: r }));
    return ([] as Row[]).concat(a as Row[]).concat(b as Row[]).sort((x, y) => new Date(x.when).getTime() - new Date(y.when).getTime());
  }, [q, intakes, repairs]);

  const combinedRec: CombinedRecord | null = useMemo(() => {
    const serial = q.trim();
    if (!serial) return null;
    const intake = intakes.slice().reverse().find((i) => i.serial === serial);
    const reps = repairs
      .filter((r) => r.serial === serial)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return { serial, intake, repairs: reps };
  }, [q, intakes, repairs]);

  function exportCsv() {
    const rows: Record<string, any>[] = [];
    intakes.forEach((i) =>
      rows.push({
        kind: 'intake',
        serial: i.serial,
        model: i.model,
        family: i.family,
        sizeIn: i.sizeIn,
        source: i.returnSource,
        reason: i.returnReason,
        createdAt: i.createdAt,
        notes: i.notes || ''
      })
    );
    repairs.forEach((r) =>
      rows.push({
        kind: 'repair',
        serial: r.serial,
        failure: r.failureCode,
        actions: r.actions.join('|'),
        disposition: r.disposition,
        startAt: r.startAt,
        endAt: r.endAt || '',
        notes: r.notes || ''
      })
    );
    downloadCSV('repairs_history.csv', rows);
  }

  const preview = (t?: string) => (t ? (t.length > 120 ? t.slice(0, 120) + '…' : t) : '');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 600 }}>History Lookup</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...fieldStyle, maxWidth: 360 }}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSelected(null);
            setShowCombined(false);
          }}
          placeholder="Search by Serial…"
        />
        <button style={btnGhost} onClick={exportCsv}>
          Export CSV
        </button>
        <button
          style={{ ...btnStyle, background: showCombined ? theme.primaryDark : theme.primary }}
          disabled={!combinedRec}
          onClick={() => setShowCombined(true)}
        >
          View Combined Report
        </button>
        {showCombined && combinedRec && (
          <button style={btnGhost} onClick={() => downloadCombinedPDF(combinedRec)}>
            Export Combined PDF
          </button>
        )}
      </div>

      {showCombined && combinedRec && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>Combined Record – {combinedRec.serial}</div>
            <button style={btnGhost} onClick={() => downloadCombinedPDF(combinedRec)}>
              Export PDF
            </button>
          </div>
          <CombinedViewer rec={combinedRec} />
        </div>
      )}

      {!showCombined && selected && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>Record Detail</div>
            <button style={btnGhost} onClick={() => downloadPDF(selected)}>
              Export PDF
            </button>
          </div>
          <RecordViewer record={selected} />
        </div>
      )}

      {q && list.length === 0 && <div style={{ fontSize: 12, color: theme.subtext }}>No records for this serial.</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {list.map((row, idx) => (
          <div key={idx} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span style={chip}>{row.type.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 12, color: theme.subtext }}>{new Date(row.when).toLocaleString()}</div>
            </div>

            {row.type === 'intake' ? (
              <div style={{ fontSize: 13, marginTop: 8 }}>
                <div>
                  <b>Serial:</b> {(row.data as Intake).serial}
                </div>
                <div>
                  <b>Family/Model:</b> {(row.data as Intake).family} / {(row.data as Intake).model} — {(row.data as Intake).sizeIn}"
                </div>
                <div>
                  <b>Return:</b> {(row.data as Intake).returnSource} – {(row.data as Intake).returnReason}
                </div>
                {/* 🔥 notes preview in list */}
                {(row.data as Intake).notes ? (
                  <div style={{ marginTop: 4, color: theme.subtext }}>
                    <b>Notes:</b> {preview((row.data as Intake).notes)}
                  </div>
                ) : null}
                <div style={{ marginTop: 8 }}>
                  <button
                    style={btnGhost}
                    onClick={() => {
                      setSelected(row.data);
                      setShowCombined(false);
                    }}
                  >
                    View Record
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, marginTop: 8 }}>
                <div>
                  <b>Serial:</b> {(row.data as Repair).serial}
                </div>
                <div>
                  <b>Failure/Disp:</b> {(row.data as Repair).failureCode} / {(row.data as Repair).disposition}
                </div>
                <div>
                  <b>Actions:</b> {(row.data as Repair).actions.join(', ')}
                </div>
                {/* 🔥 notes preview in list */}
                {(row.data as Repair).notes ? (
                  <div style={{ marginTop: 4, color: theme.subtext }}>
                    <b>Notes:</b> {preview((row.data as Repair).notes)}
                  </div>
                ) : null}
                <div style={{ marginTop: 8 }}>
                  <button
                    style={btnGhost}
                    onClick={() => {
                      setSelected(row.data);
                      setShowCombined(false);
                    }}
                  >
                    View Record
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Admin Panel =====
function AdminPanel({
  sizes,
  sources,
  reasons,
  onSave
}: {
  sizes: number[];
  sources: string[];
  reasons: string[];
  onSave: (sizes: number[], sources: string[], reasons: string[]) => void;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [szText, setSzText] = useState<string>(sizes.join(', '));
  const [srcText, setSrcText] = useState<string>(sources.join('\n'));
  const [reaText, setReaText] = useState<string>(reasons.join('\n'));
  const PASS_KEY = 'RokuRepair2025';

  function checkKey() {
    if (inputKey === PASS_KEY) {
      setAuthorized(true);
    } else {
      alert('Invalid key.');
    }
  }
  function parseSizes(t: string) {
    return t
      .split(/[ ,\n]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n));
  }
  function parseList(t: string) {
    return t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  function save() {
    onSave(parseSizes(szText), parseList(srcText), parseList(reaText));
    alert('Admin lists saved');
  }

  if (!authorized) {
    return (
      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Admin Access</div>
        <p style={{ fontSize: 13, color: theme.subtext }}>Enter pass key to unlock settings:</p>
        <input style={fieldStyle} type="password" value={inputKey} onChange={(e) => setInputKey(e.target.value)} />
        <button style={btnStyle} onClick={checkKey}>
          Enter
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Admin Settings</div>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>TV Sizes (inches)</div>
        <small style={{ color: theme.subtext }}>Comma or line separated (e.g., 32, 43, 55, 65)</small>
        <textarea style={{ ...fieldStyle, height: 90 }} value={szText} onChange={(e) => setSzText(e.target.value)} />
      </div>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Return Sources</div>
        <small style={{ color: theme.subtext }}>One per line</small>
        <textarea style={{ ...fieldStyle, height: 120 }} value={srcText} onChange={(e) => setSrcText(e.target.value)} />
      </div>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Return Reasons</div>
        <small style={{ color: theme.subtext }}>One per line</small>
        <textarea style={{ ...fieldStyle, height: 160 }} value={reaText} onChange={(e) => setReaText(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnStyle} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

// ===== Root App =====
export default function App() {
  const [tab, setTab] = useState<'intake' | 'repair' | 'dashboard' | 'history' | 'admin'>('intake');

  const [intakes, setIntakes] = useIndexedDB<Intake>('intakes', []);
  const [repairs, setRepairs] = useIndexedDB<Repair>('repairs', []);

  const [sizes, setSizes] = useState<number[]>(() => {
    if (!isBrowser) return DEFAULT_TV_SIZES;
    try {
      const raw = localStorage.getItem('sizes');
      return raw ? JSON.parse(raw) : DEFAULT_TV_SIZES;
    } catch {
      return DEFAULT_TV_SIZES;
    }
  });
  const [sources, setSources] = useState<string[]>(() => {
    if (!isBrowser) return DEFAULT_RETURN_SOURCE_SUGGESTIONS;
    try {
      const raw = localStorage.getItem('sources');
      return raw ? JSON.parse(raw) : DEFAULT_RETURN_SOURCE_SUGGESTIONS;
    } catch {
      return DEFAULT_RETURN_SOURCE_SUGGESTIONS;
    }
  });
  const [reasons, setReasons] = useState<string[]>(() => {
    if (!isBrowser) return DEFAULT_RETURN_REASON_SUGGESTIONS;
    try {
      const raw = localStorage.getItem('reasons');
      return raw ? JSON.parse(raw) : DEFAULT_RETURN_REASON_SUGGESTIONS;
    } catch {
      return DEFAULT_RETURN_REASON_SUGGESTIONS;
    }
  });

  useEffect(() => {
    if (!isBrowser) return;
    localStorage.setItem('sizes', JSON.stringify(sizes));
  }, [sizes]);
  useEffect(() => {
    if (!isBrowser) return;
    localStorage.setItem('sources', JSON.stringify(sources));
  }, [sources]);
  useEffect(() => {
    if (!isBrowser) return;
    localStorage.setItem('reasons', JSON.stringify(reasons));
  }, [reasons]);

  const serials = useMemo(() => Array.from(new Set(intakes.map((i) => i.serial))), [intakes]);
  const [historySerial, setHistorySerial] = useState<string | undefined>(undefined);

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          background: `linear-gradient(90deg,${theme.primaryDark},${theme.primary})`,
          borderBottom: `1px solid ${theme.border}`
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* 🔥 Creator watermark + Title */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 240 }}>
            <div style={{ fontSize: 11, color: 'white', opacity: 0.85, fontWeight: 600 }}>Creator: Edgar Garcia</div>
            <div
              style={{
                fontWeight: 800,
                letterSpacing: 0.3,
                color: 'white',
                fontSize: 20,
                textShadow: '1px 1px 2px #000'
              }}
            >
              ROKU 1PTV Repair
            </div>
          </div>

          <nav style={{ display: 'flex', gap: 8, fontSize: 14, flexWrap: 'wrap' }}>
            {(['intake', 'repair', 'dashboard', 'history', 'admin'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{ ...btnStyle, background: tab === t ? theme.primaryDark : theme.primary }}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {tab === 'intake' && <IntakeForm sizes={sizes} sources={sources} reasons={reasons} onSaved={(i) => setIntakes((prev) => [...prev, i])} />}

        {tab === 'repair' && <RepairForm serials={serials} onSaved={(r) => setRepairs((prev) => [...prev, r])} />}

        {tab === 'dashboard' && <Dashboard intakes={intakes} repairs={repairs} onViewSerial={(sn) => { setHistorySerial(sn); setTab('history'); }} />}

        {tab === 'history' && <History intakes={intakes} repairs={repairs} initialSerial={historySerial} />}

        {tab === 'admin' && (
          <AdminPanel
            sizes={sizes}
            sources={sources}
            reasons={reasons}
            onSave={(ns, so, re) => {
              setSizes(ns);
              setSources(so);
              setReasons(re);
            }}
          />
        )}
      </main>
    </div>
  );
}




