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

  <!-- Quick actions -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <a href="/admin/products" class="card hover:shadow-md transition-all group cursor-pointer block">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#EEF1F8">
          <i class="fas fa-boxes-stacked text-navy group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">Manage Products</div>
          <div class="text-xs text-gray-400">Add, edit, reorder</div>
        </div>
      </div>
      <div class="text-xs text-gray-500">${productCount} products across ${brandCount} brands</div>
    </a>
    <a href="/admin/chatbot" class="card hover:shadow-md transition-all group cursor-pointer block">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#F0FFF4">
          <i class="fas fa-robot text-green-600 group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">Train AI Chatbot</div>
          <div class="text-xs text-gray-400">Knowledge base & prompts</div>
        </div>
      </div>
      <div class="text-xs text-gray-500">${kbCount} knowledge entries</div>
    </a>
    <a href="/admin/content" class="card hover:shadow-md transition-all group cursor-pointer block">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#FBF5E6">
          <i class="fas fa-pen-to-square" style="color:#C9A84C" class="group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">Edit Site Content</div>
          <div class="text-xs text-gray-400">Hero, About, Services</div>
        </div>
      </div>
      <div class="text-xs text-gray-500">Update any page text or image</div>
    </a>
    <a href="/admin/inquiries" class="card hover:shadow-md transition-all group cursor-pointer block">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#FEF2F2">
          <i class="fas fa-envelope text-red-500 group-hover:scale-110 transition-transform"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-800 text-sm">Customer Inquiries</div>
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
        <div class="text-yellow-300 font-semibold mb-1">1. Add Products</div>
        <div class="text-blue-100 text-xs">Go to Products → click "Add Brand" or "Add Product" to populate the catalog customers see</div>
      </div>
      <div class="bg-white bg-opacity-10 rounded-xl p-4">
        <div class="text-yellow-300 font-semibold mb-1">2. Train the Chatbot</div>
        <div class="text-blue-100 text-xs">Go to AI Chatbot → add Q&A pairs, custom rules, or test the bot before publishing</div>
      </div>
      <div class="bg-white bg-opacity-10 rounded-xl p-4">
        <div class="text-yellow-300 font-semibold mb-1">3. Update Site Content</div>
        <div class="text-blue-100 text-xs">Go to Site Content → edit hero headline, about text, services, team bios, and more</div>
      </div>
    </div>
  </div>
</div>
`))
})

// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/products', requireAuth, async (c) => {
  return c.html(adminShell('Products', 'products', `
<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Product Catalog</h1>
      <p class="text-gray-500 text-sm mt-1">Manage all brands, products, descriptions and images</p>
    </div>
    <div class="flex gap-2">
      <button onclick="openAddBrand()" class="btn-secondary"><i class="fas fa-layer-group"></i> Add Brand</button>
      <button onclick="openAddProduct()" class="btn-primary"><i class="fas fa-plus"></i> Add Product</button>
    </div>
  </div>

  <!-- Search & filter bar -->
  <div class="card mb-5 flex flex-wrap gap-3 items-center">
    <div class="relative flex-1 min-w-48">
      <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
      <input type="text" id="prod-search" placeholder="Search products…" class="form-input pl-9" oninput="filterProducts()"/>
    </div>
    <select id="prod-filter" class="form-input w-40" onchange="filterProducts()">
      <option value="">All Categories</option>
      <option value="grain">Grain / Feed</option>
      <option value="hay">Hay</option>
      <option value="shavings">Shavings / Bedding</option>
      <option value="supplement">Supplements</option>
      <option value="poultry">Poultry</option>
    </select>
    <div class="text-sm text-gray-500" id="prod-count">Loading…</div>
  </div>

  <!-- Products list -->
  <div id="brands-container">
    <div class="text-center py-12 text-gray-400">
      <i class="fas fa-spinner fa-spin text-3xl mb-3 block"></i>
      Loading products…
    </div>
  </div>
</div>

