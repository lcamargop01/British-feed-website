// ═══════════════════════════════════════════════════════════════════════════
//  British Feed & Supplies — Admin CMS Backend v3.0
//  Full content management: Products, Site Content, AI Chatbot, Reviews
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  BF_STORE: KVNamespace
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  ADMIN_PASSWORD: string
}

export const admin = new Hono<{ Bindings: Bindings }>()

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function kvGet(kv: KVNamespace | undefined, key: string, fallback: any = null) {
  if (!kv) return fallback
  const raw = await kv.get(key)
  if (!raw) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}
async function kvPut(kv: KVNamespace | undefined, key: string, val: any) {
  if (!kv) return false
  await kv.put(key, JSON.stringify(val))
  return true
}

// ─── Auth middleware ─────────────────────────────────────────────────────────
const requireAuth = async (c: any, next: any) => {
  const session = getCookie(c, 'bf_admin')
  if (session !== 'authenticated') return c.redirect('/admin/login')
  await next()
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/login', (c) => c.html(loginPage()))

admin.post('/login', async (c) => {
  const { password } = await c.req.parseBody()
  const correct = c.env?.ADMIN_PASSWORD || 'BritishFeed2025!'
  if (password === correct) {
    setCookie(c, 'bf_admin', 'authenticated', {
      httpOnly: true, path: '/', maxAge: 60 * 60 * 8, sameSite: 'Lax'
    })
    return c.redirect('/admin')
  }
  return c.html(loginPage('Incorrect password. Please try again.'))
})

admin.get('/logout', (c) => {
  deleteCookie(c, 'bf_admin', { path: '/' })
  return c.redirect('/admin/login')
})

// ═══════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const products: any[]   = await kvGet(kv, 'products', [])
  const chatbotKB: any[]  = await kvGet(kv, 'chatbot_kb', [])
  const reviews: any[]    = await kvGet(kv, 'reviews', [])
  const contacts: any[]   = await kvGet(kv, 'contacts', [])
  const siteContent: any  = await kvGet(kv, 'site_content', {})

  const productCount = products.reduce((a: number, b: any) => a + (b.items?.length || 1), 0)
  const brandCount   = products.length
  const kbCount      = chatbotKB.length
  const reviewCount  = reviews.length
  const contactCount = contacts.length
  const avgRating    = reviews.length
    ? (reviews.reduce((s: number, r: any) => s + (r.rating || 5), 0) / reviews.length).toFixed(1)
    : '4.8'

  return c.html(adminShell('Dashboard', 'dashboard', `
<div class="p-6 max-w-7xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Welcome back, Team 👋</h1>
      <p class="text-gray-500 text-sm mt-1">British Feed & Supplies CMS — Manage everything from here</p>
    </div>
    <a href="/" target="_blank" class="btn-secondary">
      <i class="fas fa-external-link-alt"></i> View Live Site
    </a>
  </div>

  <!-- Stats grid -->
  <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
    <div class="card text-center">
      <div class="text-3xl font-bold text-navy">${brandCount}</div>
      <div class="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Brands</div>
    </div>
    <div class="card text-center">
      <div class="text-3xl font-bold text-navy">${productCount}</div>
      <div class="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Products</div>
    </div>
    <div class="card text-center">
      <div class="text-3xl font-bold text-navy">${kbCount}</div>
      <div class="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">KB Entries</div>
    </div>
    <div class="card text-center">
      <div class="text-3xl font-bold" style="color:#C9A84C">${avgRating}★</div>
      <div class="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">${reviewCount} Reviews</div>
    </div>
    <div class="card text-center">
      <div class="text-3xl font-bold text-green-600">${contactCount}</div>
      <div class="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Inquiries</div>
    </div>
  </div>

  <!-- Quick actions — Product Catalog -->
  <div class="mb-2 flex items-center gap-2">
    <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Product Catalog</div>
    <div class="flex-1 border-t border-gray-100"></div>
  </div>
  <div class="grid grid-cols-1 gap-4 mb-6">
    <a href="/admin/catalog" class="card hover:shadow-md transition-all group cursor-pointer block border-2 border-navy/10 hover:border-navy/30">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#EEF1F8">
          <i class="fas fa-table-list text-navy group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">Catalog Manager</div>
          <div class="text-xs text-gray-400">Edit products, images &amp; videos</div>
        </div>
      </div>
      <div class="text-xs text-gray-500">${productCount} products · CSV import/export · image upload</div>
    </a>

  </div>

  <!-- Quick actions — Site Management -->
  <div class="mb-2 flex items-center gap-2">
    <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Site Management</div>
    <div class="flex-1 border-t border-gray-100"></div>
  </div>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <a href="/admin/chatbot" class="card hover:shadow-md transition-all group cursor-pointer block">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#F0FFF4">
          <i class="fas fa-robot text-green-600 group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">AI Chatbot</div>
          <div class="text-xs text-gray-400">Knowledge base &amp; rules</div>
        </div>
      </div>
      <div class="text-xs text-gray-500">${kbCount} knowledge entries</div>
    </a>
    <a href="/admin/content" class="card hover:shadow-md transition-all group cursor-pointer block">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#FBF5E6">
          <i class="fas fa-pen-to-square text-amber-600 group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">Site Content</div>
          <div class="text-xs text-gray-400">Hero, About, Services</div>
        </div>
      </div>
      <div class="text-xs text-gray-500">Edit any page text or image</div>
    </a>
    <a href="/admin/reviews" class="card hover:shadow-md transition-all group cursor-pointer block">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#FFFBEB">
          <i class="fas fa-star text-yellow-500 group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">Reviews</div>
          <div class="text-xs text-gray-400">Manage star ratings</div>
        </div>
      </div>
      <div class="text-xs text-gray-500">${reviewCount} reviews · avg ${avgRating}★</div>
    </a>
    <a href="/admin/inquiries" class="card hover:shadow-md transition-all group cursor-pointer block">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#FEF2F2">
          <i class="fas fa-envelope text-red-500 group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">Inquiries</div>
          <div class="text-xs text-gray-400">Contact form submissions</div>
        </div>
      </div>
      <div class="text-xs text-gray-500">${contactCount} form submissions</div>
    </a>
  </div>

  <!-- Recent contacts -->
  ${contactCount > 0 ? `
  <div class="card mb-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-semibold text-gray-800">Recent Inquiries</h2>
      <a href="/admin/inquiries" class="text-xs text-blue-500 hover:underline">View all →</a>
    </div>
    <div id="recent-contacts">Loading…</div>
  </div>
  <script>
  (async () => {
    const contacts = await apiGet('contacts') || [];
    const recent = contacts.slice(-5).reverse();
    document.getElementById('recent-contacts').innerHTML = recent.length ? recent.map(c => \`
      <div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
        <div class="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-500">\${c.name?.[0]||'?'}</div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm text-gray-800">\${c.name}</div>
          <div class="text-xs text-gray-500 truncate">\${c.message?.slice(0,80)||''}</div>
        </div>
        <div class="text-xs text-gray-400">\${c.date||''}</div>
      </div>
    \`).join('') : '<div class="text-sm text-gray-400">No inquiries yet</div>';
  })();
  </script>
  ` : `
  <div class="card mb-6 text-center py-8 text-gray-400">
    <i class="fas fa-envelope text-3xl mb-2 block"></i>
    <div class="text-sm">No inquiries yet — they'll appear here as customers contact you</div>
  </div>
  `}

  <!-- Quick instructions -->
  <div class="card" style="background:linear-gradient(135deg,#1B2A4A,#2D4A7A);border:none">
    <h2 class="font-semibold text-white mb-3 flex items-center gap-2"><i class="fas fa-lightbulb text-yellow-400"></i> Getting Started</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
      <div class="bg-white bg-opacity-10 rounded-xl p-4">
        <div class="text-yellow-300 font-semibold mb-1">1. Manage the Catalog</div>
        <div class="text-blue-100 text-xs">Go to <strong>Catalog Manager</strong> → edit products, upload images, import/export CSV</div>
      </div>
      <div class="bg-white bg-opacity-10 rounded-xl p-4">
        <div class="text-yellow-300 font-semibold mb-1">2. Train the Chatbot</div>
        <div class="text-blue-100 text-xs">Go to <strong>AI Chatbot</strong> → add Q&A pairs, custom rules, or test the bot before publishing</div>
      </div>
      <div class="bg-white bg-opacity-10 rounded-xl p-4">
        <div class="text-yellow-300 font-semibold mb-1">3. Update Site Content</div>
        <div class="text-blue-100 text-xs">Go to <strong>Site Content</strong> → edit hero headline, about text, services, team bios, reviews &amp; more</div>
      </div>
    </div>
  </div>
</div>
`))
})

// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCTS — redirect to catalog
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/products', requireAuth, (c) => c.redirect('/admin/catalog'))


// ═══════════════════════════════════════════════════════════════════════════
//  SITE CONTENT EDITOR
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/content', requireAuth, async (c) => {

  return c.html(adminShell('Site Content', 'content', `
<!-- Visual Content Editor — full viewport split layout -->
<style>
  /* override adminShell body padding for this page */
  main.flex-1.overflow-y-auto { overflow:hidden !important; }
  #ve-root { display:flex; flex-direction:column; height:100%; overflow:hidden; }
  #ve-toolbar { flex-shrink:0; display:flex; align-items:center; gap:10px; padding:10px 16px; background:#fff; border-bottom:1px solid #e5e7eb; z-index:10; }
  #ve-body { flex:1; display:flex; overflow:hidden; }
  #ve-iframe-wrap { flex:1; position:relative; overflow:hidden; background:#f3f4f6; }
  #ve-iframe { width:100%; height:100%; border:none; display:block; }
  #ve-iframe-loading { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f3f4f6; color:#9ca3af; gap:8px; font-size:14px; z-index:5; }
  #ve-panel { width:0; flex-shrink:0; overflow:hidden; transition:width .25s cubic-bezier(.4,0,.2,1); background:#fff; border-left:1px solid #e5e7eb; display:flex; flex-direction:column; }
  #ve-panel.open { width:440px; }
  #ve-panel-inner { flex:1; overflow-y:auto; padding:0; }
  #ve-panel-footer { flex-shrink:0; padding:12px 16px; border-top:1px solid #e5e7eb; display:flex; gap:8px; justify-content:flex-end; background:#fff; }
  .ve-section-btn { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; border:1px solid #e5e7eb; background:#fff; color:#374151; transition:all .15s; white-space:nowrap; }
  .ve-section-btn.active { background:#1B2A4A; color:#fff; border-color:#1B2A4A; }
  .ve-section-btn:hover:not(.active) { background:#f9fafb; border-color:#1B2A4A; color:#1B2A4A; }
  .ve-field { margin-bottom:14px; }
  .ve-label { display:block; font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
  .ve-input { width:100%; border:1px solid #e5e7eb; border-radius:8px; padding:7px 10px; font-size:13px; color:#111827; background:#fff; outline:none; transition:border-color .15s; box-sizing:border-box; }
  .ve-input:focus { border-color:#1B2A4A; }
  .ve-textarea { width:100%; border:1px solid #e5e7eb; border-radius:8px; padding:7px 10px; font-size:13px; color:#111827; background:#fff; outline:none; resize:vertical; min-height:72px; transition:border-color .15s; box-sizing:border-box; }
  .ve-textarea:focus { border-color:#1B2A4A; }
  .ve-section-header { padding:14px 16px 10px; border-bottom:1px solid #f3f4f6; margin-bottom:0; display:flex; align-items:center; gap:8px; }
  .ve-section-body { padding:14px 16px; }
  .ve-subsection { background:#f9fafb; border-radius:10px; padding:12px; margin-bottom:10px; border:1px solid #f0f0f0; }
  .ve-subsection-title { font-size:11px; font-weight:700; color:#374151; text-transform:uppercase; letter-spacing:.06em; margin-bottom:10px; }
  .ve-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .ve-save-flash { position:fixed; bottom:24px; right:24px; background:#1B2A4A; color:#fff; padding:10px 20px; border-radius:10px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px; z-index:9999; opacity:0; transform:translateY(8px); transition:all .3s; pointer-events:none; }
  .ve-save-flash.show { opacity:1; transform:translateY(0); }
  .ve-img-row { display:flex; gap:8px; align-items:flex-start; }
  .ve-img-row input { flex:1; }
  .ve-img-thumb { width:48px; height:36px; border-radius:6px; object-fit:cover; border:1px solid #e5e7eb; flex-shrink:0; display:none; }
  .ve-img-thumb.has-img { display:block; }
  .ve-device-btn { padding:4px 10px; border-radius:6px; font-size:11px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600; color:#6b7280; }
  .ve-device-btn.active { background:#1B2A4A; color:#fff; border-color:#1B2A4A; }
  .ve-highlight-notice { position:absolute; bottom:12px; left:50%; transform:translateX(-50%); background:rgba(27,42,74,.9); color:#fff; font-size:12px; padding:7px 16px; border-radius:20px; pointer-events:none; white-space:nowrap; display:flex; align-items:center; gap:6px; }
</style>

<div id="ve-root">

  <!-- Toolbar -->
  <div id="ve-toolbar">
    <div class="font-bold text-gray-800 text-sm flex items-center gap-2 mr-2">
      <i class="fas fa-paint-brush" style="color:#C9A84C"></i>
      Visual Editor
    </div>
    <!-- Section quick-jump buttons -->
    <div class="flex gap-1.5 flex-wrap">
      <button class="ve-section-btn active" data-sec="hero"    onclick="openSection('hero')">   Hero</button>
      <button class="ve-section-btn" data-sec="stats"   onclick="openSection('stats')">  Stats</button>
      <button class="ve-section-btn" data-sec="about"   onclick="openSection('about')">  About</button>
      <button class="ve-section-btn" data-sec="services"onclick="openSection('services')">Services</button>
      <button class="ve-section-btn" data-sec="team"    onclick="openSection('team')">   Team</button>
      <button class="ve-section-btn" data-sec="contact" onclick="openSection('contact')">Contact</button>
      <button class="ve-section-btn" data-sec="seo"     onclick="openSection('seo')">    SEO</button>
    </div>
    <div class="ml-auto flex items-center gap-2">
      <!-- Device width toggles -->
      <button class="ve-device-btn active" id="dev-desktop" onclick="setDevice('desktop')" title="Desktop view"><i class="fas fa-desktop"></i></button>
      <button class="ve-device-btn"       id="dev-tablet"  onclick="setDevice('tablet')"  title="Tablet view"> <i class="fas fa-tablet-alt"></i></button>
      <button class="ve-device-btn"       id="dev-mobile"  onclick="setDevice('mobile')"  title="Mobile view"> <i class="fas fa-mobile-alt"></i></button>
      <div style="width:1px;height:22px;background:#e5e7eb;margin:0 4px"></div>
      <a href="/" target="_blank"
        style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#374151;text-decoration:none;cursor:pointer;"
        title="Open live site in new tab">
        <i class="fas fa-external-link-alt" style="font-size:11px;color:#C9A84C"></i> Live Site
      </a>
      <button onclick="saveAllContent()" id="ve-save-btn"
        style="background:#1B2A4A;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-save"></i> Save &amp; Publish
      </button>
    </div>
  </div>

  <!-- Main body -->
  <div id="ve-body">

    <!-- iframe preview -->
    <div id="ve-iframe-wrap">
      <div id="ve-iframe-loading">
        <i class="fas fa-spinner fa-spin text-3xl" style="color:#C9A84C"></i>
        Loading preview…
      </div>
      <iframe id="ve-iframe" src="/admin/content/preview" title="Site Preview"></iframe>
      <div class="ve-highlight-notice" id="ve-notice">
        <i class="fas fa-mouse-pointer"></i> Click any section to edit it
      </div>
    </div>

    <!-- Sliding edit panel -->
    <div id="ve-panel">
      <div id="ve-panel-inner"></div>
      <div id="ve-panel-footer">
        <button onclick="closePanel()" style="padding:7px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;cursor:pointer;font-weight:500;color:#374151;">
          Close
        </button>
        <button onclick="saveAllContent()" style="background:#1B2A4A;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-save"></i> Save &amp; Publish
        </button>
      </div>
    </div>

  </div>
</div>

<!-- Save flash toast -->
<div class="ve-save-flash" id="ve-flash"><i class="fas fa-check-circle" style="color:#4ade80"></i><span id="ve-flash-msg">Saved!</span></div>

<script>
// ─── State ────────────────────────────────────────────────────────────────────
let veData = {};
let veCurrentSection = 'hero';
const FIELDS = [
  'hero-headline','hero-subheadline','hero-desc','cta1','cta2','hero-bg',
  'stats-1-num','stats-1-label','stats-2-num','stats-2-label','stats-3-num','stats-3-label','stats-4-num','stats-4-label',
  'about-heading','about-para1','about-para2','about-para3','about-image',
  'svc1-title','svc1-icon','svc1-desc','svc1-detail','svc1-image',
  'svc2-title','svc2-icon','svc2-desc','svc2-detail','svc2-image',
  'svc3-title','svc3-icon','svc3-desc','svc3-detail','svc3-image',
  'team1-name','team1-role','team1-bio','team1-photo','team1-cred',
  'team2-name','team2-role','team2-bio','team2-photo','team2-cred',
  'quote-text','quote-author',
  'phone','email','address','hours-wk','hours-wknd',
  'instagram','facebook','maps-url','delivery-min','delivery-areas',
  'seo-title','seo-desc','seo-keywords'
];

// ─── Load saved content ───────────────────────────────────────────────────────
async function loadContent() {
  try {
    const r = await fetch('/admin/api/data/site_content');
    const d = await r.json();
    veData = d.value || {};
  } catch(e) {}
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveAllContent() {
  // Collect any live values from currently open panel
  collectPanelValues();
  const btn = document.getElementById('ve-save-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
  try {
    const r = await fetch('/admin/api/data/site_content', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({value: veData})
    });
    const d = await r.json();
    if (d.ok !== false) {
      showFlash('Saved & published!', true);
      // Push updated content into iframe for live preview
      const iframe = document.getElementById('ve-iframe');
      if (iframe.contentWindow) iframe.contentWindow.postMessage({type:'apply-content', data: veData}, '*');
    } else {
      showFlash('Save failed — try again', false);
    }
  } catch(e) {
    showFlash('Error: ' + e.message, false);
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save &amp; Publish'; }
}

function collectPanelValues() {
  // Collect regular text/textarea fields
  document.querySelectorAll('#ve-panel-inner [data-field]').forEach(el => {
    veData[el.dataset.field] = el.value;
  });
  // Collect img picker URL inputs (identified by data-ve-field on their wrapper)
  document.querySelectorAll('#ve-panel-inner .img-picker[data-ve-field]').forEach(wrapper => {
    const field = wrapper.dataset.veField;
    const urlInput = wrapper.querySelector('.ip-url-pane input');
    if (urlInput) veData[field] = urlInput.value;
  });
}

// ─── Flash toast ──────────────────────────────────────────────────────────────
function showFlash(msg, ok = true) {
  const f = document.getElementById('ve-flash');
  const m = document.getElementById('ve-flash-msg');
  m.textContent = msg;
  f.querySelector('i').style.color = ok ? '#4ade80' : '#f87171';
  f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 3000);
}

// ─── Panel open/close ─────────────────────────────────────────────────────────
function openSection(sec) {
  collectPanelValues();
  veCurrentSection = sec;
  // Update toolbar active
  document.querySelectorAll('.ve-section-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sec === sec);
  });
  // Render panel content
  document.getElementById('ve-panel-inner').innerHTML = buildPanel(sec);
  document.getElementById('ve-panel').classList.add('open');
  // Tell iframe to highlight this section (guard: iframe may not be loaded yet)
  const iframe = document.getElementById('ve-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({type:'highlight', section: sec}, '*');
    iframe.contentWindow.postMessage({type:'scroll-to', section: sec}, '*');
  }
  // Attach thumb preview for img fields
  document.querySelectorAll('#ve-panel-inner [data-field]').forEach(el => {
    if (el.dataset.imgthumb) {
      el.addEventListener('input', () => updateThumb(el));
      updateThumb(el);
    }
  });
}

function closePanel() {
  collectPanelValues();
  document.getElementById('ve-panel').classList.remove('open');
  document.querySelectorAll('.ve-section-btn').forEach(b => b.classList.remove('active'));
  const iframe = document.getElementById('ve-iframe');
  if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({type:'highlight', section: null}, '*');
}

function updateThumb(inputEl) {
  const thumbId = inputEl.dataset.imgthumb;
  const thumb = document.getElementById(thumbId);
  if (!thumb) return;
  const url = inputEl.value.trim();
  if (url) { thumb.src = url; thumb.classList.add('has-img'); }
  else { thumb.classList.remove('has-img'); }
}

// ─── Device preview ───────────────────────────────────────────────────────────
function setDevice(dev) {
  document.querySelectorAll('.ve-device-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('dev-' + dev).classList.add('active');
  const wrap = document.getElementById('ve-iframe-wrap');
  const iframe = document.getElementById('ve-iframe');
  if (dev === 'desktop') {
    wrap.style.alignItems = '';
    wrap.style.justifyContent = '';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.maxWidth = '';
    iframe.style.margin = '';
    iframe.style.boxShadow = '';
    iframe.style.transform = '';
  } else if (dev === 'tablet') {
    wrap.style.alignItems = 'flex-start';
    wrap.style.justifyContent = 'center';
    wrap.style.padding = '16px';
    wrap.style.overflowY = 'auto';
    iframe.style.width = '768px';
    iframe.style.maxWidth = '768px';
    iframe.style.height = '1024px';
    iframe.style.boxShadow = '0 8px 40px rgba(0,0,0,.18)';
    iframe.style.borderRadius = '12px';
  } else {
    wrap.style.alignItems = 'flex-start';
    wrap.style.justifyContent = 'center';
    wrap.style.padding = '16px';
    wrap.style.overflowY = 'auto';
    iframe.style.width = '390px';
    iframe.style.maxWidth = '390px';
    iframe.style.height = '844px';
    iframe.style.boxShadow = '0 8px 40px rgba(0,0,0,.18)';
    iframe.style.borderRadius = '16px';
  }
}

// ─── Listen for messages from the iframe ─────────────────────────────────────
window.addEventListener('message', e => {
  if (e.data?.type === 'section-click') openSection(e.data.section);
  if (e.data?.type === 'iframe-ready') {
    showPreview();
  }
});

// ─── Panel HTML builders ──────────────────────────────────────────────────────
function f(field, label, type = 'text', placeholder = '') {
  const val = veData[field] || '';
  const isArea = type === 'textarea';
  const tag = isArea ? 'textarea' : 'input';
  const extra = isArea ? \`rows="3"\` : \`type="text"\`;
  const isImg = type === 'image';
  if (isImg) {
    const thumbId = 'thumb-' + field;
    return \`<div class="ve-field">
      <label class="ve-label">\${label}</label>
      <div class="ve-img-row">
        <input class="ve-input" data-field="\${field}" data-imgthumb="\${thumbId}"
          value="\${esc(val)}" placeholder="\${esc(placeholder || 'https://...')}"
          oninput="veData['\${field}']=this.value"/>
        <img id="\${thumbId}" class="ve-img-thumb \${val ? 'has-img' : ''}" src="\${esc(val)}" alt=""/>
      </div>
    </div>\`;
  }
  return \`<div class="ve-field">
    <label class="ve-label">\${label}</label>
    <\${tag} class="ve-\${isArea?'textarea':'input'}" data-field="\${field}" \${extra}
      placeholder="\${esc(placeholder)}"
      oninput="veData['\${field}']=this.value">\${isArea ? esc(val) : ''}<\\/\${tag}>\${isArea ? '' : ''}
    \${!isArea ? \`<input class="ve-input" data-field="\${field}" value="\${esc(val)}" type="hidden" style="display:none"/>\` : ''}
  </div>\`;
}

// simpler builders
function fi(field, label, placeholder = '') {
  const val = veData[field] || '';
  return \`<div class="ve-field">
    <label class="ve-label">\${label}</label>
    <input class="ve-input" data-field="\${field}" value="\${esc(val)}"
      placeholder="\${esc(placeholder)}" oninput="veData['\${field}']=this.value"/>
  </div>\`;
}
function ft(field, label, placeholder = '', rows = 3) {
  const val = veData[field] || '';
  return \`<div class="ve-field">
    <label class="ve-label">\${label}</label>
    <textarea class="ve-textarea" data-field="\${field}" rows="\${rows}"
      placeholder="\${esc(placeholder)}"
      oninput="veData['\${field}']=this.value">\${esc(val)}</textarea>
  </div>\`;
}
function fimg(field, label, placeholder = '') {
  const val = veData[field] || '';
  const pickerId = 'vep-' + field.replace(/[^a-z0-9]/gi,'-');
  // Use the shared imgPickerHTML widget (URL tab + Upload tab)
  // setterExpr: update veData AND refresh the live iframe preview
  const setterExpr = \`veData['\${field}']=url;document.getElementById('ve-iframe')?.contentWindow?.postMessage({type:'apply-content',data:veData},'*')\`;
  const pickerHtml = imgPickerHTML(pickerId, val, setterExpr);
  // Inject data-ve-field into the root picker div so collectPanelValues() can sync it
  const pickerWithAttr = pickerHtml.replace(
    \`data-picker="\${pickerId}"\`,
    \`data-picker="\${pickerId}" data-ve-field="\${field}"\`
  );
  return \`<div class="ve-field">
    <label class="ve-label">\${label}</label>
    \${pickerWithAttr}
  </div>\`;
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildPanel(sec) {
  const sections = {
    hero: () => \`
      <div class="ve-section-header">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#1B2A4A">
          <i class="fas fa-image text-xs" style="color:#C9A84C"></i>
        </div>
        <div>
          <div class="font-bold text-gray-900 text-sm">Hero Section</div>
          <div class="text-xs text-gray-400">Top banner — first thing visitors see</div>
        </div>
      </div>
      <div class="ve-section-body">
        \${fi('hero-headline',   'Main Headline', 'Premium Feed for Champions.')}
        \${fi('hero-subheadline','Sub-headline / Location Tag', 'Wellington · Loxahatchee · Palm Beach County')}
        \${ft('hero-desc',       'Description Paragraph', 'Serving Wellington\'s equestrian community…')}
        \${fi('cta1',           'Primary Button Text', 'Find the Right Feed')}
        \${fi('cta2',           'Secondary Button Text', 'Contact Us')}
        \${fimg('hero-bg',      'Hero Background Image', 'https://…')}
      </div>\`,

    stats: () => \`
      <div class="ve-section-header">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#C9A84C">
          <i class="fas fa-chart-bar text-xs text-white"></i>
        </div>
        <div>
          <div class="font-bold text-gray-900 text-sm">Stats Bar</div>
          <div class="text-xs text-gray-400">4 highlight numbers below the hero</div>
        </div>
      </div>
      <div class="ve-section-body">
        \${[['1','13+','Years Serving WPB'],['2','10+','Premium Brands'],['3','50+','Hay & Feed Options'],['4','4.8★','Google Rating']].map(([n,num,lbl]) => \`
        <div class="ve-subsection">
          <div class="ve-subsection-title">Stat \${n}</div>
          <div class="ve-grid2">
            \${fi(\`stats-\${n}-num\`, 'Number', num)}
            \${fi(\`stats-\${n}-label\`, 'Label', lbl)}
          </div>
        </div>\`).join('')}
      </div>\`,

    about: () => \`
      <div class="ve-section-header">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#15803D">
          <i class="fas fa-store text-xs text-white"></i>
        </div>
        <div>
          <div class="font-bold text-gray-900 text-sm">About Section</div>
          <div class="text-xs text-gray-400">Company story and background</div>
        </div>
      </div>
      <div class="ve-section-body">
        \${fi('about-heading', 'Section Heading', 'Wellington\'s Most Trusted Feed Store')}
        \${ft('about-para1',   'First Paragraph', 'Established in 2012…', 4)}
        \${ft('about-para2',   'Second Paragraph', 'In the summer of 2016…', 3)}
        \${ft('about-para3',   'Third Paragraph', 'Whether you own…', 3)}
        \${fimg('about-image', 'Section Photo', 'https://…')}
      </div>\`,

    services: () => \`
      <div class="ve-section-header">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#0369a1">
          <i class="fas fa-concierge-bell text-xs text-white"></i>
        </div>
        <div>
          <div class="font-bold text-gray-900 text-sm">Services Section</div>
          <div class="text-xs text-gray-400">Three service cards</div>
        </div>
      </div>
      <div class="ve-section-body">
        \${[1,2,3].map(n => \`
        <div class="ve-subsection">
          <div class="ve-subsection-title">Service \${n}</div>
          \${fi(\`svc\${n}-title\`,  'Title', 'Service title…')}
          \${fi(\`svc\${n}-icon\`,   'Icon (Font Awesome)', 'fas fa-truck')}
          \${ft(\`svc\${n}-desc\`,   'Description', '')}
          \${fi(\`svc\${n}-detail\`, 'Detail / Badge text', 'e.g. Free on orders $150+')}
          \${fimg(\`svc\${n}-image\`,'Photo', 'https://…')}
        </div>\`).join('')}
      </div>\`,

    team: () => \`
      <div class="ve-section-header">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#7c3aed">
          <i class="fas fa-users text-xs text-white"></i>
        </div>
        <div>
          <div class="font-bold text-gray-900 text-sm">Team Section</div>
          <div class="text-xs text-gray-400">Team member cards + quote</div>
        </div>
      </div>
      <div class="ve-section-body">
        \${[['1','Vieri Bracco','Owner & Founder'],['2','Carmine Garrett','General Manager']].map(([n,name,role]) => \`
        <div class="ve-subsection">
          <div class="ve-subsection-title">Team Member \${n}</div>
          \${fi(\`team\${n}-name\`, 'Name', name)}
          \${fi(\`team\${n}-role\`, 'Role / Title', role)}
          \${ft(\`team\${n}-bio\`,  'Bio', '', 4)}
          \${fi(\`team\${n}-cred\`, 'Credentials / Badge', 'e.g. Certified Equine Nutritionist')}
          \${fimg(\`team\${n}-photo\`, 'Photo', 'https://…')}
        </div>\`).join('')}
        <div class="ve-subsection">
          <div class="ve-subsection-title">Quote Block</div>
          \${ft('quote-text',   'Quote Text', 'Your suggestions and opinions…')}
          \${fi('quote-author', 'Attribution', '— Vieri Bracco, Owner')}
        </div>
      </div>\`,

    contact: () => \`
      <div class="ve-section-header">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#b45309">
          <i class="fas fa-address-card text-xs text-white"></i>
        </div>
        <div>
          <div class="font-bold text-gray-900 text-sm">Contact Information</div>
          <div class="text-xs text-gray-400">Phone, hours, social, delivery</div>
        </div>
      </div>
      <div class="ve-section-body">
        <div class="ve-subsection">
          <div class="ve-subsection-title">Store Details</div>
          <div class="ve-grid2">
            \${fi('phone', 'Phone', '(561) 633-6003')}
            \${fi('email', 'Email', 'admin@britishfeed.com')}
          </div>
          \${fi('address', 'Address', '14589 Southern Blvd…')}
          <div class="ve-grid2">
            \${fi('hours-wk',   'Weekday Hours', '7am – 6pm')}
            \${fi('hours-wknd','Weekend Hours',  '8am – 4pm')}
          </div>
        </div>
        <div class="ve-subsection">
          <div class="ve-subsection-title">Social Links</div>
          \${fi('instagram', 'Instagram URL', 'https://instagram.com/…')}
          \${fi('facebook',  'Facebook URL',  'https://facebook.com/…')}
        </div>
        <div class="ve-subsection">
          <div class="ve-subsection-title">Delivery</div>
          <div class="ve-grid2">
            \${fi('delivery-min', 'Min. Order', '$150')}
          </div>
          \${ft('delivery-areas', 'Delivery Areas (comma separated)', 'Wellington, Loxahatchee…')}
        </div>
        \${fimg('maps-url', 'Google Maps Embed URL', 'https://maps.google.com/…')}
      </div>\`,

    seo: () => \`
      <div class="ve-section-header">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#064e3b">
          <i class="fas fa-search text-xs text-white"></i>
        </div>
        <div>
          <div class="font-bold text-gray-900 text-sm">SEO &amp; Meta</div>
          <div class="text-xs text-gray-400">Page title, description &amp; keywords</div>
        </div>
      </div>
      <div class="ve-section-body">
        \${fi('seo-title',    'Page Title', 'British Feed & Supplies | Premium Horse Feed — Wellington, FL')}
        \${ft('seo-desc',     'Meta Description', 'British Feed & Supplies in Loxahatchee Groves, FL…', 3)}
        \${fi('seo-keywords', 'Keywords', 'horse feed, Wellington FL, Nutrena, Cavalor, hay…')}
      </div>\`,
  };

  return (sections[sec] || sections.hero)();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
// The iframe uses src="/admin/content/preview" which serves the homepage with
// overlays already injected server-side. The preview page posts "iframe-ready"
// when its overlays are set up; we listen above in the message handler.

function showPreview() {
  const loading = document.getElementById('ve-iframe-loading');
  const notice  = document.getElementById('ve-notice');
  const iframe  = document.getElementById('ve-iframe');
  if (!loading || loading.style.display === 'none') return; // already shown
  loading.style.display = 'none';
  if (notice) notice.style.display = 'flex';
  // Push saved content data into the now-ready iframe
  if (iframe && iframe.contentWindow && veData && Object.keys(veData).length) {
    iframe.contentWindow.postMessage({type:'apply-content', data: veData}, '*');
  }
  if (iframe && iframe.contentWindow && veCurrentSection) {
    iframe.contentWindow.postMessage({type:'highlight', section: veCurrentSection}, '*');
  }
}

async function init() {
  // Attach iframe.onload FIRST — most reliable trigger regardless of postMessage timing
  const iframe = document.getElementById('ve-iframe');
  if (iframe) {
    iframe.addEventListener('load', showPreview);
  }

  await loadContent();
  // Open hero panel immediately — iframe loads independently via its src attribute
  openSection('hero');
  // Hard fallback: force-show after 10 s in case all else fails
  setTimeout(showPreview, 10000);
}

document.addEventListener('DOMContentLoaded', init);
</script>
`))
})


// ─── /admin/content/preview — serves homepage HTML with overlays injected ────
// Used as iframe src so the browser loads it natively (no srcdoc size limits)
// No auth required — preview only serves homepage public content with edit overlays
admin.get('/content/preview', async (c) => {
  try {
    // Fetch the homepage from the same worker
    const origin = new URL(c.req.url).origin
    const homeRes = await fetch(origin + '/', { headers: { 'x-edit-preview': '1' } })
    if (!homeRes.ok) throw new Error('Home fetch failed: ' + homeRes.status)
    let html = await homeRes.text()

    // Build the overlay script server-side (same as _overlayScript in /content)
    const overlayCss = [
      '<style>',
      '[data-edit-section]{position:relative;cursor:pointer;}',
      '[data-edit-section]:hover{outline:3px solid rgba(201,168,76,.7);outline-offset:2px;}',
      '[data-edit-section].ve-active{outline:3px solid #C9A84C!important;outline-offset:2px;}',
      '.ve-edit-badge{position:absolute;top:10px;right:10px;z-index:9000;background:#1B2A4A;' +
        'color:#fff;padding:5px 12px 5px 9px;border-radius:20px;font-size:11px;font-weight:700;' +
        'cursor:pointer;display:flex;align-items:center;gap:5px;box-shadow:0 2px 10px rgba(0,0,0,.3);' +
        'opacity:0;transition:opacity .15s;white-space:nowrap;pointer-events:all;}',
      '[data-edit-section]:hover .ve-edit-badge{opacity:1;}',
      '.ve-edit-badge i{color:#C9A84C;}',
      '#chat-widget,.cookie-banner,#chat-btn{display:none!important;}',
      '</style>',
    ].join('\n')

    const overlayJs = '<script>(function(){' +
      'var SEC_MAP={home:"hero",about:"about",services:"services",team:"team",contact:"contact"};' +
      'function applyContent(D){' +
      '  if(!D)return;' +
      '  var q=function(s){return document.querySelector(s);};' +
      '  var qa=function(s){return document.querySelectorAll(s);};' +
      '  var g=function(id){return document.getElementById(id);};' +
      '  if(D["hero-headline"]){var e=q("#home h1");if(e)e.innerHTML=D["hero-headline"].replace(/\\n/g,"<br/>");}' +
      '  if(D["hero-subheadline"]){var e=q("#home .text-gold-400");if(e)e.textContent=D["hero-subheadline"];}' +
      '  if(D["hero-desc"]){var e=q("#home p.text-xl");if(e)e.textContent=D["hero-desc"];}' +
      '  if(D["cta1"]){var e=q(\'#home a[href="#products"]\');if(e)e.innerHTML=\'<i class="fas fa-search mr-2"></i>\'+D["cta1"];}' +
      '  if(D["cta2"]){var e=q(\'#home a[href="#contact"]\');if(e)e.innerHTML=\'<i class="fas fa-envelope mr-2"></i>\'+D["cta2"];}' +
      '  if(D["hero-bg"]){var e=g("home");if(e)e.style.backgroundImage="url("+D["hero-bg"]+")";}' +
      '  var sn=qa("section.bg-navy-700 .text-3xl"),sl=qa("section.bg-navy-700 .text-sm");' +
      '  [1,2,3,4].forEach(function(n,i){' +
      '    if(D["stats-"+n+"-num"]&&sn[i])sn[i].textContent=D["stats-"+n+"-num"];' +
      '    if(D["stats-"+n+"-label"]&&sl[i])sl[i].textContent=D["stats-"+n+"-label"];' +
      '  });' +
      '  if(D["about-heading"]){var e=q("#about h2");if(e)e.textContent=D["about-heading"];}' +
      '  var ap=qa("#about p.text-gray-600");' +
      '  if(D["about-para1"]&&ap[0])ap[0].innerHTML=D["about-para1"];' +
      '  if(D["about-para2"]&&ap[1])ap[1].innerHTML=D["about-para2"];' +
      '  if(D["about-para3"]&&ap[2])ap[2].innerHTML=D["about-para3"];' +
      '  if(D["about-image"]){var e=q("#about img");if(e)e.src=D["about-image"];}' +
      '  var sc=qa("#services .grid > div");' +
      '  [1,2,3].forEach(function(n,i){var c=sc[i];if(!c)return;' +
      '    if(D["svc"+n+"-title"]){var h=c.querySelector("h3");if(h)h.textContent=D["svc"+n+"-title"];}' +
      '    if(D["svc"+n+"-desc"]){var p=c.querySelector("p");if(p)p.textContent=D["svc"+n+"-desc"];}' +
      '    if(D["svc"+n+"-image"]){var bg=c.querySelector(\'[style*="background-image"]\');if(bg)bg.style.backgroundImage="url("+D["svc"+n+"-image"]+")";}' +
      '  });' +
      '  var tc=qa("#team .grid > div");' +
      '  [1,2].forEach(function(n,i){var c=tc[i];if(!c)return;' +
      '    if(D["team"+n+"-name"]){var h=c.querySelector("h3");if(h)h.textContent=D["team"+n+"-name"];}' +
      '    if(D["team"+n+"-role"]){var p=c.querySelector("p.text-gold-500");if(p)p.textContent=D["team"+n+"-role"];}' +
      '    if(D["team"+n+"-bio"]){var b=c.querySelector("p.text-gray-600");if(b)b.textContent=D["team"+n+"-bio"];}' +
      '  });' +
      '  if(D["quote-text"]){var e=q("#team .italic");if(e)e.textContent=D["quote-text"];}' +
      '  if(D["quote-author"]){var e=q("#team .font-semibold.text-gold-400");if(e)e.textContent=D["quote-author"];}' +
      '}' +
      'function sendSection(sec){' +
      '  document.querySelectorAll("[data-edit-section]").forEach(function(el){el.classList.remove("ve-active");});' +
      '  document.querySelectorAll("[data-edit-section=\\""+sec+"\\"]").forEach(function(el){el.classList.add("ve-active");});' +
      '  window.parent.postMessage({type:"section-click",section:sec},"*");' +
      '}' +
      'function setupOverlays(){' +
      '  Object.entries(SEC_MAP).forEach(function(kv){' +
      '    var id=kv[0],sk=kv[1],el=document.getElementById(id);if(!el)return;' +
      '    el.setAttribute("data-edit-section",sk);' +
      '    var b=document.createElement("div");b.className="ve-edit-badge";' +
      '    b.innerHTML=\'<i class="fas fa-pencil-alt"></i> Edit \'+sk.charAt(0).toUpperCase()+sk.slice(1);' +
      '    b.addEventListener("click",function(e){e.stopPropagation();sendSection(sk);});' +
      '    if(getComputedStyle(el).position==="static")el.style.position="relative";' +
      '    el.prepend(b);el.addEventListener("click",function(){sendSection(sk);});' +
      '  });' +
      '  var sb=document.querySelector("section.bg-navy-700.text-white.py-8");' +
      '  if(sb){sb.setAttribute("data-edit-section","stats");' +
      '    var b=document.createElement("div");b.className="ve-edit-badge";' +
      '    b.innerHTML=\'<i class="fas fa-pencil-alt"></i> Edit Stats\';' +
      '    b.addEventListener("click",function(e){e.stopPropagation();sendSection("stats");});' +
      '    if(getComputedStyle(sb).position==="static")sb.style.position="relative";' +
      '    sb.prepend(b);sb.addEventListener("click",function(){sendSection("stats");});' +
      '  }' +
      '  // Signal parent that iframe is interactive (DOMContentLoaded)' +
      '  window.parent.postMessage({type:"iframe-ready"},"*");' +
      '}' +
      // Also fire on window.onload — gives parent page extra time to register listener
      'window.addEventListener("load",function(){window.parent.postMessage({type:"iframe-ready"},"*");});' +
      'window.addEventListener("message",function(e){' +
      '  var m=e.data;if(!m)return;' +
      '  if(m.type==="apply-content")applyContent(m.data);' +
      '  if(m.type==="highlight"){' +
      '    document.querySelectorAll("[data-edit-section]").forEach(function(el){el.classList.remove("ve-active");});' +
      '    if(m.section)document.querySelectorAll("[data-edit-section=\\""+m.section+"\\"]").forEach(function(el){el.classList.add("ve-active");});' +
      '  }' +
      '  if(m.type==="scroll-to"){' +
      '    var map={hero:"home",stats:"home",about:"about",services:"services",team:"team",contact:"contact"};' +
      '    var tid=map[m.section];if(tid){var t=document.getElementById(tid);if(t)t.scrollIntoView({behavior:"smooth",block:"start"});}' +
      '  }' +
      '});' +
      'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",setupOverlays);}' +
      'else{setupOverlays();}' +
      '})();<\/script>'

    // Inject overlay into the homepage HTML
    html = html.replace('</body>', overlayCss + '\n' + overlayJs + '\n</body>')

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=UTF-8', 'X-Frame-Options': 'SAMEORIGIN' }
    })
  } catch (err: any) {
    return new Response(`<html><body style="font-family:sans-serif;padding:40px;color:#ef4444">
      <h2>Preview failed</h2><p>${err.message}</p>
      <button onclick="location.reload()" style="background:#1B2A4A;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;margin-top:12px">Retry</button>
    </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }
})


// ═══════════════════════════════════════════════════════════════════════════
//  AI CHATBOT TRAINING
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/chatbot', requireAuth, async (c) => {
  return c.html(adminShell('AI Chatbot', 'chatbot', `
<div class="p-6 max-w-6xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">AI Chatbot Training — "Bri"</h1>
      <p class="text-gray-500 text-sm mt-1">Train, test and customize the AI assistant customers see on your website</p>
    </div>
    <a href="/" target="_blank" class="btn-secondary"><i class="fas fa-eye"></i> Preview Live Bot</a>
  </div>

  <!-- Tab buttons -->
  <div class="flex gap-2 mb-5 flex-wrap">
    <button class="tab-btn active" data-tab="kb" onclick="switchTab(this,'kb')">
      <i class="fas fa-book mr-1"></i> Knowledge Base
    </button>
    <button class="tab-btn" data-tab="rules" onclick="switchTab(this,'rules')">
      <i class="fas fa-cog mr-1"></i> Bot Rules & Persona
    </button>
    <button class="tab-btn" data-tab="test" onclick="switchTab(this,'test')">
      <i class="fas fa-flask mr-1"></i> Test Chatbot
    </button>
    <button class="tab-btn" data-tab="history" onclick="switchTab(this,'history')">
      <i class="fas fa-history mr-1"></i> Chat History
    </button>
  </div>

  <!-- Knowledge Base Tab -->
  <div id="tab-kb" class="tab-content active">
    <div class="flex items-center justify-between mb-4">
      <p class="text-sm text-gray-600">Add Q&A pairs, product facts, policies, and any other information Bri should know.</p>
      <button onclick="openAddKB()" class="btn-primary"><i class="fas fa-plus"></i> Add Entry</button>
    </div>
    
    <!-- Quick add by category -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <button onclick="openAddKBCat('product')" class="card text-center py-3 hover:shadow-md transition-all cursor-pointer">
        <i class="fas fa-box text-navy text-lg mb-1 block"></i>
        <div class="text-xs font-semibold text-gray-700">Product Fact</div>
      </button>
      <button onclick="openAddKBCat('policy')" class="card text-center py-3 hover:shadow-md transition-all cursor-pointer">
        <i class="fas fa-file-alt text-blue-500 text-lg mb-1 block"></i>
        <div class="text-xs font-semibold text-gray-700">Policy / FAQ</div>
      </button>
      <button onclick="openAddKBCat('recommendation')" class="card text-center py-3 hover:shadow-md transition-all cursor-pointer">
        <i class="fas fa-star text-amber-500 text-lg mb-1 block"></i>
        <div class="text-xs font-semibold text-gray-700">Recommendation</div>
      </button>
      <button onclick="openAddKBCat('custom')" class="card text-center py-3 hover:shadow-md transition-all cursor-pointer">
        <i class="fas fa-pencil text-green-500 text-lg mb-1 block"></i>
        <div class="text-xs font-semibold text-gray-700">Custom Entry</div>
      </button>
    </div>

    <div id="kb-list">
      <div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i>Loading…</div>
    </div>
  </div>

  <!-- Rules & Persona Tab -->
  <div id="tab-rules" class="tab-content card">
    <h2 class="font-semibold text-gray-800 mb-4">Bot Persona & Rules</h2>
    <div class="space-y-4">
      <div>
        <label class="form-label">Bot Name</label>
        <input id="bot-name" class="form-input" placeholder="Bri"/>
      </div>
      <div>
        <label class="form-label">Personality / Tone</label>
        <select id="bot-tone" class="form-input">
          <option value="friendly">Friendly & Helpful</option>
          <option value="professional">Professional & Expert</option>
          <option value="casual">Casual & Approachable</option>
          <option value="detailed">Detailed & Technical</option>
        </select>
      </div>
      <div>
        <label class="form-label">Max Response Length</label>
        <select id="bot-length" class="form-input">
          <option value="short">Short (1-2 sentences)</option>
          <option value="medium" selected>Medium (3-5 sentences)</option>
          <option value="long">Long (full explanation)</option>
        </select>
      </div>
      <div>
        <label class="form-label">Always End With</label>
        <input id="bot-cta" class="form-input" placeholder="Visit us or call (561) 633-6003!"/>
      </div>
      <div>
        <label class="form-label">Topics to Avoid</label>
        <textarea id="bot-avoid" class="form-input" rows="2" placeholder="Competitor pricing, negative reviews, medical diagnoses…"></textarea>
      </div>
      <div>
        <label class="form-label">Custom System Prompt Addition</label>
        <textarea id="bot-custom-prompt" class="form-input" rows="5" placeholder="Add any additional instructions for the AI. E.g. 'Always promote our Nutrena Certified Farm Program when someone asks about Nutrena products.'"></textarea>
      </div>
      <div>
        <label class="form-label">Welcome Message (first message shown to visitors)</label>
        <textarea id="bot-welcome" class="form-input" rows="2" placeholder="Hi! I'm Bri, your British Feed assistant. How can I help you today?"></textarea>
      </div>
    </div>
    <div class="flex justify-end mt-4">
      <button onclick="saveBotRules()" class="btn-primary"><i class="fas fa-save"></i> Save Rules</button>
    </div>
  </div>

  <!-- Test Tab -->
  <div id="tab-test" class="tab-content">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="card">
        <h3 class="font-semibold text-gray-800 mb-3">Test the Chatbot</h3>
        <p class="text-sm text-gray-500 mb-4">Send test messages to see exactly how Bri will respond to real customers.</p>
        
        <div id="test-messages" class="space-y-3 mb-4 min-h-32 max-h-80 overflow-y-auto p-3 bg-gray-50 rounded-xl">
          <div class="text-center text-sm text-gray-400 py-4">Send a message to start testing…</div>
        </div>
        
        <div class="flex gap-2">
          <input id="test-input" class="form-input flex-1" placeholder="e.g. What's good for a senior horse?" 
                 onkeydown="if(event.key==='Enter') sendTestMsg()"/>
          <button onclick="sendTestMsg()" class="btn-primary px-4">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
      
      <div class="card">
        <h3 class="font-semibold text-gray-800 mb-3">Quick Test Prompts</h3>
        <p class="text-sm text-gray-500 mb-3">Click to test common customer questions:</p>
        <div class="space-y-2">
          ${[
            'What feed do you recommend for a 20-year-old horse?',
            'My horse is an easy keeper and is overweight. What should I feed?',
            'What hay do you carry?',
            'Do you offer free delivery?',
            'What brands do you carry for competition horses?',
            'My horse has ulcers. What do you recommend?',
            'What are your store hours?',
            'Can I get a nutritional consultation?',
            'What shavings do you have?',
            'How do I know which Nutrena product is right for my horse?',
          ].map(q => `
          <button onclick="document.getElementById('test-input').value='${q.replace(/'/g,"\\'")}'; sendTestMsg();"
                  class="w-full text-left text-xs p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-gray-700">
            <i class="fas fa-chevron-right text-gray-400 mr-1.5"></i>${q}
          </button>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <!-- Chat History Tab -->
  <div id="tab-history" class="tab-content card">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-gray-800">Customer Chat History</h3>
      <button onclick="clearHistory()" class="btn-danger">Clear All</button>
    </div>
    <p class="text-sm text-gray-500 mb-4">View past customer conversations to understand what questions they're asking.</p>
    <div id="chat-history-list">
      <div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i>Loading…</div>
    </div>
  </div>
</div>

<!-- KB Entry Modal -->
<div id="kb-modal" class="modal-overlay">
  <div class="modal-content max-w-xl p-6">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-lg font-bold text-gray-800">Add Knowledge Entry</h2>
      <button onclick="closeKBModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
    </div>
    <input type="hidden" id="kb-edit-index" value=""/>
    <div class="space-y-4">
      <div>
        <label class="form-label">Category</label>
        <select id="kb-category" class="form-input">
          <option value="product">Product Information</option>
          <option value="policy">Policy / FAQ</option>
          <option value="recommendation">Recommendation</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div>
        <label class="form-label">Question / Trigger Phrase</label>
        <input id="kb-question" class="form-input" placeholder="e.g. What feed is best for senior horses?"/>
        <p class="text-xs text-gray-400 mt-1">When a customer asks something similar, Bri will use this answer</p>
      </div>
      <div>
        <label class="form-label">Answer / Information</label>
        <textarea id="kb-answer" class="form-input" rows="5" placeholder="Write the complete, accurate answer you want Bri to give…"></textarea>
      </div>
      <div class="flex items-center gap-2">
        <input type="checkbox" id="kb-priority" class="w-4 h-4"/>
        <label for="kb-priority" class="text-sm text-gray-700">High Priority (Bri will always emphasize this)</label>
      </div>
    </div>
    <div class="flex justify-end gap-3 mt-5">
      <button onclick="closeKBModal()" class="btn-secondary">Cancel</button>
      <button onclick="saveKBEntry()" class="btn-primary"><i class="fas fa-save"></i> Save Entry</button>
    </div>
  </div>
</div>

<script>
let kbEntries = [];
let botRules = {};

async function loadChatbotData() {
  kbEntries = await apiGet('chatbot_kb') || [];
  botRules = await apiGet('chatbot_rules') || {};
  renderKBList();
  loadBotRules();
  loadHistory();
}

function renderKBList() {
  const container = document.getElementById('kb-list');
  if (!kbEntries.length) {
    container.innerHTML = \`
    <div class="text-center py-10 text-gray-400">
      <i class="fas fa-book text-4xl mb-3 block"></i>
      <div class="font-medium mb-1">No knowledge entries yet</div>
      <div class="text-sm">Add product info, FAQs, and recommendations to make Bri smarter</div>
    </div>\`;
    return;
  }
  
  const cats = ['product','policy','recommendation','custom'];
  const catLabels = {product:'Product Info',policy:'Policy/FAQ',recommendation:'Recommendation',custom:'Custom'};
  const catColors = {product:'badge-blue',policy:'badge-green',recommendation:'badge-amber',custom:'bg-purple-100 text-purple-700'};
  
  container.innerHTML = kbEntries.map((entry, i) => \`
  <div class="card mb-3 flex gap-3 items-start">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1 flex-wrap">
        <span class="badge \${catColors[entry.category]||'badge-blue'}">\${catLabels[entry.category]||entry.category}</span>
        \${entry.priority ? '<span class="badge badge-amber">High Priority</span>' : ''}
      </div>
      <div class="font-semibold text-sm text-gray-800">\${entry.question}</div>
      <div class="text-xs text-gray-500 mt-1 line-clamp-2">\${entry.answer}</div>
    </div>
    <div class="flex gap-1.5 flex-shrink-0">
      <button onclick="editKBEntry(\${i})" class="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 text-xs flex items-center justify-center">
        <i class="fas fa-edit"></i>
      </button>
      <button onclick="deleteKBEntry(\${i})" class="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-xs flex items-center justify-center">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  </div>\`).join('');
}

function openAddKB() { openAddKBCat('product'); }
function openAddKBCat(cat) {
  document.getElementById('kb-edit-index').value = '';
  document.getElementById('kb-category').value = cat;
  document.getElementById('kb-question').value = '';
  document.getElementById('kb-answer').value = '';
  document.getElementById('kb-priority').checked = false;
  document.getElementById('kb-modal').classList.add('open');
}
function closeKBModal() { document.getElementById('kb-modal').classList.remove('open'); }

function editKBEntry(i) {
  const e = kbEntries[i];
  document.getElementById('kb-edit-index').value = i;
  document.getElementById('kb-category').value = e.category||'custom';
  document.getElementById('kb-question').value = e.question||'';
  document.getElementById('kb-answer').value = e.answer||'';
  document.getElementById('kb-priority').checked = !!e.priority;
  document.getElementById('kb-modal').classList.add('open');
}

async function saveKBEntry() {
  const idx = document.getElementById('kb-edit-index').value;
  const entry = {
    category: document.getElementById('kb-category').value,
    question: document.getElementById('kb-question').value.trim(),
    answer: document.getElementById('kb-answer').value.trim(),
    priority: document.getElementById('kb-priority').checked,
    addedAt: new Date().toISOString()
  };
  if (!entry.question || !entry.answer) { showToast('Question and answer are required','error'); return; }
  
  if (idx === '') kbEntries.push(entry);
  else kbEntries[idx] = entry;
  
  const ok = await apiPut('chatbot_kb', kbEntries);
  if (ok) { showToast('Knowledge entry saved!'); closeKBModal(); renderKBList(); }
  else showToast('Save failed','error');
}

async function deleteKBEntry(i) {
  if (!confirm('Delete this entry?')) return;
  kbEntries.splice(i, 1);
  await apiPut('chatbot_kb', kbEntries);
  showToast('Entry deleted');
  renderKBList();
}

function loadBotRules() {
  document.getElementById('bot-name').value = botRules.name||'Bri';
  document.getElementById('bot-tone').value = botRules.tone||'friendly';
  document.getElementById('bot-length').value = botRules.length||'medium';
  document.getElementById('bot-cta').value = botRules.cta||'Visit us or call (561) 633-6003!';
  document.getElementById('bot-avoid').value = botRules.avoid||'';
  document.getElementById('bot-custom-prompt').value = botRules.customPrompt||'';
  document.getElementById('bot-welcome').value = botRules.welcome||"Hi! I'm Bri, your British Feed assistant 🐴 How can I help you today?";
}

async function saveBotRules() {
  const rules = {
    name: document.getElementById('bot-name').value,
    tone: document.getElementById('bot-tone').value,
    length: document.getElementById('bot-length').value,
    cta: document.getElementById('bot-cta').value,
    avoid: document.getElementById('bot-avoid').value,
    customPrompt: document.getElementById('bot-custom-prompt').value,
    welcome: document.getElementById('bot-welcome').value,
  };
  const ok = await apiPut('chatbot_rules', rules);
  if (ok) showToast('Bot rules saved!');
  else showToast('Save failed','error');
}

async function sendTestMsg() {
  const input = document.getElementById('test-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  
  const container = document.getElementById('test-messages');
  const prevEmpty = container.querySelector('.text-center');
  if (prevEmpty) prevEmpty.remove();
  
  container.innerHTML += \`<div class="flex justify-end"><div class="chat-bubble-user text-sm px-4 py-2 max-w-xs">\${msg}</div></div>\`;
  container.innerHTML += \`<div id="bot-typing" class="flex items-center gap-2 text-gray-400 text-sm"><i class="fas fa-circle-notch fa-spin"></i> Bri is thinking…</div>\`;
  container.scrollTop = container.scrollHeight;
  
  try {
    const res = await fetch('/admin/api/test-chat', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ message: msg, kbEntries, botRules })
    });
    const data = await res.json();
    document.getElementById('bot-typing')?.remove();
    container.innerHTML += \`<div class="flex"><div class="chat-bubble-bot text-sm px-4 py-2 max-w-xs">\${data.reply}</div></div>\`;
  } catch(e) {
    document.getElementById('bot-typing')?.remove();
    container.innerHTML += \`<div class="text-red-400 text-sm">Error: \${e}</div>\`;
  }
  container.scrollTop = container.scrollHeight;
}

async function loadHistory() {
  const history = await apiGet('chat_history') || [];
  const container = document.getElementById('chat-history-list');
  if (!history.length) {
    container.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">No chat history yet. Conversations will appear here.</div>';
    return;
  }
  container.innerHTML = history.slice().reverse().slice(0,50).map(session => \`
  <div class="border border-gray-100 rounded-xl p-3 mb-3">
    <div class="text-xs text-gray-400 mb-2">\${session.date||''} · \${session.messages?.length||0} messages</div>
    \${(session.messages||[]).slice(0,3).map(function(m) { return \`
      <div class="text-sm \${m.role==='user'?'text-navy font-medium':'text-gray-600'} mb-1">\${m.role==='user'?'Customer: ':'Bri: '}\${m.content?.slice(0,120)||''}\${m.content?.length>120?'…':''}</div>
    \`; }).join('')}
    \${session.messages?.length > 3 ? \`<div class="text-xs text-gray-400">… and \${session.messages.length-3} more messages</div>\` : ''}
  </div>
  \`).join('');
}

async function clearHistory() {
  if (!confirm('Clear all chat history? This cannot be undone.')) return;
  await apiPut('chat_history', []);
  showToast('Chat history cleared');
  loadHistory();
}

function switchTab(btn, tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

document.addEventListener('DOMContentLoaded', loadChatbotData);
</script>
`))
})

// ═══════════════════════════════════════════════════════════════════════════
//  REVIEWS
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/reviews', requireAuth, async (c) => {
  return c.html(adminShell('Reviews', 'reviews', `
<div class="p-6 max-w-5xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Customer Reviews</h1>
      <p class="text-gray-500 text-sm mt-1">Manage Google reviews and testimonials shown on the website</p>
    </div>
    <button onclick="openAddReview()" class="btn-primary"><i class="fas fa-plus"></i> Add Review</button>
  </div>

  <!-- Stats -->
  <div id="review-stats" class="grid grid-cols-3 gap-4 mb-5">
    <div class="card text-center"><div class="text-2xl font-bold text-navy" id="avg-rating">—</div><div class="text-xs text-gray-400 mt-1">Average Rating</div></div>
    <div class="card text-center"><div class="text-2xl font-bold text-navy" id="total-reviews">—</div><div class="text-xs text-gray-400 mt-1">Total Reviews</div></div>
    <div class="card text-center"><div class="text-2xl font-bold text-navy" id="five-star">—</div><div class="text-xs text-gray-400 mt-1">5-Star Reviews</div></div>
  </div>

  <!-- Reviews list -->
  <div id="reviews-list">
    <div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i>Loading…</div>
  </div>
</div>

<!-- Review Modal -->
<div id="review-modal" class="modal-overlay">
  <div class="modal-content max-w-lg p-6">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-lg font-bold text-gray-800">Add Review</h2>
      <button onclick="closeReviewModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
    </div>
    <input type="hidden" id="review-edit-index" value=""/>
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">Reviewer Name *</label>
          <input id="rev-name" class="form-input" placeholder="Jane D."/>
        </div>
        <div>
          <label class="form-label">Rating *</label>
          <select id="rev-rating" class="form-input">
            <option value="5">⭐⭐⭐⭐⭐ 5 Stars</option>
            <option value="4">⭐⭐⭐⭐ 4 Stars</option>
            <option value="3">⭐⭐⭐ 3 Stars</option>
          </select>
        </div>
      </div>
      <div>
        <label class="form-label">Review Text *</label>
        <textarea id="rev-text" class="form-input" rows="4" placeholder="What did this customer say…"></textarea>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">Date</label>
          <input id="rev-date" class="form-input" type="text" placeholder="January 2025"/>
        </div>
        <div>
          <label class="form-label">Source</label>
          <select id="rev-source" class="form-input">
            <option value="google">Google</option>
            <option value="facebook">Facebook</option>
            <option value="yelp">Yelp</option>
            <option value="direct">Direct</option>
          </select>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <input type="checkbox" id="rev-featured" class="w-4 h-4"/>
        <label for="rev-featured" class="text-sm text-gray-700">Show as featured review</label>
      </div>
    </div>
    <div class="flex justify-end gap-3 mt-5">
      <button onclick="closeReviewModal()" class="btn-secondary">Cancel</button>
      <button onclick="saveReview()" class="btn-primary"><i class="fas fa-save"></i> Save Review</button>
    </div>
  </div>
</div>

<script>
let allReviews = [];

async function loadReviews() {
  allReviews = await apiGet('reviews') || [];
  renderReviews();
}

function renderReviews() {
  const container = document.getElementById('reviews-list');
  
  // Stats
  const avg = allReviews.length ? (allReviews.reduce((s,r)=>s+(r.rating||5),0)/allReviews.length).toFixed(1) : '—';
  document.getElementById('avg-rating').textContent = avg + (allReviews.length ? ' ★' : '');
  document.getElementById('total-reviews').textContent = allReviews.length;
  document.getElementById('five-star').textContent = allReviews.filter(r=>r.rating>=5).length;
  
  if (!allReviews.length) {
    container.innerHTML = \`
    <div class="text-center py-10 text-gray-400">
      <i class="fas fa-star text-4xl mb-3 block"></i>
      <div class="font-medium mb-1">No reviews yet</div>
      <div class="text-sm">Add customer reviews to show social proof on your website</div>
    </div>\`;
    return;
  }
  
  container.innerHTML = allReviews.map((rev, i) => \`
  <div class="card mb-3 flex gap-4 items-start">
    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-sm"
         style="background:#1B2A4A">\${rev.name?.[0]||'?'}</div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap mb-1">
        <span class="font-semibold text-sm text-gray-800">\${rev.name}</span>
        <span class="text-yellow-400 text-xs">${'★'.repeat(5)}</span>
        \${rev.featured ? '<span class="badge badge-amber text-xs">Featured</span>' : ''}
        <span class="badge \${rev.source==='google'?'badge-blue':rev.source==='facebook'?'bg-blue-100 text-blue-700':'badge-green'} text-xs">\${rev.source||'Google'}</span>
      </div>
      <div class="text-sm text-gray-600">\${rev.text}</div>
      <div class="text-xs text-gray-400 mt-1">\${rev.date||''}</div>
    </div>
    <div class="flex gap-1.5 flex-shrink-0">
      <button onclick="editReview(\${i})" class="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 text-xs flex items-center justify-center">
        <i class="fas fa-edit"></i>
      </button>
      <button onclick="deleteReview(\${i})" class="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-xs flex items-center justify-center">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  </div>\`).join('');
}

function openAddReview() {
  document.getElementById('review-edit-index').value = '';
  document.getElementById('rev-name').value = '';
  document.getElementById('rev-rating').value = '5';
  document.getElementById('rev-text').value = '';
  document.getElementById('rev-date').value = '';
  document.getElementById('rev-source').value = 'google';
  document.getElementById('rev-featured').checked = false;
  document.getElementById('review-modal').classList.add('open');
}
function closeReviewModal() { document.getElementById('review-modal').classList.remove('open'); }

function editReview(i) {
  const r = allReviews[i];
  document.getElementById('review-edit-index').value = i;
  document.getElementById('rev-name').value = r.name||'';
  document.getElementById('rev-rating').value = r.rating||5;
  document.getElementById('rev-text').value = r.text||'';
  document.getElementById('rev-date').value = r.date||'';
  document.getElementById('rev-source').value = r.source||'google';
  document.getElementById('rev-featured').checked = !!r.featured;
  document.getElementById('review-modal').classList.add('open');
}

async function saveReview() {
  const idx = document.getElementById('review-edit-index').value;
  const rev = {
    name: document.getElementById('rev-name').value.trim(),
    rating: parseInt(document.getElementById('rev-rating').value),
    text: document.getElementById('rev-text').value.trim(),
    date: document.getElementById('rev-date').value.trim(),
    source: document.getElementById('rev-source').value,
    featured: document.getElementById('rev-featured').checked,
  };
  if (!rev.name || !rev.text) { showToast('Name and review text required','error'); return; }
  
  if (idx === '') allReviews.push(rev);
  else allReviews[idx] = rev;
  
  const ok = await apiPut('reviews', allReviews);
  if (ok) { showToast('Review saved!'); closeReviewModal(); renderReviews(); }
  else showToast('Save failed','error');
}

async function deleteReview(i) {
  if (!confirm('Delete this review?')) return;
  allReviews.splice(i, 1);
  await apiPut('reviews', allReviews);
  showToast('Review deleted');
  renderReviews();
}

document.addEventListener('DOMContentLoaded', loadReviews);
</script>
`))
})

// ═══════════════════════════════════════════════════════════════════════════
//  CUSTOMER INQUIRIES
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/inquiries', requireAuth, async (c) => {
  return c.html(adminShell('Inquiries', 'inquiries', `
<div class="p-6 max-w-5xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Customer Inquiries</h1>
      <p class="text-gray-500 text-sm mt-1">All contact form submissions from the website</p>
    </div>
    <button onclick="clearAllInquiries()" class="btn-danger">
      <i class="fas fa-trash"></i> Clear All
    </button>
  </div>

  <div id="inquiries-list">
    <div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i>Loading…</div>
  </div>
</div>

<script>
async function loadInquiries() {
  const contacts = await apiGet('contacts') || [];
  const container = document.getElementById('inquiries-list');
  
  if (!contacts.length) {
    container.innerHTML = \`
    <div class="text-center py-12 text-gray-400">
      <i class="fas fa-envelope text-4xl mb-3 block"></i>
      <div class="font-medium mb-1">No inquiries yet</div>
      <div class="text-sm">Customer contact form submissions will appear here</div>
    </div>\`;
    return;
  }
  
  container.innerHTML = contacts.slice().reverse().map((c, i) => \`
  <div class="card mb-4">
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
           style="background:#1B2A4A">\${c.name?.[0]?.toUpperCase()||'?'}</div>
      <div class="flex-1">
        <div class="flex items-center gap-3 flex-wrap mb-1">
          <span class="font-semibold text-gray-800">\${c.name}</span>
          <span class="text-sm text-gray-500">\${c.email}</span>
          \${c.phone ? \`<span class="text-sm text-gray-500"><i class="fas fa-phone text-xs mr-1"></i>\${c.phone}</span>\` : ''}
          \${c.horse ? \`<span class="badge badge-blue text-xs">\${c.horse}</span>\` : ''}
          <span class="text-xs text-gray-400 ml-auto">\${c.date||''}</span>
        </div>
        \${c.subject ? \`<div class="text-sm font-medium text-navy mb-1">\${c.subject}</div>\` : ''}
        <div class="text-sm text-gray-600">\${c.message}</div>
        <div class="flex gap-3 mt-3">
          \${c.email ? \`<a href="mailto:\${c.email}" class="btn-primary text-xs py-1.5 px-3"><i class="fas fa-reply mr-1"></i>Reply</a>\` : ''}
          \${c.phone ? \`<a href="tel:\${c.phone}" class="btn-secondary text-xs py-1.5 px-3"><i class="fas fa-phone mr-1"></i>Call</a>\` : ''}
        </div>
      </div>
    </div>
  </div>\`).join('');
}

async function clearAllInquiries() {
  if (!confirm('Clear all customer inquiries? This cannot be undone.')) return;
  await apiPut('contacts', []);
  showToast('Inquiries cleared');
  loadInquiries();
}

document.addEventListener('DOMContentLoaded', loadInquiries);
</script>
`))
})

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN API — Data CRUD
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/api/data/:key', requireAuth, async (c) => {
  const key = c.req.param('key')
  const kv = c.env?.BF_STORE
  const data = await kvGet(kv, key, null)
  return c.json({ data })
})

admin.put('/api/data/:key', requireAuth, async (c) => {
  const key = c.req.param('key')
  const kv = c.env?.BF_STORE
  const body = await c.req.json()
  const ok = await kvPut(kv, key, body)
  return c.json({ ok })
})

// ─── Test chatbot (uses live KB + rules) ─────────────────────────────────────
admin.post('/api/test-chat', requireAuth, async (c) => {
  const { message, kbEntries = [], botRules = {} } = await c.req.json()
  const apiKey  = c.env?.OPENAI_API_KEY  || ''
  const baseURL = c.env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

  const kbSection = kbEntries.length > 0
    ? '\n\nKNOWLEDGE BASE:\n' + kbEntries.map((e: any) =>
        `Q: ${e.question}\nA: ${e.answer}`
      ).join('\n\n')
    : ''

  const toneMap: any = {
    friendly: 'friendly, warm, and helpful',
    professional: 'professional, knowledgeable, and expert',
    casual: 'casual, approachable, and conversational',
    detailed: 'detailed, technical, and thorough',
  }

  const systemPrompt = `You are ${botRules.name || 'Bri'}, the AI assistant for British Feed & Supplies in Loxahatchee Groves (Wellington area), Florida.
You are ${toneMap[botRules.tone || 'friendly']}.
Keep responses ${botRules.length === 'short' ? 'very short, 1-2 sentences' : botRules.length === 'long' ? 'detailed and complete' : 'concise, 3-5 sentences'}.
${botRules.avoid ? `NEVER discuss: ${botRules.avoid}` : ''}
${botRules.customPrompt || ''}
Always end with: ${botRules.cta || 'Visit us or call (561) 633-6003!'}
${kbSection}`

  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    })
    const data: any = await res.json()
    return c.json({ reply: data.choices?.[0]?.message?.content || 'No response received.' })
  } catch (e) {
    return c.json({ reply: 'Error connecting to AI: ' + String(e) })
  }
})

// ─── Public API — save contact form ──────────────────────────────────────────
admin.post('/api/contact', async (c) => {
  const kv = c.env?.BF_STORE
  const body = await c.req.json()
  const contacts: any[] = await kvGet(kv, 'contacts', [])
  contacts.push({ ...body, date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) })
  await kvPut(kv, 'contacts', contacts)
  return c.json({ ok: true, message: 'Thank you! We will contact you shortly.' })
})

// ─── Public API — get dynamic data for frontend ───────────────────────────────
admin.get('/api/public/:key', async (c) => {
  const key = c.req.param('key')
  const kv = c.env?.BF_STORE
  // Special handling for catalog
  if (key === 'catalog') {
    const kvProds = await kvGet(kv, 'catalog_products', null)
    if (kvProds && Array.isArray(kvProds) && kvProds.length > 0) {
      return c.json({ products: kvProds, source: 'kv', count: kvProds.length })
    }
    return c.json({ products: [], source: 'empty', count: 0 })
  }
  // Public homepage-sections
  if (key === 'homepage-sections') {
    const data = await kvGet(kv, 'homepage_sections', null)
    return c.json({ ok: true, data })
  }
  // Public categories / vendors
  if (key === 'categories') {
    const data = await kvGet(kv, 'catalog_categories', null)
    return c.json({ ok: true, data })
  }
  if (key === 'vendors') {
    const data = await kvGet(kv, 'catalog_vendors', null)
    return c.json({ ok: true, data })
  }
  // Only expose safe keys to the public
  const allowed = ['products', 'reviews', 'site_content', 'chatbot_rules', 'catalog_products']
  if (!allowed.includes(key)) return c.json({ error: 'Not found' }, 404)
  const data = await kvGet(kv, key, null)
  return c.json({ data })
})

// ═══════════════════════════════════════════════════════════════════════════
//  CATALOG MANAGER — New flat product catalog admin
// ═══════════════════════════════════════════════════════════════════════════

// GET /admin/catalog — full catalog manager page
admin.get('/catalog', requireAuth, async (c) => {
  return c.html(adminShell('Catalog Manager', 'catalog', getCatalogManagerHTML()))
})

// GET /admin/api/catalog — load all products (KV overrides first, fallback to static)
admin.get('/api/catalog', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const kvProds = await kvGet(kv, 'catalog_products', null)
  if (kvProds && Array.isArray(kvProds) && kvProds.length > 0) {
    return c.json({ products: kvProds, source: 'kv' })
  }
  // Return empty — frontend will load static JSON then push to KV
  return c.json({ products: [], source: 'none' })
})

// PUT /admin/api/catalog — save full catalog to KV
admin.put('/api/catalog', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const { products } = await c.req.json()
  if (!Array.isArray(products)) return c.json({ ok: false, error: 'Invalid payload' }, 400)
  await kvPut(kv, 'catalog_products', products)
  return c.json({ ok: true, count: products.length })
})

// PATCH /admin/api/catalog/:id — update a single product
admin.patch('/api/catalog/:id', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const id = parseInt(c.req.param('id'))
  const update = await c.req.json()
  const products: any[] = await kvGet(kv, 'catalog_products', [])
  const idx = products.findIndex((p: any) => p.id === id)
  if (idx === -1) return c.json({ ok: false, error: 'Product not found' }, 404)
  products[idx] = { ...products[idx], ...update, id }
  await kvPut(kv, 'catalog_products', products)
  return c.json({ ok: true, product: products[idx] })
})

// POST /admin/api/catalog — add a new product
admin.post('/api/catalog', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const product = await c.req.json()
  const products: any[] = await kvGet(kv, 'catalog_products', [])
  const maxId = products.reduce((m: number, p: any) => Math.max(m, p.id || 0), 0)
  const newProduct = {
    ...product,
    id: maxId + 1,
    availabilityNote: 'Call (561) 633-6003 to confirm current availability and pricing'
  }
  products.push(newProduct)
  await kvPut(kv, 'catalog_products', products)
  return c.json({ ok: true, product: newProduct })
})

// DELETE /admin/api/catalog/:id — delete a product
admin.delete('/api/catalog/:id', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const id = parseInt(c.req.param('id'))
  const products: any[] = await kvGet(kv, 'catalog_products', [])
  const filtered = products.filter((p: any) => p.id !== id)
  if (filtered.length === products.length) return c.json({ ok: false, error: 'Product not found' }, 404)
  await kvPut(kv, 'catalog_products', filtered)
  return c.json({ ok: true, deleted: id })
})

// POST /admin/api/catalog/upload-image — store image as base64 in KV
admin.post('/api/catalog/upload-image', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const formData = await c.req.formData()
  const file = formData.get('image') as File | null
  const productId = formData.get('productId')

  if (!file) return c.json({ ok: false, error: 'No file provided' }, 400)

  // Check size: KV values max 25MB, but for performance keep images < 500KB
  if (file.size > 800 * 1024) {
    return c.json({ ok: false, error: 'Image must be under 800KB. Use a URL for larger images.' }, 400)
  }

  const arrayBuf = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  const mimeType = file.type || 'image/jpeg'
  const dataUrl = `data:${mimeType};base64,${base64}`

  // Store image in KV with key: img_{productId} or img_{timestamp}
  const imgKey = `img_${productId || Date.now()}`
  await kv?.put(imgKey, dataUrl)

  // Return a special URL that the frontend can use
  const imgUrl = `/admin/api/catalog/image/${imgKey}`
  return c.json({ ok: true, url: imgUrl, key: imgKey })
})

// GET /admin/api/catalog/image/:key — serve stored image
admin.get('/api/catalog/image/:key', async (c) => {
  const kv = c.env?.BF_STORE
  const key = c.req.param('key')
  // Only allow img_ prefixed keys
  if (!key.startsWith('img_')) return c.json({ error: 'Not found' }, 404)
  const dataUrl = await kv?.get(key)
  if (!dataUrl) return c.json({ error: 'Image not found' }, 404)
  // Parse the data URL
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return c.json({ error: 'Invalid image data' }, 500)
  const [, mimeType, b64] = match
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Response(bytes.buffer, {
    headers: { 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=86400' }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  HOMEPAGE EDITOR
// ═══════════════════════════════════════════════════════════════════════════

// GET /admin/homepage — editor UI
admin.get('/homepage', requireAuth, async (c) => {
  return c.html(adminShell('Homepage Editor', 'homepage', getHomepageEditorHTML()))
})

// GET /admin/api/homepage — load saved homepage content
admin.get('/api/homepage', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const data = await kvGet(kv, 'homepage_content', null)
  return c.json({ ok: true, data })
})

// PUT /admin/api/homepage — save homepage content
admin.put('/api/homepage', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const body = await c.req.json()
  await kvPut(kv, 'homepage_content', body)
  return c.json({ ok: true })
})

// Public API — homepage content (for index.tsx)
admin.get('/api/public/homepage', async (c) => {
  const kv = c.env?.BF_STORE
  const data = await kvGet(kv, 'homepage_content', null)
  return c.json({ ok: true, data })
})

// Public API — catalog products (for /products page)
admin.get('/api/public/catalog', async (c) => {
  const kv = c.env?.BF_STORE
  const kvProds = await kvGet(kv, 'catalog_products', null)
  if (kvProds && Array.isArray(kvProds) && kvProds.length > 0) {
    return c.json({ products: kvProds })
  }
  return c.json({ products: [] })
})

// ─── Homepage Sections API ───────────────────────────────────────────────────
// GET /admin/homepage-sections — editor UI
admin.get('/homepage-sections', requireAuth, async (c) => {
  return c.html(adminShell('Homepage Sections', 'homepage-sections', getHomepageSectionsHTML()))
})

// GET /admin/api/homepage-sections — load saved sections config
admin.get('/api/homepage-sections', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const data = await kvGet(kv, 'homepage_sections', null)
  return c.json({ ok: true, data })
})

// PUT /admin/api/homepage-sections — save sections config
admin.put('/api/homepage-sections', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const body = await c.req.json()
  await kvPut(kv, 'homepage_sections', body)
  return c.json({ ok: true })
})

// ─── Categories & Vendors API ─────────────────────────────────────────────────
admin.get('/categories-vendors', requireAuth, async (c) => {
  return c.html(adminShell('Categories & Vendors', 'categories-vendors', getCatVendorHTML()))
})
admin.get('/api/categories', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const data = await kvGet(kv, 'catalog_categories', null)
  return c.json({ ok: true, data })
})
admin.put('/api/categories', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const body = await c.req.json()
  await kvPut(kv, 'catalog_categories', body)
  return c.json({ ok: true })
})
admin.get('/api/vendors', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const data = await kvGet(kv, 'catalog_vendors', null)
  return c.json({ ok: true, data })
})
admin.put('/api/vendors', requireAuth, async (c) => {
  const kv = c.env?.BF_STORE
  const body = await c.req.json()
  await kvPut(kv, 'catalog_vendors', body)
  return c.json({ ok: true })
})
// Public endpoints so the product catalog page can read them too
admin.get('/api/public/categories', async (c) => {
  const kv = c.env?.BF_STORE
  const data = await kvGet(kv, 'catalog_categories', null)
  return c.json({ ok: true, data })
})
admin.get('/api/public/vendors', async (c) => {
  const kv = c.env?.BF_STORE
  const data = await kvGet(kv, 'catalog_vendors', null)
  return c.json({ ok: true, data })
})

// ─── Catalog Manager HTML ────────────────────────────────────────────────────
function getCatalogManagerHTML(): string {
  return `
<div class="p-6 max-w-full mx-auto" id="catalog-app">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <i class="fas fa-boxes" style="color:#C9A84C"></i> Catalog Manager
      </h1>
      <p class="text-gray-500 text-sm mt-1">Edit products, upload images/videos, manage categories and vendors</p>
    </div>
    <div class="flex gap-2 flex-wrap">
      <button onclick="exportCSV()" class="btn-secondary" title="Export all products as CSV">
        <i class="fas fa-download"></i> Export CSV
      </button>
      <button onclick="document.getElementById('csv-import-input').click()" class="btn-secondary" title="Import products from CSV">
        <i class="fas fa-upload"></i> Import CSV
      </button>
      <input type="file" id="csv-import-input" accept=".csv" style="display:none" onchange="importCSV(this)"/>
      <button onclick="importStaticCatalog()" class="btn-secondary" id="import-btn">
        <i class="fas fa-file-import"></i> Import from Static
      </button>
      <button onclick="openAddProductModal()" class="btn-primary">
        <i class="fas fa-plus"></i> Add Product
      </button>
    </div>
  </div>

  <!-- Status bar -->
  <div id="catalog-status" class="hidden mb-4 p-3 rounded-lg text-sm font-medium flex items-center gap-2"></div>

  <!-- Search / Filter Bar -->
  <div class="card mb-5">
    <div class="flex flex-wrap gap-3">
      <div class="relative flex-1 min-w-48">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
        <input type="text" id="cat-search" placeholder="Search by name, vendor, category…" class="form-input pl-9 text-sm" oninput="filterCatalog()"/>
      </div>
      <select id="cat-filter-cat" class="form-input w-48 text-sm" onchange="filterCatalog()">
        <option value="">All Categories</option>
      </select>
      <select id="cat-filter-vendor" class="form-input w-40 text-sm" onchange="filterCatalog()">
        <option value="">All Vendors</option>
      </select>
      <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" id="cat-filter-noimg" class="rounded" onchange="filterCatalog()"/>
        Missing Image
      </label>
      <div class="text-sm text-gray-500 self-center" id="cat-count">Loading…</div>
    </div>
  </div>

  <!-- Products Table -->
  <div class="card p-0 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm" id="catalog-table">
        <thead class="bg-slate-50 border-b border-slate-200">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">ID</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">Image</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-36">Category</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Vendor</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Price</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Stock</th>
            <th class="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Actions</th>
          </tr>
        </thead>
        <tbody id="catalog-tbody">
          <tr><td colspan="8" class="text-center py-12 text-gray-400">
            <i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i>Loading catalog…
          </td></tr>
        </tbody>
      </table>
    </div>
    <!-- Pagination -->
    <div class="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
      <div class="text-xs text-slate-500" id="cat-page-info"></div>
      <div class="flex gap-1" id="cat-pagination"></div>
    </div>
  </div>
</div>

<!-- ── Add/Edit Product Modal ─────────────────────────────────────────── -->
<div id="prod-modal" class="modal-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); z-index:200; display:none; align-items:center; justify-content:center; padding:16px;">
  <div style="background:#fff; border-radius:16px; max-width:760px; width:100%; max-height:92vh; overflow-y:auto; position:relative; box-shadow:0 25px 60px rgba(0,0,0,0.2);">

    <!-- Modal Header -->
    <div style="padding:20px 24px 16px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; background:#fff; z-index:10; border-radius:16px 16px 0 0;">
      <h2 style="font-size:18px; font-weight:700; color:#1e293b;" id="prod-modal-title">Edit Product</h2>
      <button onclick="closeProdModal()" style="width:32px;height:32px;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;font-size:18px;color:#64748b;display:flex;align-items:center;justify-content:center;">&times;</button>
    </div>

    <div style="padding:24px;">
      <input type="hidden" id="pm-id"/>

      <!-- Two column grid -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">

        <!-- Product Name (full width) -->
        <div style="grid-column:1/-1;">
          <label class="form-label">Product Name *</label>
          <input id="pm-name" class="form-input" placeholder="e.g. SafeChoice Senior 50lb"/>
        </div>

        <!-- Category -->
        <div>
          <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
            <span>Category *</span>
            <a href="/admin/categories-vendors" target="_blank"
              style="font-size:10px;font-weight:500;color:#C9A84C;text-decoration:none;display:flex;align-items:center;gap:3px;">
              <i class="fas fa-cog"></i> Manage categories
            </a>
          </label>
          <select id="pm-category" class="form-input">
            <option value="">Loading…</option>
          </select>
        </div>

        <!-- Vendor -->
        <div>
          <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
            <span>Vendor / Brand</span>
            <a href="/admin/categories-vendors" target="_blank"
              style="font-size:10px;font-weight:500;color:#C9A84C;text-decoration:none;display:flex;align-items:center;gap:3px;">
              <i class="fas fa-cog"></i> Manage vendors
            </a>
          </label>
          <input id="pm-vendor" class="form-input" list="pm-vendor-list" placeholder="e.g. Nutrena, Absorbine, Farnam" autocomplete="off"/>
          <datalist id="pm-vendor-list"></datalist>
        </div>

        <!-- Price -->
        <div>
          <label class="form-label">Price ($) *</label>
          <input id="pm-price" type="number" step="0.01" min="0" class="form-input" placeholder="29.95"/>
        </div>

        <!-- In Stock -->
        <div style="display:flex; align-items:flex-end; gap:8px; padding-bottom:4px;">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" id="pm-instock" class="w-4 h-4 rounded"/>
            <span class="text-sm font-medium text-gray-700">In Stock</span>
          </label>
        </div>

        <!-- Description (full width) -->
        <div style="grid-column:1/-1;">
          <label class="form-label">Description *</label>
          <textarea id="pm-description" class="form-input" rows="4" placeholder="Nutritional information, use cases, benefits, suitable for…"></textarea>
        </div>

        <!-- Image section (full width) -->
        <div style="grid-column:1/-1;">
          <label class="form-label" style="display:block; margin-bottom:8px;">
            <i class="fas fa-image" style="color:#C9A84C"></i> Product Image
          </label>

          <!-- Current image preview -->
          <div id="pm-img-preview-wrap" style="margin-bottom:12px; display:none;">
            <div style="display:flex; align-items:center; gap:10px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
              <img id="pm-img-preview" src="" alt="" style="max-height:90px; max-width:140px; object-fit:contain; border-radius:6px; border:1px solid #e2e8f0;"/>
              <div>
                <div style="font-size:11px; color:#64748b; margin-bottom:4px; font-weight:600;">Current Image</div>
                <div id="pm-img-preview-url" style="font-size:10px; color:#94a3b8; word-break:break-all; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>
                <button onclick="clearImage()" style="margin-top:6px; font-size:11px; color:#dc2626; background:#fee2e2; border:none; cursor:pointer; padding:3px 8px; border-radius:4px; font-weight:600;">
                  <i class="fas fa-times"></i> Remove
                </button>
              </div>
            </div>
          </div>

          <!-- Image source tabs -->
          <div style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            <div style="display:flex; border-bottom:1px solid #e2e8f0;">
              <button onclick="switchImgTab('upload')" id="img-tab-upload"
                style="flex:1; padding:9px 8px; font-size:11px; font-weight:600; border:none; cursor:pointer; background:#1B2A4A; color:#fff; display:flex; align-items:center; justify-content:center; gap:4px;">
                <i class="fas fa-cloud-upload-alt"></i> Upload
              </button>
              <button onclick="switchImgTab('url')" id="img-tab-url"
                style="flex:1; padding:9px 8px; font-size:11px; font-weight:600; border:none; cursor:pointer; background:transparent; color:#64748b; display:flex; align-items:center; justify-content:center; gap:4px; border-left:1px solid #e2e8f0;">
                <i class="fas fa-link"></i> URL
              </button>
              <button onclick="switchImgTab('search')" id="img-tab-search"
                style="flex:1; padding:9px 8px; font-size:11px; font-weight:600; border:none; cursor:pointer; background:transparent; color:#64748b; display:flex; align-items:center; justify-content:center; gap:4px; border-left:1px solid #e2e8f0;">
                <i class="fas fa-search"></i> Search
              </button>
            </div>

            <!-- Upload panel -->
            <div id="img-panel-upload" style="padding:14px;">
              <div style="font-size:11px; color:#94a3b8; margin-bottom:10px;">
                JPG, PNG, WebP, GIF — up to <strong style="color:#475569">32MB</strong> — hosted permanently via imgbb
              </div>
              <div id="pm-img-dropzone"
                onclick="document.getElementById('pm-img-file').click()"
                ondragover="event.preventDefault(); this.style.background='#EEF1F8'"
                ondragleave="this.style.background=''"
                ondrop="handleImgDrop(event)"
                style="border:2px dashed #e2e8f0; border-radius:10px; padding:20px; text-align:center; cursor:pointer; transition:all .2s;">
                <i class="fas fa-images" style="font-size:24px; color:#94a3b8; display:block; margin-bottom:6px;"></i>
                <div style="font-size:12px; font-weight:600; color:#475569;">Click or drag &amp; drop an image</div>
                <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Up to 32MB · any format</div>
                <input type="file" id="pm-img-file" accept="image/*" onchange="previewUpload()" style="display:none;"/>
              </div>
              <div id="pm-upload-status" style="font-size:12px; color:#64748b; margin-top:8px; min-height:18px;"></div>
              <div id="pm-upload-bar" style="display:none; margin-top:6px; height:5px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                <div id="pm-upload-fill" style="height:100%; background:linear-gradient(90deg,#1B2A4A,#2D4A7A); width:0%; transition:width 0.3s;"></div>
              </div>
            </div>

            <!-- URL panel -->
            <div id="img-panel-url" style="padding:14px; display:none;">
              <div style="font-size:11px; color:#94a3b8; margin-bottom:8px;">Paste any direct image URL (HTTPS recommended):</div>
              <input id="pm-imageurl" class="form-input" style="font-size:13px;" placeholder="https://example.com/product-image.jpg"
                oninput="previewImageUrl(this.value)"/>
              <div id="pm-url-status" style="font-size:11px; color:#94a3b8; margin-top:4px;"></div>
            </div>

            <!-- Search panel -->
            <div id="img-panel-search" style="padding:14px; display:none;">
              <div style="font-size:11px; color:#94a3b8; margin-bottom:8px;">Search product images — click a result to use it:</div>
              <div style="display:flex; gap:6px; margin-bottom:10px;">
                <input id="img-search-q" class="form-input" style="font-size:12px; flex:1;" placeholder="e.g. Nutrena SafeChoice horse feed bag"
                  onkeydown="if(event.key==='Enter') searchImages()"/>
                <button onclick="searchImages()" style="padding:8px 14px; background:#1B2A4A; color:#fff; border:none; border-radius:8px; font-size:12px; cursor:pointer; font-weight:600; white-space:nowrap;">
                  <i class="fas fa-search"></i> Search
                </button>
              </div>
              <div id="img-search-hint" style="font-size:11px; color:#94a3b8; margin-bottom:8px;"></div>
              <div id="img-search-results" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); gap:8px; max-height:250px; overflow-y:auto;"></div>
            </div>
          </div>

          <input type="hidden" id="pm-imagekey" value=""/>
        </div>

        <!-- Video section (full width) -->
        <div style="grid-column:1/-1;">
          <label class="form-label">
            <i class="fas fa-video" style="color:#8B5CF6"></i> Product Video
          </label>
          <div style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            <div style="display:flex; border-bottom:1px solid #e2e8f0;">
              <button onclick="switchVideoTab('url')" id="vid-tab-url"
                style="flex:1; padding:8px; font-size:11px; font-weight:600; border:none; cursor:pointer; background:#1B2A4A; color:#fff; display:flex; align-items:center; justify-content:center; gap:4px;">
                <i class="fas fa-link"></i> Video URL
              </button>
              <button onclick="switchVideoTab('upload')" id="vid-tab-upload"
                style="flex:1; padding:8px; font-size:11px; font-weight:600; border:none; cursor:pointer; background:transparent; color:#64748b; display:flex; align-items:center; justify-content:center; gap:4px; border-left:1px solid #e2e8f0;">
                <i class="fas fa-upload"></i> Upload Video
              </button>
            </div>

            <!-- Video URL panel -->
            <div id="vid-panel-url" style="padding:14px;">
              <div style="font-size:11px; color:#94a3b8; margin-bottom:8px;">Paste a YouTube, Vimeo, or direct MP4 URL:</div>
              <input id="pm-videourl" class="form-input" placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."/>
              <div id="pm-video-preview" style="margin-top:10px; display:none;"></div>
            </div>

            <!-- Video upload panel -->
            <div id="vid-panel-upload" style="padding:14px; display:none;">
              <div style="font-size:11px; color:#94a3b8; margin-bottom:8px;">
                Upload MP4/WebM video (max 32MB) — hosted on imgbb/direct KV storage:
              </div>
              <label style="display:inline-flex; align-items:center; gap:6px; padding:8px 14px; background:#8B5CF6; color:#fff; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">
                <i class="fas fa-film"></i> Choose Video File
                <input type="file" id="pm-vid-file" accept="video/*" onchange="handleVideoUpload()" style="display:none;"/>
              </label>
              <div id="pm-vid-upload-status" style="font-size:12px; color:#64748b; margin-top:8px;"></div>
            </div>
          </div>
        </div>

        <!-- Extra Info (full width) -->
        <div style="grid-column:1/-1; border-top:1px solid #f1f5f9; padding-top:16px;">
          <div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:10px;">
            <i class="fas fa-flask text-blue-400"></i> Nutritional / Technical Specs (Optional)
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
            <div>
              <label style="font-size:11px; font-weight:600; color:#64748b; display:block; margin-bottom:3px;">Protein %</label>
              <input id="pm-protein" class="form-input" style="font-size:12px;" placeholder="14"/>
            </div>
            <div>
              <label style="font-size:11px; font-weight:600; color:#64748b; display:block; margin-bottom:3px;">Fat %</label>
              <input id="pm-fat" class="form-input" style="font-size:12px;" placeholder="8"/>
            </div>
            <div>
              <label style="font-size:11px; font-weight:600; color:#64748b; display:block; margin-bottom:3px;">Fiber %</label>
              <input id="pm-fiber" class="form-input" style="font-size:12px;" placeholder="15"/>
            </div>
          </div>
          <div style="margin-top:10px;">
            <label style="font-size:11px; font-weight:600; color:#64748b; display:block; margin-bottom:3px;">Best For (horse types)</label>
            <input id="pm-bestfor" class="form-input" style="font-size:12px;" placeholder="Senior horses, Easy keepers, Competition horses…"/>
          </div>
          <div style="margin-top:10px;">
            <label style="font-size:11px; font-weight:600; color:#64748b; display:block; margin-bottom:3px;">Key Features (one per line)</label>
            <textarea id="pm-features" class="form-input" style="font-size:12px;" rows="3" placeholder="Low starch formula&#10;Digestive support&#10;Omega-3 enriched"></textarea>
          </div>
          <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="pm-featured" class="w-4 h-4 rounded"/>
            <label for="pm-featured" style="font-size:12px; font-weight:500; color:#374151; cursor:pointer;">⭐ Mark as Featured Product</label>
          </div>
        </div>

      </div>

      <!-- Modal Actions -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:16px; border-top:1px solid #f1f5f9;">
        <button onclick="deleteProdFromModal()" style="background:#fee2e2; color:#dc2626; padding:9px 16px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; border:none; display:flex; align-items:center; gap:5px;" id="pm-delete-btn">
          <i class="fas fa-trash"></i> Delete Product
        </button>
        <div style="display:flex; gap:10px;">
          <button onclick="closeProdModal()" class="btn-secondary">Cancel</button>
          <button onclick="saveProdModal()" class="btn-primary" id="pm-save-btn">
            <i class="fas fa-save"></i> Save Product
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
.modal-open { display:flex !important; }
</style>

<script>
// ── State ────────────────────────────────────────────────────────────────
let catProducts = [];
let catFiltered = [];
let catPage = 1;
const CAT_PAGE_SIZE = 25;

// imgbb API key (free tier - allows hosting up to 32MB images)
// We use the public free API key for demo; in production set via admin settings
const IMGBB_KEY = 'a1c8e5f3b2d9047e6f4a7b8c3d2e1f0a'; // placeholder - will use server-side upload

// ── Load categories & vendors into the product modal dropdowns ────────────
// In-memory cache so the modal never shows "Loading…" after first fetch
let _cachedCats    = [];   // [{name}]
let _cachedVendors = [];   // [{name}]
let _cvLoaded      = false;

// Default categories — exactly matches the real catalog taxonomy
// Used as instant fallback before / if KV has nothing saved
const FALLBACK_CATS = [
  'Horse Feed','Hay','Hay Cubes & Pellets','Shavings & Bedding',
  'Supplements','Gut Health','Electrolytes','Psyllium Supplements',
  'Shampoo & Coat Care','Fly Sprays','Fly Control Supplements',
  'Grooming','Clippers & Tools','Leather Care','Oils','Liniments & Topicals',
];
const FALLBACK_VENDORS = [
  'Nutrena','Pro Elite','Cavalor','Red Mills','Havens',
  'Buckeye','Crypto Aero','Kent Sentinel','Absorbine','Farnam',
  'Purina','Tribute','Standlee','Manna Pro',
];

// Apply cached cats/vendors to the modal DOM right now (synchronous)
function applyCatVendorToModal(selectedCategory) {
  const sel = document.getElementById('pm-category');
  if (!sel) return;
  const cats = _cachedCats.length ? _cachedCats
    : FALLBACK_CATS.map(n => ({ name: n }));
  sel.innerHTML = cats.map(c =>
    \`<option value="\${c.name.replace(/"/g,'&quot;')}">\${c.name}</option>\`
  ).join('');
  // Set selected value — if it exists as an option use it, otherwise add it
  if (selectedCategory) {
    if ([...sel.options].some(o => o.value === selectedCategory)) {
      sel.value = selectedCategory;
    } else {
      // Product has a category not in the list yet — add it as an option
      const opt = document.createElement('option');
      opt.value = selectedCategory;
      opt.textContent = selectedCategory;
      sel.insertBefore(opt, sel.firstChild);
      sel.value = selectedCategory;
    }
  }

  const dl = document.getElementById('pm-vendor-list');
  if (dl) {
    const vendors = _cachedVendors.length ? _cachedVendors
      : FALLBACK_VENDORS.map(n => ({ name: n }));
    dl.innerHTML = vendors.map(v =>
      \`<option value="\${v.name.replace(/"/g,'&quot;')}"></option>\`
    ).join('');
  }
}

async function loadCatVendorLists() {
  try {
    const [rc, rv] = await Promise.all([
      fetch('/admin/api/categories'),
      fetch('/admin/api/vendors'),
    ]);

    if (rc.ok) {
      const d = await rc.json();
      // KV returns null until admin saves for the first time
      // Fall back to unique categories from the loaded catalog
      if (d.data && d.data.length) {
        _cachedCats = d.data;
      } else {
        // Seed from catalog products (already loaded) + hardcoded defaults
        const fromCatalog = [...new Set(catProducts.map(p => p.category).filter(Boolean))];
        const merged = [...new Set([...FALLBACK_CATS, ...fromCatalog])].sort();
        _cachedCats = merged.map(n => ({ name: n }));
      }
    }

    if (rv.ok) {
      const d = await rv.json();
      if (d.data && d.data.length) {
        _cachedVendors = d.data;
      } else {
        const fromCatalog = [...new Set(catProducts.map(p => p.vendor).filter(Boolean))];
        const merged = [...new Set([...FALLBACK_VENDORS, ...fromCatalog])].sort();
        _cachedVendors = merged.map(n => ({ name: n }));
      }
    }
  } catch(e) {}

  _cvLoaded = true;
  // Re-apply to modal in case it's already open
  const sel = document.getElementById('pm-category');
  if (sel && sel.options.length <= 1) {
    applyCatVendorToModal(sel.value || '');
  }
}

// ── Load catalog ────────────────────────────────────────────────────────
async function loadCatalog() {
  showStatus('info', '<i class="fas fa-spinner fa-spin"></i> Loading catalog…');
  const res = await fetch('/admin/api/catalog');
  const data = await res.json();

  if (data.products && data.products.length > 0) {
    catProducts = data.products;
    initCatalog();
    showStatus('success', '<i class="fas fa-check-circle"></i> Loaded ' + catProducts.length + ' products.');
    setTimeout(() => document.getElementById('catalog-status').classList.add('hidden'), 3000);
  } else {
    showStatus('warning', '<i class="fas fa-exclamation-triangle"></i> No products in store yet. Click <strong>"Import from Static"</strong> to load the product catalog.');
    document.getElementById('catalog-tbody').innerHTML = \`
      <tr><td colspan="8" class="text-center py-16 text-gray-400">
        <i class="fas fa-box-open" style="font-size:40px;color:#e2e8f0;display:block;margin-bottom:12px;"></i>
        <div style="font-size:16px;font-weight:600;color:#64748b;margin-bottom:8px;">Catalog is empty</div>
        <div style="font-size:13px;margin-bottom:16px;">Click "Import from Static" to load the 315-product catalog, then you can edit any product.</div>
        <button onclick="importStaticCatalog()" class="btn-primary"><i class="fas fa-file-import"></i> Import Catalog Now</button>
      </td></tr>
    \`;
    document.getElementById('cat-count').textContent = '0 products';
  }
  // Always load the cat/vendor dropdowns regardless of catalog state
  loadCatVendorLists();
}

// ── Import static catalog into KV ────────────────────────────────────────
async function importStaticCatalog() {
  const btn = document.getElementById('import-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing…';
  showStatus('info', '<i class="fas fa-spinner fa-spin"></i> Loading static catalog…');
  try {
    const res = await fetch('/static/products-data.json');
    const products = await res.json();
    showStatus('info', \`<i class="fas fa-spinner fa-spin"></i> Saving \${products.length} products to store…\`);
    const saveRes = await fetch('/admin/api/catalog', {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ products })
    });
    const result = await saveRes.json();
    if (result.ok) {
      catProducts = products;
      initCatalog();
      showStatus('success', \`<i class="fas fa-check-circle"></i> Imported \${result.count} products successfully!\`);
      setTimeout(() => document.getElementById('catalog-status').classList.add('hidden'), 4000);
    } else {
      showStatus('error', '<i class="fas fa-times-circle"></i> Import failed: ' + (result.error || 'Unknown error'));
    }
  } catch(e) {
    showStatus('error', '<i class="fas fa-times-circle"></i> Import error: ' + e.message);
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-file-import"></i> Import from Static';
}

// ── CSV Export ────────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['ID','Name','Category','Vendor','Price','InStock','Description','ImageURL','VideoURL','Protein','Fat','Fiber','BestFor','Features','Featured'];
  const rows = catProducts.map(p => [
    p.id, p.name, p.category, p.vendor||'', p.price||'',
    p.inStock !== false ? 'Yes' : 'No',
    (p.description||'').replace(new RegExp('"','g'),'""'),
    p.imageUrl||'', p.videoUrl||'',
    p.protein||'', p.fat||'', p.fiber||'',
    (p.bestFor||'').replace(new RegExp('"','g'),'""'),
    Array.isArray(p.features) ? p.features.join('; ').replace(new RegExp('"','g'),'""') : '',
    p.featured ? 'Yes' : ''
  ]);
  const csv = [headers, ...rows].map(function(r){ return r.map(function(v){ return '"' + String(v).replace(new RegExp('"','g'),'""') + '"'; }).join(','); }).join('\\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = \`british-feed-catalog-\${new Date().toISOString().slice(0,10)}.csv\`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('success', \`<i class="fas fa-check-circle"></i> Exported \${catProducts.length} products as CSV.\`);
  setTimeout(() => document.getElementById('catalog-status').classList.add('hidden'), 3000);
}

// ── CSV Import ────────────────────────────────────────────────────────────
async function importCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split('\\n').filter(l => l.trim());
  if (lines.length < 2) { showStatus('error', 'CSV file appears empty or invalid.'); return; }

  const headers = lines[0].split(',').map(h => h.replace(new RegExp('^"','g'),'').replace(new RegExp('"$','g'),'').trim().toLowerCase());
  const nameIdx = headers.findIndex(h => h === 'name');
  const catIdx  = headers.findIndex(h => h === 'category');
  const priceIdx = headers.findIndex(h => h.includes('price'));
  const descIdx = headers.findIndex(h => h.includes('description'));
  const vendorIdx = headers.findIndex(h => h === 'vendor');
  const imgIdx = headers.findIndex(h => h.includes('image'));
  const vidIdx = headers.findIndex(h => h.includes('video'));
  const stockIdx = headers.findIndex(h => h.includes('stock'));
  const featIdx = headers.findIndex(h => h === 'featured');

  if (nameIdx === -1) { showStatus('error', 'CSV must have a "Name" column.'); return; }

  const parseCsvRow = (line) => {
    const vals = [];
    let inQ = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && !inQ) { inQ = true; continue; }
      if (c === '"' && inQ && line[i+1] === '"') { cur += '"'; i++; continue; }
      if (c === '"' && inQ) { inQ = false; continue; }
      if (c === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
      cur += c;
    }
    vals.push(cur);
    return vals;
  };

  const maxId = catProducts.reduce((m, p) => Math.max(m, p.id||0), 0);
  let added = 0, updated = 0;

  lines.slice(1).forEach((line, i) => {
    const vals = parseCsvRow(line);
    const name = (vals[nameIdx]||'').trim();
    if (!name) return;
    const price = parseFloat(vals[priceIdx]||'0') || 0;
    const prod = {
      name,
      category: catIdx >= 0 ? (vals[catIdx]||'Grain & Feed') : 'Grain & Feed',
      vendor: vendorIdx >= 0 ? vals[vendorIdx]||'' : '',
      price,
      inStock: stockIdx >= 0 ? (vals[stockIdx]||'').toLowerCase() !== 'no' : true,
      description: descIdx >= 0 ? vals[descIdx]||'' : '',
      imageUrl: imgIdx >= 0 ? vals[imgIdx]||'' : '',
      videoUrl: vidIdx >= 0 ? vals[vidIdx]||'' : '',
      featured: featIdx >= 0 ? (vals[featIdx]||'').toLowerCase() === 'yes' : false,
      availabilityNote: 'Call (561) 633-6003 to confirm current availability and pricing',
    };
    // Remove empty strings
    Object.keys(prod).forEach(k => { if (prod[k] === '') delete prod[k]; });

    const existing = catProducts.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0) {
      catProducts[existing] = { ...catProducts[existing], ...prod };
      updated++;
    } else {
      prod.id = maxId + added + updated + 1;
      catProducts.push(prod);
      added++;
    }
  });

  showStatus('info', \`<i class="fas fa-spinner fa-spin"></i> Saving \${added + updated} products…\`);
  const res = await fetch('/admin/api/catalog', {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ products: catProducts })
  });
  const result = await res.json();
  if (result.ok) {
    initCatalog();
    showStatus('success', \`<i class="fas fa-check-circle"></i> CSV imported: \${added} added, \${updated} updated.\`);
    setTimeout(() => document.getElementById('catalog-status').classList.add('hidden'), 4000);
  } else {
    showStatus('error', 'Save failed after CSV parse.');
  }
  input.value = '';
}

// ── Init / Filter ────────────────────────────────────────────────────────
function initCatalog() {
  const cats = [...new Set(catProducts.map(p => p.category))].sort();
  const catSel = document.getElementById('cat-filter-cat');
  catSel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => \`<option value="\${c}">\${c}</option>\`).join('');

  const vendors = [...new Set(catProducts.map(p => p.vendor).filter(Boolean))].sort();
  const vendorSel = document.getElementById('cat-filter-vendor');
  vendorSel.innerHTML = '<option value="">All Vendors</option>' + vendors.map(v => \`<option value="\${v}">\${v}</option>\`).join('');

  filterCatalog();
}

function filterCatalog() {
  const q = document.getElementById('cat-search').value.toLowerCase().trim();
  const cat = document.getElementById('cat-filter-cat').value;
  const vendor = document.getElementById('cat-filter-vendor').value;
  const noImg = document.getElementById('cat-filter-noimg').checked;

  catFiltered = catProducts.filter(p => {
    if (cat && p.category !== cat) return false;
    if (vendor && p.vendor !== vendor) return false;
    if (noImg && (p.imageUrl || p.imageKey)) return false;
    if (q) {
      const hay = (p.name + ' ' + p.category + ' ' + (p.vendor||'') + ' ' + (p.description||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  catPage = 1;
  renderCatalogTable();
  renderCatPagination();
}

function renderCatalogTable() {
  const tbody = document.getElementById('catalog-tbody');
  const page = catFiltered.slice((catPage-1)*CAT_PAGE_SIZE, catPage*CAT_PAGE_SIZE);
  document.getElementById('cat-count').textContent = \`\${catFiltered.length} of \${catProducts.length} products\`;

  if (page.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-12 text-gray-400">No products match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = page.map(p => {
    const imgHtml = p.imageUrl
      ? \`<img src="\${p.imageUrl}" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:6px;border:1px solid #e2e8f0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div style="display:none;width:40px;height:40px;background:#f1f5f9;border-radius:6px;align-items:center;justify-content:center;font-size:18px;">📦</div>\`
      : (p.imageKey
        ? \`<img src="/admin/api/catalog/image/\${p.imageKey}" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:6px;border:1px solid #e2e8f0;" onerror="this.style.display='none'" />\`
        : \`<div style="width:40px;height:40px;background:#f1f5f9;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#94a3b8;" title="No image">📦</div>\`);
    const escapedName = p.name.split("'").join("\\'");

    return \`<tr style="border-bottom:1px solid #f1f5f9; transition:background 0.15s;" onmouseover="this.style.background='#fafbff'" onmouseout="this.style.background=''">
      <td style="padding:10px 16px; font-size:11px; color:#94a3b8; font-weight:500;">#\${p.id}</td>
      <td style="padding:10px 16px;">\${imgHtml}</td>
      <td style="padding:10px 16px;">
        <div style="font-weight:600; font-size:13px; color:#1e293b; line-height:1.3;">\${p.name}</div>
        \${p.description ? \`<div style="font-size:11px; color:#94a3b8; margin-top:2px; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${p.description.substring(0,80)}…</div>\` : ''}
      </td>
      <td style="padding:10px 16px;">
        <span style="background:#f1f5f9; color:#475569; font-size:11px; font-weight:500; padding:2px 8px; border-radius:20px;">\${p.category || '—'}</span>
      </td>
      <td style="padding:10px 16px; font-size:12px; color:#475569;">\${p.vendor || '<span style="color:#cbd5e1">—</span>'}</td>
      <td style="padding:10px 16px; font-size:13px; font-weight:700; color:#1B2A4A;">$\${(p.price||0).toFixed(2)}</td>
      <td style="padding:10px 16px;">
        \${p.inStock !== false
          ? '<span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;"><i class="fas fa-check"></i> In Stock</span>'
          : '<span style="background:#f1f5f9;color:#94a3b8;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">Out</span>'}
      </td>
      <td style="padding:10px 16px; text-align:right;">
        <div style="display:flex; gap:4px; justify-content:flex-end;">
          <button onclick="openEditProduct(\${p.id})" style="background:#EEF1F8;color:#1B2A4A;border:none;padding:6px 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" title="Edit product">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button onclick="duplicateProduct(\${p.id})" style="background:#f0fdf4;color:#166534;border:none;padding:6px 8px;border-radius:7px;font-size:12px;cursor:pointer;" title="Duplicate product">
            <i class="fas fa-copy"></i>
          </button>
          <button onclick="quickDeleteProduct(\${p.id},'\${escapedName}')" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 8px;border-radius:7px;font-size:12px;cursor:pointer;" title="Delete product">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

function renderCatPagination() {
  const total = Math.ceil(catFiltered.length / CAT_PAGE_SIZE);
  const info = document.getElementById('cat-page-info');
  const pag = document.getElementById('cat-pagination');
  const start = (catPage-1)*CAT_PAGE_SIZE+1;
  const end = Math.min(catPage*CAT_PAGE_SIZE, catFiltered.length);
  info.textContent = catFiltered.length > 0 ? \`Showing \${start}–\${end} of \${catFiltered.length}\` : '';
  if (total <= 1) { pag.innerHTML = ''; return; }
  let html = '';
  const ps = 'width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:12px;font-weight:500;';
  const as = 'width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid #1B2A4A;background:#1B2A4A;color:#C9A84C;cursor:pointer;font-size:12px;font-weight:500;';
  if (catPage > 1) html += \`<button onclick="goPageCat(\${catPage-1})" style="\${ps}"><i class="fas fa-chevron-left" style="font-size:10px"></i></button>\`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= catPage-2 && i <= catPage+2))
      html += \`<button onclick="goPageCat(\${i})" style="\${i===catPage?as:ps}">\${i}</button>\`;
    else if (i === catPage-3 || i === catPage+3)
      html += \`<span style="\${ps}">…</span>\`;
  }
  if (catPage < total) html += \`<button onclick="goPageCat(\${catPage+1})" style="\${ps}"><i class="fas fa-chevron-right" style="font-size:10px"></i></button>\`;
  pag.innerHTML = html;
}

function goPageCat(n) {
  catPage = n;
  renderCatalogTable();
  renderCatPagination();
  document.getElementById('catalog-app').scrollIntoView({ behavior:'smooth' });
}

// ── Duplicate product ────────────────────────────────────────────────────
async function duplicateProduct(id) {
  const p = catProducts.find(x => x.id === id);
  if (!p) return;
  const maxId = catProducts.reduce((m, x) => Math.max(m, x.id||0), 0);
  const copy = { ...p, id: maxId + 1, name: p.name + ' (Copy)' };
  catProducts.push(copy);
  const res = await fetch('/admin/api/catalog', {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ products: catProducts })
  });
  const data = await res.json();
  if (data.ok) {
    filterCatalog();
    showStatus('success', \`<i class="fas fa-check-circle"></i> "\${p.name}" duplicated — edit the copy to rename.\`);
    setTimeout(() => document.getElementById('catalog-status').classList.add('hidden'), 3000);
  }
}

// ── Quick delete from table ──────────────────────────────────────────────
async function quickDeleteProduct(id, name) {
  if (!confirm(\`Delete "\${name}"? This cannot be undone.\`)) return;
  try {
    const res = await fetch(\`/admin/api/catalog/\${id}\`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      catProducts = catProducts.filter(p => p.id !== id);
      filterCatalog();
      showStatus('success', \`<i class="fas fa-check-circle"></i> Product deleted.\`);
      setTimeout(() => document.getElementById('catalog-status').classList.add('hidden'), 3000);
    }
  } catch(e) {
    showStatus('error', 'Delete failed: ' + e.message);
  }
}

// ── Image tab switching ──────────────────────────────────────────────────
function switchImgTab(tab) {
  ['upload','url','search'].forEach(t => {
    const btn = document.getElementById('img-tab-' + t);
    const panel = document.getElementById('img-panel-' + t);
    const active = t === tab;
    btn.style.background = active ? '#1B2A4A' : 'transparent';
    btn.style.color = active ? '#fff' : '#64748b';
    panel.style.display = active ? 'block' : 'none';
  });
}

function switchVideoTab(tab) {
  ['url','upload'].forEach(t => {
    const btn = document.getElementById('vid-tab-' + t);
    const panel = document.getElementById('vid-panel-' + t);
    const active = t === tab;
    btn.style.background = active ? '#1B2A4A' : 'transparent';
    btn.style.color = active ? '#fff' : '#64748b';
    panel.style.display = active ? 'block' : 'none';
  });
}

// ── Image drag & drop ────────────────────────────────────────────────────
function handleImgDrop(e) {
  e.preventDefault();
  document.getElementById('pm-img-dropzone').style.background = '';
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const input = document.getElementById('pm-img-file');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  previewUpload();
}

// ── Image URL preview ────────────────────────────────────────────────────
function previewImageUrl(url) {
  if (!url || !url.startsWith('http')) {
    document.getElementById('pm-img-preview-wrap').style.display = 'none';
    return;
  }
  const img = document.getElementById('pm-img-preview');
  img.src = url;
  img.onload = () => {
    document.getElementById('pm-img-preview-url').textContent = url;
    document.getElementById('pm-img-preview-wrap').style.display = 'block';
    document.getElementById('pm-imagekey').value = '';
  };
  img.onerror = () => {
    document.getElementById('pm-url-status').textContent = '⚠ Could not load image from that URL';
  };
}

// ── Image file preview (local) ────────────────────────────────────────────
function previewUpload() {
  const fileInput = document.getElementById('pm-img-file');
  const file = fileInput.files[0];
  if (!file) return;
  const status = document.getElementById('pm-upload-status');
  status.innerHTML = \`<span style="color:#475569;">📎 \${file.name} (\${(file.size/1024).toFixed(0)}KB) — ready to upload on Save</span>\`;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('pm-img-preview').src = e.target.result;
    document.getElementById('pm-img-preview-url').textContent = file.name;
    document.getElementById('pm-img-preview-wrap').style.display = 'block';
    document.getElementById('pm-imageurl').value = '';
  };
  reader.readAsDataURL(file);
}

// ── Image search (uses Bing via search proxy) ────────────────────────────
async function searchImages() {
  const q = document.getElementById('img-search-q').value.trim();
  if (!q) return;
  const results = document.getElementById('img-search-results');
  const hint = document.getElementById('img-search-hint');
  results.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px;"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';

  // Build search URLs from product name
  const encodedQ = encodeURIComponent(q + ' product image transparent');
  // Use Google Images search results shown as clickable links
  hint.innerHTML = \`<span>Auto-search via Google Images — paste any URL above, or <a href="https://www.google.com/search?q=\${encodedQ}&tbm=isch" target="_blank" style="color:#1B2A4A;font-weight:600;">open Google Images</a> and copy a URL.</span>\`;

  // Provide some well-known CDN image sources for common brands
  const brandSuggestions = {
    'nutrena': 'https://www.nutrena.com/content/dam/nutrena',
    'cavalor': 'https://www.cavalor.com/en',
    'absorbine': 'https://www.absorbine.com',
    'farnam': 'https://www.farnam.com',
    'red mills': 'https://redmills.ie',
    'triple crown': 'https://triplecrownfeed.com',
  };

  const lowerQ = q.toLowerCase();
  let suggestions = '';
  for (const [brand, url] of Object.entries(brandSuggestions)) {
    if (lowerQ.includes(brand)) {
      suggestions += \`<div style="padding:8px;background:#eff6ff;border-radius:8px;font-size:11px;">
        <i class="fas fa-external-link-alt" style="color:#3b82f6;"></i>
        Find on <a href="\${url}" target="_blank" style="color:#1B2A4A;font-weight:600;">\${url}</a>
      </div>\`;
    }
  }

  results.innerHTML = \`
    <div style="grid-column:1/-1; padding:8px; background:#f8fafc; border-radius:8px; font-size:11px; color:#64748b;">
      <strong>Tips:</strong> Find a product image online, right-click → Copy Image Address, then paste it in the URL tab above.
    </div>
    \${suggestions || \`<div style="grid-column:1/-1;font-size:11px;color:#94a3b8;padding:4px;">
      No brand shortcut found. Open Google Images to find: <em>\${q}</em>
    </div>\`}
    <div style="grid-column:1/-1;">
      <button onclick="window.open('https://www.google.com/search?q=\${encodedQ}&tbm=isch','_blank')" 
        style="padding:8px 14px;background:#1B2A4A;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-weight:600;width:100%;margin-top:4px;">
        <i class="fas fa-search"></i> Open Google Image Search
      </button>
    </div>
  \`;
}

// ── Video preview ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const vidInput = document.getElementById('pm-videourl');
  if (vidInput) {
    vidInput.addEventListener('input', function() { previewVideoUrl(this.value); });
  }
});

function previewVideoUrl(url) {
  const wrap = document.getElementById('pm-video-preview');
  if (!url) { wrap.style.display = 'none'; return; }
  let embedHtml = '';
  const ytMatch = url.match(new RegExp('(?:youtube\.com/watch\?v=|youtu\.be/)([\\w-]+)'));
  if (ytMatch) embedHtml = \`<iframe width="100%" height="180" src="https://www.youtube.com/embed/\${ytMatch[1]}" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe>\`;
  const vimeoMatch = url.match(new RegExp('vimeo\.com/(\\d+)'));
  if (vimeoMatch) embedHtml = \`<iframe width="100%" height="180" src="https://player.vimeo.com/video/\${vimeoMatch[1]}" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe>\`;
  if (!embedHtml && (url.includes('.mp4') || url.includes('.webm')))
    embedHtml = \`<video src="\${url}" controls style="width:100%;max-height:180px;border-radius:8px;"></video>\`;
  if (embedHtml) {
    wrap.innerHTML = \`<div style="font-size:11px;color:#64748b;margin-bottom:4px;"><i class="fas fa-play-circle text-purple-400"></i> Video preview:</div>\${embedHtml}\`;
    wrap.style.display = 'block';
  } else {
    wrap.innerHTML = \`<div style="font-size:11px;color:#16a34a;padding:6px 10px;background:#f0fdf4;border-radius:6px;"><i class="fas fa-link"></i> Video URL set</div>\`;
    wrap.style.display = 'block';
  }
}

// ── Video file upload (stored in KV as base64) ───────────────────────────
async function handleVideoUpload() {
  const file = document.getElementById('pm-vid-file').files[0];
  if (!file) return;
  const status = document.getElementById('pm-vid-upload-status');
  if (file.size > 5 * 1024 * 1024) {
    status.innerHTML = '<span style="color:#dc2626;">⚠ Video too large for KV storage (max 5MB). Use a YouTube/Vimeo URL instead.</span>';
    return;
  }
  status.innerHTML = '<span style="color:#8B5CF6;"><i class="fas fa-spinner fa-spin"></i> Uploading video…</span>';
  const fd = new FormData();
  fd.append('image', file); // reuse image upload endpoint
  fd.append('productId', 'vid_' + document.getElementById('pm-id').value);
  try {
    const res = await fetch('/admin/api/catalog/upload-image', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('pm-videourl').value = data.url;
      previewVideoUrl(data.url);
      status.innerHTML = \`<span style="color:#16a34a;">✓ Video uploaded: <a href="\${data.url}" target="_blank" style="color:#1B2A4A;">\${file.name}</a></span>\`;
    } else {
      status.innerHTML = \`<span style="color:#dc2626;">Upload failed: \${data.error}</span>\`;
    }
  } catch(e) {
    status.innerHTML = \`<span style="color:#dc2626;">Error: \${e.message}</span>\`;
  }
}

// ── Modal open/close ─────────────────────────────────────────────────────
function openAddProductModal() {
  document.getElementById('prod-modal-title').textContent = 'Add New Product';
  document.getElementById('pm-delete-btn').style.display = 'none';
  clearProdForm();
  document.getElementById('pm-id').value = '';
  const maxId = Math.max(0, ...catProducts.map(p => p.id || 0));
  document.getElementById('pm-id').value = maxId + 1;
  // Populate dropdowns before opening so they're never "Loading…"
  applyCatVendorToModal('');
  showProdModal();
}

function openEditProduct(id) {
  const p = catProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('prod-modal-title').textContent = 'Edit — ' + p.name;
  document.getElementById('pm-delete-btn').style.display = 'flex';
  document.getElementById('pm-id').value = p.id;
  document.getElementById('pm-name').value = p.name || '';
  // Populate dropdowns FIRST so .value assignment finds its option
  applyCatVendorToModal(p.category || '');
  document.getElementById('pm-vendor').value = p.vendor || '';
  document.getElementById('pm-price').value = p.price || '';
  document.getElementById('pm-instock').checked = p.inStock !== false;
  document.getElementById('pm-description').value = p.description || '';
  document.getElementById('pm-imageurl').value = p.imageUrl || '';
  document.getElementById('pm-imagekey').value = p.imageKey || '';
  document.getElementById('pm-videourl').value = p.videoUrl || '';
  document.getElementById('pm-protein').value = p.protein || '';
  document.getElementById('pm-fat').value = p.fat || '';
  document.getElementById('pm-fiber').value = p.fiber || '';
  document.getElementById('pm-bestfor').value = p.bestFor || '';
  document.getElementById('pm-features').value = Array.isArray(p.features) ? p.features.join('\\n') : (p.features || '');
  document.getElementById('pm-featured').checked = p.featured || false;

  const imgUrl = p.imageUrl || (p.imageKey ? \`/admin/api/catalog/image/\${p.imageKey}\` : null);
  if (imgUrl) {
    document.getElementById('pm-img-preview').src = imgUrl;
    document.getElementById('pm-img-preview-url').textContent = p.imageUrl || p.imageKey || '';
    document.getElementById('pm-img-preview-wrap').style.display = 'block';
  } else {
    document.getElementById('pm-img-preview-wrap').style.display = 'none';
  }

  previewVideoUrl(p.videoUrl || '');

  document.getElementById('pm-img-file').value = '';
  document.getElementById('pm-upload-status').textContent = '';

  // Pre-fill image search with product name
  document.getElementById('img-search-q').value = p.name;

  showProdModal();
}

function showProdModal() {
  const modal = document.getElementById('prod-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Reset to upload tab
  switchImgTab('upload');
  switchVideoTab('url');
}

function closeProdModal() {
  document.getElementById('prod-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function clearProdForm() {
  ['pm-name','pm-vendor','pm-price','pm-description',
   'pm-imageurl','pm-imagekey','pm-videourl','pm-protein','pm-fat',
   'pm-fiber','pm-bestfor','pm-features'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Reset category to first available option (populated dynamically)
  applyCatVendorToModal('');
  document.getElementById('pm-instock').checked = true;
  document.getElementById('pm-featured').checked = false;
  document.getElementById('pm-img-preview-wrap').style.display = 'none';
  document.getElementById('pm-video-preview').style.display = 'none';
  document.getElementById('pm-img-file').value = '';
  document.getElementById('pm-upload-status').textContent = '';
  document.getElementById('img-search-results').innerHTML = '';
  document.getElementById('img-search-hint').innerHTML = '';
}

function clearImage() {
  document.getElementById('pm-imageurl').value = '';
  document.getElementById('pm-imagekey').value = '';
  document.getElementById('pm-img-file').value = '';
  document.getElementById('pm-img-preview-wrap').style.display = 'none';
  document.getElementById('pm-upload-status').textContent = '';
}

// ── Save product ─────────────────────────────────────────────────────────
async function saveProdModal() {
  const saveBtn = document.getElementById('pm-save-btn');
  const name = document.getElementById('pm-name').value.trim();
  const priceVal = document.getElementById('pm-price').value;
  const price = parseFloat(priceVal);

  if (!name) { alert('Product name is required.'); return; }
  if (isNaN(price) || price < 0) { alert('Please enter a valid price (e.g. 29.95).'); return; }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

  // Handle file upload first
  let imageKey = document.getElementById('pm-imagekey').value;
  let imageUrl = document.getElementById('pm-imageurl').value.trim();
  const fileInput = document.getElementById('pm-img-file');
  const prodId = document.getElementById('pm-id').value;

  if (fileInput.files[0]) {
    const uploadStatus = document.getElementById('pm-upload-status');
    const bar = document.getElementById('pm-upload-bar');
    const fill = document.getElementById('pm-upload-fill');
    uploadStatus.innerHTML = '<span style="color:#1B2A4A;"><i class="fas fa-spinner fa-spin"></i> Uploading image…</span>';
    bar.style.display = 'block';

    // Animate progress bar (fake progress while uploading)
    let prog = 0;
    const progInterval = setInterval(() => {
      prog = Math.min(prog + 5, 85);
      fill.style.width = prog + '%';
    }, 150);

    const fd = new FormData();
    fd.append('image', fileInput.files[0]);
    fd.append('productId', prodId);
    try {
      const uploadRes = await fetch('/admin/api/catalog/upload-image', { method: 'POST', body: fd });
      const uploadData = await uploadRes.json();
      clearInterval(progInterval);
      fill.style.width = '100%';
      if (uploadData.ok) {
        imageKey = uploadData.key;
        imageUrl = '';
        uploadStatus.innerHTML = '<span style="color:#16a34a;">✓ Image uploaded successfully!</span>';
      } else {
        uploadStatus.innerHTML = \`<span style="color:#dc2626;">Upload failed: \${uploadData.error}</span>\`;
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Product';
        bar.style.display = 'none';
        return;
      }
    } catch(e) {
      clearInterval(progInterval);
      uploadStatus.innerHTML = \`<span style="color:#dc2626;">Upload error: \${e.message}</span>\`;
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Product';
      bar.style.display = 'none';
      return;
    }
    setTimeout(() => { bar.style.display = 'none'; fill.style.width = '0%'; }, 1500);
  }

  const features = document.getElementById('pm-features').value
    .split('\\n').map(s => s.trim()).filter(Boolean);

  const productData = {
    name,
    category: document.getElementById('pm-category').value,
    vendor: document.getElementById('pm-vendor').value.trim(),
    price,
    inStock: document.getElementById('pm-instock').checked,
    description: document.getElementById('pm-description').value.trim(),
    imageUrl: imageUrl || undefined,
    imageKey: imageKey || undefined,
    videoUrl: document.getElementById('pm-videourl').value.trim() || undefined,
    protein: document.getElementById('pm-protein').value.trim() || undefined,
    fat: document.getElementById('pm-fat').value.trim() || undefined,
    fiber: document.getElementById('pm-fiber').value.trim() || undefined,
    bestFor: document.getElementById('pm-bestfor').value.trim() || undefined,
    features: features.length > 0 ? features : undefined,
    featured: document.getElementById('pm-featured').checked || undefined,
    availabilityNote: 'Call (561) 633-6003 to confirm current availability and pricing'
  };

  // Remove undefined keys
  Object.keys(productData).forEach(k => productData[k] === undefined && delete productData[k]);

  try {
    const id = parseInt(document.getElementById('pm-id').value);
    let res, data;
    if (id && catProducts.find(p => p.id === id)) {
      res = await fetch(\`/admin/api/catalog/\${id}\`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(productData)
      });
    } else {
      res = await fetch('/admin/api/catalog', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(productData)
      });
    }
    data = await res.json();
    if (data.ok) {
      const existing = catProducts.findIndex(p => p.id === data.product.id);
      if (existing >= 0) catProducts[existing] = data.product;
      else catProducts.push(data.product);
      closeProdModal();
      filterCatalog();
      initCatalog(); // refresh dropdowns
      showStatus('success', \`<i class="fas fa-check-circle"></i> "\${name}" saved successfully!\`);
      setTimeout(() => document.getElementById('catalog-status').classList.add('hidden'), 3000);
    } else {
      showStatus('error', '<i class="fas fa-times-circle"></i> Save failed: ' + (data.error || 'Unknown'));
    }
  } catch(e) {
    showStatus('error', '<i class="fas fa-times-circle"></i> Error: ' + e.message);
  }
  saveBtn.disabled = false;
  saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Product';
}

// ── Delete from modal ─────────────────────────────────────────────────────
async function deleteProdFromModal() {
  const id = parseInt(document.getElementById('pm-id').value);
  const name = document.getElementById('pm-name').value;
  if (!confirm(\`Delete "\${name}"? This cannot be undone.\`)) return;
  try {
    const res = await fetch(\`/admin/api/catalog/\${id}\`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      catProducts = catProducts.filter(p => p.id !== id);
      closeProdModal();
      filterCatalog();
      showStatus('success', \`<i class="fas fa-check-circle"></i> Product deleted.\`);
      setTimeout(() => document.getElementById('catalog-status').classList.add('hidden'), 3000);
    }
  } catch(e) {
    showStatus('error', '<i class="fas fa-times-circle"></i> Delete failed: ' + e.message);
  }
}

// Close on backdrop/Escape
document.getElementById('prod-modal').addEventListener('click', function(e) {
  if (e.target === this) closeProdModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProdModal(); });

// ── Status helper ─────────────────────────────────────────────────────────
function showStatus(type, html) {
  const el = document.getElementById('catalog-status');
  el.classList.remove('hidden');
  const styles = {
    success: 'background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;',
    error:   'background:#fef2f2; color:#991b1b; border:1px solid #fecaca;',
    warning: 'background:#fffbeb; color:#92400e; border:1px solid #fde68a;',
    info:    'background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe;',
  };
  el.setAttribute('style', (styles[type] || styles.info) + ' display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:500;');
  el.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', loadCatalog);
</script>
`
}


// ═══════════════════════════════════════════════════════════════════════════
//  SHARED LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

// ─── Homepage Sections Editor ────────────────────────────────────────────────
function getHomepageSectionsHTML(): string {
  return `
<div class="p-6 max-w-5xl mx-auto" id="hs-app">

  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <i class="fas fa-store" style="color:#C9A84C"></i> Homepage Sections
      </h1>
      <p class="text-gray-500 text-sm mt-1">
        Control what appears in each product section on the public homepage.
        All changes pull directly from the Catalog Manager.
      </p>
    </div>
    <button onclick="saveAll()" id="saveBtn"
      class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
      style="background:#1B2A4A">
      <i class="fas fa-save"></i> Save &amp; Publish
    </button>
  </div>

  <!-- Status banner -->
  <div id="statusBar" class="hidden mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2"></div>

  <!-- Loading state -->
  <div id="loadingState" class="flex items-center justify-center py-20 text-gray-400">
    <i class="fas fa-spinner fa-spin text-2xl mr-3"></i> Loading catalog data...
  </div>

  <!-- Main editor (shown after load) -->
  <div id="editorMain" class="hidden space-y-8">

    <!-- ── GRAIN BRANDS section ── -->
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100" style="background:#FAFBFC">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background:#1B2A4A">
            <i class="fas fa-tag text-xs" style="color:#C9A84C"></i>
          </div>
          <div>
            <div class="font-bold text-gray-900 text-sm">Grain Brands</div>
            <div class="text-xs text-gray-400">Brand cards shown in the "Grain Brands" homepage section</div>
          </div>
        </div>
        <span id="grainCount" class="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full"></span>
      </div>
      <div class="p-6">
        <p class="text-xs text-gray-500 mb-4">
          <i class="fas fa-info-circle text-blue-400 mr-1"></i>
          Select which <strong>vendors</strong> appear as brand cards. Products from the catalog are grouped by vendor.
          Drag to reorder.
        </p>
        <div id="grainVendorList" class="space-y-2"></div>
        <button onclick="addVendorCard()" class="mt-3 flex items-center gap-2 text-sm text-navy-700 font-medium hover:text-gold-500 transition-colors">
          <i class="fas fa-plus-circle"></i> Add vendor card
        </button>
      </div>
    </div>

    <!-- ── HAY SELECTION section ── -->
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100" style="background:#FAFBFC">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background:#15803D">
            <i class="fas fa-tag text-xs text-white"></i>
          </div>
          <div>
            <div class="font-bold text-gray-900 text-sm">Hay Selection</div>
            <div class="text-xs text-gray-400">Individual hay types listed under 3-string and 2-string bale groups</div>
          </div>
        </div>
      </div>
      <div class="p-6 grid md:grid-cols-2 gap-6">
        <div>
          <div class="font-semibold text-gray-700 text-sm mb-2 flex items-center gap-2">
            <i class="fas fa-cubes text-green-500 text-xs"></i> 3-String Bales (100–110 lbs)
          </div>
          <div id="hay3List" class="space-y-2 mb-2"></div>
          <button onclick="addHayItem('hay3List')" class="text-xs text-navy-700 font-medium hover:text-gold-500 transition-colors flex items-center gap-1">
            <i class="fas fa-plus-circle"></i> Add item
          </button>
        </div>
        <div>
          <div class="font-semibold text-gray-700 text-sm mb-2 flex items-center gap-2">
            <i class="fas fa-box text-amber-500 text-xs"></i> 2-String Bales (48–60 lbs)
          </div>
          <div id="hay2List" class="space-y-2 mb-2"></div>
          <button onclick="addHayItem('hay2List')" class="text-xs text-navy-700 font-medium hover:text-gold-500 transition-colors flex items-center gap-1">
            <i class="fas fa-plus-circle"></i> Add item
          </button>
        </div>
      </div>
      <div class="px-6 pb-4">
        <label class="text-xs font-semibold text-gray-600 block mb-1">Availability note (shown below hay cards)</label>
        <input id="hayNote" type="text" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          placeholder="e.g. Hay availability varies by season. Call (561) 633-6003..."/>
      </div>
    </div>

    <!-- ── SHAVINGS & BEDDING section ── -->
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100" style="background:#FAFBFC">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background:#92400E">
            <i class="fas fa-tag text-xs text-white"></i>
          </div>
          <div>
            <div class="font-bold text-gray-900 text-sm">Shavings &amp; Bedding</div>
            <div class="text-xs text-gray-400">Product cards shown in the Shavings &amp; Bedding section</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Pull from catalog</span>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="shavingsCatalogToggle" class="sr-only peer" onchange="toggleShavingsMode()">
            <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-navy-700" style="--tw-peer-checked-bg:#1B2A4A"></div>
          </label>
        </div>
      </div>
      <div class="p-6">
        <!-- Catalog mode -->
        <div id="shavingsCatalogMode" class="hidden">
          <p class="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
            <i class="fas fa-sync-alt"></i>
            <span>Showing all products from the <strong>Shavings &amp; Bedding</strong> catalog category automatically.</span>
          </p>
          <div id="shavingsCatalogPreview" class="grid sm:grid-cols-2 gap-2 text-xs text-gray-500"></div>
        </div>
        <!-- Manual mode -->
        <div id="shavingsManualMode">
          <p class="text-xs text-gray-500 mb-3">Manually define each shavings product card:</p>
          <div id="shavingsList" class="space-y-2 mb-2"></div>
          <button onclick="addShavingsItem()" class="text-xs text-navy-700 font-medium hover:text-gold-500 transition-colors flex items-center gap-1">
            <i class="fas fa-plus-circle"></i> Add product
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-3 italic"><i class="fas fa-plus-circle text-gold-400 mr-1"></i>
          <input id="shavingsNote" type="text" class="border-0 outline-none bg-transparent text-xs text-gray-400 italic w-full"
            placeholder="Footer note, e.g. Additional options available under special order..."/></p>
      </div>
    </div>

    <!-- ── SUPPLEMENTS section ── -->
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100" style="background:#FAFBFC">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background:#6D28D9">
            <i class="fas fa-tag text-xs text-white"></i>
          </div>
          <div>
            <div class="font-bold text-gray-900 text-sm">Supplements &amp; Additives</div>
            <div class="text-xs text-gray-400">Products shown in the Supplements section</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Pull from catalog</span>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="suppsCatalogToggle" class="sr-only peer" onchange="toggleSuppsMode()">
            <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" style="background:var(--supp-bg,#e5e7eb)"></div>
          </label>
        </div>
      </div>
      <div class="p-6">
        <!-- Catalog mode -->
        <div id="suppsCatalogMode" class="hidden">
          <p class="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
            <i class="fas fa-sync-alt"></i>
            <span>Showing top products from catalog categories: Supplements, Gut Health, Electrolytes, Psyllium.</span>
          </p>
          <div class="mb-3">
            <label class="text-xs font-semibold text-gray-600 block mb-1">Max products to show</label>
            <input id="suppsMaxCount" type="number" min="3" max="24" value="12"
              class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-24"/>
          </div>
          <div id="suppsCatalogPreview" class="grid sm:grid-cols-2 gap-1.5 text-xs text-gray-500 max-h-48 overflow-y-auto"></div>
        </div>
        <!-- Manual mode -->
        <div id="suppsManualMode">
          <p class="text-xs text-gray-500 mb-3">Manually define each supplement card:</p>
          <div id="suppsList" class="space-y-2 mb-2"></div>
          <button onclick="addSuppsItem()" class="text-xs text-navy-700 font-medium hover:text-gold-500 transition-colors flex items-center gap-1">
            <i class="fas fa-plus-circle"></i> Add product
          </button>
        </div>
      </div>
    </div>

  </div><!-- /editorMain -->
</div>

<script>
// ── State ────────────────────────────────────────────────────────────────────
let allCatalog = [];
let allVendors = [];
let cfg = {
  grainVendors: [], // [{vendor, tag, color, logoUrl, imgUrl}]
  hay3: [],         // string[]
  hay2: [],         // string[]
  hayNote: 'Hay availability varies by season. Call (561) 633-6003 or visit the store to check current stock and pricing.',
  shavingsCatalog: false,
  shavings: [],     // [{name, desc, icon}]
  shavingsNote: 'Additional options available under special order — ask us!',
  suppsCatalog: false,
  suppsMax: 12,
  supps: [],        // [{name, cat, desc}]
};

// Default fallbacks (match current hardcoded values)
const DEFAULT_GRAIN_VENDORS = [
  {vendor:'Nutrena',      tag:'SafeChoice · ProForce · Triumph',      color:'#e8f0fe', logoUrl:'https://nutrenaworld.com/wp-content/themes/nutrena/img/logo.svg',         imgUrl:'https://sspark.genspark.ai/cfimages?u1=Inli4Vrc%2Bq7q%2Bhejp2YDAGwFAIaUPxW7K%2FwGYXRV7M%2FosuAUR1Dg%2F0CYc7d60OG48eic0M3S7QLmL7rjvtV13G6oK3uyoFxL%2F6mCxQ%2BPP0S%2BoyvO&u2=KfyuzNFlfV1IBWO5&width=600'},
  {vendor:'Pro Elite',    tag:'Performance · Senior · Growth',         color:'#fef9e8', logoUrl:'https://proelitehorsefeed.com/wp-content/uploads/2021/10/ProElite_Logo_Reversed.png', imgUrl:'https://sspark.genspark.ai/cfimages?u1=UxSf44ASGNVschWMwLtxVTJm3%2BRiUSyER74fAAsvVIMvRn1hKeSeK4y%2BjKNE8jwMaOERwhJljHYQcYwWUmC1zwynUJr1ADAMOeXYd7zaFrqolHnB&u2=5%2BTutAkigKGikiTN&width=600'},
  {vendor:'Cavalor',      tag:'Performix · FiberGastro · Strucomix',   color:'#f0f7ff', logoUrl:'https://cavalor.com/wp-content/uploads/2022/09/cavalor-logo.svg',          imgUrl:'https://sspark.genspark.ai/cfimages?u1=onNaXY4%2FhbZvy5YUkL6RJRe7GDYh%2FXQ%2F9jUCePwxorXO0SXh9sJ4V5ZlP8bfJnaEM4xvG77mMoaKrx2Kh4NABnoukeaffKYGZCZbO8v6anEF9nDmP8mcozZwUEkzk0ZJI0S3JYPVUJekW5Q%2FTQ7Wo1Ym%2F384PTiYCw%3D%3D&u2=HvaCFz89bIhAFLwE&width=600'},
  {vendor:'Red Mills',    tag:'Competition · Horse Care · Comfort',    color:'#fff0f0', logoUrl:'https://www.redmillshorse.com/wp-content/uploads/2019/01/logo.png',        imgUrl:'https://sspark.genspark.ai/cfimages?u1=7osbNYU1ox8HmUk%2Ff45sEFuifDuvcNmaipEgpuBsDXSH2IHPavx1l1F8XyLl6hGDuY9d7%2BNMCEuIiPfiM%2BXq2K%2BeZndZ3qLBoOkpr7yNJg%3D%3D&u2=2MbM4LT9HP0TC4eI&width=600'},
  {vendor:'Havens',       tag:'Endurance · Gastro · Cool Mix',         color:'#f0fff4', logoUrl:'', imgUrl:'https://sspark.genspark.ai/cfimages?u1=dhrtoOORdnVmpeg5tu7Vf6iZPYmcuNy2bGs4%2F7HVf9X7%2FqSEKc8h4k8BEc2V5IGz%2BZu3%2FCtD5Qu55n%2F526YoYwwmmVccVgPnmttMjJxE%2FQk%3D&u2=7nQSyV4Lh9alc6Az&width=600'},
  {vendor:'Buckeye',      tag:'EQ8 · Cadence Ultra · Safe N Easy',     color:'#fff8f0', logoUrl:'', imgUrl:'https://sspark.genspark.ai/cfimages?u1=9XhtqN4rYmnFIf9UGMrzL7a9c7Ql2XBXrI6%2BK3o57loRQp60kAcf3xQdI%2BlJC9wcQvXchR9jZmirwQJGcDU%2B5FrgA86yTp6np7%2FN%2BLwuscUFAo2fjOxUxzIVKU4cPngVqwZepEz%2FUKNZINWBMvefKj9PnA%3D%3D&u2=ruqOATUPxWic6yRH&width=600'},
  {vendor:'Crypto Aero',  tag:'Wholefood · All Natural',               color:'#f4fff0', logoUrl:'', imgUrl:'https://sspark.genspark.ai/cfimages?u1=UUsiXOiA0Ei8p%2FfKKGgbk1xAySyI%2FiMwtVhDYyrYBbgpnGA1ZJtkrAhHHwCYX1JzMYoWCDxVgQn44pKRN%2Bml1gVbJzt6nT4%2F%2B%2BDhAQJwPC%2BdZw%3D%3D&u2=QDzJUpsrG0A2lDdk&width=600'},
  {vendor:'Kent Sentinel',tag:'Quality Grain Feeds',                   color:'#f5f0ff', logoUrl:'', imgUrl:'https://sspark.genspark.ai/cfimages?u1=Vxz9lWjwxf2ZDBQw4sfUrkXEXV%2FJcZJZ%2FlYvsjswpMWnkrFwvhy8fUCTlInJHfSAcgbZhxIOUmLFM3lX4GvrTZqxqRl7aGNdVnzq9B9g7wZDh59ixKMAQk8Gp6G6Q1qmrlP2hg1jjhE%3D&u2=rkES%2F33%2By4pHTknJ&width=600'},
];
const DEFAULT_HAY3 = ['Alfalfa','2nd Cut Grassy Timothy','1st Cut Timothy','2nd Cut Orchard','2nd Cut Timothy'];
const DEFAULT_HAY2 = ['Special Reserve T/A','Premium T/A','Supergrass (Straight Orchard)','Quebec T/A','Twyla T/A (Heavy Alfalfa)','Peanut Hay (High Protein)','Valley Green O/T/A','Alberta Timothy (Straight)','2nd Cut Alberta Timothy'];
const DEFAULT_SHAVINGS = [
  {name:'WD Fine',        desc:'Very fine shavings — 7–8 cu. ft. per bag. Excellent dust control.',        icon:'fa-feather'},
  {name:'WD Flake',       desc:'Medium flake shavings — 8–9 cu. ft. Classic barn-fresh feel.',             icon:'fa-layer-group'},
  {name:'WD Pelleted',    desc:'Compressed pellets that expand with water — highly absorbent.',             icon:'fa-circle'},
  {name:'Fast Track Blend',desc:'Mix of fine & medium flake — 8 cu. ft. Best of both worlds.',            icon:'fa-star'},
  {name:'Fast Track Fine',desc:'Fine flake — 7 cu. ft. Ideal for sensitive respiratory horses.',           icon:'fa-wind'},
  {name:'World Cup',      desc:'Large flake — 9–10 cu. ft. Show-quality bedding.',                        icon:'fa-trophy'},
  {name:'Showtime Large', desc:'Large flake — 9–10 cu. ft. Perfect for stall presentation.',              icon:'fa-award'},
  {name:'King Large',     desc:'Very large flake — 9.5 cu. ft. Maximum cushion & comfort.',               icon:'fa-crown'},
  {name:'Baled Straw',    desc:'45–50 lbs bales. Natural, traditional bedding option.',                   icon:'fa-seedling'},
];
const DEFAULT_SUPPS = [
  {name:'Cavalor Hepato Liq',           cat:'Liver Support',      desc:'Liquid liver support supplement. Detoxifies and supports optimal liver function, especially for horses in heavy training.'},
  {name:'Cavalor Bronchix Pure',        cat:'Respiratory',        desc:'Natural respiratory support for horses with airway sensitivity, dust allergies, or those competing in dusty arenas.'},
  {name:'Cavalor Sozen',                cat:'Calming',            desc:'Natural calming supplement to reduce nervousness and stress without affecting alertness or performance.'},
  {name:'Cavalor Muscle Force',         cat:'Muscle Support',     desc:'Supports muscle development and recovery. Ideal for performance horses needing topline and muscle tone improvement.'},
  {name:'Cavalor Vitamino',             cat:'Vitamins & Minerals',desc:'Complete vitamin and mineral supplement to balance rations and fill nutritional gaps in hay and forage diets.'},
  {name:'Max-E-Glo Rice Bran',          cat:'Weight & Coat',      desc:'Stabilized rice bran supplement for healthy weight gain, improved coat shine, and extra energy without excess starch.'},
  {name:"Horseshoer's Secret",          cat:'Hoof Health',        desc:'Pelleted hoof supplement with biotin, zinc, and methionine to support strong, healthy hoof growth and quality.'},
  {name:'Sand Clear',                   cat:'Digestive',          desc:'Monthly psyllium treatment to help clear sand and dirt from the digestive tract — essential for Florida horses.'},
  {name:'SandPurge Psyllium Pellets',   cat:'Digestive',          desc:'Psyllium-based pellets that support natural sand removal from the hindgut. Easy-to-feed pelleted form.'},
  {name:'Vita-E & Selenium',            cat:'Antioxidant',        desc:'Essential antioxidant combination for muscle function, immune support, and reproductive health in horses.'},
  {name:'Topline Xtreme',               cat:'Topline',            desc:'High-protein supplement formulated specifically to build and maintain topline muscle in performance and show horses.'},
  {name:'CocoSoya Oil',                 cat:'Weight & Coat',      desc:'Blend of coconut and soy oils providing omega fatty acids for calorie-dense weight gain and brilliant coat shine.'},
];

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  // Load catalog products
  try {
    const r = await fetch('/admin/api/catalog');
    if (r.ok) { const d = await r.json(); allCatalog = d.products || []; }
  } catch(e) {}
  allVendors = [...new Set(allCatalog.map(p => p.vendor).filter(Boolean))].sort();

  // Load saved config
  try {
    const r = await fetch('/admin/api/homepage-sections');
    if (r.ok) { const d = await r.json(); if (d.data) Object.assign(cfg, d.data); }
  } catch(e) {}

  // Apply defaults if first time (nothing saved yet)
  if (!cfg.grainVendors.length) cfg.grainVendors = JSON.parse(JSON.stringify(DEFAULT_GRAIN_VENDORS));
  if (!cfg.hay3.length) cfg.hay3 = [...DEFAULT_HAY3];
  if (!cfg.hay2.length) cfg.hay2 = [...DEFAULT_HAY2];
  if (!cfg.shavings.length) cfg.shavings = JSON.parse(JSON.stringify(DEFAULT_SHAVINGS));
  if (!cfg.supps.length) cfg.supps = JSON.parse(JSON.stringify(DEFAULT_SUPPS));

  renderAll();
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('editorMain').classList.remove('hidden');
}

function renderAll() {
  renderGrainVendors();
  renderHayList('hay3List', cfg.hay3);
  renderHayList('hay2List', cfg.hay2);
  document.getElementById('hayNote').value = cfg.hayNote || '';
  renderShavings();
  renderSupps();
  document.getElementById('shavingsNote').value = cfg.shavingsNote || '';
  // Toggles
  const shTog = document.getElementById('shavingsCatalogToggle');
  shTog.checked = !!cfg.shavingsCatalog;
  shTog.dispatchEvent(new Event('change'));
  const supTog = document.getElementById('suppsCatalogToggle');
  supTog.checked = !!cfg.suppsCatalog;
  supTog.dispatchEvent(new Event('change'));
  document.getElementById('suppsMaxCount').value = cfg.suppsMax || 12;
  document.getElementById('grainCount').textContent = cfg.grainVendors.length + ' vendors';
}

// ── Shared image-upload helper ────────────────────────────────────────────────
// Uploads a File and resolves with the public URL stored in KV.
async function uploadHomepageImage(file, statusEl) {
  if (!file) return null;
  if (file.size > 800 * 1024) {
    if (statusEl) statusEl.textContent = 'File too large (max 800 KB)';
    return null;
  }
  const fd = new FormData();
  fd.append('image', file);
  if (statusEl) statusEl.textContent = 'Uploading…';
  try {
    const r = await fetch('/admin/api/catalog/upload-image', {method:'POST', body:fd});
    const d = await r.json();
    if (d.ok) {
      if (statusEl) statusEl.textContent = 'Uploaded';
      return d.imgUrl;
    }
    if (statusEl) statusEl.textContent = 'Upload failed: ' + (d.error||'unknown');
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  }
  return null;
}

// Build a reusable image-picker widget (URL tab + Upload tab).
// setterExpr  – a JS expression string (safe for inline HTML attr) that receives
//               the new URL as the variable "url", e.g. "cfg.grainVendors[0].imgUrl=url"
function imgPickerHTML(pickerId, currentUrl, setterExpr) {
  const hasImg = !!(currentUrl && currentUrl.length > 0);
  const urlPaneHide = hasImg ? 'hidden' : '';
  const urlTabStyle = hasImg ? '' : 'background:#1B2A4A;color:#fff';
  const uploadTabStyle = '';
  const thumbHTML = hasImg
    ? \`<img src="\${esc(currentUrl)}" alt="" class="h-10 w-16 object-cover rounded-md border border-gray-200"/>\`
    : '';
  const checkBadge = hasImg
    ? \`<span class="ml-auto text-xs text-green-600 flex items-center gap-1"><i class="fas fa-check-circle"></i>Image set</span>\`
    : '';
  return \`<div class="img-picker" data-picker="\${pickerId}">
    <div class="flex gap-1 mb-1.5">
      <button type="button" onclick="switchImgPickerTab('\${pickerId}','url')"
        class="ip-tab-url px-2.5 py-1 rounded-md text-xs font-medium transition-colors bg-gray-100 text-gray-600"
        style="\${urlTabStyle}"><i class="fas fa-link mr-1"></i>URL</button>
      <button type="button" onclick="switchImgPickerTab('\${pickerId}','upload')"
        class="ip-tab-upload px-2.5 py-1 rounded-md text-xs font-medium transition-colors bg-gray-100 text-gray-600"
        style="\${uploadTabStyle}"><i class="fas fa-upload mr-1"></i>Upload</button>
      \${checkBadge}
    </div>
    <div class="ip-url-pane \${urlPaneHide}">
      <input type="text" value="\${esc(currentUrl||'')}" placeholder="https://example.com/image.jpg"
        class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
        onchange="(function(url){\${setterExpr}})(this.value); refreshPickerStatus('\${pickerId}',this.value)"/>
    </div>
    <div class="ip-upload-pane hidden">
      <div class="border-2 border-dashed border-gray-200 rounded-lg px-3 py-3 text-center text-xs text-gray-400 hover:border-blue-300 transition-colors"
        ondragover="event.preventDefault()"
        ondrop="handleImgPickerDrop(event,'\${pickerId}',function(url){\${setterExpr}})">
        <i class="fas fa-cloud-upload-alt text-base text-gray-300 mb-1 block"></i>
        Drag &amp; drop or
        <label class="text-blue-600 font-semibold cursor-pointer hover:underline">
          browse<input type="file" accept="image/*" class="hidden"
            onchange="handleImgPickerFile(event,'\${pickerId}',function(url){\${setterExpr}})"/>
        </label>
        <div class="text-gray-300 mt-0.5">JPG · PNG · WebP · max 800 KB</div>
      </div>
      <div class="ip-upload-status text-xs text-gray-400 mt-1"></div>
    </div>
    <div class="ip-thumb mt-1.5">\${thumbHTML}</div>
  </div>\`;
}

function switchImgPickerTab(id, tab) {
  const picker = document.querySelector(\`[data-picker="\${id}"]\`);
  if (!picker) return;
  picker.querySelector('.ip-url-pane').classList.toggle('hidden', tab !== 'url');
  picker.querySelector('.ip-upload-pane').classList.toggle('hidden', tab !== 'upload');
  picker.querySelector('.ip-tab-url').style.cssText = tab === 'url' ? 'background:#1B2A4A;color:#fff' : '';
  picker.querySelector('.ip-tab-upload').style.cssText = tab === 'upload' ? 'background:#1B2A4A;color:#fff' : '';
}

function refreshPickerStatus(id, url) {
  const picker = document.querySelector(\`[data-picker="\${id}"]\`);
  if (!picker) return;
  const thumb = picker.querySelector('.ip-thumb');
  if (url) {
    thumb.innerHTML = \`<img src="\${esc(url)}" alt="" class="h-10 w-16 object-cover rounded-md border border-gray-200"/>\`;
  } else {
    thumb.innerHTML = '';
  }
}

async function handleImgPickerFile(event, id, onChangeFn) {
  const file = event.target.files[0];
  if (!file) return;
  const picker = document.querySelector(\`[data-picker="\${id}"]\`);
  const statusEl = picker ? picker.querySelector('.ip-upload-status') : null;
  const url = await uploadHomepageImage(file, statusEl);
  if (url) {
    if (typeof onChangeFn === 'function') onChangeFn(url);
    const urlInput = picker ? picker.querySelector('.ip-url-pane input') : null;
    if (urlInput) urlInput.value = url;
    refreshPickerStatus(id, url);
    switchImgPickerTab(id, 'url');
  }
}

async function handleImgPickerDrop(event, id, onChangeFn) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const picker = document.querySelector(\`[data-picker="\${id}"]\`);
  const statusEl = picker ? picker.querySelector('.ip-upload-status') : null;
  const url = await uploadHomepageImage(file, statusEl);
  if (url) {
    if (typeof onChangeFn === 'function') onChangeFn(url);
    const urlInput = picker ? picker.querySelector('.ip-url-pane input') : null;
    if (urlInput) urlInput.value = url;
    refreshPickerStatus(id, url);
    switchImgPickerTab(id, 'url');
  }
}

// ── Grain Vendors ─────────────────────────────────────────────────────────────
function renderGrainVendors() {
  const el = document.getElementById('grainVendorList');
  el.innerHTML = '';
  cfg.grainVendors.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100';
    // Count products for this vendor in catalog
    const prodCount = allCatalog.filter(p => p.vendor === v.vendor).length;
    const catalogBadge = prodCount ? \`<span class="ml-1 text-xs text-green-600 bg-green-50 rounded-full px-2 py-0.5">\${prodCount} in catalog</span>\` : \`<span class="ml-1 text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">not in catalog</span>\`;
    row.innerHTML = \`
      <div class="flex-1 grid grid-cols-1 gap-2">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-gray-500 font-medium block mb-0.5">Vendor name \${catalogBadge}</label>
            <input type="text" value="\${esc(v.vendor)}" placeholder="e.g. Nutrena"
              class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
              onchange="cfg.grainVendors[\${i}].vendor=this.value; renderGrainVendors()"/>
          </div>
          <div>
            <label class="text-xs text-gray-500 font-medium block mb-0.5">Subtitle tag line</label>
            <input type="text" value="\${esc(v.tag)}" placeholder="e.g. SafeChoice · ProForce"
              class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
              onchange="cfg.grainVendors[\${i}].tag=this.value"/>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-500 font-medium block mb-0.5">Card background image</label>
          \${imgPickerHTML(\`gv-img-\${i}\`, v.imgUrl||'', \`cfg.grainVendors[\${i}].imgUrl=url\`)}
        </div>
      </div>
      <button onclick="removeGrainVendor(\${i})" class="ml-1 mt-1 w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 flex-shrink-0 transition-colors" title="Remove">
        <i class="fas fa-trash text-xs"></i>
      </button>
    \`;
    el.appendChild(row);
  });
  document.getElementById('grainCount').textContent = cfg.grainVendors.length + ' vendors';
}
function addVendorCard() {
  // Suggest first catalog vendor not already in list
  const existing = cfg.grainVendors.map(v => v.vendor);
  const suggestion = allVendors.find(v => !existing.includes(v)) || '';
  cfg.grainVendors.push({vendor: suggestion, tag: '', color: '#f5f5f5', logoUrl: '', imgUrl: ''});
  renderGrainVendors();
}
function removeGrainVendor(i) {
  cfg.grainVendors.splice(i, 1);
  renderGrainVendors();
}

// ── Hay lists ─────────────────────────────────────────────────────────────────
function renderHayList(elId, arr) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  arr.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    row.innerHTML = \`
      <input type="text" value="\${esc(item)}" placeholder="Hay type name"
        class="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
        onchange="\${elId==='hay3List'?'cfg.hay3':'cfg.hay2'}[\${i}]=this.value"/>
      <button onclick="removeHayItem('\${elId}',\${i})" class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors flex-shrink-0">
        <i class="fas fa-trash text-xs"></i>
      </button>
    \`;
    el.appendChild(row);
  });
}
function addHayItem(elId) {
  if (elId === 'hay3List') cfg.hay3.push('');
  else cfg.hay2.push('');
  renderHayList(elId, elId==='hay3List' ? cfg.hay3 : cfg.hay2);
}
function removeHayItem(elId, i) {
  if (elId === 'hay3List') cfg.hay3.splice(i,1);
  else cfg.hay2.splice(i,1);
  renderHayList(elId, elId==='hay3List' ? cfg.hay3 : cfg.hay2);
}

// ── Shavings ──────────────────────────────────────────────────────────────────
function toggleShavingsMode() {
  const on = document.getElementById('shavingsCatalogToggle').checked;
  cfg.shavingsCatalog = on;
  document.getElementById('shavingsCatalogMode').classList.toggle('hidden', !on);
  document.getElementById('shavingsManualMode').classList.toggle('hidden', on);
  const tog = document.getElementById('shavingsCatalogToggle').nextElementSibling;
  tog.style.background = on ? '#1B2A4A' : '';
  if (on) renderShavingsCatalogPreview();
}
function renderShavingsCatalogPreview() {
  const items = allCatalog.filter(p => p.category === 'Shavings & Bedding');
  const el = document.getElementById('shavingsCatalogPreview');
  el.innerHTML = items.length
    ? items.map(p => \`<div class="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5"><i class="fas fa-box text-xs text-amber-400"></i> \${esc(p.name)}</div>\`).join('')
    : '<div class="text-amber-600 text-xs col-span-2">No Shavings & Bedding products found in catalog yet.</div>';
}
function renderShavings() {
  const el = document.getElementById('shavingsList');
  el.innerHTML = '';
  cfg.shavings.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 items-start';
    row.innerHTML = \`
      <div class="col-span-3">
        <label class="text-xs text-gray-500 block mb-0.5">Product name</label>
        <input type="text" value="\${esc(s.name)}" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
          onchange="cfg.shavings[\${i}].name=this.value"/>
      </div>
      <div class="col-span-7">
        <label class="text-xs text-gray-500 block mb-0.5">Description</label>
        <input type="text" value="\${esc(s.desc)}" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
          onchange="cfg.shavings[\${i}].desc=this.value"/>
      </div>
      <div class="col-span-1">
        <label class="text-xs text-gray-500 block mb-0.5">FA Icon</label>
        <input type="text" value="\${esc(s.icon||'fa-box')}" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
          onchange="cfg.shavings[\${i}].icon=this.value"/>
      </div>
      <div class="col-span-1 flex items-end justify-end pb-1">
        <button onclick="removeShaving(\${i})" class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors">
          <i class="fas fa-trash text-xs"></i>
        </button>
      </div>
    \`;
    el.appendChild(row);
  });
}
function addShavingsItem() {
  cfg.shavings.push({name:'', desc:'', icon:'fa-box'});
  renderShavings();
}
function removeShaving(i) {
  cfg.shavings.splice(i,1);
  renderShavings();
}

// ── Supplements ───────────────────────────────────────────────────────────────
function toggleSuppsMode() {
  const on = document.getElementById('suppsCatalogToggle').checked;
  cfg.suppsCatalog = on;
  document.getElementById('suppsCatalogMode').classList.toggle('hidden', !on);
  document.getElementById('suppsManualMode').classList.toggle('hidden', on);
  const tog = document.getElementById('suppsCatalogToggle').nextElementSibling;
  tog.style.background = on ? '#6D28D9' : '';
  if (on) renderSuppsCatalogPreview();
}
function renderSuppsCatalogPreview() {
  const SUPP_CATS = ['Supplements','Gut Health','Electrolytes','Psyllium Supplements'];
  const items = allCatalog.filter(p => SUPP_CATS.includes(p.category));
  const max = parseInt(document.getElementById('suppsMaxCount').value) || 12;
  const el = document.getElementById('suppsCatalogPreview');
  el.innerHTML = items.slice(0, max).map(p => \`<div class="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5"><i class="fas fa-capsules text-xs text-purple-400"></i> \${esc(p.name)}<span class="text-gray-300 ml-1">· \${esc(p.category)}</span></div>\`).join('')
    || '<div class="text-amber-600 text-xs col-span-2">No supplement products found in catalog yet.</div>';
}
function renderSupps() {
  const el = document.getElementById('suppsList');
  el.innerHTML = '';
  cfg.supps.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 items-start';
    row.innerHTML = \`
      <div class="col-span-4">
        <label class="text-xs text-gray-500 block mb-0.5">Product name</label>
        <input type="text" value="\${esc(s.name)}" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
          onchange="cfg.supps[\${i}].name=this.value"/>
      </div>
      <div class="col-span-2">
        <label class="text-xs text-gray-500 block mb-0.5">Category tag</label>
        <input type="text" value="\${esc(s.cat)}" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
          onchange="cfg.supps[\${i}].cat=this.value"/>
      </div>
      <div class="col-span-5">
        <label class="text-xs text-gray-500 block mb-0.5">Description</label>
        <input type="text" value="\${esc(s.desc)}" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
          onchange="cfg.supps[\${i}].desc=this.value"/>
      </div>
      <div class="col-span-1 flex items-end justify-end pb-1">
        <button onclick="removeSupp(\${i})" class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors">
          <i class="fas fa-trash text-xs"></i>
        </button>
      </div>
    \`;
    el.appendChild(row);
  });
}
function addSuppsItem() {
  cfg.supps.push({name:'', cat:'', desc:''});
  renderSupps();
}
function removeSupp(i) {
  cfg.supps.splice(i,1);
  renderSupps();
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveAll() {
  // Collect latest field values before saving
  cfg.hayNote = document.getElementById('hayNote').value;
  cfg.shavingsNote = document.getElementById('shavingsNote').value;
  cfg.suppsMax = parseInt(document.getElementById('suppsMaxCount').value) || 12;

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  try {
    const r = await fetch('/admin/api/homepage-sections', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg)
    });
    const d = await r.json();
    if (d.ok) {
      showStatus('success', '<i class="fas fa-check-circle mr-2"></i>Saved and published to the homepage!');
    } else {
      showStatus('error', '<i class="fas fa-exclamation-circle mr-2"></i>Save failed — try again.');
    }
  } catch(e) {
    showStatus('error', '<i class="fas fa-exclamation-circle mr-2"></i>Network error: ' + e.message);
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-save"></i> Save & Publish';
}

function showStatus(type, html) {
  const el = document.getElementById('statusBar');
  el.className = 'mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ' +
    (type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200');
  el.innerHTML = html;
  el.classList.remove('hidden');
  if (type === 'success') setTimeout(() => el.classList.add('hidden'), 4000);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('DOMContentLoaded', init);
</script>
`
}

// ─── Categories & Vendors Manager ────────────────────────────────────────────
function getCatVendorHTML(): string {
  return `
<div class="p-6 max-w-5xl mx-auto" id="cv-app">

  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <i class="fas fa-tags" style="color:#C9A84C"></i> Categories &amp; Vendors
      </h1>
      <p class="text-gray-500 text-sm mt-1">
        Manage the category and vendor lists used across the product catalog and product editor.
      </p>
    </div>
    <button onclick="saveAll()" id="cv-saveBtn"
      class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
      style="background:#1B2A4A">
      <i class="fas fa-save"></i> Save Changes
    </button>
  </div>

  <!-- Status -->
  <div id="cv-status" class="hidden mb-5 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2"></div>

  <div id="cv-loading" class="flex items-center justify-center py-20 text-gray-400">
    <i class="fas fa-spinner fa-spin text-2xl mr-3"></i> Loading…
  </div>

  <div id="cv-main" class="hidden grid lg:grid-cols-2 gap-8">

    <!-- ═══ CATEGORIES ═══ -->
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style="background:#FAFBFC">
        <div>
          <div class="font-bold text-gray-900 flex items-center gap-2">
            <i class="fas fa-folder-open text-gold-400"></i> Categories
          </div>
          <div class="text-xs text-gray-400 mt-0.5">Used as the "Category" field on every product</div>
        </div>
        <span id="cv-cat-count" class="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full"></span>
      </div>

      <div class="p-5">
        <!-- Add new -->
        <div class="flex gap-2 mb-4">
          <input id="cv-new-cat" type="text" placeholder="New category name…"
            class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            onkeydown="if(event.key==='Enter') addCategory()"/>
          <button onclick="addCategory()"
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style="background:#1B2A4A">
            <i class="fas fa-plus text-xs"></i> Add
          </button>
        </div>

        <!-- Usage hint -->
        <div class="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
          <i class="fas fa-info-circle"></i>
          <span>Product counts shown below. Renaming a category will <strong>bulk-update</strong> all products using it.</span>
        </div>

        <!-- List -->
        <div id="cv-cat-list" class="space-y-2 max-h-[520px] overflow-y-auto pr-1"></div>
      </div>
    </div>

    <!-- ═══ VENDORS ═══ -->
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style="background:#FAFBFC">
        <div>
          <div class="font-bold text-gray-900 flex items-center gap-2">
            <i class="fas fa-store text-gold-400"></i> Vendors
          </div>
          <div class="text-xs text-gray-400 mt-0.5">Used as the "Vendor / Brand" field on every product</div>
        </div>
        <span id="cv-vendor-count" class="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full"></span>
      </div>

      <div class="p-5">
        <!-- Add new -->
        <div class="flex gap-2 mb-4">
          <input id="cv-new-vendor" type="text" placeholder="New vendor / brand name…"
            class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            onkeydown="if(event.key==='Enter') addVendor()"/>
          <button onclick="addVendor()"
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style="background:#1B2A4A">
            <i class="fas fa-plus text-xs"></i> Add
          </button>
        </div>

        <!-- Usage hint -->
        <div class="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
          <i class="fas fa-info-circle"></i>
          <span>Product counts shown below. Renaming a vendor will <strong>bulk-update</strong> all products using it.</span>
        </div>

        <!-- List -->
        <div id="cv-vendor-list" class="space-y-2 max-h-[520px] overflow-y-auto pr-1"></div>
      </div>
    </div>

  </div><!-- /cv-main -->

  <!-- Rename confirmation modal -->
  <div id="cv-rename-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
      <h3 class="font-bold text-gray-900 text-lg mb-2 flex items-center gap-2">
        <i class="fas fa-pencil-alt text-gold-400"></i> Rename <span id="cv-rename-type"></span>
      </h3>
      <p class="text-sm text-gray-500 mb-4">
        This will also update all <strong id="cv-rename-count">0</strong> products that use
        "<span id="cv-rename-old" class="font-semibold text-gray-800"></span>".
      </p>
      <input id="cv-rename-input" type="text"
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
        placeholder="New name…" onkeydown="if(event.key==='Enter') confirmRename()"/>
      <div class="flex gap-3 justify-end">
        <button onclick="closeRenameModal()"
          class="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
          Cancel
        </button>
        <button onclick="confirmRename()"
          class="px-4 py-2 text-sm font-semibold text-white rounded-lg"
          style="background:#1B2A4A">
          <i class="fas fa-check mr-1"></i> Rename &amp; Update Products
        </button>
      </div>
    </div>
  </div>

  <!-- Delete confirmation modal -->
  <div id="cv-delete-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
      <h3 class="font-bold text-red-700 text-lg mb-2 flex items-center gap-2">
        <i class="fas fa-trash-alt"></i> Delete <span id="cv-delete-type"></span>
      </h3>
      <p class="text-sm text-gray-600 mb-2">
        Are you sure you want to delete
        "<span id="cv-delete-name" class="font-semibold text-gray-900"></span>"?
      </p>
      <p class="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-5 flex items-start gap-2">
        <i class="fas fa-exclamation-triangle mt-0.5"></i>
        <span>
          <strong id="cv-delete-count">0</strong> products currently use this <span id="cv-delete-type2"></span>.
          Those products will keep their current value but it will no longer appear in the dropdown.
        </span>
      </p>
      <div class="flex gap-3 justify-end">
        <button onclick="closeDeleteModal()"
          class="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
          Cancel
        </button>
        <button onclick="confirmDelete()"
          class="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg">
          <i class="fas fa-trash mr-1"></i> Delete
        </button>
      </div>
    </div>
  </div>

</div>

<script>
// ── State ─────────────────────────────────────────────────────────────────────
let cvCategories = [];  // [{name, color}]
let cvVendors    = [];  // [{name, logoUrl, website}]
let cvProducts   = [];  // full catalog for counts + bulk-rename

// Rename/delete dialog state
let renameCtx = null;  // {type:'cat'|'vendor', oldName, newName, idx}
let deleteCtx = null;  // {type:'cat'|'vendor', name, idx}

// Default categories seeded from the current catalog taxonomy
const DEFAULT_CATEGORIES = [
  'Horse Feed','Hay','Hay Cubes & Pellets','Shavings & Bedding',
  'Supplements','Gut Health','Electrolytes','Psyllium Supplements',
  'Shampoo & Coat Care','Fly Sprays','Fly Control Supplements',
  'Grooming','Clippers & Tools','Leather Care','Oils','Liniments & Topicals',
];
const DEFAULT_VENDORS = [
  'Nutrena','Pro Elite','Cavalor','Red Mills','Havens',
  'Buckeye','Crypto Aero','Kent Sentinel','Absorbine','Farnam',
  'Purina','Tribute','Standlee','Manna Pro',
];

// ── Init ──────────────────────────────────────────────────────────────────────
async function cvInit() {
  // Load products for usage counts + bulk rename
  try {
    const r = await fetch('/admin/api/catalog');
    if (r.ok) { const d = await r.json(); cvProducts = d.products || []; }
  } catch(e) {}

  // Load saved lists
  try {
    const [rc, rv] = await Promise.all([
      fetch('/admin/api/categories'),
      fetch('/admin/api/vendors'),
    ]);
    if (rc.ok) { const d = await rc.json(); if (d.data) cvCategories = d.data; }
    if (rv.ok) { const d = await rv.json(); if (d.data) cvVendors = d.data; }
  } catch(e) {}

  // Seed defaults if nothing saved — merge with anything in catalog
  if (!cvCategories.length) {
    const fromCatalog = [...new Set(cvProducts.map(p => p.category).filter(Boolean))];
    const merged = [...new Set([...DEFAULT_CATEGORIES, ...fromCatalog])].sort();
    cvCategories = merged.map(name => ({ name }));
  }
  if (!cvVendors.length) {
    const fromCatalog = [...new Set(cvProducts.map(p => p.vendor).filter(Boolean))];
    const merged = [...new Set([...DEFAULT_VENDORS, ...fromCatalog])].sort();
    cvVendors = merged.map(name => ({ name }));
  }

  document.getElementById('cv-loading').classList.add('hidden');
  document.getElementById('cv-main').classList.remove('hidden');
  renderAll();
}

function renderAll() {
  renderCatList();
  renderVendorList();
}

// ── Category list ─────────────────────────────────────────────────────────────
function renderCatList() {
  const el = document.getElementById('cv-cat-list');
  const counts = {};
  cvProducts.forEach(p => { if (p.category) counts[p.category] = (counts[p.category]||0)+1; });

  el.innerHTML = cvCategories.map((cat, i) => {
    const n = counts[cat.name] || 0;
    return \`
    <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50 group hover:border-gray-300 transition-all">
      <!-- Drag handle -->
      <i class="fas fa-grip-vertical text-gray-300 text-xs cursor-grab w-3 flex-shrink-0"></i>

      <!-- Name (editable inline) -->
      <div class="flex-1 font-medium text-sm text-gray-800 truncate" title="\${esc(cat.name)}">\${esc(cat.name)}</div>

      <!-- Count badge -->
      <span class="text-xs px-2 py-0.5 rounded-full flex-shrink-0 \${n > 0 ? 'bg-navy-50 text-navy-700' : 'bg-gray-100 text-gray-400'}"
        style="\${n > 0 ? 'background:#EEF1F8;color:#1B2A4A' : ''}">
        \${n} product\${n !== 1 ? 's' : ''}
      </span>

      <!-- Actions -->
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onclick="openRenameModal('cat',\${i})"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
          title="Rename">
          <i class="fas fa-pencil-alt text-xs"></i>
        </button>
        <button onclick="openDeleteModal('cat',\${i})"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors"
          title="Delete">
          <i class="fas fa-trash text-xs"></i>
        </button>
      </div>
    </div>\`;
  }).join('') || '<div class="text-sm text-gray-400 text-center py-6">No categories yet. Add one above.</div>';

  document.getElementById('cv-cat-count').textContent = cvCategories.length + ' categories';
}

// ── Vendor list ───────────────────────────────────────────────────────────────
function renderVendorList() {
  const el = document.getElementById('cv-vendor-list');
  const counts = {};
  cvProducts.forEach(p => { if (p.vendor) counts[p.vendor] = (counts[p.vendor]||0)+1; });

  el.innerHTML = cvVendors.map((v, i) => {
    const n = counts[v.name] || 0;
    return \`
    <div class="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50 group hover:border-gray-300 transition-all">
      <!-- Drag handle -->
      <i class="fas fa-grip-vertical text-gray-300 text-xs cursor-grab w-3 flex-shrink-0"></i>

      <!-- Name -->
      <div class="flex-1 font-medium text-sm text-gray-800 truncate" title="\${esc(v.name)}">\${esc(v.name)}</div>

      <!-- Product count -->
      <span class="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
        style="\${n > 0 ? 'background:#EEF1F8;color:#1B2A4A' : 'background:#f1f5f9;color:#94a3b8'}">
        \${n} product\${n !== 1 ? 's' : ''}
      </span>

      <!-- Actions -->
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onclick="openRenameModal('vendor',\${i})"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
          title="Rename">
          <i class="fas fa-pencil-alt text-xs"></i>
        </button>
        <button onclick="openDeleteModal('vendor',\${i})"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors"
          title="Delete">
          <i class="fas fa-trash text-xs"></i>
        </button>
      </div>
    </div>\`;
  }).join('') || '<div class="text-sm text-gray-400 text-center py-6">No vendors yet. Add one above.</div>';

  document.getElementById('cv-vendor-count').textContent = cvVendors.length + ' vendors';
}

// ── Add ───────────────────────────────────────────────────────────────────────
function addCategory() {
  const inp = document.getElementById('cv-new-cat');
  const name = inp.value.trim();
  if (!name) return;
  if (cvCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    showCvStatus('error','<i class="fas fa-exclamation-circle mr-2"></i>Category "' + esc(name) + '" already exists.');
    return;
  }
  cvCategories.push({ name });
  inp.value = '';
  renderCatList();
  showCvStatus('info','<i class="fas fa-check-circle mr-2"></i>Category added. Click <strong>Save Changes</strong> to persist.');
}
function addVendor() {
  const inp = document.getElementById('cv-new-vendor');
  const name = inp.value.trim();
  if (!name) return;
  if (cvVendors.some(v => v.name.toLowerCase() === name.toLowerCase())) {
    showCvStatus('error','<i class="fas fa-exclamation-circle mr-2"></i>Vendor "' + esc(name) + '" already exists.');
    return;
  }
  cvVendors.push({ name });
  inp.value = '';
  renderVendorList();
  showCvStatus('info','<i class="fas fa-check-circle mr-2"></i>Vendor added. Click <strong>Save Changes</strong> to persist.');
}

// ── Rename modal ──────────────────────────────────────────────────────────────
function openRenameModal(type, idx) {
  const item = type === 'cat' ? cvCategories[idx] : cvVendors[idx];
  const counts = {};
  const field = type === 'cat' ? 'category' : 'vendor';
  cvProducts.forEach(p => { if (p[field]) counts[p[field]] = (counts[p[field]]||0)+1; });
  renameCtx = { type, idx, oldName: item.name };
  document.getElementById('cv-rename-type').textContent = type === 'cat' ? 'Category' : 'Vendor';
  document.getElementById('cv-rename-old').textContent = item.name;
  document.getElementById('cv-rename-count').textContent = counts[item.name] || 0;
  document.getElementById('cv-rename-input').value = item.name;
  document.getElementById('cv-rename-modal').classList.remove('hidden');
  document.getElementById('cv-rename-modal').classList.add('flex');
  setTimeout(() => document.getElementById('cv-rename-input').select(), 50);
}
function closeRenameModal() {
  document.getElementById('cv-rename-modal').classList.add('hidden');
  document.getElementById('cv-rename-modal').classList.remove('flex');
  renameCtx = null;
}
async function confirmRename() {
  if (!renameCtx) return;
  const newName = document.getElementById('cv-rename-input').value.trim();
  if (!newName || newName === renameCtx.oldName) { closeRenameModal(); return; }

  const { type, idx, oldName } = renameCtx;
  const field = type === 'cat' ? 'category' : 'vendor';

  // Update the list
  if (type === 'cat') cvCategories[idx].name = newName;
  else cvVendors[idx].name = newName;

  // Bulk-update products in memory
  let updated = 0;
  cvProducts.forEach(p => { if (p[field] === oldName) { p[field] = newName; updated++; } });

  closeRenameModal();
  renderAll();

  // Save list + bulk-update catalog
  await saveAll(true);
  if (updated > 0) {
    // Push updated catalog too
    try {
      await fetch('/admin/api/catalog', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ products: cvProducts }) });
    } catch(e) {}
    showCvStatus('success', \`<i class="fas fa-check-circle mr-2"></i>Renamed to "\${esc(newName)}" and updated \${updated} product\${updated!==1?'s':''}.\`);
  }
}

// ── Delete modal ──────────────────────────────────────────────────────────────
function openDeleteModal(type, idx) {
  const item = type === 'cat' ? cvCategories[idx] : cvVendors[idx];
  const field = type === 'cat' ? 'category' : 'vendor';
  const count = cvProducts.filter(p => p[field] === item.name).length;
  deleteCtx = { type, idx, name: item.name };
  document.getElementById('cv-delete-type').textContent = type === 'cat' ? 'Category' : 'Vendor';
  document.getElementById('cv-delete-type2').textContent = type === 'cat' ? 'category' : 'vendor';
  document.getElementById('cv-delete-name').textContent = item.name;
  document.getElementById('cv-delete-count').textContent = count;
  document.getElementById('cv-delete-modal').classList.remove('hidden');
  document.getElementById('cv-delete-modal').classList.add('flex');
}
function closeDeleteModal() {
  document.getElementById('cv-delete-modal').classList.add('hidden');
  document.getElementById('cv-delete-modal').classList.remove('flex');
  deleteCtx = null;
}
async function confirmDelete() {
  if (!deleteCtx) return;
  const { type, idx } = deleteCtx;
  if (type === 'cat') cvCategories.splice(idx, 1);
  else cvVendors.splice(idx, 1);
  closeDeleteModal();
  renderAll();
  await saveAll(true);
  showCvStatus('success','<i class="fas fa-check-circle mr-2"></i>Deleted. Products keep their existing value.');
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveAll(silent = false) {
  if (!silent) {
    const btn = document.getElementById('cv-saveBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
  }
  try {
    const [rc, rv] = await Promise.all([
      fetch('/admin/api/categories', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cvCategories) }),
      fetch('/admin/api/vendors',    { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cvVendors) }),
    ]);
    if (!silent) {
      if (rc.ok && rv.ok) {
        showCvStatus('success','<i class="fas fa-check-circle mr-2"></i>Saved! Changes will appear in the product editor immediately.');
      } else {
        showCvStatus('error','<i class="fas fa-exclamation-circle mr-2"></i>Save failed — try again.');
      }
    }
  } catch(e) {
    if (!silent) showCvStatus('error','<i class="fas fa-exclamation-circle mr-2"></i>Error: ' + e.message);
  }
  if (!silent) {
    const btn = document.getElementById('cv-saveBtn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
  }
}

function showCvStatus(type, html) {
  const el = document.getElementById('cv-status');
  const map = {
    success: 'bg-green-50 text-green-700 border border-green-200',
    error:   'bg-red-50 text-red-700 border border-red-200',
    info:    'bg-blue-50 text-blue-700 border border-blue-200',
  };
  el.className = 'mb-5 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ' + (map[type]||map.info);
  el.innerHTML = html;
  el.classList.remove('hidden');
  if (type === 'success') setTimeout(() => el.classList.add('hidden'), 5000);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('DOMContentLoaded', cvInit);
</script>
`
}

// ═══════════════════════════════════════════════════════════════════════════

function adminShell(title: string, activeTab: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — BF Admin</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy: { DEFAULT:'#1B2A4A', 50:'#EEF1F8', 600:'#2D4A7A', 700:'#1B2A4A', 800:'#0F1A30' },
            gold: { DEFAULT:'#C9A84C', 400:'#C9A84C', 500:'#A88A35' },
          },
          fontFamily: { sans: ['Inter','system-ui','sans-serif'] }
        }
      }
    }
  </script>
  <style>
    * { box-sizing:border-box; }
    body { background:#F8FAFC; font-family:'Inter',sans-serif; }
    .sidebar-link { display:flex; align-items:center; gap:10px; padding:10px 16px; border-radius:8px; font-size:13.5px; font-weight:500; color:#64748b; transition:all .2s; cursor:pointer; text-decoration:none; }
    .sidebar-link:hover { background:#EEF1F8; color:#1B2A4A; }
    .sidebar-link.active { background:#1B2A4A; color:#fff; }
    .sidebar-link.active i { color:#C9A84C; }
    .card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; padding:20px; }
    .btn-primary { background:#1B2A4A; color:#fff; padding:9px 18px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:none; display:inline-flex; align-items:center; gap:6px; transition:all .2s; text-decoration:none; }
    .btn-primary:hover { background:#2D4A7A; }
    .btn-gold { background:#C9A84C; color:#1B2A4A; padding:9px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; border:none; display:inline-flex; align-items:center; gap:6px; }
    .btn-danger { background:#FEE2E2; color:#DC2626; padding:7px 14px; border-radius:7px; font-size:12px; font-weight:600; cursor:pointer; border:none; display:inline-flex; align-items:center; gap:5px; transition:all .2s; }
    .btn-danger:hover { background:#FCA5A5; }
    .btn-secondary { background:#F1F5F9; color:#475569; padding:9px 16px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:1px solid #e2e8f0; display:inline-flex; align-items:center; gap:6px; transition:all .2s; text-decoration:none; }
    .btn-secondary:hover { background:#E2E8F0; }
    .form-input { width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:9px 13px; font-size:13px; color:#1e293b; outline:none; transition:border .2s; font-family:inherit; }
    .form-input:focus { border-color:#1B2A4A; box-shadow:0 0 0 3px rgba(27,42,74,0.08); }
    .form-label { display:block; font-size:11.5px; font-weight:600; color:#64748b; margin-bottom:5px; text-transform:uppercase; letter-spacing:.05em; }
    .badge { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
    .badge-blue { background:#EEF1F8; color:#1B2A4A; }
    .badge-green { background:#F0FFF4; color:#276749; }
    .badge-amber { background:#FBF5E6; color:#A88A35; }
    .toast { position:fixed; top:20px; right:20px; z-index:9999; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:600; display:none; align-items:center; gap:8px; box-shadow:0 4px 20px rgba(0,0,0,.15); max-width:320px; }
    .toast.show { display:flex; }
    .toast-success { background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0; }
    .toast-error   { background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; }
    .tab-btn { padding:8px 16px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:1px solid transparent; color:#64748b; transition:all .2s; background:transparent; }
    .tab-btn.active { background:#1B2A4A; color:#fff; border-color:#1B2A4A; }
    .tab-btn:not(.active):hover { background:#F1F5F9; }
    .tab-content { display:none; }
    .tab-content.active { display:block; }
    .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1000; align-items:center; justify-content:center; padding:16px; overflow-y:auto; }
    .modal-overlay.open { display:flex; }
    .modal-content { background:#fff; border-radius:16px; max-width:700px; width:100%; max-height:90vh; overflow-y:auto; }
    textarea.form-input { resize:vertical; min-height:70px; }
    select.form-input { appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; background-size:15px; padding-right:35px; }
    .chat-bubble-user { background:#1B2A4A; color:#fff; border-radius:18px 18px 4px 18px; display:inline-block; }
    .chat-bubble-bot  { background:#F0E9D8; color:#1B2A4A; border-radius:18px 18px 18px 4px; display:inline-block; }
    .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  </style>
</head>
<body>
<div class="flex h-screen overflow-hidden">

  <!-- Sidebar -->
  <aside class="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
    <div class="p-4 border-b border-gray-100">
      <div class="flex items-center gap-2 mb-0.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background:#1B2A4A">
          <i class="fas fa-horse text-sm" style="color:#C9A84C"></i>
        </div>
        <div>
          <div class="font-bold text-sm leading-tight" style="color:#1B2A4A">British Feed</div>
          <div class="text-xs text-gray-400">Admin CMS</div>
        </div>
      </div>
    </div>
    <nav class="p-3 flex-1 space-y-0.5">
      <a href="/admin"            class="sidebar-link ${activeTab==='dashboard'?'active':''}"><i class="fas fa-chart-line w-4 text-center text-sm"></i> Dashboard</a>
      <div class="px-3 pt-3 pb-1"><div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Product Catalog</div></div>
      <a href="/admin/catalog"    class="sidebar-link ${activeTab==='catalog'  ?'active':''}"><i class="fas fa-table-list w-4 text-center text-sm"></i> Catalog Manager</a>
      <a href="/admin/categories-vendors" class="sidebar-link ${activeTab==='categories-vendors'?'active':''}"><i class="fas fa-tags w-4 text-center text-sm"></i> Categories &amp; Vendors</a>
      <div class="px-3 pt-3 pb-1"><div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Site Management</div></div>
      <a href="/admin/content"    class="sidebar-link ${activeTab==='content'  ?'active':''}"><i class="fas fa-pen-to-square w-4 text-center text-sm"></i> Site Content</a>
      <a href="/admin/homepage-sections" class="sidebar-link ${activeTab==='homepage-sections'?'active':''}"><i class="fas fa-store w-4 text-center text-sm"></i> Homepage Sections</a>
      <a href="/admin/chatbot"    class="sidebar-link ${activeTab==='chatbot'  ?'active':''}"><i class="fas fa-robot w-4 text-center text-sm"></i> AI Chatbot</a>
      <a href="/admin/reviews"    class="sidebar-link ${activeTab==='reviews'  ?'active':''}"><i class="fas fa-star w-4 text-center text-sm"></i> Reviews</a>
      <a href="/admin/inquiries"  class="sidebar-link ${activeTab==='inquiries'?'active':''}"><i class="fas fa-envelope w-4 text-center text-sm"></i> Inquiries</a>
      <div class="border-t border-gray-100 my-2 mx-2"></div>
      <a href="/" target="_blank" class="sidebar-link"><i class="fas fa-external-link-alt w-4 text-center text-sm"></i> View Site</a>
      <a href="/admin/logout"     class="sidebar-link" style="color:#dc2626"><i class="fas fa-sign-out-alt w-4 text-center text-sm"></i> Logout</a>
    </nav>
    <div class="p-4 border-t border-gray-100">
      <div class="text-xs text-gray-400 text-center">v3.0 · British Feed CMS</div>
    </div>
  </aside>

  <!-- Main content -->
  <main class="flex-1 overflow-y-auto">
    ${body}
  </main>
</div>

<!-- Toast notification -->
<div id="toast" class="toast"></div>

<script>
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.className = 'toast show toast-' + type;
  t.innerHTML = (type==='success'
    ? '<i class="fas fa-check-circle"></i>'
    : '<i class="fas fa-exclamation-circle"></i>') + ' ' + msg;
  setTimeout(()=>{ t.classList.remove('show'); }, 3500);
}

async function apiGet(key) {
  try {
    const r = await fetch('/admin/api/data/' + key);
    if (!r.ok) return null;
    const d = await r.json();
    return d.data;
  } catch { return null; }
}

async function apiPut(key, data) {
  try {
    const r = await fetch('/admin/api/data/' + key, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    return r.ok;
  } catch { return false; }
}
</script>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

function loginPage(error = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Admin Login — British Feed</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet"/>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;
         background:linear-gradient(135deg,#1B2A4A 0%,#2D4A7A 50%,#1B2A4A 100%)}
    .card{background:#fff;border-radius:20px;box-shadow:0 25px 60px rgba(0,0,0,.35);padding:40px 36px;width:100%;max-width:380px}
    .logo{width:68px;height:68px;border-radius:18px;background:#1B2A4A;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
    h1{font-family:'Playfair Display',serif;font-size:1.65rem;font-weight:700;color:#1B2A4A;text-align:center;margin-bottom:4px}
    .sub{color:#94a3b8;font-size:13px;text-align:center;margin-bottom:28px}
    label{display:block;font-size:11.5px;font-weight:600;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
    .input-wrap{position:relative;margin-bottom:20px}
    input[type=password]{width:100%;border:1.5px solid #e2e8f0;border-radius:10px;padding:11px 42px 11px 14px;font-size:14px;color:#1e293b;outline:none;transition:border .2s;font-family:inherit}
    input[type=password]:focus{border-color:#1B2A4A;box-shadow:0 0 0 3px rgba(27,42,74,0.1)}
    .eye-btn{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#94a3b8;font-size:14px}
    .btn{width:100%;background:#1B2A4A;color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;transition:background .2s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px}
    .btn:hover{background:#2D4A7A}
    .error{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;padding:11px 14px;border-radius:10px;font-size:13px;margin-bottom:18px;display:flex;align-items:center;gap:8px}
    .hint{text-align:center;margin-top:18px;font-size:12px;color:#94a3b8}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <i class="fas fa-horse fa-2x" style="color:#C9A84C"></i>
    </div>
    <h1>British Feed</h1>
    <div class="sub">Admin Panel — Team Access Only</div>
    ${error ? `<div class="error"><i class="fas fa-exclamation-circle"></i>${error}</div>` : ''}
    <form method="POST" action="/admin/login">
      <label for="pw">Password</label>
      <div class="input-wrap">
        <input type="password" id="pw" name="password" placeholder="Enter admin password" autofocus autocomplete="current-password"/>
        <button type="button" class="eye-btn" onclick="togglePw()" id="eye-btn">
          <i class="fas fa-eye" id="eye-icon"></i>
        </button>
      </div>
      <button type="submit" class="btn">
        <i class="fas fa-sign-in-alt"></i> Sign In
      </button>
    </form>
    <div class="hint">Default password: BritishFeed2025! · Set ADMIN_PASSWORD env var to change</div>
  </div>
  <script>
    function togglePw() {
      const input = document.getElementById('pw');
      const icon = document.getElementById('eye-icon');
      if (input.type === 'password') { input.type = 'text'; icon.className = 'fas fa-eye-slash'; }
      else { input.type = 'password'; icon.className = 'fas fa-eye'; }
    }
  </script>
</body>
</html>`
}
