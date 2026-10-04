// Portfolio admin: sign in, list, add, edit, reorder and delete videos.
// Talks only to this server's /api/admin routes; files go straight from the
// browser to storage through one-time upload URLs.

const TOOLS = ["Adobe Premiere Pro", "Adobe After Effects", "Blender", "Kling AI", "Google Veo"];
const GROUPS = [
  { format: "long-form", title: "Long-form" },
  { format: "short", title: "Shorts" },
];

const $ = (selector) => document.querySelector(selector);
const form = $("#item-form");
const editor = $("#editor");

let siteOrigin = "";
let items = [];
/** The item being edited, or null when adding. */
let editing = null;

/* ---------- helpers ---------- */

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function icon(name, className = "icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `icons.svg#${name}`);
  svg.append(use);
  return svg;
}

/** Covers seeded from the site use /media/... paths that live on the site. */
const resolveUrl = (url) => (url && url.startsWith("/") ? siteOrigin + url : url);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

let toastTimer = 0;
function toast(message) {
  const node = $("#toast");
  node.replaceChildren(icon("check"), message);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}

/* ---------- theme ---------- */

function syncThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  const button = $("#theme-toggle");
  button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  button.replaceChildren(icon(dark ? "sun" : "moon"));
}

$("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("admin-theme", next);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  syncThemeButton();
});
syncThemeButton();

/* ---------- api ---------- */

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login") {
    show("login");
    throw new Error("Your session ended. Sign in again.");
  }
  if (!res.ok) {
    const detail = data.issues?.map((i) => `${i.path || "input"}: ${i.message}`).join("\n");
    throw new Error(detail || data.error || `Request failed (${res.status}).`);
  }
  return data;
}

/* ---------- views ---------- */

function show(view) {
  $("#login-view").hidden = view !== "login";
  $("#list-view").hidden = view !== "list";
  $("#logout").hidden = view !== "list";
  $("#site-link").hidden = view !== "list";
  if (view === "login") $("#login-form").password.focus();
}

async function loadList() {
  show("list");
  const data = await api("/items");
  items = data.items;
  $("#skeleton").hidden = true;
  renderList();
}

function renderList(movedId) {
  const longCount = items.filter((i) => i.format === "long-form").length;
  $("#empty").hidden = items.length > 0;
  $("#list-summary").textContent = items.length
    ? `${plural(longCount, "long-form", "long-form")} and ${plural(items.length - longCount, "short", "shorts")}. The order here is the order on the site.`
    : "";

  const groups = GROUPS.map(({ format, title }) => {
    const members = items.filter((i) => i.format === format);
    if (!members.length) return null;
    return el("section", { className: "group-block" }, [
      el("h2", { className: "group-title" }, [title, el("span", { className: "count", textContent: String(members.length) })]),
      el(
        "ol",
        { className: "panel" },
        members.map((item, n) => row(item, n, members.length, item.id === movedId)),
      ),
    ]);
  }).filter(Boolean);
  $("#groups").replaceChildren(...groups);
}

function row(item, position, total, moved) {
  const short = item.format === "short";
  const thumb = el("img", { className: `thumb ${short ? "short" : "long"}`, alt: "", loading: "lazy", src: resolveUrl(item.cover) });
  const meta = [item.language ?? "Language not set", item.tools.join(", ")].filter(Boolean).join("  ·  ");

  const tags = el("div", { className: "tags" }, [
    ...(item.approved ? [el("span", { className: "tag hero" }, [icon("star"), "Hero"])] : []),
    el("span", { className: "tag source" }, [icon(item.source.type === "mp4" ? "film" : "drive"), item.source.type === "mp4" ? "MP4" : "Drive"]),
    ...item.categories.map((c) => el("span", { className: "tag", textContent: c })),
  ]);

  const iconButton = (name, label, onClick, { disabled = false, danger = false } = {}) => {
    const b = el("button", { type: "button", className: `btn-icon${danger ? " danger" : ""}`, disabled, title: label }, [icon(name)]);
    b.setAttribute("aria-label", `${label}: ${item.label}`);
    b.addEventListener("click", onClick);
    return b;
  };
  const edit = el("button", { type: "button", className: "btn btn-outline btn-sm" }, [icon("pencil"), "Edit"]);
  edit.setAttribute("aria-label", `Edit ${item.label}`);
  edit.addEventListener("click", () => openEditor(item));

  const li = el("li", { className: `row${moved ? " moved" : ""}` });
  li.dataset.id = item.id;
  li.append(
    el("div", { className: "thumb-box" }, [thumb]),
    el("div", { className: "row-main" }, [
      el("h3", { className: "row-title", textContent: item.label, title: item.label }),
      el("p", { className: "row-meta", textContent: meta }),
      tags,
    ]),
    el("div", { className: "row-actions" }, [
      iconButton("arrow-up", "Move up", () => move(item, -1), { disabled: position === 0 }),
      iconButton("arrow-down", "Move down", () => move(item, 1), { disabled: position === total - 1 }),
      el("span", { className: "sep", ariaHidden: "true" }),
      edit,
      iconButton("trash", "Delete", () => remove(item), { danger: true }),
    ]),
  );
  return li;
}