<!-- Add/Edit Brand Modal -->
<div id="brand-modal" class="modal-overlay">
  <div class="modal-content max-w-lg p-6">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-lg font-bold text-gray-800" id="brand-modal-title">Add Brand</h2>
      <button onclick="closeBrandModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
    </div>
    <input type="hidden" id="brand-edit-index" value=""/>
    <div class="space-y-4">
      <div>
        <label class="form-label">Brand Name *</label>
        <input id="brand-name" class="form-input" placeholder="e.g. Nutrena, Pro Elite, Cavalor"/>
      </div>
      <div>
        <label class="form-label">Category *</label>
        <select id="brand-category" class="form-input">
          <option value="grain">Grain / Feed</option>
          <option value="hay">Hay</option>
          <option value="shavings">Shavings / Bedding</option>
          <option value="supplement">Supplements</option>
          <option value="poultry">Poultry</option>
        </select>
      </div>
      <div>
        <label class="form-label">Brand Description</label>
        <textarea id="brand-desc" class="form-input" rows="3" placeholder="Brief description shown on the brand card…"></textarea>
      </div>
      <div>
        <label class="form-label">Brand Logo / Image URL</label>
        <input id="brand-image" class="form-input" placeholder="https://…"/>
        <p class="text-xs text-gray-400 mt-1">Paste a direct image URL. Leave blank to use an icon placeholder.</p>
      </div>
      <div>
        <label class="form-label">Color Theme</label>
        <select id="brand-color" class="form-input">
          <option value="navy">Navy Blue</option>
          <option value="green">Forest Green</option>
          <option value="amber">Amber / Gold</option>
          <option value="red">Red</option>
          <option value="purple">Purple</option>
        </select>
      </div>
    </div>
    <div class="flex justify-end gap-3 mt-6">
      <button onclick="closeBrandModal()" class="btn-secondary">Cancel</button>
      <button onclick="saveBrand()" class="btn-primary"><i class="fas fa-save"></i> Save Brand</button>
    </div>
  </div>
</div>

<!-- Add/Edit Product Modal -->
<div id="product-modal" class="modal-overlay">
  <div class="modal-content max-w-2xl p-6">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-lg font-bold text-gray-800" id="product-modal-title">Add Product</h2>
      <button onclick="closeProductModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
    </div>
    <input type="hidden" id="product-edit-brand" value=""/>
    <input type="hidden" id="product-edit-index" value=""/>
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2">
        <label class="form-label">Product Name *</label>
        <input id="product-name" class="form-input" placeholder="e.g. SafeChoice Senior"/>
      </div>
      <div>
        <label class="form-label">Brand *</label>
        <select id="product-brand" class="form-input">
          <option value="">Select brand…</option>
        </select>
      </div>
      <div>
        <label class="form-label">Tags (comma separated)</label>
        <input id="product-tags" class="form-input" placeholder="Senior, Performance, Low-Starch"/>
      </div>
      <div class="col-span-2">
        <label class="form-label">Short Description (shown on card)</label>
        <textarea id="product-short-desc" class="form-input" rows="2" placeholder="One-line summary shown on the product card…"></textarea>
      </div>
      <div class="col-span-2">
        <label class="form-label">Full Description (shown in detail view)</label>
        <textarea id="product-full-desc" class="form-input" rows="4" placeholder="Complete product description with benefits, ingredients, suitable for…"></textarea>
      </div>
      <div>
        <label class="form-label">Product Image URL</label>
        <input id="product-image" class="form-input" placeholder="https://…"/>
      </div>
      <div>
        <label class="form-label">Price / Size Info</label>
        <input id="product-price" class="form-input" placeholder="e.g. $28 / 50 lb bag"/>
      </div>
      <div>
        <label class="form-label">Protein %</label>
        <input id="product-protein" class="form-input" placeholder="e.g. 14%"/>
      </div>
      <div>
        <label class="form-label">Fat %</label>
        <input id="product-fat" class="form-input" placeholder="e.g. 8%"/>
      </div>
      <div>
        <label class="form-label">Fiber %</label>
        <input id="product-fiber" class="form-input" placeholder="e.g. 15%"/>
      </div>
      <div>
        <label class="form-label">Best For</label>
        <input id="product-best-for" class="form-input" placeholder="e.g. Senior horses, Hard keepers"/>
      </div>
      <div class="col-span-2">
        <label class="form-label">Key Features (one per line)</label>
        <textarea id="product-features" class="form-input" rows="3" placeholder="Controlled starch&#10;High-fat formula&#10;Digestive Shield"></textarea>
      </div>
      <div class="col-span-2 flex items-center gap-2">
        <input type="checkbox" id="product-featured" class="w-4 h-4"/>
        <label for="product-featured" class="text-sm text-gray-700 font-medium">Mark as Featured Product</label>
      </div>
      <div class="col-span-2 flex items-center gap-2">
        <input type="checkbox" id="product-instock" class="w-4 h-4" checked/>
        <label for="product-instock" class="text-sm text-gray-700 font-medium">In Stock</label>
      </div>
    </div>
    <div class="flex justify-end gap-3 mt-6">
      <button onclick="closeProductModal()" class="btn-secondary">Cancel</button>
      <button onclick="saveProduct()" class="btn-primary"><i class="fas fa-save"></i> Save Product</button>
    </div>
  </div>
