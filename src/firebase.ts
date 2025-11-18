// src/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { getAuth } from "firebase/auth";

/****************************************************
 * Firebase config (corrected)
 ****************************************************/
const firebaseConfig = {
  apiKey: "AIzaSyBPhn4p4CSdctIIlWPauMfumbRurzDImJk",
  authDomain: "roku-1ptv-repair.firebaseapp.com",
  projectId: "roku-1ptv-repair",
  storageBucket: "roku-1ptv-repair.appspot.com", // <- appspot.com
  messagingSenderId: "448278246329",
  appId: "1:448278246329:web:19e4855b8ca182a66f7c68",
};

/****************************************************
 * Initialize
 ****************************************************/
const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

/****************************************************
 * Types (relaxed to match UI)
 ****************************************************/
export type Intake = {
  serial?: string;
  model?: string;
  size?: string;
  notes?: string;
  photos?: string[];                        // will become HTTPS URLs after upload
  createdAt?: Timestamp | string | Date | null;
  [k: string]: any;
};

export type Repair = {
  serial?: string;
  model?: string;
  actions?: string[];
  failureMode?: string;
  failureCode?: string;
  disposition?: string;
  notes?: string;
  photos?: string[];                        // will become HTTPS URLs after upload
  createdAt?: Timestamp | string | Date | null;
  [k: string]: any;
};

/****************************************************
 * Helpers: upload dataURL -> Storage -> URL
 ****************************************************/
function dataURLtoBlob(dataURL: string): Blob {
  // data:[<mediatype>][;base64],<data>
  const arr = dataURL.split(",");
  if (arr.length < 2) {
    throw new Error("Invalid data URL");
  }
  const mimeMatch = arr[0].match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const bstr = atob(arr[1]);
  const n = bstr.length;
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

async function uploadPhotoAndGetURL(
  folder: "intakes" | "repairs",
  serial: string,
  idx: number,
  dataUrl: string
): Promise<string> {
  const blob = dataURLtoBlob(dataUrl);
  const path = `${folder}/${serial || "unknown"}/${Date.now()}_${idx}.jpg`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob);
  return await getDownloadURL(ref);
}

async function normalizePhotos(
  folder: "intakes" | "repairs",
  serial: string | undefined,
  photos: string[] | undefined
): Promise<string[]> {
  if (!photos || photos.length === 0) return [];
  // Only upload items that are data URLs; keep existing HTTPS links
  const results: string[] = [];
  let idx = 0;
  for (const p of photos) {
    if (p && p.startsWith("data:")) {
      const url = await uploadPhotoAndGetURL(folder, serial || "unknown", idx++, p);
      results.push(url);
    } else if (p && p.startsWith("http")) {
      results.push(p);
    }
  }
  return results;
}

/****************************************************
 * Cloud Saves (now upload photos first)
 ****************************************************/
export async function saveIntakeCloud(payload: Intake) {
  const photoURLs = await normalizePhotos("intakes", payload.serial, payload.photos);
  const data = {
    ...payload,
    photos: photoURLs,
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, "intakes"), data);
}

export async function saveRepairCloud(payload: Repair) {
  const photoURLs = await normalizePhotos("repairs", payload.serial, payload.photos);
  const data = {
    ...payload,
    photos: photoURLs,
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, "repairs"), data);
}

/****************************************************
 * Real-time listeners
 ****************************************************/
export function listenIntakes(
  cb: (rows: Array<{ id: string; [k: string]: any }>) => void
) {
  const q = query(collection(db, "intakes"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function listenRepairs(
  cb: (rows: Array<{ id: string; [k: string]: any }>) => void
) {
  const q = query(collection(db, "repairs"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/****************************************************
 * Debug helpers
 ****************************************************/
export async function testWrite(): Promise<string> {
  const ref = await addDoc(collection(db, "__ping"), {
    when: serverTimestamp(),
    note: "hello from 1PTV Repair",
  });
  console.log("✅ Firestore test write id:", ref.id);
  return ref.id;
}

export function debugProject() {
  console.log("Firebase projectId:", (app.options as any).projectId);
}



