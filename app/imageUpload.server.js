// Shared image-upload handling for Bespoke's public forms (enquiry
// reference images, proposal/inspiration images). Same proven pattern as
// COA Kit / Reveal's logo uploads: store the file itself as a base64
// data: URI directly in the database, never on local disk — Railway (like
// most container hosts) gives every deployment a brand-new, empty
// filesystem, so anything written to disk at runtime is gone the instant
// the app redeploys. A data: URI works as a normal <img src> everywhere
// it needs to (admin, customer page, emails), and Postgres isn't wiped on
// redeploy.

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3MB — plenty for a reference/inspiration photo
const MAX_FILES_PER_UPLOAD = 6;

const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// iPhones save photos as HEIC/HEIF by default — that format isn't
// something a plain <img> tag can render in Chrome/Firefox, so reject it
// up front with an actionable message instead of silently saving an image
// that will only ever show as broken.
const UNSUPPORTED_FORMAT_HINTS = ["heic", "heif"];

export function isUploadedFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && value.size > 0;
}

function isUnsupportedFormat(file) {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return UNSUPPORTED_FORMAT_HINTS.some((hint) => type.includes(hint) || name.endsWith(`.${hint}`));
}

export function userFacingError(message) {
  const error = new Error(message);
  error.userFacing = true;
  return error;
}

async function fileToDataUri(file) {
  if (isUnsupportedFormat(file)) {
    throw userFacingError(
      `"${file.name || "That photo"}" looks like an iPhone HEIC file, which won't display in a normal web page. Please re-export or share it as a JPEG or PNG (on iPhone: Settings > Camera > Formats > "Most Compatible"), then upload that instead.`,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw userFacingError(`"${file.name || "That image"}" is over 3MB — please choose a smaller file.`);
  }
  const rawType = (file.type || "").toLowerCase();
  const ext = (rawType.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
  const mime = MIME_BY_EXT[ext] || rawType || "image/png";
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

// Takes whatever formData.getAll("someFileInput") returns (a mix of real
// File objects and, in browsers that submit an empty file input as a
// zero-byte File, junk entries) and returns [{ dataUri, label }], skipping
// anything empty. Caps at MAX_FILES_PER_UPLOAD so one enquiry can't be
// used to smuggle in dozens of 3MB images.
export async function saveUploadedImages(files, { labelPrefix = "Image" } = {}) {
  const real = (files || []).filter(isUploadedFile).slice(0, MAX_FILES_PER_UPLOAD);
  const results = [];
  for (let i = 0; i < real.length; i++) {
    const dataUri = await fileToDataUri(real[i]);
    results.push({ dataUri, label: real[i].name || `${labelPrefix} ${i + 1}` });
  }
  return results;
}

export { MAX_UPLOAD_BYTES, MAX_FILES_PER_UPLOAD };
