const POLL_IMAGE_BASE = 'https://image.pollinations.ai/prompt';
const POLL_MEDIA_UPLOAD = 'https://media.pollinations.ai/upload';
const STORAGE_KEY = 'aura.instant.pollinationsKey';

const state = {
  recentOutputs: [],
  installPrompt: null
};

const els = {
  remixPill: document.getElementById('remix-pill'),
  remixText: document.getElementById('remix-text'),
  apiKey: document.getElementById('api-key'),
  saveSettings: document.getElementById('save-settings'),
  installApp: document.getElementById('install-app'),
  previewPlaceholder: document.getElementById('preview-placeholder'),
  previewMedia: document.getElementById('preview-media'),
  busyIndicator: document.getElementById('busy-indicator'),
  log: document.getElementById('log'),
  logTemplate: document.getElementById('log-item-template'),
  gallery: document.getElementById('gallery'),
  clearLog: document.getElementById('clear-log'),
  toastContainer: document.getElementById('toast-container')
};

function setPill(element, status, label) {
  element.className = `status-pill ${status}`;
  element.textContent = label;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addLog(title, copy) {
  const node = els.logTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.log-title').textContent = title;
  node.querySelector('.log-time').textContent = nowTime();
  node.querySelector('.log-copy').textContent = copy;
  els.log.prepend(node);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `studio-toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => toast.classList.remove('show'), 3200);
  setTimeout(() => toast.remove(), 3600);
}

function setBusy(isBusy) {
  els.busyIndicator.classList.toggle('hidden', !isBusy);
  els.busyIndicator.classList.toggle('flex', isBusy);
  document.querySelectorAll('button, input, textarea, select').forEach((el) => {
    if (el.closest('#preview-stage')) return;
    if (el.id === 'clear-log') return;
    if (el.dataset.noBusy === 'true') return;
    el.disabled = isBusy;
  });
  els.clearLog.disabled = false;
  els.saveSettings.disabled = false;
  els.installApp.disabled = false;
}

function randomSeed() {
  return Math.floor(Math.random() * 1000000000);
}

function getAppReferrer() {
  return location.hostname || 'aura-local-file';
}

function composePrompt(prompt, avoidTerms) {
  const trimmedPrompt = String(prompt || '').trim();
  const trimmedAvoid = String(avoidTerms || '').trim();
  if (!trimmedAvoid) return trimmedPrompt;
  return `${trimmedPrompt}. Avoid: ${trimmedAvoid}.`;
}

function buildPollinationsImageUrl(prompt, options = {}) {
  const url = new URL(`${POLL_IMAGE_BASE}/${encodeURIComponent(prompt)}`);
  const params = url.searchParams;
  const seed = options.seed ?? randomSeed();

  params.set('model', options.model || 'flux');
  params.set('width', String(options.width || 1024));
  params.set('height', String(options.height || 1024));
  params.set('seed', String(seed));
  params.set('safe', 'true');
  params.set('referrer', getAppReferrer());

  if (options.enhance) params.set('enhance', 'true');
  if (options.privateMode) params.set('private', 'true');
  if (options.imageUrl) params.set('image', options.imageUrl);

  return { url: url.toString(), seed };
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the generated image.'));
    image.src = url;
  });
}

function renderPreview(item) {
  els.previewPlaceholder.classList.add('hidden');
  els.previewMedia.classList.remove('hidden');
  els.previewMedia.innerHTML = '';

  const frame = document.createElement('div');
  frame.className = 'media-frame';

  if (item.kind === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.src = item.url;
    frame.appendChild(video);
  } else {
    const image = document.createElement('img');
    image.src = item.url;
    image.alt = item.title || 'Generated image';
    frame.appendChild(image);
  }

  els.previewMedia.appendChild(frame);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderGallery() {
  els.gallery.innerHTML = '';
  if (!state.recentOutputs.length) {
    const empty = document.createElement('div');
    empty.className = 'col-span-full empty-state';
    empty.textContent = 'Your finished images and videos will appear here.';
    els.gallery.appendChild(empty);
    return;
  }

  state.recentOutputs.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'gallery-card';

    let media;
    if (item.kind === 'video') {
      media = document.createElement('video');
      media.src = item.url;
      media.muted = true;
      media.loop = true;
      media.autoplay = true;
      media.playsInline = true;
    } else {
      media = document.createElement('img');
      media.src = item.url;
      media.alt = item.title || 'Output';
    }

    const meta = document.createElement('div');
    meta.className = 'gallery-meta';
    meta.innerHTML = `
      <div class="gallery-title">${escapeHtml(item.title)}</div>
      <div class="gallery-subtitle">${escapeHtml(item.subtitle)}</div>
      <div class="gallery-actions">
        <button class="studio-button studio-button-dark button-small" data-action="open">Open</button>
        <button class="studio-button studio-button-light button-small" data-action="save">Save</button>
      </div>
    `;

    meta.querySelector('[data-action="open"]').addEventListener('click', () => renderPreview(item));
    meta.querySelector('[data-action="save"]').addEventListener('click', async () => {
      try {
        await saveOutput(item);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });

    card.appendChild(media);
    card.appendChild(meta);
    els.gallery.appendChild(card);
  });
}

function pushOutputs(outputs) {
  const normalized = outputs.map((item) => ({
    ...item,
    id: crypto.randomUUID()
  }));
  state.recentOutputs = [...normalized, ...state.recentOutputs].slice(0, 18);
  if (normalized[0]) renderPreview(normalized[0]);
  renderGallery();
}

function attachUploadLabels() {
  document.querySelectorAll('.upload-dropzone input[type="file"]').forEach((input) => {
    input.addEventListener('change', () => {
      const name = input.files?.[0]?.name || 'No file selected';
      input.closest('.upload-dropzone').querySelector('.upload-file-name').textContent = name;
    });
  });
}

function attachTabs() {
  const triggers = document.querySelectorAll('[data-tab-trigger]');
  triggers.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tabTrigger;
      document.querySelectorAll('[data-tab-trigger]').forEach((el) => el.classList.toggle('active', el.dataset.tabTrigger === tab));
      document.querySelectorAll('[data-tab]').forEach((panel) => panel.classList.toggle('active', panel.dataset.tab === tab));
    });
  });
}

function attachModeCards() {
  document.querySelectorAll('input[name="remixMode"]').forEach((radio) => {
    radio.addEventListener('change', refreshModeCards);
  });
  refreshModeCards();
}

function refreshModeCards() {
  document.querySelectorAll('input[name="remixMode"]').forEach((radio) => {
    radio.closest('.mode-card').classList.toggle('mode-selected', radio.checked);
  });
}

function updateKeyStatus() {
  const hasKey = Boolean(els.apiKey.value.trim());
  if (hasKey) {
    setPill(els.remixPill, 'status-ok', 'Enabled');
    els.remixText.textContent = 'AI Remix can upload your reference image and call the kontext image-to-image model.';
  } else {
    setPill(els.remixPill, 'status-pending', 'Optional key');
    els.remixText.textContent = 'Quick Remix works instantly. AI Remix needs a Pollinations upload key so your reference image can be posted first.';
  }
}

function saveSettings() {
  const value = els.apiKey.value.trim();
  if (value) {
    localStorage.setItem(STORAGE_KEY, value);
    showToast('Local key saved for AI Remix.');
    addLog('Settings saved', 'Your optional AI Remix upload key was saved in this browser.');
  } else {
    localStorage.removeItem(STORAGE_KEY);
    showToast('Local key cleared.');
    addLog('Settings updated', 'The optional AI Remix upload key was removed from this browser.');
  }
  updateKeyStatus();
}

function loadSettings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) els.apiKey.value = stored;
  updateKeyStatus();
}

async function saveOutput(item) {
  const filenameBase = item.fileName || `aura-${item.kind}-${Date.now()}`;
  if (item.localBlob instanceof Blob) {
    downloadBlob(item.localBlob, filenameBase);
    return;
  }

  try {
    const response = await fetch(item.url, { mode: 'cors' });
    if (!response.ok) throw new Error('Remote save was blocked.');
    const blob = await response.blob();
    downloadBlob(blob, filenameBase);
  } catch {
    window.open(item.url, '_blank', 'noopener,noreferrer');
    showToast('Opened the source in a new tab because direct download was blocked.');
  }
}

function guessCanvasSize(image) {
  const maxWidth = 1280;
  const maxHeight = 720;
  const imageRatio = image.width / image.height;
  const canvasRatio = maxWidth / maxHeight;
  if (imageRatio > canvasRatio) {
    return { width: maxWidth, height: Math.round(maxWidth / imageRatio) };
  }
  return { width: Math.round(maxHeight * imageRatio), height: maxHeight };
}

function fitDimensions(width, height, maxSide = 1600) {
  const largest = Math.max(width, height);
  if (largest <= maxSide) return { width, height };
  const scale = maxSide / largest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}

async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return { image, url };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function chooseQuickRemixPreset(promptText, strength) {
  const text = String(promptText || '').toLowerCase();
  const amount = Number(strength) || 0.65;

  const base = {
    name: 'Editorial',
    filter: `brightness(${1 + amount * 0.04}) contrast(${1 + amount * 0.18}) saturate(${1 + amount * 0.12})`,
    tint: 'rgba(255, 237, 213, 0.10)',
    tintBlend: 'screen',
    grain: 0.04 + amount * 0.04,
    vignette: 0.22 + amount * 0.18,
    glowBlur: 0,
    glowAlpha: 0,
    blur: 0
  };

  if (/noir|black and white|monochrome/.test(text)) {
    return {
      ...base,
      name: 'Noir',
      filter: `grayscale(1) contrast(${1.25 + amount * 0.25}) brightness(${0.95 + amount * 0.04})`,
      tint: 'rgba(255,255,255,0.03)',
      grain: 0.06 + amount * 0.05,
      vignette: 0.35 + amount * 0.2
    };
  }

  if (/vintage|retro|film|analog|kodak/.test(text)) {
    return {
      ...base,
      name: 'Vintage Film',
      filter: `sepia(${0.35 + amount * 0.35}) contrast(${1.08 + amount * 0.18}) saturate(${0.92 + amount * 0.08})`,
      tint: 'rgba(255, 214, 170, 0.16)',
      grain: 0.07 + amount * 0.05,
      vignette: 0.3 + amount * 0.18
    };
  }

  if (/dream|ethereal|soft|romantic|mist|pastel/.test(text)) {
    return {
      ...base,
      name: 'Dream Glow',
      filter: `brightness(${1.03 + amount * 0.06}) contrast(${0.95 + amount * 0.1}) saturate(${0.96 + amount * 0.08})`,
      tint: 'rgba(255, 237, 251, 0.18)',
      grain: 0.025 + amount * 0.02,
      vignette: 0.16 + amount * 0.1,
      glowBlur: 16 + amount * 18,
      glowAlpha: 0.28 + amount * 0.12,
      blur: 0.6 + amount * 0.8
    };
  }

  if (/cyber|neon|electric|club|synth/.test(text)) {
    return {
      ...base,
      name: 'Neon Grade',
      filter: `contrast(${1.12 + amount * 0.22}) saturate(${1.18 + amount * 0.35}) brightness(${0.98 + amount * 0.03})`,
      tint: 'rgba(121, 85, 255, 0.16)',
      tintBlend: 'screen',
      grain: 0.03 + amount * 0.02,
      vignette: 0.18 + amount * 0.1,
      glowBlur: 8 + amount * 12,
      glowAlpha: 0.18 + amount * 0.08
    };
  }

  if (/warm|golden|sunset|amber|honey/.test(text)) {
    return {
      ...base,
      name: 'Golden Hour',
      filter: `brightness(${1.03 + amount * 0.05}) contrast(${1.02 + amount * 0.12}) saturate(${1.02 + amount * 0.12})`,
      tint: 'rgba(255, 192, 120, 0.18)',
      tintBlend: 'screen',
      grain: 0.03 + amount * 0.02,
      vignette: 0.18 + amount * 0.12
    };
  }

  if (/cool|moon|blue|night|icy/.test(text)) {
    return {
      ...base,
      name: 'Moonlit',
      filter: `brightness(${0.96 + amount * 0.03}) contrast(${1.08 + amount * 0.16}) saturate(${0.95 + amount * 0.06})`,
      tint: 'rgba(126, 178, 255, 0.16)',
      tintBlend: 'screen',
      grain: 0.04 + amount * 0.02,
      vignette: 0.24 + amount * 0.14
    };
  }

  return base;
}

function applyVignette(ctx, width, height, intensity) {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.18,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${Math.min(0.75, intensity)})`);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function applyGrain(ctx, width, height, opacity) {
  const noise = ctx.createImageData(width, height);
  for (let i = 0; i < noise.data.length; i += 4) {
    const value = Math.random() * 255;
    noise.data[i] = value;
    noise.data[i + 1] = value;
    noise.data[i + 2] = value;
    noise.data[i + 3] = Math.floor(255 * opacity);
  }
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const offCtx = off.getContext('2d');
  offCtx.putImageData(noise, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

async function createQuickRemix(file, prompt, strength) {
  const preset = chooseQuickRemixPreset(prompt, strength);
  const { image, url: objectUrl } = await fileToImage(file);
  const size = fitDimensions(image.width, image.height, 1600);

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = size.width;
  glowCanvas.height = size.height;
  const glowCtx = glowCanvas.getContext('2d');

  if (preset.glowBlur > 0) {
    glowCtx.filter = `blur(${preset.glowBlur}px) brightness(1.08)`;
    glowCtx.drawImage(image, 0, 0, size.width, size.height);
    ctx.globalAlpha = preset.glowAlpha;
    ctx.drawImage(glowCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }

  ctx.filter = `${preset.filter}${preset.blur ? ` blur(${preset.blur}px)` : ''}`;
  ctx.drawImage(image, 0, 0, size.width, size.height);
  ctx.filter = 'none';

  ctx.save();
  ctx.globalCompositeOperation = preset.tintBlend;
  ctx.fillStyle = preset.tint;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.restore();

  applyVignette(ctx, size.width, size.height, preset.vignette);
  applyGrain(ctx, size.width, size.height, preset.grain);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not export quick remix.')), 'image/png');
  });

  URL.revokeObjectURL(objectUrl);
  return { blob, presetName: preset.name };
}

async function uploadReferenceImage(file, apiKey) {
  const formData = new FormData();
  formData.append('file', file, file.name || 'reference-image.png');

  async function attempt(url, headers) {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) {
      throw new Error(data.error || data.message || 'Reference upload failed.');
    }
    return data.url;
  }

  try {
    return await attempt(POLL_MEDIA_UPLOAD, { Authorization: `Bearer ${apiKey}` });
  } catch (firstError) {
    try {
      const fallbackUrl = `${POLL_MEDIA_UPLOAD}?key=${encodeURIComponent(apiKey)}`;
      return await attempt(fallbackUrl);
    } catch {
      throw firstError;
    }
  }
}

async function handleTextToImage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  const prompt = composePrompt(body.prompt, body.avoidTerms);

  if (!prompt) {
    showToast('Please enter a prompt.', 'error');
    return;
  }

  setBusy(true);
  addLog('Text → Image', `Prompt queued: ${body.prompt}`);

  try {
    const { url, seed } = buildPollinationsImageUrl(prompt, {
      model: body.model || 'flux',
      width: Number(body.width) || 1024,
      height: Number(body.height) || 1024,
      seed: body.seed ? Number(body.seed) : undefined,
      enhance: body.enhance === 'true',
      privateMode: body.privateMode === 'true'
    });

    renderLoadingPreview('Generating image…');
    await preloadImage(url);

    pushOutputs([{
      kind: 'image',
      url,
      title: 'Generated image',
      subtitle: `${body.model || 'flux'} • Seed ${seed}`,
      fileName: `aura-image-${seed}.png`
    }]);

    addLog('Image complete', `Created a ${body.width}×${body.height} image with seed ${seed}.`);
    showToast('Image ready.');
  } catch (error) {
    addLog('Error', error.message);
    showToast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function renderLoadingPreview(message) {
  els.previewPlaceholder.classList.add('hidden');
  els.previewMedia.classList.remove('hidden');
  els.previewMedia.innerHTML = `
    <div class="media-frame">
      <div class="loading-card loading-pulse">
        ${escapeHtml(message)}
      </div>
    </div>
  `;
}

async function handleImageToImage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = new FormData(form);
  const file = body.get('image');
  const prompt = String(body.get('prompt') || '').trim();
  const mode = body.get('remixMode');

  if (!(file instanceof File) || !file.size) {
    showToast('Please upload an image first.', 'error');
    return;
  }

  if (!prompt) {
    showToast('Please describe the remix you want.', 'error');
    return;
  }

  setBusy(true);
  addLog('Image → Image', `${mode === 'ai' ? 'AI Remix' : 'Quick Remix'} requested: ${prompt}`);

  try {
    renderLoadingPreview(mode === 'ai' ? 'Uploading reference for AI Remix…' : 'Rendering Quick Remix…');

    if (mode === 'quick') {
      const { blob, presetName } = await createQuickRemix(file, prompt, Number(body.get('strength') || 0.65));
      const url = URL.createObjectURL(blob);

      pushOutputs([{
        kind: 'image',
        url,
        title: 'Quick Remix',
        subtitle: `${presetName} • Browser render`,
        localBlob: blob,
        fileName: `aura-quick-remix-${Date.now()}.png`
      }]);

      addLog('Quick Remix complete', `Applied the ${presetName} preset on-device.`);
      showToast('Quick Remix finished.');
      return;
    }

    const apiKey = els.apiKey.value.trim();
    if (!apiKey) {
      throw new Error('AI Remix needs an upload key in the settings card because your source image must be uploaded first.');
    }

    const uploadedUrl = await uploadReferenceImage(file, apiKey);
    renderLoadingPreview('Generating AI Remix…');

    const { url, seed } = buildPollinationsImageUrl(prompt, {
      model: 'kontext',
      width: Number(body.get('width')) || 1024,
      height: Number(body.get('height')) || 1024,
      seed: body.get('seed') ? Number(body.get('seed')) : undefined,
      imageUrl: uploadedUrl,
      privateMode: true,
      enhance: true
    });

    await preloadImage(url);

    pushOutputs([{
      kind: 'image',
      url,
      title: 'AI Remix',
      subtitle: `kontext • Seed ${seed}`,
      fileName: `aura-ai-remix-${seed}.png`
    }]);

    addLog('AI Remix complete', `Uploaded the reference image and generated a kontext remix with seed ${seed}.`);
    showToast('AI Remix finished.');
  } catch (error) {
    addLog('Error', error.message);
    showToast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function createMotionClip(file, options) {
  const { image, url } = await fileToImage(file);
  const { width, height } = guessCanvasSize(image);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const fps = Number(options.fps);
  const duration = Number(options.duration);
  const zoom = Number(options.zoom);
  const pan = String(options.pan);
  const totalFrames = Math.max(1, Math.floor(fps * duration));

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onerror = (event) => reject(event.error || new Error('Recording failed'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });

  function ease(t) {
    return 0.5 - Math.cos(t * Math.PI) / 2;
  }

  recorder.start();
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const t = totalFrames === 1 ? 1 : frame / (totalFrames - 1);
    const eased = ease(t);
    const scale = 1 + zoom * eased;
    const drawWidth = canvas.width * scale;
    const drawHeight = canvas.height * scale;

    let dx = (canvas.width - drawWidth) / 2;
    let dy = (canvas.height - drawHeight) / 2;
    const travelX = (drawWidth - canvas.width) * 0.5;
    const travelY = (drawHeight - canvas.height) * 0.5;

    if (pan === 'right') dx -= travelX * t;
    if (pan === 'left') dx += travelX * t;
    if (pan === 'up') dy += travelY * t;
    if (pan === 'down') dy -= travelY * t;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight);

    await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
  }
  recorder.stop();

  const blob = await done;
  URL.revokeObjectURL(url);
  return blob;
}

async function handleImageToVideo(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = new FormData(form);
  const file = body.get('image');

  if (!(file instanceof File) || !file.size) {
    showToast('Please upload an image first.', 'error');
    return;
  }

  setBusy(true);
  addLog('Image → Video', `Motion Clip requested: ${body.get('prompt') || 'No clip note entered.'}`);

  try {
    renderLoadingPreview('Rendering motion clip…');
    const blob = await createMotionClip(file, {
      duration: body.get('duration') || 5,
      fps: body.get('fps') || 30,
      zoom: body.get('zoom') || 0.18,
      pan: body.get('pan') || 'right'
    });

    const url = URL.createObjectURL(blob);
    const item = {
      kind: 'video',
      url,
      title: 'Motion Clip',
      subtitle: `${body.get('duration')}s • ${body.get('fps')} fps • Browser render`,
      localBlob: blob,
      fileName: `aura-motion-${Date.now()}.webm`
    };

    pushOutputs([item]);
    addLog('Motion Clip complete', 'Created a browser-rendered WebM clip from your still image.');
    showToast('Motion Clip ready.');
  } catch (error) {
    addLog('Error', error.message);
    showToast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function bootPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    els.installApp.classList.remove('hidden');
  });

  els.installApp.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => ({}));
    state.installPrompt = null;
    els.installApp.classList.add('hidden');
  });
}

function boot() {
  attachTabs();
  attachUploadLabels();
  attachModeCards();
  renderGallery();
  loadSettings();
  bootPwa();

  document.getElementById('txt2img-form').addEventListener('submit', handleTextToImage);
  document.getElementById('img2img-form').addEventListener('submit', handleImageToImage);
  document.getElementById('img2video-form').addEventListener('submit', handleImageToVideo);
  els.saveSettings.addEventListener('click', saveSettings);
  els.apiKey.addEventListener('input', updateKeyStatus);
  els.clearLog.addEventListener('click', () => {
    els.log.innerHTML = '';
    addLog('Session cleared', 'The activity feed was reset.');
  });

  addLog('Studio ready', 'Text-to-image, Quick Remix, and Motion Clip work immediately in this browser-first build.');
}

boot();