/** Swap with the neighbour of the same format (the site groups by format). */
async function move(item, delta) {
  const from = items.indexOf(item);
  let to = from + delta;
  while (items[to] && items[to].format !== item.format) to += delta;
  if (!items[to]) return;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  items = next;
  renderList(item.id);
  // Keep keyboard focus on the same control after the re-render.
  document.querySelector(`[data-id="${item.id}"] [aria-label^="${delta < 0 ? "Move up" : "Move down"}"]:not(:disabled)`)?.focus();
  try {
    await api("/order", { method: "PUT", body: { ids: next.map((i) => i.id) } });
  } catch (error) {
    toast(error.message);
    await loadList();
  }
}

function confirmDelete(item) {
  const dialog = $("#confirm");
  $("#confirm-text").textContent = `"${item.label}" leaves the site, and its uploaded video and cover are deleted. This cannot be undone.`;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "delete"), { once: true }));
}

async function remove(item) {
  if (!(await confirmDelete(item))) return;
  try {
    await api(`/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    items = items.filter((i) => i.id !== item.id);
    renderList();
    toast(`Deleted "${item.label}"`);
  } catch (error) {
    toast(error.message);
  }
}

/* ---------- editor ---------- */

const videoDefault = { name: "Choose an MP4 or drop it here", meta: "H.264 web copy, ideally under 10 MB" };

function setError(message) {
  const box = $("#form-error");
  box.hidden = !message;
  box.querySelector("span").textContent = message ?? "";
}

function syncEditor() {
  const type = form.sourceType.value;
  for (const panel of form.querySelectorAll("[data-source]")) panel.hidden = panel.dataset.source !== type;
  form.approved.disabled = type !== "mp4";
  if (type !== "mp4") form.approved.checked = false;
  $("#cover-frame").classList.toggle("long", form.format.value === "long-form");
  if (!form.cover.files[0] && !editing) {
    $("#cover-hint").textContent =
      type === "mp4" ? "WebP or JPEG. Leave empty to use a frame from the video." : "WebP or JPEG. Needed for Drive videos.";
  }
}

function showCover(src, name, hint) {
  $("#cover-preview")?.remove();
  if (src) $("#cover-frame").prepend(el("img", { id: "cover-preview", alt: "", src }));
  $("#cover-name").textContent = name;
  if (hint) $("#cover-hint").textContent = hint;
  $("#cover-drop").classList.toggle("has-file", Boolean(src));
}

function showVideo(name, meta, hasFile) {
  $("#video-name").textContent = name;
  $("#video-meta").textContent = meta;
  $("#video-drop").classList.toggle("has-file", hasFile);
}

function openEditor(item = null) {
  editing = item;
  form.reset();
  setError(null);
  $("#progress").hidden = true;
  $("#editor-title").textContent = item ? "Edit video" : "Add video";
  $("#save").textContent = item ? "Save changes" : "Add video";

  const known = new Set(item?.tools ?? []);
  $("#tool-options").replaceChildren(
    ...TOOLS.map((tool) =>
      el("label", { className: "chip" }, [el("input", { type: "checkbox", name: "tools", value: tool, checked: known.has(tool) }), icon("check"), tool]),
    ),
  );

  if (item) {
    form.format.value = item.format;
    form.label.value = item.label;
    form.description.value = item.description ?? "";
    form.categories.value = item.categories.join(", ");
    form.language.value = item.language ?? "";
    form.otherTools.value = item.tools.filter((t) => !TOOLS.includes(t)).join(", ");
    form.sourceType.value = item.source.type;
    if (item.source.type === "drive") form.driveUrl.value = item.source.embedUrl;
    form.approved.checked = item.approved;
    showCover(resolveUrl(item.cover), "Current cover", "Choose a file to replace it.");
  } else {
    showCover(null, "Choose a cover image");
  }
  if (item?.source.type === "mp4") {
    const length = item.durationSeconds ? `${formatTime(item.durationSeconds)}  ·  ` : "";
    showVideo(item.source.src.split("/").pop(), `${length}Current video. Choose a file to replace it.`, true);
  } else {
    showVideo(videoDefault.name, videoDefault.meta, false);
  }

  syncEditor();
  editor.showModal();
  form.label.focus();
}

const list = (value) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Any Drive share link to the /preview embed form the site expects. */
function driveEmbed(url) {
  const id = url.match(/\/d\/([\w-]+)/)?.[1] ?? url.match(/[?&]id=([\w-]+)/)?.[1];
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("This MP4 cannot be read by the browser. Export it as H.264."));
    video.src = URL.createObjectURL(file);
  });
}

/** A still from about a third in (max 1s), as WebP (JPEG where WebP encoding is missing). */
async function grabFrame(video) {
  await new Promise((resolve) => {
    video.onseeked = resolve;
    video.currentTime = Math.min(1, video.duration / 3 || 0);
  });
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = el("canvas", { width: Math.round(video.videoWidth * scale), height: Math.round(video.videoHeight * scale) });
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await toBlob("image/webp");
  return webp?.type === "image/webp" ? webp : toBlob("image/jpeg");
}

async function imageSize(blob) {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

function setProgress(text, fraction) {
  const bar = $("#progress");
  bar.hidden = false;
  bar.querySelector(".progress-fill").style.transform = `scaleX(${fraction})`;
  bar.querySelector(".progress-text").textContent = text;
}

async function upload(blob, label) {
  const target = await api("/uploads", { method: "POST", body: { contentType: blob.type } });
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    let payload = blob;
    if (target.fields) {
      // Signed multipart form (Cloudinary): the file goes last, as "file".
      payload = new FormData();
      for (const [key, value] of Object.entries(target.fields)) payload.append(key, value);
      payload.append("file", blob);
    } else {
      for (const [key, value] of Object.entries(target.headers)) xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(`Uploading ${label}  ${Math.round((e.loaded / e.total) * 100)}%`, e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status < 300) return resolve();
      let reason = "";
      try {
        reason = JSON.parse(xhr.responseText).error?.message ?? "";
      } catch {
        // Not JSON: keep the status code only.
      }
      reject(new Error(`Upload of the ${label} failed (${xhr.status})${reason ? `: ${reason}` : ""}. Try again.`));
    };
    xhr.onerror = () => reject(new Error(`Upload of the ${label} failed. Check the connection and the storage settings.`));
    xhr.send(payload);
  });
  return target.publicUrl;
}

async function save() {
  const format = form.format.value;
  const sourceType = form.sourceType.value;
  const label = form.label.value.trim();
  if (!label) {
    form.label.focus();
    throw new Error("Add a title.");
  }

  const videoFile = form.video.files[0];
  const coverFile = form.cover.files[0];
  const keepVideo = editing?.source.type === "mp4" && sourceType === "mp4" && !videoFile;
  let source;
  let durationSeconds = null;
  let video = null;

  if (sourceType === "drive") {
    const embedUrl = driveEmbed(form.driveUrl.value.trim());
    if (!embedUrl) throw new Error("Paste a Google Drive file link.");
    source = { type: "drive", embedUrl };
  } else if (!videoFile && !keepVideo) {
    throw new Error("Choose an MP4 file.");
  }

  if (videoFile) {
    if (videoFile.type !== "video/mp4") throw new Error("The video must be an MP4.");
    video = await loadVideo(videoFile);
    durationSeconds = Math.round(video.duration * 100) / 100;
    const vertical = video.videoHeight > video.videoWidth;
    if (vertical !== (format === "short")) {
      throw new Error(
        `This video is ${vertical ? "vertical" : "horizontal"}, but the format is ${format === "short" ? "Short (vertical)" : "Long-form (horizontal)"}. Pick the matching format.`,
      );
    }
  } else if (keepVideo) {
    durationSeconds = editing.durationSeconds;
  }

  let coverBlob = coverFile ?? null;
  if (!coverBlob && video) coverBlob = await grabFrame(video);
  // Editing without a new cover keeps the current one.
  if (!coverBlob && !editing) throw new Error("Choose a cover image.");

  // Uploads last, once everything else is valid.
  if (videoFile) source = { type: "mp4", src: await upload(videoFile, "video") };
  else if (keepVideo) source = { ...editing.source };

  let cover = editing?.cover;
  let coverSize = editing?.coverSize;
  if (coverBlob) {
    coverSize = await imageSize(coverBlob);
    cover = await upload(coverBlob, "cover");
  }

  setProgress("Saving", 1);
  const body = {
    format,
    label,
    description: form.description.value.trim() || null,
    categories: list(form.categories.value),
    language: form.language.value.trim() || null,
    tools: [...form.querySelectorAll('input[name="tools"]:checked')].map((b) => b.value).concat(list(form.otherTools.value)),
    source,
    cover,
    coverSize,
    durationSeconds,
    captionsVtt: editing?.captionsVtt ?? null,
    approved: sourceType === "mp4" && form.approved.checked,
  };
  if (editing) await api(`/items/${encodeURIComponent(editing.id)}`, { method: "PUT", body });
  else await api("/items", { method: "POST", body });
  if (video) URL.revokeObjectURL(video.src);
  return label;
}

/* ---------- file pickers: click or drop ---------- */

async function describeVideo(file) {
  showVideo(file.name, formatBytes(file.size), true);
  try {
    const video = await loadVideo(file);
    const shape = video.videoHeight > video.videoWidth ? "vertical" : "horizontal";
    showVideo(file.name, `${formatTime(video.duration)}  ·  ${shape}  ·  ${formatBytes(file.size)}`, true);
    // Match the format to the file, the most common slip when adding a video.
    form.format.value = shape === "vertical" ? "short" : "long-form";
    syncEditor();
    URL.revokeObjectURL(video.src);
  } catch {
    showVideo(file.name, `${formatBytes(file.size)}  ·  the browser cannot read this file`, true);
  }
}

for (const zone of [$("#video-drop"), $("#cover-drop")]) {
  const input = zone.querySelector("input");
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragging");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragging");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/* ---------- wiring ---------- */

form.addEventListener("change", (e) => {
  const { name, files } = e.target;
  if (name === "sourceType" || name === "format") syncEditor();
  if (name === "video" && files[0]) describeVideo(files[0]);
  if (name === "cover" && files[0]) showCover(URL.createObjectURL(files[0]), files[0].name, formatBytes(files[0].size));
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = $("#save");
  button.disabled = true;
  setError(null);
  try {
    const label = await save();
    const added = !editing;
    editor.close();
    await loadList();
    toast(added ? `Added "${label}"` : `Saved "${label}"`);
  } catch (error) {
    setError(error.message);
  } finally {
    button.disabled = false;
    $("#progress").hidden = true;
  }
});

$("#cancel").addEventListener("click", () => editor.close());
$("#close-editor").addEventListener("click", () => editor.close());
editor.addEventListener("click", (e) => {
  if (e.target === editor) editor.close(); // backdrop click
});
$("#add-item").addEventListener("click", () => openEditor());
$("#empty-add").addEventListener("click", () => openEditor());

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.target.querySelector("button");
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    await api("/login", { method: "POST", body: { password: e.target.password.value } });
    e.target.reset();
    await loadList();
  } catch (error) {
    $("#login-error").textContent = error.message === "Wrong password" ? "That password is not right. Try again." : error.message;
  } finally {
    button.disabled = false;
  }
});

$("#logout").addEventListener("click", async () => {
  await api("/logout", { method: "POST" }).catch(() => {});
  show("login");
});

const session = await api("/session");
siteOrigin = session.siteOrigin;
$("#site-link").href = siteOrigin;
if (session.signedIn) await loadList();
else show("login");