</div>

<script>
let allProducts = [];

async function loadProducts() {
  allProducts = await apiGet('products') || [];
  renderProducts(allProducts);
  populateBrandDropdown();
}

function populateBrandDropdown() {
  const sel = document.getElementById('product-brand');
  sel.innerHTML = '<option value="">Select brand…</option>' +
    allProducts.map((b,i) => \`<option value="\${i}">\${b.name}</option>\`).join('');
}

function renderProducts(data) {
  const container = document.getElementById('brands-container');
  const search = (document.getElementById('prod-search')?.value||'').toLowerCase();
  const cat = document.getElementById('prod-filter')?.value||'';
  
  let totalProds = 0;
  let html = '';
  
  data.forEach((brand, bi) => {
    if (cat && brand.category !== cat) return;
    let items = brand.items || [];
    if (search) items = items.filter(p => 
      p.name?.toLowerCase().includes(search) || 
      p.description?.toLowerCase().includes(search) ||
      p.fullDesc?.toLowerCase().includes(search)
    );
    if (search && items.length === 0 && !brand.name?.toLowerCase().includes(search)) return;
    totalProds += items.length;
    
    html += \`
    <div class="card mb-4" id="brand-\${bi}">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm" 
               style="background:\${colorMap(brand.color||'navy')}">
            \${brand.name?.[0]||'?'}
          </div>
          <div>
            <div class="font-bold text-gray-800">\${brand.name}</div>
            <div class="text-xs text-gray-400">\${catLabel(brand.category)} · \${items.length} products</div>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="openAddProduct(\${bi})" class="btn-secondary text-xs py-1.5 px-3">
            <i class="fas fa-plus"></i> Add Product
          </button>
          <button onclick="openEditBrand(\${bi})" class="btn-secondary text-xs py-1.5 px-3">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button onclick="deleteBrand(\${bi})" class="btn-danger text-xs">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      <div class="space-y-2">
        \${items.map((prod, pi) => \`
        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
          \${prod.image ? \`<img src="\${prod.image}" class="w-12 h-12 object-cover rounded-lg flex-shrink-0" onerror="this.style.display='none'"/>\` 
            : \`<div class="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 flex-shrink-0"><i class="fas fa-box"></i></div>\`}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-sm text-gray-800">\${prod.name}</span>
              \${prod.featured ? '<span class="badge badge-amber text-xs">★ Featured</span>' : ''}
              \${prod.inStock === false ? '<span class="badge" style="background:#FEE2E2;color:#DC2626">Out of Stock</span>' : ''}
              \${(prod.tags||[]).slice(0,3).map((t:string)=>\`<span class="badge badge-blue text-xs">\${t}</span>\`).join('')}
            </div>
            <div class="text-xs text-gray-500 truncate mt-0.5">\${prod.description||prod.shortDesc||''}</div>
            \${prod.price ? \`<div class="text-xs font-medium mt-0.5" style="color:#C9A84C">\${prod.price}</div>\` : ''}
          </div>
          <div class="flex gap-1.5 flex-shrink-0">
            <button onclick="openEditProduct(\${bi},\${pi})" class="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 text-xs flex items-center justify-center" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteProduct(\${bi},\${pi})" class="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-xs flex items-center justify-center" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        \`).join('')}
        \${items.length === 0 ? \`<div class="text-center py-4 text-gray-400 text-sm">No products yet — <button onclick="openAddProduct(\${bi})" class="text-blue-500 hover:underline">add one</button></div>\` : ''}
      </div>
    </div>\`;
  });
  
  document.getElementById('prod-count').textContent = \`\${totalProds} products\`;
  container.innerHTML = html || '<div class="text-center py-12 text-gray-400"><i class="fas fa-search text-3xl mb-3 block"></i>No results found</div>';
}

function colorMap(c) {
  return {navy:'#1B2A4A',green:'#276749',amber:'#C9A84C',red:'#DC2626',purple:'#6B3FA0'}[c]||'#1B2A4A';
}
function catLabel(c) {
  return {grain:'Grain/Feed',hay:'Hay',shavings:'Shavings',supplement:'Supplements',poultry:'Poultry'}[c]||c||'General';
}

function filterProducts() { renderProducts(allProducts); }

// Brand modal
function openAddBrand() {
  document.getElementById('brand-edit-index').value = '';
  document.getElementById('brand-modal-title').textContent = 'Add Brand';
  document.getElementById('brand-name').value = '';
  document.getElementById('brand-category').value = 'grain';
  document.getElementById('brand-desc').value = '';
  document.getElementById('brand-image').value = '';
  document.getElementById('brand-color').value = 'navy';
  document.getElementById('brand-modal').classList.add('open');
}
function openEditBrand(bi) {
  const brand = allProducts[bi];
  document.getElementById('brand-edit-index').value = bi;
  document.getElementById('brand-modal-title').textContent = 'Edit Brand: ' + brand.name;
  document.getElementById('brand-name').value = brand.name||'';
  document.getElementById('brand-category').value = brand.category||'grain';
  document.getElementById('brand-desc').value = brand.description||'';
  document.getElementById('brand-image').value = brand.image||'';
  document.getElementById('brand-color').value = brand.color||'navy';
  document.getElementById('brand-modal').classList.add('open');
}
function closeBrandModal() { document.getElementById('brand-modal').classList.remove('open'); }

async function saveBrand() {
  const idx = document.getElementById('brand-edit-index').value;
  const brand = {
    name: document.getElementById('brand-name').value.trim(),
    category: document.getElementById('brand-category').value,
    description: document.getElementById('brand-desc').value.trim(),
    image: document.getElementById('brand-image').value.trim(),
    color: document.getElementById('brand-color').value,
    items: []
  };
  if (!brand.name) { showToast('Brand name is required','error'); return; }
  
  if (idx === '') {
    allProducts.push(brand);
  } else {
    brand.items = allProducts[idx].items || [];
    allProducts[idx] = brand;
  }
  
  const ok = await apiPut('products', allProducts);
  if (ok) { showToast('Brand saved!'); closeBrandModal(); renderProducts(allProducts); populateBrandDropdown(); }
  else showToast('Save failed','error');
}

async function deleteBrand(bi) {
  if (!confirm(\`Delete brand "\${allProducts[bi].name}" and all its products?\`)) return;
  allProducts.splice(bi, 1);
  await apiPut('products', allProducts);
  showToast('Brand deleted');
  renderProducts(allProducts);
  populateBrandDropdown();
}

// Product modal
function openAddProduct(brandIndex) {
  document.getElementById('product-edit-brand').value = brandIndex ?? '';
  document.getElementById('product-edit-index').value = '';
  document.getElementById('product-modal-title').textContent = 'Add Product';
  clearProductForm();
  if (brandIndex !== undefined) document.getElementById('product-brand').value = brandIndex;
  document.getElementById('product-modal').classList.add('open');
}
function openEditProduct(bi, pi) {
  const prod = allProducts[bi].items[pi];
  document.getElementById('product-edit-brand').value = bi;
  document.getElementById('product-edit-index').value = pi;
  document.getElementById('product-modal-title').textContent = 'Edit Product: ' + prod.name;
  document.getElementById('product-brand').value = bi;
  document.getElementById('product-name').value = prod.name||'';
  document.getElementById('product-tags').value = (prod.tags||[]).join(', ');
  document.getElementById('product-short-desc').value = prod.description||prod.shortDesc||'';
  document.getElementById('product-full-desc').value = prod.fullDesc||prod.fullDescription||'';
  document.getElementById('product-image').value = prod.image||'';
  document.getElementById('product-price').value = prod.price||'';
  document.getElementById('product-protein').value = prod.protein||'';
  document.getElementById('product-fat').value = prod.fat||'';
  document.getElementById('product-fiber').value = prod.fiber||'';
  document.getElementById('product-best-for').value = prod.bestFor||prod['best-for']||'';
  document.getElementById('product-features').value = (prod.features||prod.highlights||[]).join('\\n');
  document.getElementById('product-featured').checked = !!prod.featured;
  document.getElementById('product-instock').checked = prod.inStock !== false;
  document.getElementById('product-modal').classList.add('open');
}
function closeProductModal() { document.getElementById('product-modal').classList.remove('open'); }
function clearProductForm() {
  ['product-name','product-tags','product-short-desc','product-full-desc','product-image',
   'product-price','product-protein','product-fat','product-fiber','product-best-for','product-features'
  ].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('product-featured').checked = false;
  document.getElementById('product-instock').checked = true;
}

async function saveProduct() {
  const bi = document.getElementById('product-brand').value;
  const pi = document.getElementById('product-edit-index').value;
  if (bi === '') { showToast('Please select a brand','error'); return; }
  
  const prod = {
    name: document.getElementById('product-name').value.trim(),
    tags: document.getElementById('product-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    description: document.getElementById('product-short-desc').value.trim(),
    fullDesc: document.getElementById('product-full-desc').value.trim(),
    image: document.getElementById('product-image').value.trim(),
    price: document.getElementById('product-price').value.trim(),
    protein: document.getElementById('product-protein').value.trim(),
    fat: document.getElementById('product-fat').value.trim(),
    fiber: document.getElementById('product-fiber').value.trim(),
    bestFor: document.getElementById('product-best-for').value.trim(),
    features: document.getElementById('product-features').value.split('\\n').map(l=>l.trim()).filter(Boolean),
    featured: document.getElementById('product-featured').checked,
    inStock: document.getElementById('product-instock').checked,
  };
  if (!prod.name) { showToast('Product name is required','error'); return; }
  
  if (!allProducts[bi].items) allProducts[bi].items = [];
  if (pi === '') {
    allProducts[bi].items.push(prod);
  } else {
    allProducts[bi].items[pi] = prod;
  }
  
  const ok = await apiPut('products', allProducts);
  if (ok) { showToast('Product saved!'); closeProductModal(); renderProducts(allProducts); }
  else showToast('Save failed','error');
}

async function deleteProduct(bi, pi) {
  if (!confirm('Delete this product?')) return;
  allProducts[bi].items.splice(pi, 1);
  await apiPut('products', allProducts);
  showToast('Product deleted');
  renderProducts(allProducts);
}

loadProducts();
</script>
`))
})

// ═══════════════════════════════════════════════════════════════════════════
//  SITE CONTENT EDITOR
// ═══════════════════════════════════════════════════════════════════════════

admin.get('/content', requireAuth, async (c) => {
  return c.html(adminShell('Site Content', 'content', `
<div class="p-6 max-w-5xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Site Content Editor</h1>
      <p class="text-gray-500 text-sm mt-1">Edit all text and images displayed on your public website</p>
    </div>
    <button onclick="saveAllContent()" class="btn-primary"><i class="fas fa-save"></i> Save All Changes</button>
  </div>

  <!-- Tab buttons -->
  <div class="flex gap-2 mb-5 flex-wrap">
    <button class="tab-btn active" data-tab="hero" onclick="switchTab(this,'hero')">Hero Section</button>
    <button class="tab-btn" data-tab="about" onclick="switchTab(this,'about')">About</button>
    <button class="tab-btn" data-tab="services" onclick="switchTab(this,'services')">Services</button>
    <button class="tab-btn" data-tab="team" onclick="switchTab(this,'team')">Team</button>
    <button class="tab-btn" data-tab="contact" onclick="switchTab(this,'contact')">Contact Info</button>
    <button class="tab-btn" data-tab="seo" onclick="switchTab(this,'seo')">SEO</button>
  </div>

  <!-- Hero Tab -->
  <div id="tab-hero" class="tab-content active card space-y-4">
    <h2 class="font-semibold text-gray-800 border-b pb-2">Hero Section</h2>
    <div>
      <label class="form-label">Main Headline</label>
      <input id="c-hero-headline" class="form-input" placeholder="Premium Horse Feed & Supplies…"/>
    </div>
    <div>
      <label class="form-label">Sub-headline</label>
      <input id="c-hero-subheadline" class="form-input" placeholder="Wellington & Loxahatchee's trusted source…"/>
    </div>
    <div>
      <label class="form-label">Hero Description</label>
      <textarea id="c-hero-desc" class="form-input" rows="3" placeholder="Supporting text below headline…"></textarea>
    </div>
    <div>
      <label class="form-label">CTA Button 1 Text</label>
      <input id="c-cta1" class="form-input" placeholder="Shop Feed & Supplies"/>
    </div>
    <div>
      <label class="form-label">CTA Button 2 Text</label>
      <input id="c-cta2" class="form-input" placeholder="Find My Horse's Feed"/>
    </div>
    <div>
      <label class="form-label">Hero Background Image URL</label>
      <input id="c-hero-bg" class="form-input" placeholder="https://…"/>
    </div>
  </div>

  <!-- About Tab -->
  <div id="tab-about" class="tab-content card space-y-4">
    <h2 class="font-semibold text-gray-800 border-b pb-2">About Section</h2>
    <div>
      <label class="form-label">Section Heading</label>
      <input id="c-about-heading" class="form-input" placeholder="About British Feed & Supplies"/>
    </div>
    <div>
      <label class="form-label">Main Paragraph</label>
      <textarea id="c-about-para1" class="form-input" rows="4" placeholder="In 2016, Vieri Bracco purchased British Feed & Supplies…"></textarea>
    </div>
    <div>
      <label class="form-label">Second Paragraph</label>
      <textarea id="c-about-para2" class="form-input" rows="3" placeholder="Ownership changed in 2016…"></textarea>
    </div>
    <div>
      <label class="form-label">About Section Image URL</label>
      <input id="c-about-image" class="form-input" placeholder="https://…"/>
    </div>
    <div>
      <label class="form-label">Stats (shown in stat bar)</label>
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="form-label">Stat 1 Number</label>
          <input id="c-stat1-num" class="form-input" placeholder="12+"/>
        </div>
        <div>
          <label class="form-label">Stat 1 Label</label>
          <input id="c-stat1-label" class="form-input" placeholder="Years in Business"/>
        </div>
        <div></div>
        <div>
          <label class="form-label">Stat 2 Number</label>
          <input id="c-stat2-num" class="form-input" placeholder="500+"/>
        </div>
        <div>
          <label class="form-label">Stat 2 Label</label>
          <input id="c-stat2-label" class="form-input" placeholder="Happy Customers"/>
        </div>
        <div></div>
        <div>
          <label class="form-label">Stat 3 Number</label>
          <input id="c-stat3-num" class="form-input" placeholder="50+"/>
        </div>
        <div>
          <label class="form-label">Stat 3 Label</label>
          <input id="c-stat3-label" class="form-input" placeholder="Product Brands"/>
        </div>
      </div>
    </div>
  </div>

  <!-- Services Tab -->
  <div id="tab-services" class="tab-content card space-y-6">
    <h2 class="font-semibold text-gray-800 border-b pb-2">Services Section</h2>
    <p class="text-sm text-gray-500">Edit your 3 service cards shown on the website</p>
    
    ${[1,2,3].map(n => `
    <div class="bg-gray-50 rounded-xl p-4 space-y-3">
      <div class="font-medium text-gray-700 text-sm">Service ${n}</div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">Title</label>
          <input id="c-svc${n}-title" class="form-input" placeholder="Service title…"/>
        </div>
        <div>
          <label class="form-label">Icon (Font Awesome class)</label>
          <input id="c-svc${n}-icon" class="form-input" placeholder="fas fa-truck"/>
        </div>
        <div class="col-span-2">
          <label class="form-label">Description</label>
          <textarea id="c-svc${n}-desc" class="form-input" rows="2"></textarea>
        </div>
        <div>
          <label class="form-label">Detail Text</label>
          <input id="c-svc${n}-detail" class="form-input" placeholder="e.g. Min. order $150"/>
        </div>
        <div>
          <label class="form-label">Image URL</label>
          <input id="c-svc${n}-image" class="form-input" placeholder="https://…"/>
        </div>
      </div>
    </div>`).join('')}
  </div>

  <!-- Team Tab -->
  <div id="tab-team" class="tab-content card space-y-6">
    <h2 class="font-semibold text-gray-800 border-b pb-2">Team Members</h2>
    
    ${[1,2].map(n => `
    <div class="bg-gray-50 rounded-xl p-4 space-y-3">
      <div class="font-medium text-gray-700 text-sm">Team Member ${n}</div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">Name</label>
          <input id="c-team${n}-name" class="form-input" placeholder="Full name"/>
        </div>
        <div>
          <label class="form-label">Role / Title</label>
          <input id="c-team${n}-role" class="form-input" placeholder="Owner / General Manager"/>
        </div>
        <div class="col-span-2">
          <label class="form-label">Bio</label>
          <textarea id="c-team${n}-bio" class="form-input" rows="3"></textarea>
        </div>
        <div>
          <label class="form-label">Photo URL</label>
          <input id="c-team${n}-photo" class="form-input" placeholder="https://…"/>
        </div>
        <div>
          <label class="form-label">Credentials / Badge</label>
          <input id="c-team${n}-cred" class="form-input" placeholder="e.g. Certified Equine Nutritionist"/>
        </div>
      </div>
    </div>`).join('')}
  </div>

  <!-- Contact Tab -->
  <div id="tab-contact" class="tab-content card space-y-4">
    <h2 class="font-semibold text-gray-800 border-b pb-2">Contact Information</h2>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="form-label">Phone</label>
        <input id="c-phone" class="form-input" placeholder="(561) 633-6003"/>
      </div>
      <div>
        <label class="form-label">Email</label>
        <input id="c-email" class="form-input" placeholder="admin@britishfeed.com"/>
      </div>
      <div class="col-span-2">
        <label class="form-label">Store Address</label>
        <input id="c-address" class="form-input" placeholder="14589 Southern Blvd, Palm West Plaza, Loxahatchee Groves, FL 33470"/>
      </div>
      <div>
        <label class="form-label">Store Hours (Mon-Fri)</label>
        <input id="c-hours-wk" class="form-input" placeholder="7am – 6pm"/>
      </div>
      <div>
        <label class="form-label">Store Hours (Sat-Sun)</label>
        <input id="c-hours-wknd" class="form-input" placeholder="8am – 4pm"/>
      </div>
      <div>
        <label class="form-label">Instagram URL</label>
        <input id="c-instagram" class="form-input" placeholder="https://instagram.com/british_feed_and_supplies"/>
      </div>
      <div>
        <label class="form-label">Facebook URL</label>
        <input id="c-facebook" class="form-input" placeholder="https://facebook.com/british.feed"/>
      </div>
      <div>
        <label class="form-label">Google Maps Embed URL</label>
        <input id="c-maps-url" class="form-input" placeholder="https://maps.google.com/…"/>
      </div>
      <div>
        <label class="form-label">Delivery Min. Order</label>
        <input id="c-delivery-min" class="form-input" placeholder="$150"/>
      </div>
      <div class="col-span-2">
        <label class="form-label">Delivery Areas (comma separated)</label>
        <textarea id="c-delivery-areas" class="form-input" rows="2" placeholder="Wellington, Loxahatchee, Royal Palm Beach, Jupiter Farms…"></textarea>
      </div>
    </div>
  </div>

  <!-- SEO Tab -->
  <div id="tab-seo" class="tab-content card space-y-4">
    <h2 class="font-semibold text-gray-800 border-b pb-2">SEO & Meta</h2>
    <div>
      <label class="form-label">Page Title</label>
      <input id="c-seo-title" class="form-input" placeholder="British Feed & Supplies | Premium Horse Feed — Wellington, FL"/>
    </div>
    <div>
      <label class="form-label">Meta Description</label>
      <textarea id="c-seo-desc" class="form-input" rows="3" placeholder="British Feed & Supplies in Loxahatchee Groves, FL. Premium horse feed…"></textarea>
    </div>
    <div>
      <label class="form-label">Keywords</label>
      <input id="c-seo-keywords" class="form-input" placeholder="horse feed, Wellington FL, Nutrena, Cavalor, hay…"/>
    </div>
  </div>

  <div class="flex justify-end mt-6">
    <button onclick="saveAllContent()" class="btn-primary"><i class="fas fa-save"></i> Save All Changes</button>
  </div>
</div>

<script>
const contentFields = [
  'hero-headline','hero-subheadline','hero-desc','cta1','cta2','hero-bg',
  'about-heading','about-para1','about-para2','about-image',
  'stat1-num','stat1-label','stat2-num','stat2-label','stat3-num','stat3-label',
  'svc1-title','svc1-icon','svc1-desc','svc1-detail','svc1-image',
  'svc2-title','svc2-icon','svc2-desc','svc2-detail','svc2-image',
  'svc3-title','svc3-icon','svc3-desc','svc3-detail','svc3-image',
  'team1-name','team1-role','team1-bio','team1-photo','team1-cred',
  'team2-name','team2-role','team2-bio','team2-photo','team2-cred',
  'phone','email','address','hours-wk','hours-wknd',
  'instagram','facebook','maps-url','delivery-min','delivery-areas',
  'seo-title','seo-desc','seo-keywords'
];

async function loadContent() {
  const data = await apiGet('site_content') || {};
  contentFields.forEach(f => {
    const el = document.getElementById('c-' + f);
    if (el && data[f] !== undefined) el.value = data[f];
  });
}

async function saveAllContent() {
  const data = {};
  contentFields.forEach(f => {
    const el = document.getElementById('c-' + f);
    if (el) data[f] = el.value;
  });
  const ok = await apiPut('site_content', data);
  if (ok) showToast('Content saved successfully!');
  else showToast('Save failed — please try again','error');
}

function switchTab(btn, tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

loadContent();
</script>
`))
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
    \${(session.messages||[]).slice(0,3).map((m:any) => \`
      <div class="text-sm \${m.role==='user'?'text-navy font-medium':'text-gray-600'} mb-1">\${m.role==='user'?'Customer: ':'Bri: '}\${m.content?.slice(0,120)||''}\${m.content?.length>120?'…':''}</div>
    \`).join('')}
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

loadChatbotData();
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

loadReviews();
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

loadInquiries();
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
  // Only expose safe keys to the public
  const allowed = ['products', 'reviews', 'site_content', 'chatbot_rules']
  if (!allowed.includes(key)) return c.json({ error: 'Not found' }, 404)
  const kv = c.env?.BF_STORE
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

// Public API — catalog products (for /products page)
admin.get('/api/public/catalog', async (c) => {
  const kv = c.env?.BF_STORE
  const kvProds = await kvGet(kv, 'catalog_products', null)
  if (kvProds && Array.isArray(kvProds) && kvProds.length > 0) {
    return c.json({ products: kvProds })
  }
  return c.json({ products: [] })
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
          <label class="form-label">Category *</label>
          <select id="pm-category" class="form-input">
            <option value="Grain &amp; Feed">Grain &amp; Feed</option>
            <option value="Hay">Hay</option>
            <option value="Shavings &amp; Bedding">Shavings &amp; Bedding</option>
            <option value="Fly Prevention">Fly Prevention</option>
            <option value="Grooming">Grooming</option>
            <option value="Animal Health &amp; Supplements">Animal Health &amp; Supplements</option>
            <option value="Digestive Health">Digestive Health</option>
            <option value="Stress Relief">Stress Relief</option>
            <option value="Energy &amp; Performance">Energy &amp; Performance</option>
            <option value="First Aid &amp; Liniments">First Aid &amp; Liniments</option>
            <option value="Leather Care">Leather Care</option>
            <option value="Hoof &amp; Coat">Hoof &amp; Coat</option>
            <option value="Cavalor">Cavalor</option>
          </select>
        </div>

        <!-- Vendor -->
        <div>
          <label class="form-label">Vendor / Brand</label>
          <input id="pm-vendor" class="form-input" placeholder="e.g. Nutrena, Absorbine, Farnam"/>
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

// ── Load catalog ────────────────────────────────────────────────────────
async function loadCatalog() {
  showStatus('info', '<i class="fas fa-spinner fa-spin"></i> Loading catalog…');
  const res = await fetch('/admin/api/catalog');
  const data = await res.json();

  if (data.products && data.products.length > 0) {
    catProducts = data.products;
    initCatalog();
    showStatus('success', \`<i class="fas fa-check-circle"></i> Loaded \${catProducts.length} products.\`);
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
    (p.description||'').replace(/"/g,'""'),
    p.imageUrl||'', p.videoUrl||'',
    p.protein||'', p.fat||'', p.fiber||'',
    (p.bestFor||'').replace(/"/g,'""'),
    Array.isArray(p.features) ? p.features.join('; ').replace(/"/g,'""') : '',
    p.featured ? 'Yes' : ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => \`"\${v}"\`).join(',')).join('\n');
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
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) { showStatus('error', 'CSV file appears empty or invalid.'); return; }

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g,'').trim().toLowerCase());
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
    const escapedName = p.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

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
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) embedHtml = \`<iframe width="100%" height="180" src="https://www.youtube.com/embed/\${ytMatch[1]}" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe>\`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
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
  showProdModal();
}

function openEditProduct(id) {
  const p = catProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('prod-modal-title').textContent = 'Edit — ' + p.name;
  document.getElementById('pm-delete-btn').style.display = 'flex';
  document.getElementById('pm-id').value = p.id;
  document.getElementById('pm-name').value = p.name || '';
  document.getElementById('pm-category').value = p.category || 'Grain & Feed';
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
  document.getElementById('pm-features').value = Array.isArray(p.features) ? p.features.join('\n') : (p.features || '');
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
  document.getElementById('pm-category').value = 'Grain & Feed';
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
    .split('\n').map(s => s.trim()).filter(Boolean);

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

loadCatalog();
</script>
`
}


// ═══════════════════════════════════════════════════════════════════════════
//  SHARED LAYOUT
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
      <a href="/admin/products"   class="sidebar-link ${activeTab==='products' ?'active':''}"><i class="fas fa-boxes-stacked w-4 text-center text-sm"></i> Legacy Brands</a>
      <div class="px-3 pt-3 pb-1"><div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Site Management</div></div>
      <a href="/admin/content"    class="sidebar-link ${activeTab==='content'  ?'active':''}"><i class="fas fa-pen-to-square w-4 text-center text-sm"></i> Site Content</a>
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
