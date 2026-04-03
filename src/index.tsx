import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { admin } from './admin'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  BF_STORE: KVNamespace
  ADMIN_PASSWORD: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Mount admin panel
app.route('/admin', admin)

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './' }))

// ── AI Chatbot endpoint ──────────────────────────────────────────────────────
app.post('/api/chat', async (c) => {
  const { messages } = await c.req.json()

  const apiKey  = c.env?.OPENAI_API_KEY  || ''
  const baseURL = c.env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'
  const kv = c.env?.BF_STORE

  // Load dynamic KB and rules from KV if available
  let kbEntries: any[] = []
  let botRules: any = {}
  if (kv) {
    try {
      const kbRaw = await kv.get('chatbot_kb')
      if (kbRaw) kbEntries = JSON.parse(kbRaw)
      const rulesRaw = await kv.get('chatbot_rules')
      if (rulesRaw) botRules = JSON.parse(rulesRaw)
    } catch {}
  }

  const kbSection = kbEntries.length > 0
    ? '\n\nKNOWLEDGE BASE (use these as authoritative answers):\n' +
      kbEntries.map((e: any) => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n')
    : ''

  const toneMap: any = {
    friendly: 'friendly, warm, and helpful',
    professional: 'professional, knowledgeable, and expert',
    casual: 'casual, approachable, and conversational',
    detailed: 'detailed, technical, and thorough',
  }

  const systemPrompt = `You are ${botRules.name || 'Bri'}, the ${toneMap[botRules.tone || 'friendly']} AI assistant for British Feed & Supplies, 
a premier horse feed and livestock supply store located in Loxahatchee Groves (Wellington area), 
Palm Beach County, Florida. You help customers find the best feed, hay, and supplements for their horses.

STORE INFO:
- Address: 14589 Southern Blvd, Palm West Plaza, Loxahatchee Groves, FL 33470
- Phone: (561) 633-6003
- Owner: Vieri Bracco | General Manager: Carmine Garrett
- Store Hours: Mon–Fri 9am–6pm, Sat 9am–4pm
- Distribution Center Hours: Mon–Fri 8am–5pm, Sat 9am–4pm
- Services: Free delivery ($150 min), Nutritional visits, Certified Nutrena Farm Program

PRODUCT BRANDS WE CARRY:
GRAIN BRANDS: Nutrena (SafeChoice, ProForce, Triumph lines), Pro Elite (Performance, Senior, Grass Advantage, Growth, Starch Wise, Omega Advantage, Topline Advantage), Cavalor (Performix, Fiber Force, Strucomix Original/Senior, Pianissimo, Endurix, WholyGain, FiberGastro), Red Mills (Competition 10/12/14, Horse Care 10/12/14, Performacare Balancer, Comfort Mash), Havens (Cool Mix, Endurance, Gastro Plus, Natural Balance, Performance 14, Power Plus, Sport Muesli), Buckeye (EQ8 Performance/Senior, Cadence Ultra, Gro-N-Win, Safe N Easy line), Crypto Aero (wholefood horse feed), Kent Sentinel

HAY: Alfalfa, Timothy (1st/2nd cut), Orchard, Peanut, T/A blends, Special Reserve, Premium, Supergrass, Quebec, Twyla, Valley Green, Alberta Timothy — both 3-string (100-110 lbs) and 2-string (48-60 lbs) bales

SHAVINGS: WD Fine, WD Flake, WD Pelleted, Fast Track Blend/Fine, World Cup, Showtime Large, King Large, Baled Straw

SUPPLEMENTS: Cavalor (Hepato Liq, Bronchix Pure, Sozen, Muscle Force, Vitamino), Max-E-Glo Rice Bran, Horseshoer's Secret Hoof, Sand Clear, Vita-E & Selenium, Topline Xtreme, Kombat Boots, SandPurge Psyllium, CocoSoya, and more

RECOMMENDATION GUIDELINES:
- Competition/Show horses → Pro Elite Performance, Cavalor Performix, Red Mills Competition 14, Havens Performance 14
- Senior horses → Nutrena SafeChoice Senior, Pro Elite Senior, Buckeye EQ8 Senior, Cavalor Strucomix Senior
- Easy keepers/metabolic → Nutrena SafeChoice Special Care, Pro Elite Starch Wise, Cavalor Pianissimo
- Hard keepers/weight gain → Pro Elite Omega Advantage, Buckeye Cadence Ultra, Cavalor WholyGain, Havens Power Plus
- Young/growing horses → Pro Elite Growth, Buckeye Gro-N-Win, Nutrena SafeChoice Mare & Foal
- Digestive issues → Cavalor FiberGastro, Havens Gastro Plus, Buckeye EQ8 line, Red Mills Comfort Mash
- Endurance horses → Havens Endurance, Cavalor Endurix
- Nervous/calm needed → Cavalor Pianissimo, Havens Cool Mix
- Broodmares → Pro Elite Grass Advantage, Nutrena SafeChoice Mare & Foal, Red Mills Horse Care 14
${botRules.customPrompt ? '\n' + botRules.customPrompt : ''}
${kbSection}

Keep answers ${botRules.length === 'short' ? 'very short (1-2 sentences)' : botRules.length === 'long' ? 'detailed and complete' : 'friendly, practical, and under 120 words unless more detail is needed'}. Always end with: ${botRules.cta || 'Visit the store or call (561) 633-6003!'}`

  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    })

    const data: any = await response.json()
    // Save conversation snippet to history
    if (kv && messages.length >= 1) {
      try {
        const histRaw = await kv.get('chat_history')
        const history: any[] = histRaw ? JSON.parse(histRaw) : []
        const reply = data.choices?.[0]?.message?.content || ''
        history.push({
          date: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
          messages: [...messages, { role:'assistant', content: reply }]
        })
        // Keep only last 200 sessions
        if (history.length > 200) history.splice(0, history.length - 200)
        await kv.put('chat_history', JSON.stringify(history))
      } catch {}
    }
    return c.json({ reply: data.choices?.[0]?.message?.content || 'Sorry, I could not process that. Please call us at (561) 633-6003!' })
  } catch (e) {
    return c.json({ reply: 'Sorry, something went wrong. Please call us at (561) 633-6003 for expert help!' })
  }
})

// ── Contact form endpoint ─────────────────────────────────────────────────────
app.post('/api/contact', async (c) => {
  const kv   = c.env?.BF_STORE
  const body = await c.req.json()

  const lead = {
    ...body,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
  }

  // 1. Persist to KV
  if (kv) {
    try {
      const raw = await kv.get('contacts')
      const contacts: any[] = raw ? JSON.parse(raw) : []
      contacts.push(lead)
      await kv.put('contacts', JSON.stringify(contacts))
    } catch {}
  }

  // 2. Send notification via Web3Forms
  const name    = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown'
  const subject = lead.subject || 'General'
  const phone   = lead.phone   || 'not provided'
  const email   = lead.email   || 'not provided'
  const message = lead.message || ''

  try {
    await fetch('https://api.web3forms.com/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: '5039ba39-d0f0-4d3e-8811-3e1c911eb198',
        subject:    `🐴 New Lead: ${name} — ${subject}`,
        from_name:  'British Feed Website',
        to_email:   'inquiries@britishfeed.com',
        replyto:    email !== 'not provided' ? email : 'inquiries@britishfeed.com',
        name,
        email,
        phone,
        topic:      subject,
        message,
        date:       `${lead.date} at ${lead.time} ET`,
      }),
    })
  } catch (_) {}

  return c.json({ success: true, message: 'Thank you! We will contact you within 24 hours.' })
})

// ── Products catalog page ──────────────────────────────────────────────────────
app.get('/products', (c) => {
  return c.html(getProductsHTML())
})

// ── Printable magazine catalog ────────────────────────────────────────────────
app.get('/catalog-print', async (c) => {
  const kv = c.env?.BF_STORE
  let products: any[] = []
  // Try KV first (live admin edits), fall back to static JSON note
  if (kv) {
    try {
      const raw = await kv.get('catalog_products', 'json') as any[] | null
      if (raw && Array.isArray(raw) && raw.length > 0) products = raw
    } catch (_) {}
  }
  return c.html(getCatalogPrintHTML(products))
})

// ── Public products API (no auth — used by catalog-print page) ────────────────
app.get('/api/public/products', async (c) => {
  const kv = c.env?.BF_STORE
  if (kv) {
    try {
      const raw = await kv.get('catalog_products', 'json') as any[] | null
      if (raw && Array.isArray(raw) && raw.length > 0) {
        return c.json({ products: raw, source: 'kv' })
      }
    } catch (_) {}
  }
  return c.json({ products: [], source: 'none' })
})

// ── Favicon ────────────────────────────────────────────────────────────────────
app.get('/favicon.ico', (c) => {
  return c.redirect('/static/favicon.ico', 301)
})

// ── Main page ─────────────────────────────────────────────────────────────────
app.get('/', (c) => {
  return c.html(getHTML())
})

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>British Feed & Supplies | Premium Horse Feed — Wellington, FL</title>
  <meta name="description" content="British Feed & Supplies in Loxahatchee Groves, FL. Premium horse feed, hay, shavings and supplements for Wellington area horses. Nutrena, Cavalor, Pro Elite and more." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Nunito+Sans:wght@300;400;600;700&display=swap" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy:  { DEFAULT:'#1B2A4A', 50:'#EEF1F8', 100:'#C8D2E8', 200:'#9BAECF', 300:'#6E8AB6', 400:'#4F6FA3', 500:'#3A5A8F', 600:'#2D4A7A', 700:'#1B2A4A', 800:'#0F1A30', 900:'#080D18' },
            gold:  { DEFAULT:'#C9A84C', 50:'#FBF5E6', 100:'#F5E8BE', 200:'#EDD68A', 300:'#E3C25C', 400:'#C9A84C', 500:'#A88A35', 600:'#866D24', 700:'#6A5218' },
            cream: { DEFAULT:'#FBF7F0', dark:'#F0E9D8' },
          },
          fontFamily: {
            serif: ['Cormorant Garamond', 'Georgia', 'serif'],
            sans:  ['Nunito Sans', 'system-ui', 'sans-serif'],
          }
        }
      }
    }
  </script>
  <style>
    html { scroll-behavior: smooth; }
    .hero-bg {
      background: linear-gradient(to bottom, rgba(10,20,40,0.45) 0%, rgba(10,20,40,0.20) 40%, rgba(10,20,40,0.65) 100%),
                  url('https://sspark.genspark.ai/cfimages?u1=bjFbxr1dt1IgTwWI6rBmznGwqcE%2F6lOpH8IEb5QcqnHyruCviBPWzT9g61YEPJuZIcBLE4KEjr4WqttlRVrvu3xAfMhkq4JXTgKndw%3D%3D&u2=ElqfVS4599dVePu6&width=2560') center 40%/cover no-repeat;
      background-attachment: scroll;
    }
    @media (max-width: 767px) {
      .hero-bg {
        background-position: 70% 40%;
        background-size: cover;
      }
    }
    .hero-text-center { text-align:center; }
    @media(min-width:768px){ .hero-badge { backdrop-filter: blur(8px); } }
    /* Delivery schedule modal */
    .delivery-day { display:flex; gap:8px; margin-bottom:8px; }
    .delivery-day:last-child { margin-bottom:0; }
    .delivery-day-name { color:#C9A84C; font-weight:700; min-width:72px; flex-shrink:0; }
    #delivery-modal-overlay {
      display:none; position:fixed; inset:0; z-index:9999;
      background:rgba(0,0,0,0.6); backdrop-filter:blur(4px);
      align-items:center; justify-content:center; padding:16px;
    }
    #delivery-modal-overlay.open { display:flex; }
    #delivery-modal-box {
      background:#1B2A4A; color:#fff; border-radius:18px;
      padding:24px; width:100%; max-width:420px;
      max-height:85vh; overflow-y:auto;
      box-shadow:0 24px 80px rgba(0,0,0,0.5);
      font-size:0.85rem; line-height:1.6;
    }
    .section-divider { border-top: 2px solid #C9A84C; width: 60px; margin: 0 auto; }
    .card-hover { transition: all 0.3s ease; }
    .card-hover:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.12); }
    .product-brand-card { cursor: pointer; transition: all 0.3s ease; }
    .product-brand-card:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(27,42,74,0.15); }
    .chat-bubble-user   { background:#1B2A4A; color:#fff; border-radius:18px 18px 4px 18px; }
    .chat-bubble-bot    { background:#F0E9D8; color:#1B2A4A; border-radius:18px 18px 18px 4px; }
    .chatbot-window     { display:none; position:fixed; bottom:100px; right:24px; width:360px; max-height:520px; z-index:999; }
    .chatbot-window.open { display:flex; flex-direction:column; }
    @media(max-width:480px){ .chatbot-window { width:calc(100vw - 32px); right:16px; } }
    .nav-link { position:relative; }
    .nav-link::after { content:''; position:absolute; bottom:-2px; left:0; width:0; height:2px; background:#C9A84C; transition:width .3s; }
    .nav-link:hover::after { width:100%; }
    .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; align-items:center; justify-content:center; padding:16px; }
    .modal-overlay.open { display:flex; }
    .modal-content { background:#fff; border-radius:16px; max-width:900px; width:100%; max-height:90vh; overflow-y:auto; }
    .tag { display:inline-block; padding:2px 10px; border-radius:20px; font-size:0.72rem; font-weight:600; }
    .tag-perf  { background:#EEF1F8; color:#1B2A4A; }
    .tag-senior{ background:#FBF5E6; color:#A88A35; }
    .tag-special{ background:#F0FFF4; color:#276749; }
    .tag-all   { background:#F8F0FF; color:#6B3FA0; }
    .stars { color:#C9A84C; }
    .product-item { border-left: 3px solid #C9A84C; }
    .scroll-reveal { opacity:0; transform:translateY(24px); transition:opacity .6s ease, transform .6s ease; }
    .scroll-reveal.visible { opacity:1; transform:none; }
    .sticky-nav { position:sticky; top:0; z-index:100; backdrop-filter:blur(12px); background:rgba(27,42,74,0.95); }
  </style>
</head>
<body class="font-sans bg-cream text-navy-700 antialiased">

<!-- ═══════════════════════════ NAVIGATION ═══════════════════════════ -->
<nav class="sticky-nav shadow-lg">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16">
      <a href="#home" class="flex items-center gap-3 group">
        <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed Logo" class="h-10" onerror="this.style.display='none'" style="filter: brightness(0) invert(1);" />

      </a>
      <div class="hidden md:flex items-center gap-6 text-sm font-medium text-white/90">
        <a href="#about"    class="nav-link hover:text-gold-400 transition-colors">About</a>
        <a href="#products" class="nav-link hover:text-gold-400 transition-colors">Products</a>
        <a href="/products" class="nav-link hover:text-gold-400 transition-colors flex items-center gap-1" title="Browse our product catalog">
          <i class="fas fa-list text-gold-400 text-xs"></i>Full Catalog
        </a>
        <a href="#services" class="nav-link hover:text-gold-400 transition-colors">Services</a>
        <a href="#team"     class="nav-link hover:text-gold-400 transition-colors">Our Team</a>
        <a href="#reviews"  class="nav-link hover:text-gold-400 transition-colors">Reviews</a>
        <a href="#contact"  class="nav-link hover:text-gold-400 transition-colors">Contact</a>
        <a href="tel:5616336003" class="bg-gold-400 hover:bg-gold-500 text-navy-700 font-bold px-4 py-2 rounded-full transition-all hover:scale-105 whitespace-nowrap">
          <i class="fas fa-phone mr-1"></i> (561) 633-6003
        </a>
      </div>
      <button onclick="toggleMobileMenu()" class="md:hidden text-white p-2">
        <i class="fas fa-bars text-xl" id="menu-icon"></i>
      </button>
    </div>
  </div>
  <!-- Mobile menu -->
  <div id="mobile-menu" class="hidden md:hidden bg-navy-700 border-t border-white/10">
    <div class="px-4 py-3 space-y-2 text-sm font-medium text-white/90">
      <a href="#about"    onclick="closeMobileMenu()" class="block py-2 hover:text-gold-400">About</a>
      <a href="#products" onclick="closeMobileMenu()" class="block py-2 hover:text-gold-400">Products</a>
      <a href="/products" class="block py-2 hover:text-gold-400 flex items-center gap-2">
        <i class="fas fa-list text-xs" style="color:#C9A84C"></i>Product Catalog
      </a>
      <a href="#services" onclick="closeMobileMenu()" class="block py-2 hover:text-gold-400">Services</a>
      <a href="#team"     onclick="closeMobileMenu()" class="block py-2 hover:text-gold-400">Our Team</a>
      <a href="#reviews"  onclick="closeMobileMenu()" class="block py-2 hover:text-gold-400">Reviews</a>
      <a href="#contact"  onclick="closeMobileMenu()" class="block py-2 hover:text-gold-400">Contact</a>
      <a href="tel:5616336003" class="block bg-gold-400 text-navy-700 font-bold px-4 py-2 rounded-full text-center mt-2">
        <i class="fas fa-phone mr-1"></i> Call Us Now
      </a>
    </div>
  </div>
</nav>

<!-- ═══════════════════════════ HERO ═══════════════════════════ -->
<section id="home" class="hero-bg min-h-screen flex flex-col justify-center items-center relative overflow-hidden">
  <!-- Bottom gradient fade -->
  <div class="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-transparent to-navy-900/20 pointer-events-none"></div>
  <div class="relative w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-28 text-white hero-text-center">
    <!-- Location badge -->
    <div class="inline-flex items-center gap-2 bg-white/10 hero-badge border border-white/20 rounded-full px-4 py-1.5 mb-8">
      <div class="h-px w-8 bg-gold-400"></div>
      <span class="text-gold-300 font-semibold tracking-widest text-xs uppercase">Wellington · Loxahatchee · Palm Beach County</span>
      <div class="h-px w-8 bg-gold-400"></div>
    </div>
    <h1 class="font-serif text-5xl sm:text-7xl lg:text-8xl font-bold leading-tight mb-6 drop-shadow-2xl">
      Premium Feed<br/>
      <span class="text-gold-400">for Champions.</span>
    </h1>
    <p class="text-xl sm:text-2xl text-white/85 mb-10 leading-relaxed max-w-2xl mx-auto drop-shadow">
      Serving Wellington's equestrian community since 2012. Expert nutrition, top brands, and personalized service for horses, livestock, and pets.
    </p>
    <div class="flex flex-wrap justify-center gap-4 mb-12">
      <a href="#products" class="bg-gold-400 hover:bg-gold-500 text-navy-700 font-bold px-9 py-4 rounded-full text-lg transition-all hover:scale-105 shadow-xl">
        <i class="fas fa-search mr-2"></i>Find the Right Feed
      </a>
      <a href="#contact" class="border-2 border-white/70 hover:border-white text-white hover:bg-white/15 font-semibold px-9 py-4 rounded-full text-lg transition-all">
        <i class="fas fa-envelope mr-2"></i>Contact Us
      </a>
    </div>
    <!-- Feature pills -->
    <div class="flex flex-wrap justify-center gap-3 text-sm">
      <div class="flex items-center gap-2 bg-white/10 hero-badge border border-white/20 rounded-full px-4 py-1.5">
        <i class="fas fa-star text-gold-400"></i><span class="text-white/90">Since 2012</span>
      </div>
      <div class="flex items-center gap-2 bg-white/10 hero-badge border border-white/20 rounded-full px-4 py-1.5">
        <i class="fas fa-truck text-gold-400"></i><span class="text-white/90">Free Local Delivery</span>
      </div>
      <div class="flex items-center gap-2 bg-white/10 hero-badge border border-white/20 rounded-full px-4 py-1.5">
        <i class="fas fa-award text-gold-400"></i><span class="text-white/90">10+ Premium Brands</span>
      </div>
      <div class="flex items-center gap-2 bg-white/10 hero-badge border border-white/20 rounded-full px-4 py-1.5">
        <i class="fas fa-horse text-gold-400"></i><span class="text-white/90">Equine Nutritionists</span>
      </div>
    </div>
  </div>
  <!-- Scroll indicator -->
  <div class="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 animate-bounce">
    <i class="fas fa-chevron-down text-2xl"></i>
  </div>
</section>

<!-- ═══════════════════════════ STATS BAR ═══════════════════════════ -->
<section class="bg-navy-700 text-white py-8">
  <div class="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
    <div><div class="text-3xl font-serif font-bold text-gold-400">13+</div><div class="text-sm text-white/70 mt-1">Years Serving WPB</div></div>
    <div><div class="text-3xl font-serif font-bold text-gold-400">10+</div><div class="text-sm text-white/70 mt-1">Premium Brands</div></div>
    <div><div class="text-3xl font-serif font-bold text-gold-400">50+</div><div class="text-sm text-white/70 mt-1">Hay & Feed Options</div></div>
    <div><div class="text-3xl font-serif font-bold text-gold-400">4.8★</div><div class="text-sm text-white/70 mt-1">Google Rating</div></div>
  </div>
</section>

<!-- ═══════════════════════════ ABOUT ═══════════════════════════ -->
<section id="about" class="py-20 bg-cream">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid lg:grid-cols-2 gap-16 items-center">
      <div class="scroll-reveal">
        <div class="flex items-center gap-2 mb-3">
          <div class="h-px w-10 bg-gold-400"></div>
          <span class="text-gold-500 font-semibold text-xs tracking-widest uppercase">Our Story</span>
        </div>
        <h2 class="font-serif text-4xl lg:text-5xl font-bold text-navy-700 mb-6 leading-tight">Wellington's Most Trusted Feed Store</h2>
        <p class="text-gray-600 text-lg mb-5 leading-relaxed">
          Established in <strong>2012</strong>, British Feed & Supplies has been the go-to destination for horse owners, livestock farmers, and pet owners across Wellington, Loxahatchee, and all of Palm Beach County.
        </p>
        <p class="text-gray-600 mb-5 leading-relaxed">
          In the summer of 2016, the store underwent a complete transformation under new ownership — renovating the space and expanding the product range to better serve the growing equestrian community of South Florida.
        </p>
        <p class="text-gray-600 mb-8 leading-relaxed">
          Whether you own a competition jumper, a pleasure trail horse, a herd of goats, backyard chickens, or a beloved family dog — our knowledgeable team is here to guide you to exactly the right product.
        </p>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <i class="fas fa-trophy text-gold-400 text-2xl mb-2"></i>
            <div class="font-semibold text-navy-700">Competition Ready</div>
            <div class="text-sm text-gray-500">Premium feeds for show horses</div>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <i class="fas fa-heart text-gold-400 text-2xl mb-2"></i>
            <div class="font-semibold text-navy-700">All Animals Welcome</div>
            <div class="text-sm text-gray-500">Horses, livestock, pets & more</div>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <i class="fas fa-users text-gold-400 text-2xl mb-2"></i>
            <div class="font-semibold text-navy-700">Expert Team</div>
            <div class="text-sm text-gray-500">Trained nutritional advisors</div>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <i class="fas fa-handshake text-gold-400 text-2xl mb-2"></i>
            <div class="font-semibold text-navy-700">Community First</div>
            <div class="text-sm text-gray-500">Supporting local shelters & events</div>
          </div>
        </div>
      </div>
      <div class="scroll-reveal">
        <div class="rounded-2xl overflow-hidden shadow-2xl relative" id="story-media-wrap">
          <!-- Closing slide shown until video is ready to play -->
          <img id="story-poster" src="/static/story_closing.jpg" alt="British Feed — For Proper Care & Nutrition" class="w-full block object-cover" />
          <!-- Video hidden initially, swaps in when autoplay succeeds -->
          <video id="story-video" class="w-full block object-cover hidden" style="aspect-ratio:16/9;"
            playsinline preload="auto" loop>
            <source src="/static/commercial.mp4" type="video/mp4" />
          </video>
          <!-- Tap-to-unmute overlay shown if browser blocks audio -->
          <div id="story-unmute" class="hidden absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
            <button onclick="storyUnmute()" class="pointer-events-auto bg-black/60 hover:bg-black/80 text-white text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-2 transition-all">
              <i class="fas fa-volume-xmark"></i> Tap to unmute
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════ WHAT SETS US APART ═══════════════════════════ -->
<section class="py-16 bg-navy-700 text-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-12 scroll-reveal">
      <h2 class="font-serif text-3xl lg:text-4xl font-bold text-white mb-3">What Sets British Feed Apart</h2>
      <div class="section-divider mb-4"></div>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="bg-white/8 backdrop-blur rounded-xl p-6 border border-white/10 card-hover scroll-reveal">
        <i class="fas fa-microscope text-gold-400 text-3xl mb-4"></i>
        <h3 class="font-bold text-lg mb-2">Science-Backed Selection</h3>
        <p class="text-white/70 text-sm">Every brand we stock is rigorously vetted for nutritional quality, digestibility, and results backed by equine science.</p>
      </div>
      <div class="bg-white/8 backdrop-blur rounded-xl p-6 border border-white/10 card-hover scroll-reveal">
        <i class="fas fa-user-md text-gold-400 text-3xl mb-4"></i>
        <h3 class="font-bold text-lg mb-2">Nutritional Consultations</h3>
        <p class="text-white/70 text-sm">One-on-one barn visits from certified equine nutritionists who evaluate your horse and build a personalized feed program.</p>
      </div>
      <div class="bg-white/8 backdrop-blur rounded-xl p-6 border border-white/10 card-hover scroll-reveal">
        <i class="fas fa-truck text-gold-400 text-3xl mb-4"></i>
        <h3 class="font-bold text-lg mb-2">Free Local Delivery</h3>
        <p class="text-white/70 text-sm">We deliver to Wellington, Loxahatchee, Royal Palm Beach, Lake Worth, Jupiter Farms & surrounding areas. Free on orders $150+.</p>
      </div>
      <div class="bg-white/8 backdrop-blur rounded-xl p-6 border border-white/10 card-hover scroll-reveal">
        <i class="fas fa-certificate text-gold-400 text-3xl mb-4"></i>
        <h3 class="font-bold text-lg mb-2">Nutrena Certified Partner</h3>
        <p class="text-white/70 text-sm">Enroll in the Nutrena Farm Program and earn rewards for every bag purchased — exclusive to certified retailer locations.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════ PRODUCTS ═══════════════════════════ -->
<section id="products" class="py-20 bg-cream-dark">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-14 scroll-reveal">
      <div class="flex items-center justify-center gap-2 mb-3">
        <div class="h-px w-10 bg-gold-400"></div>
        <span class="text-gold-500 font-semibold text-xs tracking-widest uppercase">What We Carry</span>
        <div class="h-px w-10 bg-gold-400"></div>
      </div>
      <h2 class="font-serif text-4xl lg:text-5xl font-bold text-navy-700 mb-4">Our Products</h2>
      <p class="text-gray-500 max-w-2xl mx-auto text-lg">Click any category to explore our full product lineup with descriptions, ideal use cases, and nutritional highlights.</p>
    </div>

    <!-- Category tabs -->
    <div class="flex flex-wrap justify-center gap-3 mb-10">
      <button onclick="filterProducts('all')" id="tab-all" class="product-tab active-tab px-5 py-2 rounded-full font-semibold text-sm border-2 border-navy-700 bg-navy-700 text-white transition-all">All Products</button>
      <button onclick="filterProducts('grain')" id="tab-grain" class="product-tab px-5 py-2 rounded-full font-semibold text-sm border-2 border-navy-200 text-navy-700 hover:border-navy-700 hover:bg-navy-700 hover:text-white transition-all">Grain & Feed</button>
      <button onclick="filterProducts('hay')" id="tab-hay" class="product-tab px-5 py-2 rounded-full font-semibold text-sm border-2 border-navy-200 text-navy-700 hover:border-navy-700 hover:bg-navy-700 hover:text-white transition-all">Hay</button>
      <button onclick="filterProducts('shavings')" id="tab-shavings" class="product-tab px-5 py-2 rounded-full font-semibold text-sm border-2 border-navy-200 text-navy-700 hover:border-navy-700 hover:bg-navy-700 hover:text-white transition-all">Shavings & Bedding</button>
      <button onclick="filterProducts('supplements')" id="tab-supplements" class="product-tab px-5 py-2 rounded-full font-semibold text-sm border-2 border-navy-200 text-navy-700 hover:border-navy-700 hover:bg-navy-700 hover:text-white transition-all">Supplements</button>
    </div>

    <!-- GRAIN BRAND CARDS -->
    <!-- GRAIN BRANDS — populated by loadHomepageSections() -->
    <div id="cat-grain" class="product-category mb-12">
      <h3 class="text-2xl font-serif font-bold text-navy-700 mb-6 flex items-center gap-3">
        Grain Brands
        <span class="text-sm font-sans font-normal text-gray-400 ml-2">— click a brand to see all products</span>
      </h3>
      <div id="grainBrandsGrid" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        ${brandCards()}
      </div>
    </div>

    <!-- HAY — populated by loadHomepageSections() -->
    <div id="cat-hay" class="product-category mb-12">
      <h3 class="text-2xl font-serif font-bold text-navy-700 mb-6 flex items-center gap-3">Hay Selection</h3>
      <div id="hayGrid" class="grid md:grid-cols-2 gap-6">
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><i class="fas fa-cubes text-green-600"></i></div>
            <div><h4 class="font-bold text-navy-700">3-String Bales (100–110 lbs)</h4><p class="text-xs text-gray-400">Large format — bulk value</p></div>
          </div>
          <div id="hay3Items" class="grid grid-cols-2 gap-2 text-sm">
            ${['Alfalfa','2nd Cut Grassy Timothy','1st Cut Timothy','2nd Cut Orchard','2nd Cut Timothy'].map(h=>`<div class="product-item pl-3 py-1 text-gray-600">${h}</div>`).join('')}
          </div>
        </div>
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center"><i class="fas fa-box text-amber-600"></i></div>
            <div><h4 class="font-bold text-navy-700">2-String Bales (48–60 lbs)</h4><p class="text-xs text-gray-400">Convenient size — easy handling</p></div>
          </div>
          <div id="hay2Items" class="grid grid-cols-2 gap-2 text-sm">
            ${['Special Reserve T/A','Premium T/A','Supergrass (Straight Orchard)','Quebec T/A','Twyla T/A (Heavy Alfalfa)','Peanut Hay (High Protein)','Valley Green O/T/A','Alberta Timothy (Straight)','2nd Cut Alberta Timothy'].map(h=>`<div class="product-item pl-3 py-1 text-gray-600">${h}</div>`).join('')}
          </div>
        </div>
      </div>
      <div id="hayNoteBox" class="mt-4 bg-gold-50 border border-gold-200 rounded-xl p-4 text-sm text-gray-600">
        <i class="fas fa-info-circle text-gold-500 mr-2"></i>
        Hay availability varies by season. Call <strong>(561) 633-6003</strong> or visit the store to check current stock and pricing.
      </div>
    </div>

    <!-- SHAVINGS — populated by loadHomepageSections() -->
    <div id="cat-shavings" class="product-category mb-12">
      <h3 class="text-2xl font-serif font-bold text-navy-700 mb-6 flex items-center gap-3">Shavings & Bedding</h3>
      <div id="shavingsGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${[
          {name:'WD Fine',desc:'Very fine shavings — 7–8 cu. ft. per bag. Excellent dust control.',icon:'fa-feather'},
          {name:'WD Flake',desc:'Medium flake shavings — 8–9 cu. ft. Classic barn-fresh feel.',icon:'fa-layer-group'},
          {name:'WD Pelleted',desc:'Compressed pellets that expand with water — highly absorbent.',icon:'fa-circle'},
          {name:'Fast Track Blend',desc:'Mix of fine & medium flake — 8 cu. ft. Best of both worlds.',icon:'fa-star'},
          {name:'Fast Track Fine',desc:'Fine flake — 7 cu. ft. Ideal for sensitive respiratory horses.',icon:'fa-wind'},
          {name:'World Cup',desc:'Large flake — 9–10 cu. ft. Show-quality bedding.',icon:'fa-trophy'},
          {name:'Showtime Large',desc:'Large flake — 9–10 cu. ft. Perfect for stall presentation.',icon:'fa-award'},
          {name:'King Large',desc:'Very large flake — 9.5 cu. ft. Maximum cushion & comfort.',icon:'fa-crown'},
          {name:'Baled Straw',desc:'45–50 lbs bales. Natural, traditional bedding option.',icon:'fa-seedling'},
        ].map(s=>`
          <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 card-hover flex gap-4">
            <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <i class="fas ${s.icon} text-amber-600"></i>
            </div>
            <div>
              <div class="font-bold text-navy-700 text-sm">${s.name}</div>
              <div class="text-xs text-gray-500 mt-1">${s.desc}</div>
            </div>
          </div>`).join('')}
      </div>
      <p id="shavingsNote" class="text-sm text-gray-500 mt-4 italic"><i class="fas fa-plus-circle text-gold-400 mr-1"></i>Additional options available under special order — ask us!</p>
    </div>

    <!-- SUPPLEMENTS — populated by loadHomepageSections() -->
    <div id="cat-supplements" class="product-category mb-12">
      <h3 class="text-2xl font-serif font-bold text-navy-700 mb-6 flex items-center gap-3">Supplements & Additives</h3>
      <div id="suppsGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${[
          {name:'Cavalor Hepato Liq',cat:'Liver Support',desc:'Liquid liver support supplement. Detoxifies and supports optimal liver function, especially for horses in heavy training.'},
          {name:'Cavalor Bronchix Pure',cat:'Respiratory',desc:'Natural respiratory support for horses with airway sensitivity, dust allergies, or those competing in dusty arenas.'},
          {name:'Cavalor Sozen',cat:'Calming',desc:'Natural calming supplement to reduce nervousness and stress without affecting alertness or performance.'},
          {name:'Cavalor Muscle Force',cat:'Muscle Support',desc:'Supports muscle development and recovery. Ideal for performance horses needing topline and muscle tone improvement.'},
          {name:'Cavalor Vitamino',cat:'Vitamins & Minerals',desc:'Complete vitamin and mineral supplement to balance rations and fill nutritional gaps in hay and forage diets.'},
          {name:'Max-E-Glo Rice Bran',cat:'Weight & Coat',desc:'Stabilized rice bran supplement for healthy weight gain, improved coat shine, and extra energy without excess starch.'},
          {name:"Horseshoer's Secret",cat:'Hoof Health',desc:'Pelleted hoof supplement with biotin, zinc, and methionine to support strong, healthy hoof growth and quality.'},
          {name:'Sand Clear',cat:'Digestive',desc:'Monthly psyllium treatment to help clear sand and dirt from the digestive tract — essential for Florida horses.'},
          {name:'SandPurge Psyllium Pellets',cat:'Digestive',desc:'Psyllium-based pellets that support natural sand removal from the hindgut. Easy-to-feed pelleted form.'},
          {name:'Vita-E & Selenium',cat:'Antioxidant',desc:'Essential antioxidant combination for muscle function, immune support, and reproductive health in horses.'},
          {name:'Topline Xtreme',cat:'Topline',desc:'High-protein supplement formulated specifically to build and maintain topline muscle in performance and show horses.'},
          {name:'CocoSoya Oil',cat:'Weight & Coat',desc:'Blend of coconut and soy oils providing omega fatty acids for calorie-dense weight gain and brilliant coat shine.'},
        ].map(s=>`
          <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover">
            <div class="flex items-start justify-between mb-2">
              <div class="font-bold text-navy-700 text-sm">${s.name}</div>
              <span class="tag tag-special ml-2 flex-shrink-0">${s.cat}</span>
            </div>
            <p class="text-xs text-gray-500 leading-relaxed">${s.desc}</p>
          </div>`).join('')}
      </div>
    </div>
    <div class="text-center mt-10 scroll-reveal">
      <div class="inline-flex flex-col sm:flex-row items-center gap-4 bg-white rounded-2xl px-8 py-6 shadow-sm border border-gray-100">
        <div class="text-left">
          <div class="font-bold text-navy-700 text-base">Looking for something specific?</div>
          <div class="text-gray-500 text-sm mt-0.5">Browse our complete product catalog with search & filters.</div>
        </div>
        <div class="flex flex-col sm:flex-row gap-3">
          <a href="/products" class="flex-shrink-0 bg-navy-700 hover:bg-navy-800 text-white font-bold px-6 py-3 rounded-xl transition-all hover:scale-105 flex items-center gap-2 whitespace-nowrap" style="background:#1B2A4A">
            <i class="fas fa-list"></i> Browse Full Catalog
          </a>
          <a href="/catalog-print" target="_blank"
             style="display:inline-flex;align-items:center;gap:8px;background:#C9A84C;color:#1B2A4A;font-weight:700;padding:12px 20px;border-radius:12px;text-decoration:none;white-space:nowrap;flex-shrink:0;"
             onmouseover="this.style.background='#E0C87A'" onmouseout="this.style.background='#C9A84C'">
            <i class="fas fa-file-pdf"></i> Download PDF Catalog
          </a>
        </div>
      </div>
    </div>

  </div>
</section>
<section id="finder" class="py-20 bg-white">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-12 scroll-reveal">
      <div class="flex items-center justify-center gap-2 mb-3">
        <div class="h-px w-10 bg-gold-400"></div>
        <span class="text-gold-500 font-semibold text-xs tracking-widest uppercase">Find the Right Feed</span>
        <div class="h-px w-10 bg-gold-400"></div>
      </div>
      <h2 class="font-serif text-4xl font-bold text-navy-700 mb-3">Not Sure What to Feed?</h2>
      <p class="text-gray-500 text-lg">Answer 3 quick questions and we'll recommend the best options for your horse.</p>
    </div>
    <div class="bg-cream rounded-2xl p-8 shadow-sm border border-gray-100 scroll-reveal">
      <div id="finder-step-1">
        <h3 class="font-bold text-navy-700 text-lg mb-4"><span class="text-gold-400 font-serif text-2xl mr-2">1.</span> What best describes your horse?</h3>
        <div class="grid sm:grid-cols-2 gap-3">
          ${[
            {val:'competition',label:'Competition / Show Horse',icon:'fa-trophy'},
            {val:'senior',label:'Senior Horse (15+ years)',icon:'fa-heart'},
            {val:'easy',label:'Easy Keeper / Metabolic',icon:'fa-weight'},
            {val:'hard',label:'Hard Keeper / Needs Weight',icon:'fa-dumbbell'},
            {val:'young',label:'Young / Growing Horse',icon:'fa-seedling'},
            {val:'broodmare',label:'Broodmare / Breeding',icon:'fa-baby'},
            {val:'endurance',label:'Endurance / Trail Horse',icon:'fa-route'},
            {val:'digestive',label:'Digestive Issues / Sensitive',icon:'fa-stethoscope'},
          ].map(o=>`
            <button onclick="selectHorse('${o.val}')" class="finder-option flex items-center gap-3 p-4 bg-white rounded-xl border-2 border-gray-200 hover:border-navy-700 hover:bg-navy-50 transition-all text-left font-medium text-navy-700">
              <i class="fas ${o.icon} text-gold-400 w-5 text-center"></i>${o.label}
            </button>`).join('')}
        </div>
      </div>
      <div id="finder-results" class="hidden">
        <div class="flex items-center gap-3 mb-6">
          <button onclick="resetFinder()" class="text-sm text-gray-400 hover:text-navy-700 flex items-center gap-1"><i class="fas fa-arrow-left"></i> Start over</button>
          <h3 class="font-bold text-navy-700 text-lg">Recommended for Your Horse</h3>
        </div>
        <div id="finder-recs" class="space-y-4"></div>
        <div class="mt-6 p-4 bg-navy-700 rounded-xl text-white text-sm">
          <i class="fas fa-comments text-gold-400 mr-2"></i>
          Want personalized advice? <strong>Chat with Bri</strong> below or call <strong>(561) 633-6003</strong> to speak with our team.
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════ SERVICES ═══════════════════════════ -->
<section id="services" class="py-20 bg-cream-dark">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-14 scroll-reveal">
      <div class="flex items-center justify-center gap-2 mb-3">
        <div class="h-px w-10 bg-gold-400"></div>
        <span class="text-gold-500 font-semibold text-xs tracking-widest uppercase">What We Offer</span>
        <div class="h-px w-10 bg-gold-400"></div>
      </div>
      <h2 class="font-serif text-4xl lg:text-5xl font-bold text-navy-700 mb-4">Our Services</h2>
    </div>
    <div class="grid md:grid-cols-3 gap-8">
      <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 card-hover scroll-reveal">
        <div class="h-48 bg-cover bg-center" style="background-image:url('/admin/api/catalog/image/img_img_site_truck')"></div>
        <div class="p-6">
          <div class="w-12 h-12 bg-navy-50 rounded-full flex items-center justify-center mb-4">
            <i class="fas fa-truck text-navy-700 text-xl"></i>
          </div>
          <h3 class="font-bold text-xl text-navy-700 mb-3">Free Local Delivery</h3>
          <p class="text-gray-600 text-sm leading-relaxed mb-4">We deliver to Wellington, Loxahatchee Groves, Royal Palm Beach, Lake Worth, Jupiter Farms, Southwest Ranches and surrounding areas.</p>
          <div class="bg-cream rounded-lg p-3 text-sm">
            <div class="font-semibold text-navy-700">Free on orders $150+</div>
            <div class="text-gray-500 text-xs mt-1">$50 fee on orders under $150</div>
          </div>
          <div class="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 flex items-start gap-2">
            <i class="fas fa-gas-pump mt-0.5 flex-shrink-0"></i>
            <span><strong>Fuel Surcharge Notice:</strong> Due to rising fuel costs, we are implementing a temporary, minimal fuel surcharge. Thank you for your understanding.</span>
          </div>
          <!-- Delivery Schedule button - opens full-screen modal -->
          <div class="mt-4">
            <button onclick="document.getElementById('delivery-modal-overlay').classList.add('open')"
              class="w-full flex items-center justify-center gap-2 text-white text-xs font-semibold px-4 py-2.5 rounded-full transition-all"
              style="background:#1B2A4A;">
              <i class="fas fa-calendar-week"></i> View Delivery Schedule
            </button>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 card-hover scroll-reveal">
        <div class="h-48 bg-cover bg-center" style="background-image:url('https://sspark.genspark.ai/cfimages?u1=CqkH4kIYABdVpnuxtR4bJqyehkIDpq3%2BdUQr%2FcbR38crltam%2BSVdBNtylFtOjAIbQiLcBWuAmcW42P%2F3dPIBpRuDsEF8u9g2sBQuyCtXS5dMZ3gwEWb6n0c%2BANfOj1jFDmw%3D&u2=erPuew9pmVC%2BvkXw&width=2560')"></div>
        <div class="p-6">
          <div class="w-12 h-12 bg-navy-50 rounded-full flex items-center justify-center mb-4">
            <i class="fas fa-user-md text-navy-700 text-xl"></i>
          </div>
          <h3 class="font-bold text-xl text-navy-700 mb-3">Nutritional Barn Visit</h3>
          <p class="text-gray-600 text-sm leading-relaxed mb-4">Schedule a one-on-one visit from our certified equine nutritionist. We evaluate your horse's condition, weight, and activity level to build the ideal feed program.</p>
          <a href="tel:5616336003" class="inline-block bg-navy-700 hover:bg-navy-600 text-white text-sm font-semibold px-5 py-2 rounded-full transition-all">
            Schedule: (561) 633-6003
          </a>
        </div>
      </div>
      <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 card-hover scroll-reveal">
        <div class="h-48 bg-cover bg-center bg-white flex items-center justify-center" style="background-image:url('https://sspark.genspark.ai/cfimages?u1=v0dkTfLlLXgoeZLiiQP35sHCbdK2Lf4A3U5pvV683Qf516I0p3WIx0QGNwG1kRPWEZmm4f3KSCqO7m9PifeBRyQcOQBNcHI%2FMR1UI2dg&u2=JcOEp9U6PwOOsj0N&width=600');background-size:contain;background-repeat:no-repeat;"></div>
        <div class="p-6">
          <div class="w-12 h-12 bg-navy-50 rounded-full flex items-center justify-center mb-4">
            <i class="fas fa-certificate text-navy-700 text-xl"></i>
          </div>
          <h3 class="font-bold text-xl text-navy-700 mb-3">Nutrena Farm Program</h3>
          <p class="text-gray-600 text-sm leading-relaxed mb-4">As a Nutrena Certified Partner, we offer the Nutrena Farm Rewards Program — earn cash back on every bag of Nutrena feed you purchase through our store.</p>
          <div class="bg-cream rounded-lg p-3 text-sm">
            <div class="font-semibold text-navy-700">Earn rewards on every purchase</div>
            <div class="text-gray-500 text-xs mt-1">Ask in-store for enrollment details</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════ TEAM ═══════════════════════════ -->
<section id="team" class="py-20 bg-white">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-14 scroll-reveal">
      <div class="flex items-center justify-center gap-2 mb-3">
        <div class="h-px w-10 bg-gold-400"></div>
        <span class="text-gold-500 font-semibold text-xs tracking-widest uppercase">The People Behind British Feed</span>
        <div class="h-px w-10 bg-gold-400"></div>
      </div>
      <h2 class="font-serif text-4xl lg:text-5xl font-bold text-navy-700">Meet Our Team</h2>
    </div>
    <!-- Shared team photo -->
    <div class="mb-10 scroll-reveal">
      <div class="rounded-2xl overflow-hidden shadow-xl" style="max-height:420px;">
        <img src="/admin/api/catalog/image/img_site_team_owners" alt="Vieri Bracco & Carmine Garrett" class="w-full h-full object-cover" style="object-position:center 20%;" onerror="this.parentElement.style.display='none'" />
      </div>
    </div>
    <div class="grid md:grid-cols-2 gap-10">
      <!-- Vieri Bracco -->
      <div class="bg-cream rounded-2xl p-8 border border-gray-100 shadow-sm card-hover scroll-reveal">
        <h3 class="font-serif text-2xl font-bold text-navy-700">Vieri Bracco</h3>
        <p class="text-gold-500 font-semibold text-sm mb-3">Owner & Founder</p>
        <p class="text-gray-600 text-sm leading-relaxed mb-4">
          Vieri founded British Feed & Supplies in 2012 with a vision to bring top-quality European and American horse nutrition brands to the Wellington equestrian community. His passion for horses and deep knowledge of equine nutrition have made British Feed a cornerstone of Palm Beach County's horse world.
        </p>
        <div class="flex flex-wrap gap-2">
          <span class="tag tag-perf">Founder</span>
          <span class="tag tag-senior">Equine Nutrition</span>
          <span class="tag tag-special">Community Leader</span>
        </div>
      </div>
      <!-- Carmine Garrett -->
      <div class="bg-cream rounded-2xl p-8 border border-gray-100 shadow-sm card-hover scroll-reveal">
        <h3 class="font-serif text-2xl font-bold text-navy-700">Carmine Garrett</h3>
        <p class="text-gold-500 font-semibold text-sm mb-3">General Manager</p>
        <p class="text-gray-600 text-sm leading-relaxed mb-4">
          Carmine brings hands-on equestrian expertise and operational excellence to British Feed's daily operations. With deep roots in the Wellington horse community, Carmine ensures every customer receives personalized, knowledgeable service — from first-time horse owners to seasoned professionals.
        </p>
        <div class="flex flex-wrap gap-2">
          <span class="tag tag-perf">General Manager</span>
          <span class="tag tag-all">Customer Service</span>
          <span class="tag tag-special">Wellington Community</span>
        </div>
      </div>
    </div>
    <div class="mt-10 text-center scroll-reveal">
      <div class="bg-navy-700 rounded-2xl p-6 text-white inline-block max-w-lg">
        <i class="fas fa-quote-left text-gold-400 text-2xl mb-3 block"></i>
        <p class="italic text-white/85 mb-3">"Your suggestions and opinions are very important to us. We'll be glad to hear from you!"</p>
        <p class="font-semibold text-gold-400 text-sm">— Vieri Bracco, Owner</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════ GOOGLE REVIEWS ═══════════════════════════ -->
<section id="reviews" class="py-20 bg-cream-dark">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-14 scroll-reveal">
      <div class="flex items-center justify-center gap-2 mb-3">
        <div class="h-px w-10 bg-gold-400"></div>
        <span class="text-gold-500 font-semibold text-xs tracking-widest uppercase">Customer Reviews</span>
        <div class="h-px w-10 bg-gold-400"></div>
      </div>
      <h2 class="font-serif text-4xl lg:text-5xl font-bold text-navy-700 mb-3">What Our Customers Say</h2>
      <div class="flex items-center justify-center gap-2 mt-2">
        <div class="stars text-2xl">★★★★★</div>
        <span class="text-xl font-bold text-navy-700">4.8</span>
        <span class="text-gray-400 text-sm">on Google</span>
        <a href="https://www.google.com/maps/search/?api=1&query=British+Feed+and+Supplies+Loxahatchee+Groves+FL" target="_blank" rel="noopener" class="ml-2 text-sm text-navy-500 hover:text-navy-700 underline">View all reviews</a>
      </div>
    </div>
    <div class="grid md:grid-cols-3 gap-6">
      ${[
        {name:'Jessica M.',stars:5,date:'Jan 2025',text:'British Feed is the ONLY place I buy feed for my horses. The staff always knows exactly what I need and Carmine goes above and beyond every time. Best selection in Wellington by far!'},
        {name:'Robert T.',stars:5,date:'Dec 2024',text:'Switched to Cavalor Performix on Carmine\'s recommendation and my show jumper has never looked better. Shiny coat, great energy, and his topline improved in just 6 weeks. Amazing store!'},
        {name:'Amanda L.',stars:5,date:'Feb 2025',text:'Vieri personally helped me set up a feed program for my senior OTTB. So knowledgeable! The free delivery is a huge bonus. I recommend British Feed to everyone at my barn.'},
        {name:'Carlos R.',stars:5,date:'Nov 2024',text:'Had an issue with my horse losing weight and the team here diagnosed it right away — recommended Pro Elite Omega Advantage and the results were incredible. True professionals.'},
        {name:'Sarah K.',stars:5,date:'Jan 2025',text:'The nutritional barn visit was worth every penny. They came out, assessed all 4 of my horses, and created individual programs for each one. Exceptional service you can\'t find anywhere else.'},
        {name:'Mike D.',stars:4,date:'Mar 2025',text:'Great selection, competitive prices, and knowledgeable staff. The Nutrena Farm Program saves me a lot of money each month. Wish they had longer weekend hours but overall excellent store.'},
      ].map(r=>`
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover scroll-reveal">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-navy-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">${r.name[0]}</div>
            <div>
              <div class="font-bold text-navy-700 text-sm">${r.name}</div>
              <div class="text-xs text-gray-400">${r.date}</div>
            </div>
            <div class="ml-auto flex items-center gap-1">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/24px-Google_%22G%22_logo.svg.png" alt="Google" class="w-4 h-4" />
            </div>
          </div>
          <div class="stars text-base mb-3">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div>
          <p class="text-gray-600 text-sm leading-relaxed">"${r.text}"</p>
        </div>`).join('')}
    </div>
    <div class="text-center mt-10 scroll-reveal">
      <a href="https://www.google.com/maps/search/?api=1&query=British+Feed+and+Supplies+Loxahatchee+Groves+FL" target="_blank" rel="noopener"
         class="inline-flex items-center gap-2 bg-white border-2 border-navy-200 hover:border-navy-700 text-navy-700 font-semibold px-8 py-3 rounded-full transition-all hover:shadow-md">
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/24px-Google_%22G%22_logo.svg.png" alt="Google" class="w-5 h-5" />
        See All Google Reviews
      </a>
    </div>
  </div>
</section>

<!-- ═══════════════════════════ CONTACT ═══════════════════════════ -->
<section id="contact" class="py-20 bg-navy-700 text-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-14 scroll-reveal">
      <div class="flex items-center justify-center gap-2 mb-3">
        <div class="h-px w-10 bg-gold-400"></div>
        <span class="text-gold-400 font-semibold text-xs tracking-widest uppercase">Get In Touch</span>
        <div class="h-px w-10 bg-gold-400"></div>
      </div>
      <h2 class="font-serif text-4xl lg:text-5xl font-bold text-white mb-3">Contact Us</h2>
      <p class="text-white/70 text-lg">Questions, orders, or just want expert advice? We're here for you.</p>
    </div>
    <div class="grid lg:grid-cols-2 gap-12">
      <!-- Info side -->
      <div class="scroll-reveal space-y-6">
        <div class="flex gap-5">
          <div class="w-12 h-12 bg-gold-400/20 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-map-marker-alt text-gold-400 text-lg"></i></div>
          <div>
            <div class="font-bold text-white text-lg mb-1">Store Location</div>
            <div class="text-white/70">14589 Southern Blvd, Palm West Plaza<br/>Loxahatchee Groves, FL 33470</div>
            <div class="text-white/50 text-sm mt-1"><i class="fas fa-clock mr-1 text-gold-400/70"></i>Mon–Fri 9am–6pm &nbsp;·&nbsp; Sat 9am–4pm</div>
          </div>
        </div>
        <div class="flex gap-5">
          <div class="w-12 h-12 bg-gold-400/20 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-warehouse text-gold-400 text-lg"></i></div>
          <div>
            <div class="font-bold text-white text-lg mb-1">Distribution Center</div>
            <div class="text-white/70">100 Aldi Way, Suite 400<br/>Royal Palm Beach, FL 33411</div>
            <div class="text-white/50 text-sm mt-1"><i class="fas fa-clock mr-1 text-gold-400/70"></i>Mon–Fri 8am–5pm &nbsp;·&nbsp; Sat 9am–4pm</div>
          </div>
        </div>
        <div class="flex gap-5">
          <div class="w-12 h-12 bg-gold-400/20 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-phone text-gold-400 text-lg"></i></div>
          <div>
            <div class="font-bold text-white text-lg mb-1">Phone</div>
            <a href="tel:5616336003" class="text-gold-400 hover:text-gold-300 text-xl font-bold">(561) 633-6003</a>
          </div>
        </div>
        <div class="flex gap-5">
          <div class="w-12 h-12 bg-gold-400/20 rounded-full flex items-center justify-center flex-shrink-0"><i class="fab fa-instagram text-gold-400 text-lg"></i></div>
          <div>
            <div class="font-bold text-white text-lg mb-1">Instagram</div>
            <a href="https://www.instagram.com/british_feed_and_supplies/" target="_blank" rel="noopener" class="text-gold-400 hover:text-gold-300">@british_feed_and_supplies</a>
          </div>
        </div>
        <!-- Map embed -->
        <div class="rounded-xl overflow-hidden shadow-lg">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3573.5!2d-80.2738!3d26.6702!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x88d9b0a0a0a0a0a1%3A0x1!2s14589+Southern+Blvd%2C+Loxahatchee+Groves%2C+FL+33470!5e0!3m2!1sen!2sus!4v1"
            width="100%" height="220" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
      </div>
      <!-- Contact form -->
      <div class="scroll-reveal">
        <div class="bg-white/8 backdrop-blur rounded-2xl p-8 border border-white/10">
          <h3 class="font-bold text-xl text-white mb-6">Send Us a Message</h3>
          <form id="contact-form" onsubmit="submitContact(event)" class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">First Name *</label>
                <input type="text" name="firstName" required placeholder="Jane" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-gold-400 text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Last Name *</label>
                <input type="text" name="lastName" required placeholder="Smith" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-gold-400 text-sm" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-white/80 mb-1">Email Address *</label>
              <input type="email" name="email" required placeholder="jane@example.com" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-gold-400 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-white/80 mb-1">Phone Number</label>
              <input type="tel" name="phone" placeholder="(561) 000-0000" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-gold-400 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-white/80 mb-1">What can we help you with?</label>
              <select name="subject" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold-400 text-sm">
                <option value="" class="bg-navy-700">Select a topic...</option>
                <option value="feed" class="bg-navy-700">Feed / Product Question</option>
                <option value="nutrition" class="bg-navy-700">Nutritional Consultation</option>
                <option value="delivery" class="bg-navy-700">Delivery Inquiry</option>
                <option value="nutrena" class="bg-navy-700">Nutrena Farm Program</option>
                <option value="order" class="bg-navy-700">Place an Order</option>
                <option value="other" class="bg-navy-700">Other</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-white/80 mb-1">Message *</label>
              <textarea name="message" required rows="4" placeholder="Tell us about your horse(s) and what you're looking for..." class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-gold-400 text-sm resize-none"></textarea>
            </div>
            <button type="submit" id="contact-btn" class="w-full bg-gold-400 hover:bg-gold-500 text-navy-700 font-bold py-4 rounded-xl transition-all hover:scale-[1.02] text-sm">
              <i class="fas fa-paper-plane mr-2"></i>Send Message
            </button>
          </form>
          <div id="contact-success" class="hidden mt-4 bg-green-500/20 border border-green-400/30 rounded-xl p-4 text-center">
            <i class="fas fa-check-circle text-green-400 text-2xl mb-2 block"></i>
            <p class="text-white font-semibold">Message received!</p>
            <p class="text-white/70 text-sm mt-1">We'll get back to you within 24 hours.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════ FOOTER ═══════════════════════════ -->
<footer class="bg-navy-900 text-white py-10">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-3 gap-8 mb-8">
      <div>
        <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed Logo" class="h-10 mb-4" style="filter: brightness(0) invert(1);" onerror="this.style.display='none'" />
        <p class="text-white/50 text-sm leading-relaxed">Premium horse feed, hay, shavings & supplies for Wellington's equestrian community since 2016.</p>
        <a href="https://www.instagram.com/british_feed_and_supplies/" target="_blank" rel="noopener" class="inline-flex items-center gap-2 mt-4 text-white/50 hover:text-gold-400 transition-colors text-sm">
          <i class="fab fa-instagram text-lg"></i> @british_feed_and_supplies
        </a>
      </div>
      <div>
        <h4 class="font-bold text-white mb-3 text-sm uppercase tracking-wider">Quick Links</h4>
        <ul class="space-y-2 text-sm text-white/50">
          <li><a href="#about"    class="hover:text-gold-400 transition-colors">About Us</a></li>
          <li><a href="#products" class="hover:text-gold-400 transition-colors">Products</a></li>
          <li><a href="#services" class="hover:text-gold-400 transition-colors">Services</a></li>
          <li><a href="#team"     class="hover:text-gold-400 transition-colors">Our Team</a></li>
          <li><a href="#reviews"  class="hover:text-gold-400 transition-colors">Reviews</a></li>
          <li><a href="#contact"  class="hover:text-gold-400 transition-colors">Contact</a></li>
        </ul>
      </div>
      <div>
        <h4 class="font-bold text-white mb-3 text-sm uppercase tracking-wider">Contact Info</h4>
        <div class="space-y-2 text-sm text-white/50">
          <div><i class="fas fa-map-marker-alt text-gold-400 mr-2 w-4"></i>14589 Southern Blvd, Loxahatchee Groves, FL</div>
          <div><a href="tel:5616336003" class="hover:text-gold-400"><i class="fas fa-phone text-gold-400 mr-2 w-4"></i>(561) 633-6003</a></div>
          <div><i class="fas fa-clock text-gold-400 mr-2 w-4"></i>Mon–Fri 9am–6pm · Sat 9am–4pm</div>
        </div>
      </div>
    </div>
    <div class="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/30">
      <span>© 2025 British Feed &amp; Supplies. All rights reserved. | 14589 Southern Blvd, Loxahatchee Groves, FL 33470</span>
      <a href="/admin/login" class="hover:text-gold-400 transition-colors flex items-center gap-1 opacity-50 hover:opacity-100">
        <i class="fas fa-lock text-[10px]"></i> Admin
      </a>
    </div>
  </div>
</footer>

<!-- ═══════════════════════════ BRAND MODALS ═══════════════════════════ -->
${brandModals()}

<!-- ═══════════════════════════ AI CHATBOT ═══════════════════════════ -->
<button onclick="toggleChat()" id="chat-btn"
  class="fixed bottom-6 right-6 w-16 h-16 bg-navy-700 hover:bg-navy-600 text-white rounded-full shadow-2xl z-50 flex items-center justify-center transition-all hover:scale-110 border-2 border-gold-400">
  <i class="fas fa-comment-dots text-2xl" id="chat-icon"></i>
</button>
<div id="chat-window" class="chatbot-window shadow-2xl rounded-2xl overflow-hidden border border-gray-200">
  <div class="bg-navy-700 px-5 py-4 flex items-center gap-3">
    <div class="w-9 h-9 bg-gold-400 rounded-full flex items-center justify-center">
      <i class="fas fa-horse text-navy-700 text-sm"></i>
    </div>
    <div>
      <div class="text-white font-bold text-sm">Bri — Feed Advisor</div>
      <div class="text-white/60 text-xs">British Feed & Supplies AI</div>
    </div>
    <button onclick="toggleChat()" class="ml-auto text-white/50 hover:text-white"><i class="fas fa-times"></i></button>
  </div>
  <div id="chat-messages" class="flex-1 overflow-y-auto p-4 bg-white space-y-3" style="min-height:280px;max-height:320px;">
    <div class="chat-bubble-bot text-sm p-3 max-w-xs">
      Hi! I'm <strong>Bri</strong>, your British Feed advisor. Tell me about your horse — age, activity level, and any concerns — and I'll recommend the perfect feed!
    </div>
  </div>
  <div class="p-3 border-t border-gray-100 bg-white">
    <div class="flex gap-2 mb-2 flex-wrap">
      ${['Senior horse','Competition horse','Hard keeper','Digestive issues'].map(q=>`<button onclick="quickAsk('${q}')" class="text-xs bg-cream border border-gray-200 hover:border-navy-700 text-navy-700 px-3 py-1 rounded-full transition-all">${q}</button>`).join('')}
    </div>
    <div class="flex gap-2">
      <input id="chat-input" type="text" placeholder="Ask about feed, hay, supplements..." 
        class="flex-1 text-sm border border-gray-200 rounded-full px-4 py-2 focus:outline-none focus:border-navy-700"
        onkeydown="if(event.key==='Enter')sendChat()" />
      <button onclick="sendChat()" class="w-10 h-10 bg-navy-700 hover:bg-navy-600 text-white rounded-full flex items-center justify-center transition-all flex-shrink-0">
        <i class="fas fa-paper-plane text-xs"></i>
      </button>
    </div>
  </div>
</div>

<script>
// ─── Mobile menu ────────────────────────────────────────────────────────────
function toggleMobileMenu(){
  const m=document.getElementById('mobile-menu');
  const i=document.getElementById('menu-icon');
  m.classList.toggle('hidden');
  i.className = m.classList.contains('hidden') ? 'fas fa-bars text-xl' : 'fas fa-times text-xl';
}
function closeMobileMenu(){
  document.getElementById('mobile-menu').classList.add('hidden');
  document.getElementById('menu-icon').className='fas fa-bars text-xl';
}

// ─── Product category filter ─────────────────────────────────────────────────
function filterProducts(cat) {
  document.querySelectorAll('.product-category').forEach(el => {
    if(cat==='all') { el.style.display='block'; }
    else { el.style.display = el.id==='cat-'+cat ? 'block' : 'none'; }
  });
  document.querySelectorAll('.product-tab').forEach(btn => btn.classList.remove('active-tab','bg-navy-700','text-white','border-navy-700'));
  const active = document.getElementById('tab-'+cat);
  if(active){ active.classList.add('active-tab','bg-navy-700','text-white','border-navy-700'); }
}

// ─── Brand modal ─────────────────────────────────────────────────────────────
function openBrandModal(brandId){
  document.getElementById('modal-'+brandId).classList.add('open');
  document.body.style.overflow='hidden';
}
function closeBrandModal(brandId){
  document.getElementById('modal-'+brandId).classList.remove('open');
  document.body.style.overflow='';
}
// close on overlay click
document.addEventListener('click', e => {
  if(e.target.classList.contains('modal-overlay')){
    e.target.classList.remove('open');
    document.body.style.overflow='';
  }
});

// ─── Feed Finder ─────────────────────────────────────────────────────────────
const finderRecs = {
  competition: [
    {brand:'Pro Elite Performance',desc:'High-fat beet-pulp textured feed designed for mature show and performance horses. Supports stamina, muscle strength, and endurance with guaranteed amino acids.',tags:['Performance','Show Horse']},
    {brand:'Cavalor Performix',desc:'Premium muesli for sport horses needing intense energy output. Level 5 formula with puffed & extruded cereals for optimal digestibility.',tags:['Performance','Level 5']},
    {brand:'Red Mills Competition 14',desc:'14% protein competition mix with high digestibility and energy for horses in intense training and competition.',tags:['Competition','High Protein']},
    {brand:'Havens Performance 14',desc:'Complete performance muesli with 14% protein. Ideal for horses competing in jumping, dressage, or eventing.',tags:['Performance','Muesli']},
  ],
  senior: [
    {brand:'Nutrena SafeChoice Senior',desc:'High-fat, controlled-starch formula with Digestive Shield™. Complete nutrition designed for older horses, hard keepers, and horses with dental challenges.',tags:['Senior','Complete Feed']},
    {brand:'Pro Elite Senior',desc:'Textured feed addressing the special nutritional needs of older horses. Low starch and sugar to support metabolic health.',tags:['Senior','Low Starch']},
    {brand:'Buckeye EQ8 Senior',desc:'Multi-textured senior feed with gut health support system. High fiber and controlled energy for aging horses.',tags:['Senior','Gut Health']},
    {brand:'Cavalor Strucomix Senior',desc:'Fibre-rich muesli with puffed & extruded grains for easy digestion. Long alfalfa fibres stimulate chewing.',tags:['Senior','Fibre-Rich']},
  ],
  easy: [
    {brand:'Nutrena SafeChoice Special Care',desc:'Only 10% NSC — lowest starch formula for easy keepers, metabolic horses, insulin-resistant ponies, and miniature horses with Digestive Shield™.',tags:['Easy Keeper','Low NSC','Metabolic']},
    {brand:'Pro Elite Starch Wise',desc:'Low starch and sugar pelleted feed for mature performance horses with metabolic concerns. Corn-free formula.',tags:['Metabolic','Low Starch']},
    {brand:'Cavalor Pianissimo',desc:'Special care muesli for sensitive, excitable, or metabolically challenged horses. Calming formula with low sugar content.',tags:['Low Sugar','Calming']},
    {brand:'Pro Elite Grass Advantage',desc:'Ration balancer with low feeding rate. Balances grass and mixed forage diets without adding excess calories.',tags:['Balancer','Grass','Easy Keeper']},
  ],
  hard: [
    {brand:'Pro Elite Omega Advantage',desc:'Extruded pellet supplement with 24% fat and added vitamin E. Supports weight gain, coat shine, and performance appearance.',tags:['Weight Gain','High Fat']},
    {brand:'Buckeye Cadence Ultra',desc:'Sweet pelleted feed for performance horses. High calorie dense formula for hard keepers needing extra energy.',tags:['High Calorie','Weight Gain']},
    {brand:'Cavalor WholyGain',desc:'Concentrated weight gain supplement providing high-quality fats and proteins for underweight or hard-keeping horses.',tags:['Weight Gain','High Fat']},
    {brand:'Havens Power Plus Mix',desc:'High-energy power muesli with extra fat and calories for horses struggling to maintain weight under heavy workload.',tags:['Hard Keeper','High Energy']},
  ],
  young: [
    {brand:'Pro Elite Growth',desc:'Textured feed formulated specifically for foals, growing horses, and broodmares. Balanced amino acid profile supports healthy bone and muscle development.',tags:['Foals','Growing','Broodmares']},
    {brand:'Buckeye Gro-N-Win',desc:'Ration balancer for growing horses. Fortifies pasture and hay rations with essential nutrients without excess calories.',tags:['Growing','Balancer']},
    {brand:'Nutrena SafeChoice Mare & Foal',desc:'Controlled starch pelleted formula with Digestive Shield™ for pregnant and lactating mares, weanlings, and yearlings.',tags:['Mare & Foal','Growing']},
  ],
  broodmare: [
    {brand:'Pro Elite Grass Advantage',desc:'Pellet balancer for broodmares on pasture. Provides balanced nutrition without overfeeding energy to horses on good grass.',tags:['Broodmares','Balancer']},
    {brand:'Nutrena SafeChoice Mare & Foal',desc:'16% protein controlled-starch formula for pregnant or lactating mares, weanlings, and yearlings with complete nutrition support.',tags:['Mares','Foals','16% Protein']},
    {brand:'Red Mills Horse Care 14',desc:'14% protein complete diet mix for breeding stock. Supports reproductive performance and early foal development.',tags:['Broodmares','14% Protein']},
  ],
  endurance: [
    {brand:'Havens Endurance',desc:'Designed specifically for endurance horses covering long distances. High fiber and sustained-release energy to keep horses going mile after mile.',tags:['Endurance','Long Distance']},
    {brand:'Cavalor Endurix',desc:'Energy-dense muesli with L-carnitine for fat metabolism. Supports stamina and recovery for endurance and eventing horses.',tags:['Endurance','Stamina']},
    {brand:'Havens Natural Balance',desc:'Complete balanced muesli providing steady, long-lasting energy for recreational and trail horses with lighter workloads.',tags:['Trail Horse','Balanced']},
  ],
  digestive: [
    {brand:'Cavalor FiberGastro',desc:'Specifically formulated for horses with gastric sensitivity, ulcer risk, or digestive issues. High fiber, low starch, with natural stomach buffering.',tags:['Gastric','Ulcer Support']},
    {brand:'Havens Gastro Plus',desc:'Gastro-supportive muesli with prebiotics and probiotics. Ideal for horses prone to colic, ulcers, or stress-related digestive upset.',tags:['Gastric','Probiotics']},
    {brand:'Buckeye EQ8 Performance',desc:'Extruded feed with built-in gut health system. Combines prebiotics, probiotics, and postbiotics for a healthy microbiome.',tags:['Gut Health','Extruded']},
    {brand:'Red Mills Comfort Mash',desc:'Easy-to-digest mash feed for horses recovering from illness, dental issues, or surgery. Gentle on the digestive system.',tags:['Recovery','Easy Digest']},
  ],
};
function selectHorse(type){
  const recs = finderRecs[type] || [];
  const html = recs.map(r=>\`
    <div class="bg-cream rounded-xl p-5 border border-gray-200">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="font-bold text-navy-700">\${r.brand}</div>
        <div class="flex flex-wrap gap-1 justify-end">\${r.tags.map(t=>\`<span class="tag tag-perf text-xs">\${t}</span>\`).join('')}</div>
      </div>
      <p class="text-sm text-gray-600">\${r.desc}</p>
    </div>\`).join('');
  document.getElementById('finder-recs').innerHTML = html;
  document.getElementById('finder-step-1').classList.add('hidden');
  document.getElementById('finder-results').classList.remove('hidden');
}
function resetFinder(){
  document.getElementById('finder-step-1').classList.remove('hidden');
  document.getElementById('finder-results').classList.add('hidden');
}

// ─── Contact form ─────────────────────────────────────────────────────────────
async function submitContact(e){
  e.preventDefault();
  const btn = document.getElementById('contact-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sending...';
  const form = e.target;
  const data = {
    firstName: form.firstName.value, lastName: form.lastName.value,
    email: form.email.value, phone: form.phone.value,
    subject: form.subject.value, message: form.message.value
  };
  try {
    await fetch('/api/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    form.style.display = 'none';
    document.getElementById('contact-success').classList.remove('hidden');
  } catch {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Send Message';
  }
}

// ─── Chatbot ──────────────────────────────────────────────────────────────────
let chatOpen = false;
let chatMessages = [];
function toggleChat(){
  chatOpen = !chatOpen;
  const win = document.getElementById('chat-window');
  const icon = document.getElementById('chat-icon');
  win.classList.toggle('open', chatOpen);
  icon.className = chatOpen ? 'fas fa-times text-2xl' : 'fas fa-comment-dots text-2xl';
}
function quickAsk(q){ document.getElementById('chat-input').value=q; sendChat(); }
async function sendChat(){
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if(!msg) return;
  input.value = '';
  addChatBubble(msg, 'user');
  chatMessages.push({ role:'user', content: msg });
  const typing = addTypingIndicator();
  try {
    const res = await fetch('/api/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages: chatMessages })
    });
    const data = await res.json();
    typing.remove();
    const reply = data.reply || 'Please call us at (561) 633-6003 for help!';
    addChatBubble(reply, 'bot');
    chatMessages.push({ role:'assistant', content: reply });
  } catch {
    typing.remove();
    addChatBubble('Sorry, something went wrong. Please call (561) 633-6003!', 'bot');
  }
}
function addChatBubble(text, who){
  const div = document.createElement('div');
  div.className = (who==='user' ? 'chat-bubble-user ml-auto' : 'chat-bubble-bot') + ' text-sm p-3 max-w-xs w-fit';
  div.textContent = text;
  const msgs = document.getElementById('chat-messages');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}
function addTypingIndicator(){
  const div = document.createElement('div');
  div.className = 'chat-bubble-bot text-sm p-3 max-w-xs';
  div.innerHTML = '<span class="animate-pulse">Bri is typing...</span>';
  document.getElementById('chat-messages').appendChild(div);
  document.getElementById('chat-messages').scrollTop = 9999;
  return div;
}

// ─── Homepage Sections — live loader ─────────────────────────────────────────
// Fetches admin-saved section config from KV and re-renders each product section.
// Falls back silently to the hardcoded defaults already in the DOM if fetch fails.
async function loadHomepageSections() {
  let s;
  try {
    const r = await fetch('/admin/api/public/homepage-sections');
    if (!r.ok) return;
    const d = await r.json();
    if (!d.data) return;
    s = d.data;
  } catch(e) { return; }

  // ── Grain Brands ─────────────────────────────────────────────────────────
  if (s.grainVendors && s.grainVendors.length) {
    const grid = document.getElementById('grainBrandsGrid');
    if (grid) {
      grid.innerHTML = s.grainVendors.map(v => {
        const id = (v.vendor||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        const hasBrandModal = !!document.getElementById('modal-'+id);
        const clickAction = hasBrandModal ? \`openBrandModal('\${id}')\` : \`window.location='/products?q=\${encodeURIComponent(v.vendor||'')}'\`;
        return \`
        <div class="product-brand-card bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer"
             onclick="\${clickAction}">
          <div class="h-28 bg-cover bg-center relative" style="background-image:url('\${v.imgUrl||''}');background-color:\${v.color||'#f5f5f5'}">
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <div class="absolute bottom-2 left-3 right-3">
              <div class="text-white font-bold text-sm drop-shadow">\${v.vendor||''}</div>
            </div>
          </div>
          <div class="p-3">
            <p class="text-xs text-gray-400">\${v.tag||''}</p>
            <div class="mt-2 flex items-center gap-1 text-navy-700 text-xs font-semibold">
              View Products <i class="fas fa-chevron-right text-gold-400 text-xs"></i>
            </div>
          </div>
        </div>\`;
      }).join('');
    }
  }

  // ── Hay ───────────────────────────────────────────────────────────────────
  if (s.hay3 && s.hay3.length) {
    const el = document.getElementById('hay3Items');
    if (el) el.innerHTML = s.hay3.filter(Boolean).map(h => \`<div class="product-item pl-3 py-1 text-gray-600">\${h}</div>\`).join('');
  }
  if (s.hay2 && s.hay2.length) {
    const el = document.getElementById('hay2Items');
    if (el) el.innerHTML = s.hay2.filter(Boolean).map(h => \`<div class="product-item pl-3 py-1 text-gray-600">\${h}</div>\`).join('');
  }
  if (s.hayNote) {
    const box = document.getElementById('hayNoteBox');
    if (box) box.innerHTML = \`<i class="fas fa-info-circle text-gold-500 mr-2"></i>\${s.hayNote}\`;
  }

  // ── Shavings ──────────────────────────────────────────────────────────────
  const shavingsGrid = document.getElementById('shavingsGrid');
  if (shavingsGrid) {
    if (s.shavingsCatalog) {
      // Pull from catalog — items pre-loaded by /products page script, skip for homepage
      // (homepage doesn't load full catalog; just show note)
      shavingsGrid.innerHTML = \`<p class="text-sm text-gray-400 col-span-3 italic">Shavings products are managed in the catalog. <a href="/products?cat=Shavings" class="underline text-navy-700">Browse all shavings.</a></p>\`;
    } else if (s.shavings && s.shavings.length) {
      shavingsGrid.innerHTML = s.shavings.map(sv => \`
        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 card-hover flex gap-4">
          <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <i class="fas \${sv.icon||'fa-box'} text-amber-600"></i>
          </div>
          <div>
            <div class="font-bold text-navy-700 text-sm">\${sv.name||''}</div>
            <div class="text-xs text-gray-500 mt-1">\${sv.desc||''}</div>
          </div>
        </div>\`).join('');
    }
  }
  if (s.shavingsNote) {
    const el = document.getElementById('shavingsNote');
    if (el) el.innerHTML = \`<i class="fas fa-plus-circle text-gold-400 mr-1"></i>\${s.shavingsNote}\`;
  }

  // ── Supplements ───────────────────────────────────────────────────────────
  const suppsGrid = document.getElementById('suppsGrid');
  if (suppsGrid) {
    if (s.suppsCatalog) {
      suppsGrid.innerHTML = \`<p class="text-sm text-gray-400 col-span-3 italic">Supplement products are managed in the catalog. <a href="/products?cat=Supplements" class="underline text-navy-700">Browse all supplements.</a></p>\`;
    } else if (s.supps && s.supps.length) {
      suppsGrid.innerHTML = s.supps.map(sv => \`
        <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover">
          <div class="flex items-start justify-between mb-2">
            <div class="font-bold text-navy-700 text-sm">\${sv.name||''}</div>
            <span class="tag tag-special ml-2 flex-shrink-0">\${sv.cat||''}</span>
          </div>
          <p class="text-xs text-gray-500 leading-relaxed">\${sv.desc||''}</p>
        </div>\`).join('');
    }
  }
}
loadHomepageSections();

// ─── Site Content — apply saved editor data from KV ──────────────────────────
async function loadSiteContent() {
  try {
    const r = await fetch('/admin/api/public/site_content');
    if (!r.ok) return;
    const d = await r.json();
    // Public API returns { data: <stored_value> }
    // Stored value was saved as { value: {...fields} }
    const stored = d.data;
    const D = (stored && stored.value) ? stored.value : (stored || null);
    if (!D || typeof D !== 'object') return;

    // Helper
    const q  = s => document.querySelector(s);
    const qa = s => document.querySelectorAll(s);
    const g  = id => document.getElementById(id);

    // Hero
    if (D['hero-headline'])    { var e = q('#home h1'); if (e) e.innerHTML = D['hero-headline'].replace(/\\n/g,'<br/>'); }
    if (D['hero-subheadline']) { var e = q('#home .text-gold-400'); if (e) e.textContent = D['hero-subheadline']; }
    if (D['hero-desc'])        { var e = q('#home p.text-xl'); if (e) e.textContent = D['hero-desc']; }
    if (D['cta1']) { var e = q('#home a[href="#products"]'); if (e) e.innerHTML = '<i class="fas fa-search mr-2"></i>' + D['cta1']; }
    if (D['cta2']) { var e = q('#home a[href="#contact"]');  if (e) e.innerHTML = '<i class="fas fa-envelope mr-2"></i>' + D['cta2']; }
    if (D['hero-bg']) { var e = g('home'); if (e) e.style.backgroundImage = 'linear-gradient(to bottom, rgba(10,20,40,0.55) 0%, rgba(10,20,40,0.35) 50%, rgba(10,20,40,0.65) 100%), url(' + D['hero-bg'] + ')'; }

    // Stats bar
    var sn = qa('section.bg-navy-700 .text-3xl'), sl = qa('section.bg-navy-700 .text-sm');
    [1,2,3,4].forEach((n, i) => {
      if (D['stats-'+n+'-num']   && sn[i]) sn[i].textContent = D['stats-'+n+'-num'];
      if (D['stats-'+n+'-label'] && sl[i]) sl[i].textContent = D['stats-'+n+'-label'];
    });

    // About
    if (D['about-heading']) { var e = q('#about h2'); if (e) e.textContent = D['about-heading']; }
    var ap = qa('#about p.text-gray-600');
    if (D['about-para1'] && ap[0]) ap[0].innerHTML = D['about-para1'];
    if (D['about-para2'] && ap[1]) ap[1].innerHTML = D['about-para2'];
    if (D['about-para3'] && ap[2]) ap[2].innerHTML = D['about-para3'];
    if (D['about-image']) { var e = q('#about img'); if (e) e.src = D['about-image']; }

    // Services
    var sc = qa('#services .grid > div');
    [1,2,3].forEach((n, i) => { var c = sc[i]; if (!c) return;
      if (D['svc'+n+'-title']) { var h = c.querySelector('h3'); if (h) h.textContent = D['svc'+n+'-title']; }
      if (D['svc'+n+'-desc'])  { var p = c.querySelector('p'); if (p) p.textContent = D['svc'+n+'-desc']; }
      if (D['svc'+n+'-image']) { var bg = c.querySelector('[style*="background-image"]'); if (bg) bg.style.backgroundImage = 'url(' + D['svc'+n+'-image'] + ')'; }
    });

    // Team
    var tc = qa('#team .grid > div');
    [1,2].forEach((n, i) => { var c = tc[i]; if (!c) return;
      if (D['team'+n+'-name']) { var h = c.querySelector('h3'); if (h) h.textContent = D['team'+n+'-name']; }
      if (D['team'+n+'-role']) { var p = c.querySelector('p.text-gold-500'); if (p) p.textContent = D['team'+n+'-role']; }
      if (D['team'+n+'-bio'])  { var b = c.querySelector('p.text-gray-600'); if (b) b.textContent = D['team'+n+'-bio']; }
      if (D['team'+n+'-photo']) { var img = c.querySelector('img'); if (img) img.src = D['team'+n+'-photo']; }
    });
    if (D['quote-text'])   { var e = q('#team .italic'); if (e) e.textContent = D['quote-text']; }
    if (D['quote-author']) { var e = q('#team .font-semibold.text-gold-400'); if (e) e.textContent = D['quote-author']; }

    // Contact
    if (D['phone'])   { var els = qa('#contact [data-field="phone"],   #contact .contact-phone');   els.forEach(e => e.textContent = D['phone']); }
    if (D['email'])   { var els = qa('#contact [data-field="email"],   #contact .contact-email');   els.forEach(e => { e.textContent = D['email']; if (e.tagName==='A') e.href='mailto:'+D['email']; }); }
    if (D['address']) { var els = qa('#contact [data-field="address"], #contact .contact-address'); els.forEach(e => e.textContent = D['address']); }
    if (D['hours-wk'])   { var e = q('#contact .hours-wk');   if (e) e.textContent = D['hours-wk']; }
    if (D['hours-wknd']) { var e = q('#contact .hours-wknd'); if (e) e.textContent = D['hours-wknd']; }
    if (D['instagram']) { var e = q('a[href*="instagram"]'); if (e) e.href = D['instagram']; }
    if (D['facebook'])  { var e = q('a[href*="facebook"]');  if (e) e.href = D['facebook']; }

    // Delivery schedule
    if (D['delivery-schedule']) { renderDeliverySchedule(D['delivery-schedule']); }

    // SEO / meta
    if (D['seo-title'])    { document.title = D['seo-title']; var e = q('title'); if(e) e.textContent = D['seo-title']; }
    if (D['seo-desc'])     { var e = q('meta[name="description"]'); if (e) e.setAttribute('content', D['seo-desc']); }
    if (D['seo-keywords']) { var e = q('meta[name="keywords"]');    if (e) e.setAttribute('content', D['seo-keywords']); }
  } catch(e) {}
}
loadSiteContent();

// ─── Delivery Schedule ───────────────────────────────────────────────────────
const DEFAULT_DELIVERY_SCHEDULE = [
  { day: 'Monday',    areas: 'Northwest Loxahatchee, North Wellington, Palm Beach Point North, Southfields' },
  { day: 'Tuesday',   areas: 'C, E, F, G Road; Collecting Canal; Deer Run; Fox Trail; Sycamore; Palm Beach Point South' },
  { day: 'Wednesday', areas: 'D Road, Northwest Loxahatchee, White Fences, Lake Worth, Grand Prix, Flying Cow, North Wellington, Palm Beach Point North' },
  { day: 'Thursday',  areas: 'B, E, F, G Road; Collecting Canal; Deer Run; Jupiter; Grand Prix; Little Ranches; South Fields' },
  { day: 'Friday',    areas: 'East Loxahatchee, White Fences, Flying Cow, North Wellington, Palm Beach Point (North & South)' },
  { day: 'Saturday',  areas: 'A, B, C Road; Collecting Canal; Homeland' },
];

function renderDeliverySchedule(raw) {
  const el = document.getElementById('delivery-schedule-days');
  if (!el) return;
  let days = DEFAULT_DELIVERY_SCHEDULE;
  // raw can be JSON string or pre-parsed array
  if (raw) {
    try {
      const parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length) days = parsed;
    } catch(_) {
      // fallback to default
    }
  }
  el.innerHTML = days.map(d => \`
    <div class="delivery-day">
      <span class="delivery-day-name">\${d.day}</span>
      <span class="text-white/80">\${d.areas}</span>
    </div>
  \`).join('');
}
// Render default schedule on page load
renderDeliverySchedule(null);

// ─── Scroll reveal ────────────────────────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));

// ─── Our Story video: autoplay with audio when scrolled into view ─────────────
(function() {
  const video   = document.getElementById('story-video');
  const poster  = document.getElementById('story-poster');
  const unmute  = document.getElementById('story-unmute');
  if (!video) return;

  function startVideo() {
    video.muted = false;
    const p = video.play();
    if (p && p.then) {
      p.then(() => {
        // Autoplay with audio succeeded
        poster.classList.add('hidden');
        video.classList.remove('hidden');
        unmute.classList.add('hidden');
      }).catch(() => {
        // Audio blocked — try muted then show unmute button
        video.muted = true;
        video.play().then(() => {
          poster.classList.add('hidden');
          video.classList.remove('hidden');
          unmute.classList.remove('hidden');
        }).catch(() => {});
      });
    }
  }

  // Unmute when user taps the overlay button
  window.storyUnmute = function() {
    video.muted = false;
    unmute.classList.add('hidden');
  };

  // Trigger when video scrolls into view
  const vidObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        startVideo();
        vidObserver.disconnect();
      }
    });
  }, { threshold: 0.4 });
  vidObserver.observe(document.getElementById('story-media-wrap'));
})();
</script>

<!-- ── Delivery Schedule Modal (full-screen, works on all devices) ── -->
<div id="delivery-modal-overlay" onclick="if(event.target===this)this.classList.remove('open')">
  <div id="delivery-modal-box">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <span style="font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-weight:700;color:#C9A84C;letter-spacing:0.03em;">📅 Weekly Delivery Schedule</span>
      <button onclick="document.getElementById('delivery-modal-overlay').classList.remove('open')"
        style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
    </div>
    <div id="delivery-schedule-days"><!-- populated by JS --></div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.15);font-size:0.75rem;color:rgba(255,255,255,0.55);text-align:center;">
      Free delivery on orders $150+ · Minimal fuel surcharge applies
    </div>
  </div>
</div>

</body>
</html>`
}

// ── Brand card grid ────────────────────────────────────────────────────────────
function brandCards(): string {
  // Top 8 vendors by product count in catalog (from live catalog data)
  const brands = [
    { id:'farnam',    name:'Farnam',         logo:'',                                                                          color:'#fff7ed', tag:'Horse Health · Fly Control · Hoof',     img:'https://sspark.genspark.ai/cfimages?u1=APQFxRzBJu5iRG%2Be6%2BZSpV1FnL4sqrLBF61a2yu9f2v8MWczCNQSIgESkQQbf8iA%2FzJ5bD%2B4dbPiHRXn15DqqHv%2B714IxEzsafrHOXaCIR6eRXI4IYLxCq93T4CTomVNN%2FntdtJmtTsf&u2=FBjs72IGitspXxu9&width=600' },
    { id:'nutrena',   name:'Nutrena',        logo:'https://nutrenaworld.com/wp-content/themes/nutrena/img/logo.svg',           color:'#e8f0fe', tag:'SafeChoice · ProForce · Triumph',       img:'https://sspark.genspark.ai/cfimages?u1=Inli4Vrc%2Bq7q%2Bhejp2YDAGwFAIaUPxW7K%2FwGYXRV7M%2FosuAUR1Dg%2F0CYc7d60OG48eic0M3S7QLmL7rjvtV13G6oK3uyoFxL%2F6mCxQ%2BPP0S%2BoyvO&u2=KfyuzNFlfV1IBWO5&width=600' },
    { id:'foran',     name:'Foran',          logo:'',                                                                          color:'#f0fff4', tag:'Equine Supplements · Performance',      img:'https://sspark.genspark.ai/cfimages?u1=CqkH4kIYABdVpnuxtR4bJqyehkIDpq3%2BdUQr%2FcbR38crltam%2BSVdBNtylFtOjAIbQiLcBWuAmcW42P%2F3dPIBpRuDsEF8u9g2sBQuyCtXS5dMZ3gwEWb6n0c%2BANfOj1jFDmw%3D&u2=erPuew9pmVC%2BvkXw&width=600' },
    { id:'absorbine', name:'Absorbine',      logo:'',                                                                          color:'#fef9e8', tag:'Liniment · ShowSheen · Joint Support',  img:'https://sspark.genspark.ai/cfimages?u1=hzEbAV4lPpykIa5X9lcQ4jr%2Fm9mpHj9nzVfssr4frp4kAfrI%2BXGE%2BRdSmGkNbIxpnhntyl9t3x6ivKuK9ssLhnalkfNY3MPhQuv3a11VUri%2F6A%3D%3D&u2=Y3f3oehzecr27oyj&width=600' },
    { id:'cavalor',   name:'Cavalor',        logo:'https://cavalor.com/wp-content/uploads/2022/09/cavalor-logo.svg',          color:'#f0f7ff', tag:'Performix · FiberGastro · Strucomix',  img:'https://sspark.genspark.ai/cfimages?u1=onNaXY4%2FhbZvy5YUkL6RJRe7GDYh%2FXQ%2F9jUCePwxorXO0SXh9sJ4V5ZlP8bfJnaEM4xvG77mMoaKrx2Kh4NABnoukeaffKYGZCZbO8v6anEF9nDmP8mcozZwUEkzk0ZJI0S3JYPVUJekW5Q%2FTQ7Wo1Ym%2F384PTiYCw%3D%3D&u2=HvaCFz89bIhAFLwE&width=600' },
    { id:'redmills',  name:'Red Mills',      logo:'https://www.redmillshorse.com/wp-content/uploads/2019/01/logo.png',        color:'#fff0f0', tag:'Competition · Horse Care · Comfort',   img:'https://sspark.genspark.ai/cfimages?u1=7osbNYU1ox8HmUk%2Ff45sEFuifDuvcNmaipEgpuBsDXSH2IHPavx1l1F8XyLl6hGDuY9d7%2BNMCEuIiPfiM%2BXq2K%2BeZndZ3qLBoOkpr7yNJg%3D%3D&u2=2MbM4LT9HP0TC4eI&width=600' },
    { id:'havens',    name:'Havens',         logo:'',                                                                          color:'#f0fff4', tag:'Endurance · Gastro · Cool Mix',        img:'https://sspark.genspark.ai/cfimages?u1=dhrtoOORdnVmpeg5tu7Vf6iZPYmcuNy2bGs4%2F7HVf9X7%2FqSEKc8h4k8BEc2V5IGz%2BZu3%2FCtD5Qu55n%2F526YoYwwmmVccVgPnmttMjJxE%2FQk%3D&u2=7nQSyV4Lh9alc6Az&width=600' },
    { id:'keyflow',   name:'KeyFlow',        logo:'',                                                                          color:'#f5f0ff', tag:'Low Starch · Performance · Senior',     img:'https://sspark.genspark.ai/cfimages?u1=Vxz9lWjwxf2ZDBQw4sfUrkXEXV%2FJcZJZ%2FlYvsjswpMWnkrFwvhy8fUCTlInJHfSAcgbZhxIOUmLFM3lX4GvrTZqxqRl7aGNdVnzq9B9g7wZDh59ixKMAQk8Gp6G6Q1qmrlP2hg1jjhE%3D&u2=rkES%2F33%2By4pHTknJ&width=600' },
  ]
  return brands.map(b => `
    <div class="product-brand-card bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100"
         onclick="openBrandModal('${b.id}')">
      <div class="h-28 bg-cover bg-center relative" style="background-image:url('${b.img}')">
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
        <div class="absolute bottom-2 left-3 right-3">
          <div class="text-white font-bold text-sm drop-shadow">${b.name}</div>
        </div>
      </div>
      <div class="p-3">
        <p class="text-xs text-gray-400">${b.tag}</p>
        <div class="mt-2 flex items-center gap-1 text-navy-700 text-xs font-semibold">
          View Products <i class="fas fa-chevron-right text-gold-400 text-xs"></i>
        </div>
      </div>
    </div>`).join('')
}

// ── Brand modals with full product listings ────────────────────────────────────
function brandModals(): string {
  const brands: Record<string, {name:string; color:string; intro:string; products:{name:string;desc:string;tags:string[];protein?:string;fat?:string;fiber?:string}[]}> = {
    nutrena: {
      name: 'Nutrena', color: '#1B2A4A',
      intro: 'Nutrena is a science-driven American feed brand with decades of equine research. Their SafeChoice line features proprietary Digestive Shield™ technology for superior gut health and nutrient absorption.',
      products: [
        { name:'SafeChoice All Life Stages', protein:'14%', fat:'8%', fiber:'15%', tags:['All Horses','Performance','Controlled Starch'], desc:'Nutritionally balanced, controlled starch formula for all ages and activity levels, including performance horses. Features Digestive Shield™ for gut health, immune support, healthy coat, topline, and muscles. 10% NSC with organic trace minerals.' },
        { name:'SafeChoice Special Care', protein:'14%', fat:'7%', fiber:'21%', tags:['Easy Keeper','Metabolic','Ponies'], desc:'Only 10% NSC — the lowest starch formula in the SafeChoice line. Ideal for insulin-resistant horses, easy keepers, ponies, miniatures, and horses with metabolic concerns. Corn-free with Digestive Shield™.' },
        { name:'SafeChoice Senior', protein:'14%', fat:'8%', fiber:'16%', tags:['Senior','Complete Feed','Hard Keepers'], desc:'High fat and controlled starch formula for older horses, hard keepers, and performance horses. Can be fed as a complete feed. Supports digestive health, body condition, immune function, and muscle maintenance in aging horses.' },
        { name:'SafeChoice Senior Molasses Free', protein:'14%', fat:'8%', fiber:'16%', tags:['Senior','Molasses-Free'], desc:'Same high-quality senior nutrition without added molasses. Ideal for horses sensitive to molasses or owners preferring a cleaner ingredient list. Features Digestive Shield™ technology.' },
        { name:'SafeChoice Mare & Foal', protein:'16%', fat:'7%', fiber:'15%', tags:['Mares','Foals','Growing Horses'], desc:'16% protein controlled-starch formula for pregnant/lactating mares, weanlings, and yearlings. Supports healthy fetal development, milk production, and proper growth with complete amino acid profiles.' },
        { name:'SafeChoice Maintenance', protein:'12%', fat:'5%', fiber:'18%', tags:['Maintenance','Light Work'], desc:'Controlled starch formula for horses in maintenance or light exercise. Budget-friendly, complete nutrition for healthy horses that don\'t need high performance feeding rates.' },
        { name:'ProForce Fuel', protein:'12%', fat:'10%', fiber:'17%', tags:['Performance','High Fat','Energy'], desc:'Ultra-high fat (10%) performance feed for horses in intense training. Provides cool energy from fat rather than starch — reducing excitability and metabolic stress while fueling intense athletic output.' },
        { name:'ProForce Fuel XF', protein:'12%', fat:'10%', fiber:'17%', tags:['Performance','Extended Fuel'], desc:'Extended version of ProForce Fuel with additional fiber sources. Ideal for horses that need sustained caloric energy without digestive disruption during hard training and competition schedules.' },
        { name:'ProForce Senior', protein:'12%', fat:'10%', fiber:'17%', tags:['Senior','High Fat','Performance'], desc:'High-fat ProForce formula designed for senior horses that remain active or in light competition. Bridges the gap between performance nutrition and senior care.' },
        { name:'Triumph Complete', protein:'10%', fat:'4%', fiber:'22%', tags:['Economy','Maintenance'], desc:'Complete and balanced pelleted horse feed for maintenance horses. Affordable all-in-one solution that provides quality nutrition for recreational horses and easy keepers.' },
        { name:'Triumph Professional Pellet', protein:'12%', fat:'4%', fiber:'20%', tags:['Pellet','Moderate Work'], desc:'Professional-grade pelleted feed for horses in moderate work. Clean pellet format with quality protein and energy sources for consistent daily nutrition.' },
        { name:'Triumph Fiber Plus', protein:'10%', fat:'5%', fiber:'25%', tags:['High Fiber','Digestive'], desc:'High fiber formula supporting digestive health. Extra fiber helps horses feel full longer, reduces cribbing behavior, and supports a healthy hindgut environment.' },
        { name:'Triumph Senior', protein:'12%', fat:'5%', fiber:'22%', tags:['Senior','Economy'], desc:'Economy senior formula providing complete nutrition for older horses. Good option for senior horses in maintenance or light work who need digestive support without premium pricing.' },
        { name:'Empower Digestive Balance', protein:'18%', fat:'5%', fiber:'20%', tags:['Balancer','Digestive'], desc:'Ration balancer with pre, pro, and postbiotics for outstanding digestive health. Balances nutrient gaps in hay and pasture without adding unnecessary calories.' },
      ]
    },
    proelite: {
      name: 'Pro Elite', color: '#2D4A7A',
      intro: 'Pro Elite is the ultra-premium performance feed brand from Cargill, formulated with guaranteed amino acid profiles, locked formulas, and industry-leading broad-spectrum prebiotics, probiotics, and postbiotics for digestive excellence.',
      products: [
        { name:'Pro Elite Performance', protein:'12%', fat:'10%', fiber:'18%', tags:['Performance','Show Horse','Beet Pulp'], desc:'Beet-pulp based textured feed for mature show and performance horses. High fat (10%) provides cool, sustained energy. Guaranteed levels of all 4 key amino acids: lysine, methionine, threonine, and tryptophan. Locked formula for consistency.' },
        { name:'Pro Elite Senior', protein:'14%', fat:'10%', fiber:'20%', tags:['Senior','Low Starch','Show Horse'], desc:'Textured feed with low starch and sugar for the special nutritional needs of older and senior horses. Specially designed to maintain weight, muscle, and coat quality in aging performance horses.' },
        { name:'Pro Elite Grass Advantage', protein:'30%', fat:'5%', fiber:'18%', tags:['Balancer','Broodmares','Grass-Fed'], desc:'30% protein pelleted diet balancer with a very low feeding rate (1–2 lbs/day). Balances grass and mixed forage rations for broodmares, growing horses, performance horses, and easy keepers without excess calories.' },
        { name:'Pro Elite Growth', protein:'16%', fat:'8%', fiber:'16%', tags:['Foals','Growing','Broodmares'], desc:'Textured feed for foals, growing horses, and broodmares. Formulated for sound skeletal development with balanced calcium:phosphorus ratio, guaranteed amino acids, and controlled starch to support healthy growth.' },
        { name:'Pro Elite Starch Wise', protein:'12%', fat:'8%', fiber:'22%', tags:['Low Starch','Metabolic','Sensitive'], desc:'Low starch and sugar pelleted feed for mature show and performance horses with metabolic sensitivities. Corn-free and molasses-limited formula for horses prone to insulin resistance or laminitis.' },
        { name:'Pro Elite Omega Advantage', protein:'18%', fat:'24%', fiber:'15%', tags:['Weight Gain','High Fat','Coat'], desc:'Extruded pellet weight and appearance supplement with 24% fat enriched with flax and added vitamin E. Designed to support weight gain, coat shine, and performance appearance when combined with a fortified diet.' },
        { name:'Pro Elite Topline Advantage', protein:'30%', fat:'8%', fiber:'15%', tags:['Topline','Muscle','Show Horse'], desc:'High-protein extruded supplement specifically targeting topline muscle development and maintenance. Perfect for show horses, rescues, OTTBs, or any horse needing improved muscle condition.' },
        { name:'Pro Elite Hoof', tags:['Supplement','Hoof','Skin'], desc:'Comprehensive hoof health supplement providing biotin, zinc, methionine, and omega fatty acids for strong, healthy hoof growth. Also supports skin and coat quality as secondary benefits.' },
        { name:'Pro Elite GutBiome', tags:['Supplement','Gut Health','Probiotics'], desc:'Advanced gut microbiome support supplement using research-proven pre, pro, and postbiotics. Optimizes digestive efficiency, nutrient absorption, and immune function through a healthy hindgut environment.' },
        { name:'Pro Elite Joint', tags:['Supplement','Joint','Cartilage'], desc:'Research-proven joint health supplement with glucosamine, chondroitin, hyaluronic acid, and omega fatty acids. Supports healthy cartilage, joint lubrication, and mobility in active and aging performance horses.' },
      ]
    },
    cavalor: {
      name: 'Cavalor', color: '#1B2A4A',
      intro: 'Cavalor is a Belgian premium equine nutrition brand trusted by Olympic riders and top equestrians worldwide. Their mueslis use visible, high-quality ingredients with puffed and extruded grains for superior digestibility.',
      products: [
        { name:'Cavalor Performix (WB)', protein:'12%', fat:'7%', fiber:'14%', tags:['Performance','Level 5','Sport Horse'], desc:'Top-level sport horse muesli for horses competing at the highest levels (Level 4–5). Contains puffed and extruded cereals with sport essential multi-vitamins. For jumpers, dressage horses, and eventers in intensive training.' },
        { name:'Cavalor Fiber Force', protein:'10%', fat:'5%', fiber:'25%', tags:['High Fiber','Maintenance','Sensitive'], desc:'High-fiber pellet for horses needing extra fiber support. Excellent for maintaining gut motility, reducing ulcer risk, and supporting healthy digestion. Suitable for easy keepers and sensitive horses.' },
        { name:'Cavalor Strucomix Original', protein:'11%', fat:'5%', fiber:'18%', tags:['All-Round','Moderate Work','Level 2–3'], desc:'All-round muesli for horses in regular moderate training (Level 2–3). Visible whole grain ingredients with balanced nutrition for sport and leisure horses. One of Cavalor\'s most popular products.' },
        { name:'Cavalor Strucomix Senior', protein:'14%', fat:'6%', fiber:'20%', tags:['Senior','Easy Digest','Oat-Free'], desc:'Fibre-rich muesli with puffed and extruded grains specifically for older horses. Long alfalfa fibres stimulate chewing (900 chewing movements/kg). Oat-free option available. Supports intestinal motility in aging horses.' },
        { name:'Cavalor Mash Mix', tags:['Recovery','Warm-Up','Rehydration'], desc:'Warm mash mixture for post-competition recovery, cold weather care, or horses needing extra gut stimulation. Combines beet pulp, linseed, and herbs to warm the gut and support rehydration and digestion.' },
        { name:'Cavalor Pianissimo', protein:'10%', fat:'5%', fiber:'22%', tags:['Calming','Low Sugar','Easy Keeper'], desc:'Special care muesli for sensitive, nervous, or excitable horses. Low sugar, low starch formula with natural calming ingredients. Suitable for metabolic horses, easy keepers, and horses in stressful environments.' },
        { name:'Cavalor Endurix', protein:'11%', fat:'8%', fiber:'18%', tags:['Endurance','Stamina','Long Distance'], desc:'High-energy endurance muesli with L-carnitine to optimize fat metabolism. Supports stamina, aerobic capacity, and efficient energy use during long-distance riding, endurance events, and cross-country competition.' },
        { name:'Cavalor WholyGain', protein:'16%', fat:'12%', fiber:'15%', tags:['Weight Gain','High Fat','Hard Keepers'], desc:'Concentrated weight gain supplement in muesli form. High in quality fats and proteins for horses that need to gain weight, improve body condition, or recover from illness or heavy competition.' },
        { name:'Cavalor FiberGastro', protein:'11%', fat:'5%', fiber:'28%', tags:['Gastric','Ulcer Support','Sensitive'], desc:'Specially formulated for horses at risk of gastric ulcers or with digestive sensitivity. High fiber, very low starch (6% NSC), with natural buffering ingredients to protect the gastric mucosa and support a healthy stomach environment.' },
      ]
    },
    redmills: {
      name: 'Red Mills', color: '#8B1A1A',
      intro: 'Red Mills is an Irish premium feed brand with 150+ years of tradition, trusted by Olympic equestrians. Their feeds use high-quality ingredients including oats, barley, and alfalfa with no artificial additives.',
      products: [
        { name:'Competition 10% Mix', protein:'10%', fat:'4%', fiber:'12%', tags:['Competition','Mix','Moderate Energy'], desc:'Competition-grade textured mix for horses in light to moderate competition work. Clean ingredients with no artificial colors or preservatives. 10% protein with quality digestible energy from oats and barley.' },
        { name:'Competition 12% Mix', protein:'12%', fat:'5%', fiber:'12%', tags:['Competition','Mix','Active'], desc:'Higher protein competition mix for horses in regular competition or intensive training. Supports muscle maintenance and recovery with quality Irish-sourced grain ingredients.' },
        { name:'Competition 14% Mix', protein:'14%', fat:'6%', fiber:'12%', tags:['Competition','High Protein','Performance'], desc:'High-protein performance mix for top-level competition horses. 14% protein with elevated fat for sustained energy, ideal for showjumpers, event horses, and racehorses in peak training.' },
        { name:'Horse Care 10% Pellets', protein:'10%', fat:'4%', fiber:'14%', tags:['All-Round','Pellet','Maintenance'], desc:'Complete nutritionally balanced pellet for horses in light to moderate work. Easy-to-feed pellet format with added vitamins and minerals. Suitable for recreational horses and easy keepers.' },
        { name:'Horse Care 10% Mix', protein:'10%', fat:'4%', fiber:'14%', tags:['All-Round','Mix','Maintenance'], desc:'Textured mix version of Horse Care 10%. Clean whole grain ingredients for horses in maintenance and light work. Popular choice for leisure horses and breeding stock.' },
        { name:'Horse Care 14% Pellets', protein:'14%', fat:'6%', fiber:'13%', tags:['Performance','Pellet','High Protein'], desc:'High-protein pellet for performance and breeding horses. 14% protein supports muscle, growth, and reproductive performance with no artificial additives.' },
        { name:'Horse Care 14% Mix', protein:'14%', fat:'6%', fiber:'13%', tags:['Performance','Mix','Breeding'], desc:'Textured 14% protein mix for competition, performance, and breeding horses. Visible quality ingredients with balanced amino acid profiles for muscle development and maintenance.' },
        { name:'Horse Care Ultra Pellets', protein:'16%', fat:'8%', fiber:'13%', tags:['Ultra Premium','Muscle','Recovery'], desc:'Ultra-premium high protein (16%) and fat (8%) pellet for horses with high nutritional demands. Supports rapid recovery, muscle building, and peak performance in elite equine athletes.' },
        { name:'PerformaCare Balancer', protein:'32%', fat:'5%', fiber:'15%', tags:['Balancer','Low Rate','Supplements Hay'], desc:'High-protein ration balancer fed at low rate (400–600g/day) to balance hay and pasture rations. Perfect for easy keepers, good-doers, and horses on forage-only diets needing vitamin and mineral supplementation.' },
        { name:'Comfort Mash', protein:'10%', fat:'5%', fiber:'28%', tags:['Recovery','Mash','Senior','Post-Surgery'], desc:'Highly digestible warm mash for horses recovering from illness, surgery, or for seniors with dental challenges. Beet pulp-based with high fiber. Soak in hot water for a warm, comforting, easy-to-eat meal.' },
      ]
    },
    havens: {
      name: 'Havens', color: '#2D5A1B',
      intro: 'Havens is a Dutch premium horse feed brand producing high-quality mueslis for horses at every level. Known for their visible, recognizable ingredients and sport-specific formulations trusted by European equestrians.',
      products: [
        { name:'Havens Cool Mix', tags:['Calming','Leisure','Low Energy'], desc:'Fiber-rich muesli for horses that tend to be over-energetic or nervous. Low sugar and starch with calming ingredients. Ideal for horses in light work, after competition, or horses with "hot" temperaments.' },
        { name:'Havens Draversbrok', tags:['Trotting Sport','Harness','Moderate Energy'], desc:'Traditional Dutch sport muesli originally developed for harness racing horses. Provides clean, sustained energy with quality oats and corn. Popular with leisure riding and moderate sport horses.' },
        { name:'Havens Endurance', tags:['Endurance','Distance Riding','Aerobic'], desc:'Purpose-built muesli for endurance horses covering 40–160km distances. High fiber with slow-release carbohydrates and electrolyte support. Maintains energy without metabolic spikes during ultra-long rides.' },
        { name:'Havens Gastro Plus', tags:['Gastric','Ulcer','Sensitive Gut'], desc:'Gut-health focused muesli with prebiotics, probiotics, and high fiber content. Supports horses prone to gastric ulcers, colic, or digestive sensitivity. Low starch formula protects the stomach lining.' },
        { name:'Havens Natural Balance', tags:['All-Round','Balanced','Leisure'], desc:'Complete balanced muesli for horses in regular recreational and leisure riding. Provides steady energy, good body condition, and coat quality without excess calories. Great everyday option for non-competing horses.' },
        { name:'Havens Performance 14', protein:'14%', fat:'6%', fiber:'16%', tags:['Performance','Competition','14% Protein'], desc:'Performance muesli with 14% protein for horses in active competition. Formulated for jumpers, dressage horses, and eventers in regular training. Supports muscle development, recovery, and sustained athletic performance.' },
        { name:'Havens Power Plus Mix', tags:['Hard Keepers','High Energy','Weight Gain'], desc:'High energy power muesli for horses struggling to maintain weight under heavy training or competition. Extra fat and calorie-dense ingredients support weight gain and sustained energy output.' },
        { name:'Havens Slobber Mash', tags:['Recovery','Warm Mash','Rehydration'], desc:'Warm mash for muscle recovery, post-competition care, and horses in cold weather. Rich in fiber with hydrating beet pulp and linseed. Stimulates gut motility and encourages water intake.' },
        { name:'Havens Sport Muesli', tags:['Sport','Moderate-High Energy','All Disciplines'], desc:'Versatile sport muesli for horses across all equestrian disciplines in regular training. Clean visible ingredients with performance-supporting vitamins and minerals.' },
        { name:'Havens Green Vet Herbal Muesli', tags:['Herbal','Natural','Wellness'], desc:'Herb-enriched muesli for horses benefiting from natural plant extracts. Supports general wellness, immune function, and digestion. Popular for horses with a preference for natural feeding approaches.' },
      ]
    },
    buckeye: {
      name: 'Buckeye Nutrition', color: '#8B4513',
      intro: 'Buckeye Nutrition is an Ohio-based premium horse feed company focused on extruded and textured feeds with advanced gut health systems. Their EQ8 line features a proprietary prebiotics, probiotics, and postbiotics blend.',
      products: [
        { name:'EQ8 Performance', protein:'12%', fat:'8%', fiber:'18%', tags:['Performance','Gut Health','Extruded'], desc:'Extruded performance feed with Buckeye\'s EQ8 gut health system (prebiotics, probiotics, postbiotics). Highly digestible extruded format maximizes nutrient absorption. Ideal for performance horses needing gut health support alongside energy.' },
        { name:'EQ8 Senior', protein:'14%', fat:'8%', fiber:'20%', tags:['Senior','Gut Health','Multi-Textured'], desc:'Multi-textured senior feed combining the EQ8 gut health system with senior-specific nutrition. High fiber, controlled energy, and easy-to-chew textures for aging horses with dental or digestive challenges.' },
        { name:'Cadence Ultra', protein:'12%', fat:'8%', fiber:'20%', tags:['Performance','Sweet Feed','High Energy'], desc:'Sweet pelleted performance feed providing calorie-dense nutrition for horses in intense training. High fat and digestible energy with palatable sweet formula. Popular with hard keepers needing calorie density.' },
        { name:'Gro-N-Win Ration Balancer', protein:'30%', fat:'5%', fiber:'15%', tags:['Balancer','Growing Horses','Low Calorie'], desc:'High-protein ration balancer (30%) fed at low rates to complete forage diets for growing horses. Provides balanced vitamins, minerals, and amino acids without calorie overload. Ideal for young horses on good pasture.' },
        { name:'Senior Balancer', protein:'32%', fat:'5%', fiber:'15%', tags:['Balancer','Senior','Low Rate'], desc:'Ration balancer specifically formulated for senior horses. Fed at low rates to balance hay/pasture diets with essential vitamins, minerals, and amino acids that aging horses need without excessive calories.' },
        { name:'Safe N Easy Pelleted', protein:'12%', fat:'5%', fiber:'20%', tags:['Easy Keeper','Pellet','Low Starch'], desc:'Low starch pelleted feed for easy keepers, ponies, and metabolically sensitive horses. Clean, simple formula providing essential nutrition without excess sugar or starch.' },
        { name:'Safe N Easy Performance Pelleted', protein:'12%', fat:'8%', fiber:'18%', tags:['Performance','Low Starch','Pelleted'], desc:'Performance version of Safe N Easy with increased fat for energy. Low starch formula keeps metabolic horses safe while providing performance-level calories from fat sources.' },
        { name:'Safe N Easy Senior Extruded', protein:'14%', fat:'8%', fiber:'20%', tags:['Senior','Extruded','Easy Digest'], desc:'Extruded senior formula for maximum digestibility. Highly processed for horses with poor digestion, dental issues, or those recovering from illness. Easy on the gut with complete senior nutrition.' },
        { name:'Safe N Easy Textured', protein:'12%', fat:'5%', fiber:'20%', tags:['Easy Keeper','Textured','All-Round'], desc:'Textured version of Safe N Easy providing visible ingredients with low starch content. Great for horses that prefer a textured feed but need a safer, lower-sugar formula.' },
      ]
    },
    cryptoaero: {
      name: 'Crypto Aero', color: '#2D6A1B',
      intro: 'Crypto Aero is an innovative wholefood horse feed brand using real, recognizable ingredients — seeds, grains, and herbs — with no artificial preservatives, dyes, or synthetic additives. Loved by natural horse-keeping enthusiasts.',
      products: [
        { name:'Crypto Aero Wholefood Horse Feed (Original)', tags:['All-Natural','Wholefood','No Synthetics'], desc:'The original Crypto Aero formula featuring real whole seeds, herbs, and grains including flax, hemp, chia, oats, and more. No artificial colors, preservatives, or synthetic vitamins. Complete nutrition from real food sources.' },
        { name:'Crypto Aero Wholefood — High Performance', tags:['Performance','All-Natural','High Energy'], desc:'Performance-level wholefood formula with additional fat and protein from natural sources. Supports athletic performance, coat quality, and muscle development without synthetic additives or fillers.' },
      ]
    },
    kent: {
      name: 'Kent Sentinel', color: '#4A3728',
      intro: 'Kent Nutrition Group\'s Sentinel Premium Horse Feed line offers a range of quality feeds crafted with carefully selected ingredients for horses at every life stage and activity level.',
      products: [
        { name:'Sentinel Performance LS (Low Starch)', protein:'12%', fat:'8%', fiber:'22%', tags:['Low Starch','Performance','Sensitive'], desc:'Low starch performance feed for horses that need energy without the metabolic risks of high-sugar feeds. Supports athletic performance while maintaining digestive and metabolic safety.' },
        { name:'Sentinel Senior', protein:'14%', fat:'8%', fiber:'20%', tags:['Senior','Complete Feed'], desc:'Complete senior horse feed with higher protein and fat to support older horses. Easy to chew and digest with added vitamins and minerals for whole-body health in aging horses.' },
        { name:'Sentinel Lite', protein:'12%', fat:'4%', fiber:'25%', tags:['Easy Keeper','Low Calorie','Maintenance'], desc:'Low-calorie, high-fiber formula for easy keepers, horses prone to weight gain, or those needing a controlled diet without sacrificing essential nutrition.' },
        { name:'Sentinel Growth', protein:'16%', fat:'6%', fiber:'16%', tags:['Growing','Foals','Yearlings'], desc:'Development feed for foals, weanlings, and yearlings. Balanced calcium:phosphorus ratio and quality protein sources support strong bone structure and healthy muscle development.' },
      ]
    },
  }

  return Object.entries(brands).map(([id, brand]) => `
  <div id="modal-${id}" class="modal-overlay">
    <div class="modal-content">
      <div class="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white rounded-t-2xl z-10" style="border-top:4px solid ${brand.color}">
        <div>
          <h2 class="font-serif text-2xl font-bold text-navy-700">${brand.name}</h2>
          <p class="text-sm text-gray-400">${brand.products.length} products available at British Feed</p>
        </div>
        <button onclick="closeBrandModal('${id}')" class="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-all flex-shrink-0">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="p-6">
        <div class="bg-cream rounded-xl p-4 mb-6 text-sm text-gray-600 leading-relaxed border-l-4" style="border-color:${brand.color}">
          ${brand.intro}
        </div>
        <div class="space-y-4">
          ${brand.products.map(p => `
            <div class="bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-300 transition-all shadow-sm">
              <div class="flex flex-wrap items-start gap-3 mb-2">
                <h3 class="font-bold text-navy-700 text-base flex-1">${p.name}</h3>
                <div class="flex flex-wrap gap-1">
                  ${p.tags.map(t=>`<span class="tag tag-perf text-xs">${t}</span>`).join('')}
                </div>
              </div>
              ${p.protein || p.fat || p.fiber ? `
              <div class="flex gap-4 my-2 text-xs">
                ${p.protein ? `<span class="bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-semibold">Protein: ${p.protein}</span>` : ''}
                ${p.fat ? `<span class="bg-yellow-50 text-yellow-700 px-2 py-1 rounded-full font-semibold">Fat: ${p.fat}</span>` : ''}
                ${p.fiber ? `<span class="bg-green-50 text-green-700 px-2 py-1 rounded-full font-semibold">Fiber: ${p.fiber}</span>` : ''}
              </div>` : ''}
              <p class="text-sm text-gray-600 leading-relaxed">${p.desc}</p>
            </div>`).join('')}
        </div>
        <div class="mt-6 bg-navy-700 rounded-xl p-4 text-white text-sm flex items-center gap-3">
          <i class="fas fa-info-circle text-gold-400 text-lg flex-shrink-0"></i>
          <div>Questions about ${brand.name} products? <a href="tel:5616336003" class="text-gold-400 font-bold hover:underline">(561) 633-6003</a> or use the AI chat below for personalized recommendations.</div>
        </div>
      </div>
    </div>
  </div>`).join('')
}

export default app

// ═══════════════════════════════════════════════════════════════════════════
//  MAGAZINE-STYLE PRINTABLE CATALOG
// ═══════════════════════════════════════════════════════════════════════════
function getCatalogPrintHTML(liveProducts: any[]): string {
  const year = new Date().getFullYear()
  const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── Vendor brand metadata (icons, descriptions) ──────────────────────────
  const brandMeta: Record<string, { icon: string; desc: string; highlight: string }> = {
    'Nutrena':                  { icon: '🌾', desc: 'Science-backed nutrition trusted by competitive riders and backyard horse owners alike.', highlight: 'SafeChoice · ProForce · Empower' },
    'Red Mills':                { icon: '🏆', desc: 'Irish-made performance feeds formulated for equine athletes at the highest levels of sport.', highlight: 'Competition · Racehorse · Stud' },
    'Triple Crown':             { icon: '⭐', desc: 'Premium nutrient-dense feeds with organic minerals and quality forage ingredients.', highlight: 'Senior · Growth · 30% Supplement' },
    'Cavalor':                  { icon: '🐎', desc: 'Belgian sports nutrition — the choice of Olympic and FEI-level competitors worldwide.', highlight: 'Opti Force · FiberForce · Endurix' },
    'Buckeye':                  { icon: '🌿', desc: 'Ohio-crafted feeds focused on digestive health and natural ingredients for all life stages.', highlight: 'Gro-N-Win · Safe N Easy · Cadence Ultra' },
    'Havens':                   { icon: '🇩🇪', desc: 'Premium German forage feeds — high fibre, low sugar, ideal for metabolic horses.', highlight: 'Healty · Coarse Muesli · Good Performance' },
    'Foran':                    { icon: '🧪', desc: 'Irish veterinary-developed supplements for performance, recovery, and metabolism.', highlight: 'Chevinal · Buccloze · Phosphogen' },
    'Absorbine':                { icon: '💪', desc: 'America\'s most trusted equine grooming and topical care brand since 1892.', highlight: 'Veterinary Liniment · ShowSheen · UltraShield' },
    'Farnam':                   { icon: '🛡️', desc: 'Comprehensive fly control, health, and management products for every horse owner.', highlight: 'Fly Sprays · Electrolytes · Psyllium' },
    'Finish Line':              { icon: '🏁', desc: 'Targeted supplements for gut health, hydration, and peak performance recovery.', highlight: 'U-7 · Apple-A-Day · Iron Power' },
    'Cowboy Magic':             { icon: '✨', desc: 'Professional detangling and coat care products loved by show grooms worldwide.', highlight: 'Detangler · Rosewater · Greenspot' },
    'Andis':                    { icon: '✂️', desc: 'Professional-grade clippers and grooming tools used by top show barns.', highlight: 'Clippers · Blades · Trimmers' },
    'Standlee':                 { icon: '🌱', desc: 'Premium Timothy and alfalfa hay products — convenient, dust-free, consistent quality.', highlight: 'Timothy Grass · Alfalfa · Hay Cubes' },
    'K.E.R':                    { icon: '🔬', desc: 'Kentucky Equine Research — science-first nutrition consulting and precision supplements.', highlight: 'Restore SR · EO-3 · RiteTrac' },
    'SynNutra':                 { icon: '💊', desc: 'Targeted equine supplements for joints, gut, and overall wellness.', highlight: 'Joint · Probiotics · Omega' },
    'Generic':                  { icon: '🏪', desc: 'House brand and multi-brand selection — essential everyday products at great value.', highlight: 'Shavings · Hay · Grooming essentials' },
    'British Horse Feeds':      { icon: '🇬🇧', desc: 'UK-heritage fibre feeds bringing British horse keeping tradition to South Florida.', highlight: 'Speedi-Beet · Fibergy Plus' },
    'Canter':                   { icon: '🐴', desc: 'Luxury coat and mane care formulated for show horses and sensitive skin.', highlight: 'Conditioning · Mane & Tail · Shine' },
    'E3':                       { icon: '⚡', desc: 'High-performance electrolyte and conditioning products for hard-working horses.', highlight: 'Shampoo · Coat Care' },
  }

  // ── Category metadata ─────────────────────────────────────────────────────
  const catMeta: Record<string, { icon: string; color: string }> = {
    'Horse Feed':               { icon: '🌾', color: '#1B2A4A' },
    'Supplements':              { icon: '💊', color: '#2E5339' },
    'Hay':                      { icon: '🌿', color: '#5C7A3E' },
    'Hay Cubes & Pellets':      { icon: '📦', color: '#5C7A3E' },
    'Shavings & Bedding':       { icon: '🛏️', color: '#8B6914' },
    'Fly Sprays':               { icon: '🪰', color: '#7B3F00' },
    'Fly Control Supplements':  { icon: '🛡️', color: '#7B3F00' },
    'Grooming':                 { icon: '✨', color: '#4A2B6B' },
    'Shampoo & Coat Care':      { icon: '🫧', color: '#4A2B6B' },
    'Clippers & Tools':         { icon: '✂️', color: '#2C4A6B' },
    'Liniments & Topicals':     { icon: '💪', color: '#6B2C2C' },
    'Electrolytes':             { icon: '⚡', color: '#1A5276' },
    'Gut Health':               { icon: '🫀', color: '#884EA0' },
    'Psyllium Supplements':     { icon: '🌱', color: '#1E8449' },
    'Oils':                     { icon: '🫙', color: '#B7950B' },
    'Leather Care':             { icon: '🟫', color: '#784212' },
  }

  // ── Load products: use live KV products if available, else embed static note ─
  // Products are passed in from the route handler (KV-first)
  // At print time we fetch from the API on the client side for always-fresh data
  const hasLiveData = liveProducts.length > 0

  // ── Build category → products map ─────────────────────────────────────────
  const byCategory: Record<string, any[]> = {}
  const byVendor: Record<string, any[]> = {}
  liveProducts.forEach(p => {
    const cat = p.category || 'Other'
    const ven = p.vendor || p.brand || 'Other'
    if (!byCategory[cat]) byCategory[cat] = []
    if (!byVendor[ven]) byVendor[ven] = []
    byCategory[cat].push(p)
    byVendor[ven].push(p)
  })

  const categories = Object.keys(byCategory).sort()
  const vendors    = Object.keys(byVendor).sort()

  // ── TOC entries ───────────────────────────────────────────────────────────
  const tocSections = [
    { title: 'About British Feed & Supplies', page: 2 },
    { title: 'Why Choose Us',                page: 3 },
    { title: 'Our Services',                 page: 4 },
    { title: 'Product Index by Category',    page: 5 },
    ...categories.map((cat, i) => ({ title: cat, page: 6 + i })),
  ]

  // ── Per-product row HTML ──────────────────────────────────────────────────
  function productRow(p: any): string {
    const price = p.priceFormatted || (p.price ? `$${Number(p.price).toFixed(2)}` : 'Call for Price')
    const stock = p.inStock !== false ? '<span class="in-stock">✓ In Stock</span>' : '<span class="oos">Call</span>'
    const desc = (p.description || '').replace(/—\s*available at British Feed.*?to order\./gi, '').trim()
    const shortDesc = desc.length > 120 ? desc.slice(0, 117) + '…' : desc
    return `<tr>
      <td class="prod-name">${escHtml(p.name)}</td>
      <td class="prod-brand">${escHtml(p.brand || p.vendor || '')}</td>
      <td class="prod-desc">${escHtml(shortDesc)}</td>
      <td class="prod-price">${escHtml(price)}</td>
      <td class="prod-stock">${stock}</td>
    </tr>`
  }

  function escHtml(s: string): string {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  // ── Category section pages ────────────────────────────────────────────────
  function categoryPages(): string {
    return categories.map(cat => {
      const prods = byCategory[cat]
      const meta = catMeta[cat] || { icon: '📋', color: '#1B2A4A' }
      // Group within category by vendor/brand
      const vendorGroups: Record<string, any[]> = {}
      prods.forEach(p => {
        const v = p.vendor || p.brand || 'Other'
        if (!vendorGroups[v]) vendorGroups[v] = []
        vendorGroups[v].push(p)
      })
      const vendorList = Object.entries(vendorGroups).sort(([a],[b]) => a.localeCompare(b))

      return `
<div class="page category-page">
  <div class="cat-header" style="background:${meta.color}">
    <div class="cat-header-icon">${meta.icon}</div>
    <div>
      <div class="cat-header-title">${cat}</div>
      <div class="cat-header-sub">${prods.length} product${prods.length !== 1 ? 's' : ''} · ${vendorList.length} brand${vendorList.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="cat-header-logo">British Feed<br/>&amp; Supplies</div>
  </div>

  ${vendorList.map(([vendor, vprods]) => `
  <div class="vendor-block">
    <div class="vendor-label">${escHtml(vendor)}</div>
    <table class="prod-table">
      <thead><tr>
        <th class="th-name">Product</th>
        <th class="th-brand">Brand</th>
        <th class="th-desc">Description</th>
        <th class="th-price">Price</th>
        <th class="th-stock">Avail.</th>
      </tr></thead>
      <tbody>${vprods.map(productRow).join('')}</tbody>
    </table>
  </div>`).join('')}

  <div class="page-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd, Loxahatchee Groves, FL 33470 · (561) 633-6003 · britishfeed.com</span>
    <span>${cat} · ${monthYear}</span>
  </div>
</div>`
    }).join('\n')
  }

  // ── Vendor summary cards for marketing page ───────────────────────────────
  function vendorCards(): string {
    return vendors.map(v => {
      const meta = brandMeta[v] || { icon: '🏪', desc: '', highlight: '' }
      const count = byVendor[v].length
      return `<div class="brand-card">
        <div class="brand-card-icon">${meta.icon}</div>
        <div class="brand-card-name">${escHtml(v)}</div>
        <div class="brand-card-count">${count} product${count !== 1 ? 's' : ''}</div>
        ${meta.highlight ? `<div class="brand-card-highlight">${escHtml(meta.highlight)}</div>` : ''}
      </div>`
    }).join('')
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalInStock = liveProducts.filter(p => p.inStock !== false).length
  const avgPrice = liveProducts.length
    ? (liveProducts.reduce((s,p) => s + (Number(p.price)||0), 0) / liveProducts.length).toFixed(2)
    : '0.00'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>British Feed & Supplies — Product Catalog ${year}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Nunito+Sans:wght@300;400;600;700&display=swap" rel="stylesheet"/>
<style>
/* ═══ RESET & BASE ═══════════════════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 10pt; }
body { font-family: 'Nunito Sans', sans-serif; color: #1a1a2e; background: #fff; }

/* ═══ PAGE SETUP ═════════════════════════════════════════════════ */
@page { size: 8.5in 11in; margin: 0; }
@media print {
  .no-print { display: none !important; }
  .page { page-break-after: always; page-break-inside: avoid; }
  .page:last-child { page-break-after: auto; }
  a { color: inherit; text-decoration: none; }
  body { background: white; }
}
.page {
  width: 8.5in;
  min-height: 11in;
  position: relative;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
}

/* ═══ SCREEN PREVIEW STYLES ══════════════════════════════════════ */
@media screen {
  body { background: #e8e8e8; padding: 20px; }
  .page {
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    margin: 0 auto 32px auto;
  }
  .print-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 999;
    background: #1B2A4A; color: #fff; padding: 12px 24px;
    display: flex; align-items: center; justify-content: space-between;
    font-family: 'Nunito Sans', sans-serif; font-size: 13px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
  }
  .print-bar .bar-left { display: flex; align-items: center; gap: 16px; }
  .print-bar .bar-title { font-weight: 700; font-size: 15px; color: #C9A84C; }
  .print-bar .bar-sub { opacity: 0.75; font-size: 12px; }
  .print-btn {
    background: #C9A84C; color: #1B2A4A; border: none; cursor: pointer;
    padding: 9px 22px; border-radius: 8px; font-weight: 700; font-size: 13px;
    font-family: 'Nunito Sans', sans-serif; transition: background 0.2s;
    display: flex; align-items: center; gap: 8px;
  }
  .print-btn:hover { background: #E0C87A; }
  .back-btn {
    background: transparent; color: #C9A84C; border: 1px solid rgba(201,168,76,0.4);
    cursor: pointer; padding: 7px 16px; border-radius: 8px; font-size: 12px;
    font-family: 'Nunito Sans', sans-serif; transition: all 0.2s; text-decoration: none;
    display: flex; align-items: center; gap: 6px;
  }
  .back-btn:hover { background: rgba(201,168,76,0.1); }
  body { padding-top: 64px; }
  .loading-overlay {
    position: fixed; inset: 0; background: rgba(27,42,74,0.92); z-index: 1000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #fff; font-family: 'Nunito Sans', sans-serif;
  }
  .loading-overlay h2 { font-size: 22px; margin-bottom: 10px; color: #C9A84C; }
  .loading-overlay p { opacity: 0.75; font-size: 14px; }
  .spinner {
    width: 48px; height: 48px; border: 4px solid rgba(201,168,76,0.3);
    border-top-color: #C9A84C; border-radius: 50%; animation: spin 0.9s linear infinite; margin-bottom: 20px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
}

/* ═══ COVER PAGE ═════════════════════════════════════════════════ */
.cover-page {
  background: linear-gradient(160deg, #0d1b35 0%, #1B2A4A 45%, #0a2218 100%);
  color: #fff;
  position: relative;
  overflow: hidden;
}
.cover-page::before {
  content: '';
  position: absolute; inset: 0;
  background: url('/static/hero_horse.jpg') center 30% / cover no-repeat;
  opacity: 0.22;
}
.cover-overlay {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; height: 11in;
  padding: 0.6in 0.7in;
}
.cover-top-bar {
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid rgba(201,168,76,0.35); padding-bottom: 14px; margin-bottom: 0;
}
.cover-logo-area { display: flex; align-items: center; gap: 12px; }
.cover-logo-img { height: 52px; filter: brightness(0) invert(1); }
.cover-logo-text { font-family: 'Cormorant Garamond', serif; font-size: 15pt; font-weight: 700; line-height: 1.2; }
.cover-logo-text span { display: block; font-size: 9pt; font-weight: 400; opacity: 0.7; letter-spacing: 0.08em; }
.cover-year-badge {
  background: #C9A84C; color: #0d1b35; font-weight: 800; font-size: 11pt;
  padding: 6px 18px; border-radius: 20px; letter-spacing: 0.05em;
  font-family: 'Nunito Sans', sans-serif;
}
.cover-main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0.4in 0; }
.cover-eyebrow {
  font-family: 'Nunito Sans', sans-serif; font-size: 8pt; letter-spacing: 0.25em;
  text-transform: uppercase; color: #C9A84C; margin-bottom: 16px;
}
.cover-headline {
  font-family: 'Cormorant Garamond', serif; font-size: 54pt; font-weight: 700;
  line-height: 1.05; margin-bottom: 10px;
  text-shadow: 0 2px 30px rgba(0,0,0,0.5);
}
.cover-headline em { font-style: italic; color: #C9A84C; }
.cover-subline {
  font-family: 'Cormorant Garamond', serif; font-size: 18pt; font-weight: 400;
  font-style: italic; opacity: 0.85; margin-bottom: 32px;
}
.cover-divider { width: 80px; height: 2px; background: #C9A84C; margin-bottom: 28px; }
.cover-stats {
  display: flex; gap: 40px;
}
.cover-stat { text-align: left; }
.cover-stat-num { font-family: 'Cormorant Garamond', serif; font-size: 28pt; font-weight: 700; color: #C9A84C; line-height: 1; }
.cover-stat-label { font-size: 8pt; opacity: 0.7; letter-spacing: 0.06em; margin-top: 2px; text-transform: uppercase; }
.cover-bottom {
  border-top: 1px solid rgba(201,168,76,0.35); padding-top: 18px;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 8pt; opacity: 0.65;
}
.cover-address { display: flex; flex-direction: column; gap: 2px; }
.cover-tagline { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 10pt; opacity: 0.8; }

/* ═══ INNER PAGE COMMON ══════════════════════════════════════════ */
.page-header {
  background: #1B2A4A; color: #fff;
  padding: 14px 0.5in; display: flex; align-items: center; justify-content: space-between;
}
.page-header-title { font-family: 'Cormorant Garamond', serif; font-size: 16pt; font-weight: 700; }
.page-header-sub { font-size: 8pt; opacity: 0.65; margin-top: 2px; }
.page-header-logo { font-family: 'Cormorant Garamond', serif; font-size: 10pt; text-align: right; opacity: 0.75; line-height: 1.3; }
.page-body { padding: 0.35in 0.5in; flex: 1; }
.page-footer {
  background: #f5f5f5; border-top: 1px solid #ddd;
  padding: 7px 0.5in; font-size: 7pt; color: #888;
  display: flex; justify-content: space-between; align-items: center;
  margin-top: auto;
}

/* ═══ ABOUT PAGE ═════════════════════════════════════════════════ */
.about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 18px; }
.about-story h2 { font-family: 'Cormorant Garamond', serif; font-size: 22pt; font-weight: 700; color: #1B2A4A; line-height: 1.2; margin-bottom: 12px; }
.about-story p { font-size: 9.5pt; line-height: 1.65; color: #333; margin-bottom: 10px; }
.about-story .gold-line { width: 50px; height: 2px; background: #C9A84C; margin-bottom: 16px; }
.team-box { background: #F8F5EF; border: 1px solid #e8dcc8; border-radius: 8px; padding: 20px; }
.team-box h3 { font-family: 'Cormorant Garamond', serif; font-size: 13pt; color: #1B2A4A; margin-bottom: 14px; border-bottom: 1px solid #C9A84C; padding-bottom: 8px; }
.team-member { margin-bottom: 14px; }
.team-member-name { font-weight: 700; font-size: 10pt; color: #1B2A4A; }
.team-member-role { font-size: 8pt; color: #C9A84C; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.team-member-bio { font-size: 8.5pt; color: #555; line-height: 1.55; }
.info-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; }
.info-card { background: #1B2A4A; color: #fff; border-radius: 8px; padding: 16px; text-align: center; }
.info-card-icon { font-size: 18pt; margin-bottom: 6px; }
.info-card-title { font-family: 'Cormorant Garamond', serif; font-size: 11pt; font-weight: 700; color: #C9A84C; margin-bottom: 4px; }
.info-card-text { font-size: 7.5pt; opacity: 0.8; line-height: 1.5; }

/* ═══ SERVICES PAGE ══════════════════════════════════════════════ */
.services-intro { font-size: 10pt; line-height: 1.65; color: #444; max-width: 5.5in; margin-bottom: 24px; }
.service-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.service-card { border: 1px solid #e0d5c0; border-radius: 10px; overflow: hidden; }
.service-card-header { background: #1B2A4A; color: #fff; padding: 14px; text-align: center; }
.service-card-icon { font-size: 22pt; margin-bottom: 4px; }
.service-card-title { font-family: 'Cormorant Garamond', serif; font-size: 12pt; font-weight: 700; color: #C9A84C; }
.service-card-body { padding: 14px; }
.service-card-body p { font-size: 8.5pt; line-height: 1.6; color: #444; }
.service-card-body .badge { display: inline-block; background: #F0E9D8; color: #8B6914; font-size: 7.5pt; font-weight: 700; padding: 3px 9px; border-radius: 10px; margin-top: 8px; }
.delivery-schedule { margin-top: 20px; border: 1px solid #C9A84C30; border-radius: 8px; overflow: hidden; }
.delivery-schedule-header { background: #C9A84C; color: #1B2A4A; padding: 8px 16px; font-weight: 700; font-size: 9pt; font-family: 'Cormorant Garamond', serif; font-size: 12pt; }
.delivery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
.delivery-day { padding: 10px 14px; border-right: 1px solid #eee; border-bottom: 1px solid #eee; }
.delivery-day:nth-child(3n) { border-right: none; }
.delivery-day-name { font-weight: 700; font-size: 8pt; color: #1B2A4A; margin-bottom: 3px; }
.delivery-day-areas { font-size: 7pt; color: #666; line-height: 1.5; }

/* ═══ BRANDS PAGE ════════════════════════════════════════════════ */
.brands-intro { font-size: 9.5pt; color: #444; line-height: 1.6; margin-bottom: 20px; max-width: 6in; }
.brand-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.brand-card { border: 1px solid #e8dcc8; border-radius: 8px; padding: 12px 10px; text-align: center; background: #fafaf8; }
.brand-card-icon { font-size: 18pt; margin-bottom: 4px; }
.brand-card-name { font-weight: 700; font-size: 9pt; color: #1B2A4A; margin-bottom: 2px; }
.brand-card-count { font-size: 7.5pt; color: #C9A84C; font-weight: 600; margin-bottom: 4px; }
.brand-card-highlight { font-size: 7pt; color: #888; line-height: 1.4; }

/* ═══ TOC PAGE ═══════════════════════════════════════════════════ */
.toc-title { font-family: 'Cormorant Garamond', serif; font-size: 28pt; font-weight: 700; color: #1B2A4A; margin-bottom: 6px; }
.toc-sub { font-size: 9pt; color: #888; margin-bottom: 28px; }
.toc-section-header { font-family: 'Cormorant Garamond', serif; font-size: 11pt; font-weight: 700; color: #C9A84C; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #e8dcc8; padding-bottom: 4px; margin: 16px 0 8px 0; }
.toc-row { display: flex; align-items: baseline; padding: 4px 0; border-bottom: 1px dotted #ddd; }
.toc-row-title { font-size: 9pt; color: #1B2A4A; flex: 1; }
.toc-row-dots { flex: 1; border-bottom: 1px dotted #bbb; margin: 0 8px; position: relative; top: -3px; }
.toc-row-page { font-size: 9pt; font-weight: 700; color: #1B2A4A; min-width: 24px; text-align: right; }
.toc-cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }

/* ═══ CATEGORY PAGES ═════════════════════════════════════════════ */
.category-page { }
.cat-header {
  color: #fff; padding: 18px 0.5in;
  display: flex; align-items: center; gap: 16px;
}
.cat-header-icon { font-size: 28pt; flex-shrink: 0; }
.cat-header-title { font-family: 'Cormorant Garamond', serif; font-size: 22pt; font-weight: 700; line-height: 1; }
.cat-header-sub { font-size: 8.5pt; opacity: 0.8; margin-top: 4px; }
.cat-header-logo { margin-left: auto; font-family: 'Cormorant Garamond', serif; font-size: 9pt; text-align: right; opacity: 0.6; line-height: 1.4; }
.vendor-block { padding: 0 0.5in; margin-top: 10px; }
.vendor-label { font-weight: 700; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #1B2A4A; background: #F0E9D8; padding: 4px 10px; border-left: 3px solid #C9A84C; margin-bottom: 0; }
.prod-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 6px; }
.prod-table thead tr { background: #1B2A4A; color: #fff; }
.prod-table th { padding: 5px 7px; text-align: left; font-weight: 600; font-size: 7.5pt; letter-spacing: 0.03em; }
.prod-table tbody tr:nth-child(even) { background: #f9f8f5; }
.prod-table tbody tr:hover { background: #FBF7F0; }
.prod-table td { padding: 4px 7px; border-bottom: 1px solid #eee; vertical-align: top; line-height: 1.4; }
.th-name  { width: 22%; }
.th-brand { width: 13%; }
.th-desc  { width: 42%; }
.th-price { width: 11%; text-align: right; }
.th-stock { width: 9%; text-align: center; }
.prod-name  { font-weight: 600; color: #1B2A4A; }
.prod-brand { color: #888; }
.prod-desc  { color: #555; font-size: 7.5pt; }
.prod-price { text-align: right; font-weight: 700; color: #1B2A4A; font-variant-numeric: tabular-nums; }
.prod-stock { text-align: center; }
.in-stock   { color: #2E7D32; font-size: 7pt; font-weight: 700; }
.oos        { color: #E65100; font-size: 7pt; font-weight: 700; }

/* ═══ BACK COVER ═════════════════════════════════════════════════ */
.back-cover {
  background: linear-gradient(160deg, #0d1b35 0%, #1B2A4A 60%, #0a2218 100%);
  color: #fff; position: relative; overflow: hidden;
}
.back-cover::before {
  content: '';
  position: absolute; inset: 0;
  background: url('/static/story_closing.jpg') center center / cover no-repeat;
  opacity: 0.15;
}
.back-cover-overlay {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 11in; padding: 0.6in;
  text-align: center;
}
.back-cover-logo { height: 70px; filter: brightness(0) invert(1); margin-bottom: 28px; }
.back-cover-headline { font-family: 'Cormorant Garamond', serif; font-size: 32pt; font-weight: 700; margin-bottom: 10px; }
.back-cover-headline em { color: #C9A84C; font-style: italic; }
.back-cover-sub { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 14pt; opacity: 0.8; margin-bottom: 40px; }
.back-divider { width: 80px; height: 1px; background: #C9A84C; margin: 0 auto 36px; }
.back-contact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; width: 100%; max-width: 5.5in; margin-bottom: 36px; }
.back-contact-item { text-align: center; }
.back-contact-icon { font-size: 18pt; margin-bottom: 6px; }
.back-contact-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.6; margin-bottom: 4px; }
.back-contact-value { font-size: 10pt; font-weight: 600; }
.back-social { font-size: 8pt; opacity: 0.6; margin-top: 16px; }
.back-footer { position: absolute; bottom: 0.4in; left: 0; right: 0; text-align: center; font-size: 7pt; opacity: 0.45; }
</style>
</head>
<body>

<!-- Loading overlay — shown while products load client-side -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="spinner"></div>
  <h2>Building Your Catalog…</h2>
  <p>Fetching latest products from our inventory</p>
</div>

<!-- ── Print bar (screen only) ────────────────────────────────── -->
<div class="print-bar no-print">
  <div class="bar-left">
    <a href="/products" class="back-btn">← Back to Catalog</a>
    <div>
      <div class="bar-title">British Feed &amp; Supplies — Product Catalog ${year}</div>
      <div class="bar-sub">Magazine-style · 8.5 × 11 in · Always current</div>
    </div>
  </div>
  <button class="print-btn" onclick="window.print()">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Download / Print PDF
  </button>
</div>

<!-- All pages rendered by JS below -->
<div id="catalogPages"></div>

<script>
// ── Client-side: load live products then render all pages ─────────────────
const YEAR = ${year};
const MONTH_YEAR = '${monthYear}';

const CAT_META = ${JSON.stringify(catMeta)};
const BRAND_META = ${JSON.stringify(brandMeta)};

const DELIVERY_SCHEDULE = [
  { day: 'Monday',    areas: 'Northwest Loxahatchee · North Wellington · Palm Beach Point North · Southfields' },
  { day: 'Tuesday',   areas: 'C, E, F, G Road · Collecting Canal · Deer Run · Fox Trail · Sycamore · Palm Beach Point South' },
  { day: 'Wednesday', areas: 'D Road · Northwest Loxahatchee · White Fences · Lake Worth · Grand Prix · Flying Cow · North Wellington · Palm Beach Point North' },
  { day: 'Thursday',  areas: 'B, E, F, G Road · Collecting Canal · Deer Run · Jupiter · Grand Prix · Little Ranches · South Fields' },
  { day: 'Friday',    areas: 'East Loxahatchee · White Fences · Flying Cow · North Wellington · Palm Beach Point (North & South)' },
  { day: 'Saturday',  areas: 'A, B, C Road · Collecting Canal · Homeland' },
];

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function buildCatalog(products) {
  // ── Organise data ────────────────────────────────────────────────
  const byCategory = {};
  const byVendor   = {};
  products.forEach(p => {
    const cat = p.category || 'Other';
    const ven = p.vendor   || p.brand || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    if (!byVendor[ven])   byVendor[ven]   = [];
    byCategory[cat].push(p);
    byVendor[ven].push(p);
  });
  const categories = Object.keys(byCategory).sort();
  const vendors    = Object.keys(byVendor).sort();
  const totalInStock = products.filter(p => p.inStock !== false).length;

  // ── Helpers ──────────────────────────────────────────────────────
  function productRow(p) {
    const price = p.priceFormatted || (p.price ? '$'+Number(p.price).toFixed(2) : 'Call');
    const stock = p.inStock !== false
      ? '<span class="in-stock">✓</span>'
      : '<span class="oos">Call</span>';
    const raw = (p.description||'').replace(/—\\s*available at British Feed.*?to order\\.?/gi,'').trim();
    const desc = raw.length > 115 ? raw.slice(0,112)+'…' : raw;
    return \`<tr>
      <td class="prod-name">\${esc(p.name)}</td>
      <td class="prod-brand">\${esc(p.brand||p.vendor||'')}</td>
      <td class="prod-desc">\${esc(desc)}</td>
      <td class="prod-price">\${esc(price)}</td>
      <td class="prod-stock">\${stock}</td>
    </tr>\`;
  }

  // ── Cover page ────────────────────────────────────────────────────
  const cover = \`
<div class="page cover-page">
  <div class="cover-overlay">
    <div class="cover-top-bar">
      <div class="cover-logo-area">
        <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed" class="cover-logo-img" onerror="this.style.display='none'"/>
        <div class="cover-logo-text">British Feed &amp; Supplies<span>Wellington · Loxahatchee · Palm Beach County</span></div>
      </div>
      <div class="cover-year-badge">\${YEAR} CATALOG</div>
    </div>

    <div class="cover-main">
      <div class="cover-eyebrow">Premium Equine Nutrition &amp; Supplies</div>
      <div class="cover-headline">For Proper<br/><em>Care &amp; Nutrition</em></div>
      <div class="cover-subline">Your complete guide to our full product range</div>
      <div class="cover-divider"></div>
      <div class="cover-stats">
        <div class="cover-stat">
          <div class="cover-stat-num">\${products.length}</div>
          <div class="cover-stat-label">Products</div>
        </div>
        <div class="cover-stat">
          <div class="cover-stat-num">\${vendors.length}+</div>
          <div class="cover-stat-label">Premium Brands</div>
        </div>
        <div class="cover-stat">
          <div class="cover-stat-num">\${categories.length}</div>
          <div class="cover-stat-label">Categories</div>
        </div>
        <div class="cover-stat">
          <div class="cover-stat-num">13+</div>
          <div class="cover-stat-label">Years Serving WPB</div>
        </div>
      </div>
    </div>

    <div class="cover-bottom">
      <div class="cover-address">
        <span>14589 Southern Blvd, Palm West Plaza · Loxahatchee Groves, FL 33470</span>
        <span>(561) 633-6003 · britishfeed.com</span>
      </div>
      <div class="cover-tagline">"Champions deserve champions' feed."</div>
    </div>
  </div>
</div>\`;

  // ── About page ────────────────────────────────────────────────────
  const about = \`
<div class="page">
  <div class="page-header">
    <div><div class="page-header-title">About British Feed &amp; Supplies</div><div class="page-header-sub">Our story · Our team · Our commitment</div></div>
    <div class="page-header-logo">British Feed<br/>&amp; Supplies</div>
  </div>
  <div class="page-body">
    <div class="about-grid">
      <div class="about-story">
        <div class="gold-line"></div>
        <h2>Wellington's Most<br/>Trusted Feed Store</h2>
        <p>Founded in 2012 by Vieri Bracco, British Feed &amp; Supplies was built on a simple promise: to bring the highest-quality equine nutrition products to the competitive riders and horse owners of Palm Beach County.</p>
        <p>After a full renovation in 2016, our store became a one-stop destination for premium feeds, supplements, grooming products, hay, bedding, and more — serving everyone from Olympic-level competitors to backyard horse enthusiasts.</p>
        <p>Located in the heart of Wellington's equestrian community, we have spent over a decade earning the trust of the most discerning horse owners in South Florida. Our certified equine nutritionists are always available for barn visits, ensuring your animals receive personalized care at every level.</p>
        <p>We carry brands trusted at the world's most prestigious competitions, and we deliver them right to your barn door across Palm Beach County and surrounding areas.</p>
      </div>
      <div>
        <div class="team-box">
          <h3>Our Leadership Team</h3>
          <div class="team-member">
            <div class="team-member-name">Vieri Bracco</div>
            <div class="team-member-role">Owner &amp; Founder</div>
            <div class="team-member-bio">A lifelong equestrian with deep roots in the Wellington community, Vieri founded British Feed with a vision to provide competition-grade nutrition and supplies to South Florida's horse owners. His passion for equine welfare drives every product decision we make.</div>
          </div>
          <div class="team-member">
            <div class="team-member-name">Carmine Garrett</div>
            <div class="team-member-role">General Manager</div>
            <div class="team-member-bio">Carmine brings years of hands-on equestrian experience and operational excellence to British Feed. As General Manager, she ensures every customer — from first-time horse owners to elite competitors — receives expert guidance and exceptional service.</div>
          </div>
        </div>
        <div class="info-cards">
          <div class="info-card">
            <div class="info-card-icon">🏆</div>
            <div class="info-card-title">Since 2012</div>
            <div class="info-card-text">Over 13 years serving the WPB equestrian community</div>
          </div>
          <div class="info-card">
            <div class="info-card-icon">⭐</div>
            <div class="info-card-title">4.8★ Rating</div>
            <div class="info-card-text">Google-verified reviews from our loyal customers</div>
          </div>
          <div class="info-card">
            <div class="info-card-icon">🌎</div>
            <div class="info-card-title">All Animals</div>
            <div class="info-card-text">Horses, livestock, pets &amp; more</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd, Loxahatchee Groves, FL 33470 · (561) 633-6003 · britishfeed.com</span>
    <span>About Us · \${MONTH_YEAR}</span>
  </div>
</div>\`;

  // ── Services page ─────────────────────────────────────────────────
  const services = \`
<div class="page">
  <div class="page-header">
    <div><div class="page-header-title">Our Services</div><div class="page-header-sub">Delivery · Nutrition · Farm Programs</div></div>
    <div class="page-header-logo">British Feed<br/>&amp; Supplies</div>
  </div>
  <div class="page-body">
    <p class="services-intro">At British Feed &amp; Supplies, we go beyond the store shelf. Our team is committed to supporting the health and performance of your animals with expert services designed for Palm Beach County's equestrian lifestyle.</p>
    <div class="service-cards">
      <div class="service-card">
        <div class="service-card-header">
          <div class="service-card-icon">🚚</div>
          <div class="service-card-title">Free Local Delivery</div>
        </div>
        <div class="service-card-body">
          <p>We deliver directly to your barn across Wellington, Loxahatchee, Royal Palm Beach, Lake Worth, Jupiter Farms, and surrounding communities.</p>
          <p style="margin-top:8px">Free delivery on orders $150+. A $50 delivery fee applies to orders under $150. A temporary, minimal fuel surcharge is currently in effect.</p>
          <span class="badge">Free on orders $150+</span>
        </div>
      </div>
      <div class="service-card">
        <div class="service-card-header">
          <div class="service-card-icon">🔬</div>
          <div class="service-card-title">Nutritional Barn Visit</div>
        </div>
        <div class="service-card-body">
          <p>Our certified equine nutritionists come to you. We assess your horses' condition, workload, and dietary needs to build a customized feeding plan.</p>
          <p style="margin-top:8px">From performance horses to senior care and metabolic management, we tailor every recommendation to your unique situation.</p>
          <span class="badge">Call (561) 633-6003</span>
        </div>
      </div>
      <div class="service-card">
        <div class="service-card-header">
          <div class="service-card-icon">💰</div>
          <div class="service-card-title">Nutrena Farm Program</div>
        </div>
        <div class="service-card-body">
          <p>Enroll in the Nutrena Farm Program to earn cash-back rewards on every bag of qualifying Nutrena feed you purchase.</p>
          <p style="margin-top:8px">The more you buy, the more you earn — designed for barn managers and multi-horse operations who rely on Nutrena's science-backed nutrition.</p>
          <span class="badge">Earn cash back rewards</span>
        </div>
      </div>
    </div>
    <div class="delivery-schedule">
      <div class="delivery-schedule-header">📅 Weekly Delivery Schedule</div>
      <div class="delivery-grid">
        \${DELIVERY_SCHEDULE.map(d => \`<div class="delivery-day">
          <div class="delivery-day-name">\${d.day}</div>
          <div class="delivery-day-areas">\${d.areas}</div>
        </div>\`).join('')}
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd, Loxahatchee Groves, FL 33470 · (561) 633-6003 · britishfeed.com</span>
    <span>Services · \${MONTH_YEAR}</span>
  </div>
</div>\`;

  // ── Brands page ───────────────────────────────────────────────────
  const brandsPage = \`
<div class="page">
  <div class="page-header">
    <div><div class="page-header-title">Our Premium Brands</div><div class="page-header-sub">\${vendors.length} world-class brands curated for South Florida's equestrians</div></div>
    <div class="page-header-logo">British Feed<br/>&amp; Supplies</div>
  </div>
  <div class="page-body">
    <p class="brands-intro">Every brand we carry is hand-selected for quality, efficacy, and suitability for South Florida's climate and competitive environment. From Olympic-level performance feeds to trusted everyday grooming essentials, our lineup represents the very best available.</p>
    <div class="brand-grid">
      \${vendors.map(v => {
        const meta = BRAND_META[v] || { icon: '🏪', desc:'', highlight:'' };
        const count = byVendor[v].length;
        return \`<div class="brand-card">
          <div class="brand-card-icon">\${meta.icon}</div>
          <div class="brand-card-name">\${esc(v)}</div>
          <div class="brand-card-count">\${count} product\${count!==1?'s':''}</div>
          \${meta.highlight ? \`<div class="brand-card-highlight">\${esc(meta.highlight)}</div>\` : ''}
        </div>\`;
      }).join('')}
    </div>
  </div>
  <div class="page-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd, Loxahatchee Groves, FL 33470 · (561) 633-6003 · britishfeed.com</span>
    <span>Our Brands · \${MONTH_YEAR}</span>
  </div>
</div>\`;

  // ── Table of contents ─────────────────────────────────────────────
  let pageNum = 2; // cover is p1
  const tocEntries = [
    { title: 'About British Feed & Supplies', page: pageNum++ },
    { title: 'Our Services & Delivery Schedule', page: pageNum++ },
    { title: 'Our Premium Brands', page: pageNum++ },
    { title: 'Table of Contents', page: pageNum++ },
  ];
  categories.forEach(cat => tocEntries.push({ title: cat, page: pageNum++ }));
  tocEntries.push({ title: 'Contact & Hours', page: pageNum });

  const frontEntries = tocEntries.slice(0,4);
  const catEntries   = tocEntries.slice(4);

  const toc = \`
<div class="page">
  <div class="page-header">
    <div><div class="page-header-title">Table of Contents</div><div class="page-header-sub">\${products.length} products across \${categories.length} categories &amp; \${vendors.length} brands</div></div>
    <div class="page-header-logo">British Feed<br/>&amp; Supplies</div>
  </div>
  <div class="page-body">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;">
      <div>
        <div class="toc-section-header">Front Matter</div>
        \${frontEntries.map(e=>\`<div class="toc-row"><span class="toc-row-title">\${esc(e.title)}</span><span class="toc-row-dots"></span><span class="toc-row-page">\${e.page}</span></div>\`).join('')}
        <div class="toc-section-header" style="margin-top:24px">Product Categories A–H</div>
        \${catEntries.filter((_,i)=>i<Math.ceil(catEntries.length/2)).map(e=>\`<div class="toc-row"><span class="toc-row-title">\${esc(e.title)}</span><span class="toc-row-dots"></span><span class="toc-row-page">\${e.page}</span></div>\`).join('')}
      </div>
      <div>
        <div class="toc-section-header">Product Categories I–Z</div>
        \${catEntries.filter((_,i)=>i>=Math.ceil(catEntries.length/2)).map(e=>\`<div class="toc-row"><span class="toc-row-title">\${esc(e.title)}</span><span class="toc-row-dots"></span><span class="toc-row-page">\${e.page}</span></div>\`).join('')}
        <div class="toc-section-header" style="margin-top:24px">Store Information</div>
        <div class="toc-row"><span class="toc-row-title">Contact &amp; Hours</span><span class="toc-row-dots"></span><span class="toc-row-page">\${pageNum}</span></div>
        <div style="margin-top:24px;padding:16px;background:#F8F5EF;border:1px solid #e8dcc8;border-radius:8px;">
          <div style="font-family:'Cormorant Garamond',serif;font-size:13pt;font-weight:700;color:#1B2A4A;margin-bottom:6px;">Quick Reference</div>
          <div style="font-size:8pt;color:#555;line-height:1.8;">
            <div>📞 <strong>(561) 633-6003</strong></div>
            <div>📍 14589 Southern Blvd, Loxahatchee Groves, FL</div>
            <div>🕐 Store: Mon–Fri 9am–6pm · Sat 9am–4pm</div>
            <div>🕐 Distribution: Mon–Fri 8am–5pm · Sat 9am–4pm</div>
            <div>🌐 britishfeed.com</div>
            <div>📦 Free delivery on orders $150+</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd, Loxahatchee Groves, FL 33470 · (561) 633-6003 · britishfeed.com</span>
    <span>Table of Contents · \${MONTH_YEAR}</span>
  </div>
</div>\`;

  // ── Category product pages ────────────────────────────────────────
  const catPages = categories.map(cat => {
    const prods = byCategory[cat];
    const meta  = CAT_META[cat] || { icon:'📋', color:'#1B2A4A' };
    // Group by vendor within category
    const vGroups = {};
    prods.forEach(p => {
      const v = p.vendor || p.brand || 'Other';
      if (!vGroups[v]) vGroups[v] = [];
      vGroups[v].push(p);
    });
    const vList = Object.entries(vGroups).sort(([a],[b]) => a.localeCompare(b));

    return \`
<div class="page category-page">
  <div class="cat-header" style="background:\${meta.color}">
    <div class="cat-header-icon">\${meta.icon}</div>
    <div>
      <div class="cat-header-title">\${esc(cat)}</div>
      <div class="cat-header-sub">\${prods.length} product\${prods.length!==1?'s':''} · \${vList.length} brand\${vList.length!==1?'s':''}</div>
    </div>
    <div class="cat-header-logo">British Feed<br/>&amp; Supplies</div>
  </div>
  \${vList.map(([vendor, vprods]) => \`
  <div class="vendor-block">
    <div class="vendor-label">\${esc(vendor)}</div>
    <table class="prod-table">
      <thead><tr>
        <th class="th-name">Product</th>
        <th class="th-brand">Brand</th>
        <th class="th-desc">Description</th>
        <th class="th-price">Price</th>
        <th class="th-stock">In Stock</th>
      </tr></thead>
      <tbody>\${vprods.map(productRow).join('')}</tbody>
    </table>
  </div>\`).join('')}
  <div class="page-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd, Loxahatchee Groves, FL 33470 · (561) 633-6003 · britishfeed.com</span>
    <span>\${esc(cat)} · \${MONTH_YEAR}</span>
  </div>
</div>\`;
  }).join('\\n');

  // ── Back cover ────────────────────────────────────────────────────
  const backCover = \`
<div class="page back-cover">
  <div class="back-cover-overlay">
    <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed" class="back-cover-logo" onerror="this.style.display='none'"/>
    <div class="back-cover-headline">The Best Care<br/>for <em>Champions</em></div>
    <div class="back-cover-sub">Premium Feed &amp; Supplies for South Florida's Finest Horses</div>
    <div class="back-divider"></div>
    <div class="back-contact-grid">
      <div class="back-contact-item">
        <div class="back-contact-icon">📞</div>
        <div class="back-contact-label">Call Us</div>
        <div class="back-contact-value">(561) 633-6003</div>
      </div>
      <div class="back-contact-item">
        <div class="back-contact-icon">📍</div>
        <div class="back-contact-label">Visit Us</div>
        <div class="back-contact-value" style="font-size:9pt">14589 Southern Blvd<br/>Loxahatchee Groves, FL 33470</div>
      </div>
      <div class="back-contact-item">
        <div class="back-contact-icon">🕐</div>
        <div class="back-contact-label">Store Hours</div>
        <div class="back-contact-value" style="font-size:9pt">Mon–Fri 9am–6pm<br/>Sat 9am–4pm</div>
      </div>
    </div>
    <div class="back-social">@britishfeed · britishfeed.com · Since 2012</div>
    <div class="back-footer">Pricing and availability subject to change without notice. Call (561) 633-6003 to confirm. © \${YEAR} British Feed &amp; Supplies. All rights reserved.</div>
  </div>
</div>\`;

  return cover + about + services + brandsPage + toc + catPages + backCover;
}

// ── Boot: load products from API then build catalog ───────────────────────
async function boot() {
  try {
    // Try public KV-backed API first (reflects admin edits instantly, no auth needed)
    let products = [];
    try {
      const r = await fetch('/api/public/products');
      if (r.ok) {
        const d = await r.json();
        if (d.products && d.products.length > 0) products = d.products;
      }
    } catch (_) {}

    // Fallback to static JSON (always has data)
    if (products.length === 0) {
      const r = await fetch('/static/products-data.json');
      if (r.ok) products = await r.json();
    }

    document.getElementById('catalogPages').innerHTML = buildCatalog(products);
  } catch (err) {
    document.getElementById('catalogPages').innerHTML =
      '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#c00">Error loading products: '+err.message+'. <a href="/products">Return to catalog</a></div>';
  } finally {
    document.getElementById('loadingOverlay').style.display = 'none';
  }
}

boot();
</script>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════════════════
//  FULL PRODUCT CATALOG PAGE
// ═══════════════════════════════════════════════════════════════════════════
function getProductsHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Product Catalog | British Feed & Supplies — Wellington, FL</title>
  <meta name="description" content="Browse our complete product catalog at British Feed & Supplies. Premium horse feeds, supplements, grooming, hay, bedding and more in Wellington, FL."/>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Nunito+Sans:wght@300;400;600;700&display=swap" rel="stylesheet"/>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy: { DEFAULT:'#1B2A4A', 50:'#EEF1F8', 100:'#D5DCF0', 200:'#9BAECF', 700:'#1B2A4A', 800:'#0F1A30', 900:'#080F1C' },
            gold: { DEFAULT:'#C9A84C', 300:'#E0C87A', 400:'#C9A84C', 500:'#A88A35', 600:'#876D22' },
            cream: { DEFAULT:'#FBF7F0', dark:'#F0E9D8' },
          },
          fontFamily: {
            serif: ['Cormorant Garamond','Georgia','serif'],
            sans:  ['Inter','system-ui','sans-serif'],
          }
        }
      }
    }
  </script>
  <style>
    html { scroll-behavior:smooth; }
    body { font-family:'Inter',sans-serif; background:#F5F7FA; color:#1e293b; }
    .nav-sticky { position:sticky; top:0; z-index:100; background:rgba(27,42,74,0.97); backdrop-filter:blur(12px); border-bottom:1px solid rgba(201,168,76,0.2); }

    /* ── Storefront Layout ── */
    .store-layout { display:flex; gap:0; min-height:calc(100vh - 200px); }
    .store-sidebar {
      width:260px;
      flex-shrink:0;
      background:#fff;
      border-right:1px solid #e8edf4;
      padding:20px 0;
      position:sticky;
      top:56px;
      height:calc(100vh - 56px);
      overflow-y:auto;
    }
    .store-main { flex:1; padding:20px; min-width:0; }

    /* Sidebar category groups */
    .cat-group { margin-bottom:4px; }
    .cat-group-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:10px 16px;
      cursor:pointer;
      border-radius:0;
      transition:background 0.15s;
      user-select:none;
    }
    .cat-group-header:hover { background:#F8FAFC; }
    .cat-group-header.active-parent { background:#EEF1F8; }
    .cat-group-header-left { display:flex; align-items:center; gap:10px; }
    .cat-group-icon {
      width:34px; height:34px;
      border-radius:8px;
      display:flex; align-items:center; justify-content:center;
      font-size:16px;
      flex-shrink:0;
    }
    .cat-group-name { font-weight:600; font-size:13.5px; color:#1e293b; }
    .cat-group-count { font-size:11px; font-weight:600; color:#94a3b8; background:#f1f5f9; padding:2px 7px; border-radius:10px; }
    .cat-group-arrow { font-size:10px; color:#94a3b8; transition:transform 0.2s; }
    .cat-group.open .cat-group-arrow { transform:rotate(90deg); }

    /* Sub-filters */
    .cat-subfilters { display:none; padding-bottom:4px; }
    .cat-group.open .cat-subfilters { display:block; }
    .cat-sub-btn {
      display:flex;
      align-items:center;
      justify-content:space-between;
      width:100%;
      padding:7px 16px 7px 58px;
      font-size:12.5px;
      color:#64748b;
      cursor:pointer;
      background:none;
      border:none;
      text-align:left;
      transition:background 0.15s, color 0.15s;
      border-radius:0;
    }
    .cat-sub-btn:hover { background:#F8FAFC; color:#1B2A4A; }
    .cat-sub-btn.active { background:#1B2A4A; color:#C9A84C; font-weight:600; }
    .cat-sub-btn.active .sub-count { background:rgba(201,168,76,0.25); color:#C9A84C; }
    .sub-count { font-size:10px; font-weight:600; background:#f1f5f9; color:#94a3b8; padding:1px 6px; border-radius:8px; }

    /* Vendor filter panel */
    .vendor-panel { margin-top:8px; border-top:1px solid #f1f5f9; padding-top:16px; }
    .vendor-panel-title { font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; padding:0 16px 8px; }
    .vendor-btn {
      display:flex; align-items:center; justify-content:space-between;
      width:100%; padding:6px 16px;
      font-size:12.5px; color:#64748b;
      cursor:pointer; background:none; border:none; text-align:left;
      transition:background 0.15s, color 0.15s;
    }
    .vendor-btn:hover { background:#F8FAFC; color:#1B2A4A; }
    .vendor-btn.active { color:#1B2A4A; font-weight:600; }
    .vendor-btn.active { padding-left:1.75rem; position:relative; } .vendor-btn.active::before { content:''; background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%23C9A84C' d='M1 6l4 4L11 2'/%3E%3C/svg%3E") no-repeat center/12px; width:16px; height:16px; position:absolute; left:0.5rem; top:50%; transform:translateY(-50%); }
    .vendor-count { font-size:10px; font-weight:600; background:#f1f5f9; color:#94a3b8; padding:1px 6px; border-radius:8px; }

    /* Mobile filter toggle */
    .mobile-filter-btn {
      display:none;
      align-items:center; gap:8px;
      padding:10px 16px; background:#1B2A4A; color:#fff;
      border:none; border-radius:10px; font-size:13px; font-weight:600;
      cursor:pointer; width:100%;
    }
    @media(max-width:768px) {
      .store-layout { flex-direction:column; }
      .store-sidebar {
        position:static; width:100%; height:auto;
        border-right:none; border-bottom:1px solid #e8edf4;
        display:none; padding:12px 0;
      }
      .store-sidebar.open { display:block; }
      .mobile-filter-btn { display:flex; }
      .store-main { padding:12px; }
    }

    /* Product Cards */
    .product-card {
      background:#fff;
      border:1px solid #e2e8f0;
      border-radius:14px;
      overflow:hidden;
      transition:all 0.22s cubic-bezier(0.4,0,0.2,1);
      display:flex;
      flex-direction:column;
      cursor:pointer;
    }
    .product-card:hover {
      transform:translateY(-3px);
      box-shadow:0 16px 32px rgba(27,42,74,0.12);
      border-color:#C9A84C;
    }
    .product-img-wrap {
      position:relative;
      background:linear-gradient(135deg, #f8f9fa 0%, #f0f4f8 100%);
      padding:16px;
      display:flex;
      align-items:center;
      justify-content:center;
      height:160px;
      overflow:hidden;
    }
    .product-img-wrap img {
      max-height:128px;
      max-width:100%;
      object-fit:contain;
      transition:transform 0.3s ease;
    }
    .product-card:hover .product-img-wrap img { transform:scale(1.05); }
    .product-img-placeholder {
      width:72px; height:72px;
      display:flex; align-items:center; justify-content:center;
      border-radius:50%; font-size:1.8rem;
    }
    .vendor-badge {
      position:absolute; top:8px; left:8px;
      background:rgba(27,42,74,0.85); color:#C9A84C;
      font-size:9px; font-weight:700; padding:2px 7px;
      border-radius:20px; letter-spacing:0.4px; text-transform:uppercase;
    }

    /* Search */
    .search-input {
      width:100%; padding:11px 16px 11px 42px;
      border:1.5px solid #e2e8f0; border-radius:10px;
      font-size:14px; outline:none; transition:border-color 0.2s; background:#fff;
    }
    .search-input:focus { border-color:#C9A84C; }

    /* Sort select */
    select.sort-select {
      appearance:none; padding:8px 28px 8px 12px;
      border:1.5px solid #e2e8f0; border-radius:10px; font-size:13px;
      background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E") no-repeat right 8px center;
      cursor:pointer; outline:none; color:#1e293b;
    }
    select.sort-select:focus { border-color:#C9A84C; }

    /* In-stock toggle */
    .stock-toggle {
      display:inline-flex; align-items:center; gap:6px;
      padding:7px 14px; border-radius:10px; font-size:13px; font-weight:500;
      cursor:pointer; transition:all 0.2s; border:1.5px solid #e2e8f0;
      background:#fff; color:#64748b; white-space:nowrap;
    }
    .stock-toggle:hover { border-color:#C9A84C; color:#1B2A4A; }
    .stock-toggle.active { background:#1B2A4A; color:#C9A84C; border-color:#1B2A4A; }

    /* Active filter pills (top of results) */
    .active-filter-pill {
      display:inline-flex; align-items:center; gap:5px;
      background:#1B2A4A; color:#C9A84C;
      padding:4px 10px 4px 12px; border-radius:20px; font-size:12px; font-weight:600;
    }
    .active-filter-pill button { background:none; border:none; color:#C9A84C; cursor:pointer; font-size:14px; line-height:1; padding:0 0 0 2px; }

    /* Modal */
    .modal-backdrop {
      position:fixed; inset:0; background:rgba(0,0,0,0.6);
      backdrop-filter:blur(4px); z-index:300;
      display:flex; align-items:center; justify-content:center; padding:20px;
    }
    .modal-box {
      background:#fff; border-radius:20px; max-width:680px;
      width:100%; max-height:90vh; overflow-y:auto; position:relative;
    }
    .modal-img-wrap {
      background:linear-gradient(135deg, #f8f9fa 0%, #e8edf4 100%);
      padding:30px; display:flex; align-items:center; justify-content:center; min-height:200px;
    }
    .modal-img-wrap img { max-height:180px; max-width:100%; object-fit:contain; }

    /* Page numbers */
    .page-btn {
      width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center;
      border-radius:8px; border:1.5px solid #e2e8f0; background:#fff; cursor:pointer;
      font-size:13px; font-weight:500; transition:all 0.15s;
    }
    .page-btn:hover { border-color:#C9A84C; color:#1B2A4A; }
    .page-btn.active { background:#1B2A4A; color:#C9A84C; border-color:#1B2A4A; }

    /* Availability bar */
    .avail-bar {
      background:linear-gradient(135deg, #1B2A4A, #2d4a7a); color:white;
      padding:10px 20px; border-radius:10px; font-size:13px;
      display:flex; align-items:center; gap:10px;
    }

    /* Category icon colors */
    .cat-grain     { background:#FFF7ED; color:#C2410C; }
    .cat-hay       { background:#FEFCE8; color:#A16207; }
    .cat-bedding   { background:#F5F3FF; color:#6D28D9; }
    .cat-supp      { background:#EFF6FF; color:#1D4ED8; }
    .cat-supplies  { background:#FDF4FF; color:#9333EA; }
    .cat-fly       { background:#F0FDF4; color:#15803D; }
    .cat-flyctl    { background:#DCFCE7; color:#166534; }
    .cat-grooming  { background:#FDF4FF; color:#9333EA; }
    .cat-health    { background:#EFF6FF; color:#1D4ED8; }
    .cat-digestive { background:#F0FDF4; color:#166534; }
    .cat-gut       { background:#FFF0F3; color:#9F1239; }
    .cat-stress    { background:#FFF1F2; color:#BE123C; }
    .cat-energy    { background:#FFFBEB; color:#B45309; }
    .cat-firstaid  { background:#FFF1F2; color:#DC2626; }
    .cat-leather   { background:#FDF2F8; color:#9D174D; }
    .cat-hoof      { background:#F0FDF4; color:#15803D; }
    .cat-shampoo   { background:#FDF4FF; color:#7C3AED; }
    .cat-oil       { background:#FFFBEB; color:#92400E; }
    .cat-electro   { background:#ECFDF5; color:#065F46; }
    .cat-clip      { background:#F1F5F9; color:#374151; }
    .cat-psyl      { background:#F0FFF4; color:#14532D; }
    .cat-lini      { background:#FFF1F2; color:#DC2626; }
    .cat-haycube   { background:#FEFCE8; color:#854D0E; }
    .cat-default   { background:#F8FAFC; color:#475569; }

    @keyframes fade-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
    .fade-in { animation:fade-in 0.25s ease forwards; }

    @media(max-width:640px) {
      .product-img-wrap { height:130px; }
      .modal-img-wrap { min-height:150px; padding:16px; }
    }

    /* Scrollbar styling for sidebar */
    .store-sidebar::-webkit-scrollbar { width:4px; }
    .store-sidebar::-webkit-scrollbar-track { background:transparent; }
    .store-sidebar::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:4px; }
  </style>
</head>
<body>

<!-- ── Navigation ─────────────────────────────────────────────────────────── -->
<nav class="nav-sticky">
  <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
    <a href="/" class="text-gray-300 hover:text-white text-sm transition-colors flex items-center gap-1.5">
      <i class="fas fa-arrow-left text-gold-400 text-xs"></i>
      <span>Back to Site</span>
    </a>
    <a href="/" class="flex items-center justify-center">
      <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed & Supplies" class="h-12" style="filter:brightness(0) invert(1);" onerror="this.style.display='none'" />
    </a>
    <div class="w-24"></div>
  </div>
</nav>

<!-- ── Hero ───────────────────────────────────────────────────────────────── -->
<div class="bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 text-white py-8 px-4">
  <div class="max-w-screen-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
    <div>
      <h1 class="font-serif text-2xl sm:text-3xl font-bold text-white mb-1">
        Product <span class="text-gold-400">Catalog</span>
      </h1>
      <p class="text-slate-300 text-sm max-w-lg">Premium feeds, supplements, grooming, hay &amp; more — curated for South Florida's equestrians.</p>
    </div>
    <div class="flex flex-col sm:items-end gap-2">
      <div class="inline-flex items-center gap-2 text-amber-300 text-xs font-medium bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-2">
        <i class="fas fa-phone-alt"></i>
        Call <strong>(561) 633-6003</strong> to confirm availability
      </div>
      <a href="/catalog-print" target="_blank"
         style="display:inline-flex;align-items:center;gap:8px;background:#C9A84C;color:#1B2A4A;font-weight:700;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,0.25);transition:all 0.2s;"
         onmouseover="this.style.background='#E0C87A'" onmouseout="this.style.background='#C9A84C'">
        <i class="fas fa-file-pdf"></i>
        Download Full Catalog (PDF)
      </a>
      <span id="productCountBadge" class="text-xs text-slate-400 hidden sm:block text-right"></span>
    </div>
  </div>
</div>

<!-- ── Store Layout ─────────────────────────────────────────────────────────── -->
<div class="max-w-screen-2xl mx-auto">

  <!-- Mobile filter toggle -->
  <div class="md:hidden px-4 pt-3">
    <button class="mobile-filter-btn" onclick="toggleMobileSidebar()">
      <i class="fas fa-sliders-h"></i>
      <span>Filter by Category &amp; Brand</span>
      <span id="activeFilterCount" class="ml-auto bg-gold-400 text-navy-700 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center hidden">0</span>
    </button>
  </div>

  <div class="store-layout">

    <!-- ── Sidebar ────────────────────────────────────────────────────────── -->
    <aside class="store-sidebar" id="storeSidebar">

      <!-- All Products button -->
      <div style="padding:0 16px 12px;">
        <button id="btn-all" onclick="selectParent(null)" class="w-full flex items-center justify-between p-2.5 rounded-lg text-sm font-semibold transition-all bg-navy-700 text-white">
          <span class="flex items-center gap-2"><i class="fas fa-th-large text-gold-400 text-xs"></i> All Products</span>
          <span id="count-all" class="text-xs bg-white/20 px-2 py-0.5 rounded-full text-white"></span>
        </button>
      </div>

      <!-- Category Groups -->
      <div id="catGroupList">
        <!-- Injected by JS -->
      </div>

      <!-- Vendor Filter -->
      <div class="vendor-panel">
        <div class="vendor-panel-title"><i class="fas fa-tag mr-1"></i> Filter by Brand</div>
        <div id="vendorList"><!-- Injected by JS --></div>
      </div>

    </aside>

    <!-- ── Main Content ───────────────────────────────────────────────────── -->
    <main class="store-main">

      <!-- Search + Sort bar -->
      <div class="flex flex-col sm:flex-row gap-2 mb-4">
        <div class="relative flex-1">
          <i class="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input type="text" id="searchInput" class="search-input" placeholder="Search products, brands..."/>
          <button id="clearSearch" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 hidden text-xl leading-none">&times;</button>
        </div>
        <div class="flex gap-2 items-center flex-shrink-0">
          <select id="sortSelect" class="sort-select">
            <option value="default">Default</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="price-asc">Price ↑</option>
            <option value="price-desc">Price ↓</option>
            <option value="category">By Category</option>
          </select>
          <button id="inStockToggle" class="stock-toggle" onclick="toggleInStock()">
            <i class="fas fa-check-circle text-xs"></i> In Stock
          </button>
        </div>
      </div>

      <!-- Active filters row -->
      <div id="activeFiltersRow" class="flex flex-wrap gap-2 mb-4 hidden"></div>

      <!-- Results info -->
      <div class="flex items-center justify-between mb-3">
        <div id="resultsInfo" class="text-sm text-slate-500"></div>
        <div id="activeHeading" class="text-sm font-semibold text-navy-700 hidden"></div>
      </div>

      <!-- Product Grid -->
      <div id="productGrid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
        <div class="col-span-full text-center py-12 text-slate-400">
          <i class="fas fa-spinner fa-spin text-2xl mb-3 block"></i>Loading products...
        </div>
      </div>

      <!-- Empty State -->
      <div id="emptyState" class="hidden text-center py-16">
        <div class="text-5xl mb-4 text-slate-300"><i class="fas fa-search"></i></div>
        <h3 class="text-xl font-semibold text-slate-700 mb-2">No products found</h3>
        <p class="text-slate-500 mb-4">Try adjusting your search or filters</p>
        <button onclick="resetAll()" class="bg-navy-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-navy-800 transition-colors">
          Clear All Filters
        </button>
      </div>

      <!-- Pagination -->
      <div id="pagination" class="flex items-center justify-center gap-1.5 py-4 flex-wrap"></div>

      <!-- Availability Note -->
      <div class="avail-bar mt-2 mb-6">
        <i class="fas fa-info-circle text-gold-300 text-lg flex-shrink-0"></i>
        <div>
          <strong class="text-gold-300">Availability Notice:</strong>
          <span class="text-slate-200"> Pricing and availability change frequently. Call <strong class="text-white">(561) 633-6003</strong> to confirm.</span>
        </div>
      </div>

      <!-- Store Info Footer -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 text-center">
        <div class="bg-white rounded-2xl p-4 border border-slate-100">
          <i class="fas fa-map-marker-alt text-gold-400 text-xl mb-2"></i>
          <div class="font-semibold text-navy-700 text-sm">Location</div>
          <div class="text-slate-500 text-xs mt-1">14589 Southern Blvd, Palm West Plaza<br/>Loxahatchee Groves, FL 33470</div>
        </div>
        <div class="bg-white rounded-2xl p-4 border border-slate-100">
          <i class="fas fa-phone text-gold-400 text-xl mb-2"></i>
          <div class="font-semibold text-navy-700 text-sm">Call Us</div>
          <a href="tel:+15616336003" class="text-gold-500 font-semibold text-sm mt-1 block hover:text-gold-600">(561) 633-6003</a>
          <div class="text-slate-500 text-xs">Store: Mon–Fri 9am–6pm &middot; Sat 9am–4pm</div>
          <div class="text-slate-400 text-xs">Distribution: Mon–Fri 8am–5pm &middot; Sat 9am–4pm</div>
        </div>
        <div class="bg-white rounded-2xl p-4 border border-slate-100">
          <i class="fas fa-truck text-gold-400 text-xl mb-2"></i>
          <div class="font-semibold text-navy-700 text-sm">Free Delivery</div>
          <div class="text-slate-500 text-xs mt-1">On orders over $150<br/>Wellington &amp; surrounding areas</div>
          <div class="text-amber-600 text-xs mt-1 font-medium"><i class="fas fa-gas-pump mr-1"></i>Temporary minimal fuel surcharge applies</div>
        </div>
      </div>

    </main>
  </div>
</div>

<!-- ── Product Detail Modal ─────────────────────────────────────────────── -->
<div id="productModal" class="modal-backdrop hidden" onclick="closeModalBg(event)">
  <div class="modal-box">
    <button onclick="closeModal()" class="absolute top-4 right-4 z-10 w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold text-lg transition-colors">&times;</button>

    <div class="modal-img-wrap" id="modalImgWrap">
      <img id="modalImg" src="" alt="" onerror="this.style.display='none'; document.getElementById('modalImgFallback').style.display='flex'"/>
      <div id="modalImgFallback" class="w-24 h-24 rounded-full flex items-center justify-center text-4xl" style="display:none"></div>
    </div>

    <div class="p-6">
      <div class="flex flex-wrap gap-2 mb-3" id="modalBadges"></div>
      <h2 class="font-serif text-2xl font-bold text-navy-700 mb-1" id="modalName"></h2>
      <div class="text-slate-500 text-sm mb-4" id="modalVendorCat"></div>
      <div class="text-3xl font-bold text-navy-700 mb-4" id="modalPrice"></div>

      <div class="bg-slate-50 rounded-xl p-4 mb-4">
        <h3 class="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-2">
          <i class="fas fa-info-circle text-gold-400"></i>
          Product Information
        </h3>
        <p class="text-slate-600 text-sm leading-relaxed" id="modalDescription"></p>
      </div>

      <!-- Extra details: features, bestFor, nutrition -->
      <div id="modalExtra" class="mb-4"></div>

      <!-- Video embed -->
      <div id="modalVideoWrap" style="display:none" class="mb-4"></div>

      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
        <i class="fas fa-phone-alt text-amber-500 mt-0.5 flex-shrink-0"></i>
        <div>
          <div class="font-semibold text-amber-800 text-sm">Confirm Availability</div>
          <div class="text-amber-700 text-xs mt-0.5">Call <strong>(561) 633-6003</strong> to confirm availability and current pricing before visiting.</div>
        </div>
      </div>

      <div class="flex gap-3">
        <a href="tel:+15616336003" class="flex-1 bg-navy-700 hover:bg-navy-800 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm">
          <i class="fas fa-phone-alt text-gold-400"></i>
          Call to Order
        </a>
        <a href="/#chat" class="flex-1 border-2 border-navy-700 text-navy-700 hover:bg-navy-50 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm">
          <i class="fas fa-comment-dots text-gold-500"></i>
          Ask Our AI
        </a>
      </div>
    </div>
  </div>
</div>

<script>
// ── State ──────────────────────────────────────────────────────────────────────
let allProducts = [];
let filtered = [];
let activeParent = null;   // null = all, string = parent group key
let activeSub = null;      // null = all in parent, string = exact category name
let activeVendor = '';
let inStockOnly = false;
let currentPage = 1;
const PAGE_SIZE = 40;

// ── Storefront Category Groups ──────────────────────────────────────────────────
const GROUPS = [
  { key:'Horse Feed',       label:'Horse Feed',        icon:'', bgClass:'cat-grain',   subcats:['Horse Feed'] },
  { key:'Hay',              label:'Hay',                icon:'', bgClass:'cat-hay',     subcats:['Hay','Hay Cubes & Pellets'] },
  { key:'Supplements',      label:'Supplements',        icon:'', bgClass:'cat-supp',    subcats:['Supplements','Gut Health','Electrolytes','Psyllium Supplements'] },
  { key:'Shavings & Bedding',label:'Shavings & Bedding',icon:'', bgClass:'cat-bedding', subcats:['Shavings & Bedding'] },
  { key:'Supplies',         label:'Supplies',           icon:'', bgClass:'cat-supplies',subcats:['Shampoo & Coat Care','Fly Sprays','Fly Control Supplements','Grooming','Clippers & Tools','Leather Care','Oils','Liniments & Topicals'] },
];

// ── Category config fallback ────────────────────────────────────────────────────
const CAT_CONFIG_EXTRA = {
  'Horse Feed':['','cat-grain','Horse Feed'],'Hay':['','cat-hay','Hay'],'Hay Cubes & Pellets':['','cat-haycube','Hay Cubes'],
  'Shavings & Bedding':['','cat-bedding','Bedding'],'Supplements':['','cat-supp','Supplements'],'Gut Health':['','cat-gut','Gut Health'],
  'Psyllium Supplements':['','cat-psyl','Psyllium'],'Electrolytes':['','cat-electro','Electrolytes'],
  'Shampoo & Coat Care':['','cat-shampoo','Shampoo'],'Fly Sprays':['','cat-fly','Fly Sprays'],
  'Fly Control Supplements':['','cat-flyctl','Fly Control'],'Grooming':['','cat-grooming','Grooming'],
  'Clippers & Tools':['','cat-clip','Clippers'],'Leather Care':['','cat-leather','Leather Care'],
  'Oils':['','cat-oil','Oils'],'Liniments & Topicals':['','cat-lini','Liniments'],
  // Legacy
  'Grain & Feed':['','cat-grain','Grain & Feed'],
};

function catConfig(cat) {
  if (CAT_CONFIG_EXTRA[cat]) return CAT_CONFIG_EXTRA[cat];
  for (const g of GROUPS) { if (g.subcats.includes(cat)) return [g.icon, g.bgClass, cat]; }
  return ['','cat-default',cat];
}

function getProductImage(product) {
  if (product.imageUrl) return product.imageUrl;
  if (product.imageKey) return '/admin/api/catalog/image/' + product.imageKey;
  const name = product.name.toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
  const imageMap = {
    'endurix': 'https://www.cavalor.com/media/catalog/product/e/n/endurix.jpg',
    'fiberforce': 'https://www.cavalor.com/media/catalog/product/f/i/fiberforce.jpg',
    'pianissimo': 'https://www.cavalor.com/media/catalog/product/p/i/pianissimo.jpg',
    'performix': 'https://www.cavalor.com/media/catalog/product/p/e/performix.jpg',
    'strucomix original': 'https://www.cavalor.com/media/catalog/product/s/t/strucomix_original.jpg',
    'strucomix senior': 'https://www.cavalor.com/media/catalog/product/s/t/strucomix_senior.jpg',
    'competition 12 mix': 'https://www.redmills.com/uploads/products/competition-12-mix.jpg',
    'competition 10 mix': 'https://www.redmills.com/uploads/products/competition-10-mix.jpg',
  };
  return imageMap[name] || null;
}

function formatPrice(p) { return '$' + parseFloat(p).toFixed(2); }

// ── Sidebar builder ─────────────────────────────────────────────────────────────
function buildSidebar() {
  document.getElementById('count-all').textContent = allProducts.length;
  const catCounts = {};
  allProducts.forEach(p => { catCounts[p.category] = (catCounts[p.category]||0)+1; });
  const catGroupList = document.getElementById('catGroupList');
  catGroupList.innerHTML = '';
  GROUPS.forEach(g => {
    const total = g.subcats.reduce((s,c) => s+(catCounts[c]||0), 0);
    if (!total) return;
    const hasSubFilters = g.subcats.length > 1;
    const groupDiv = document.createElement('div');
    groupDiv.className = 'cat-group';
    groupDiv.id = 'grp-' + g.key.replace(/[^a-z0-9]/gi,'_');
    const header = document.createElement('div');
    header.className = 'cat-group-header';
    header.innerHTML = \`<div class="cat-group-header-left"><div class="cat-group-icon \${g.bgClass}">\${g.icon}</div><span class="cat-group-name">\${g.label}</span></div><div class="flex items-center gap-2"><span class="cat-group-count">\${total}</span>\${hasSubFilters?'<i class="fas fa-chevron-right cat-group-arrow text-xs text-slate-400"></i>':''}</div>\`;
    header.onclick = () => hasSubFilters ? toggleGroup(g.key) : selectParent(g.key);
    groupDiv.appendChild(header);
    if (hasSubFilters) {
      const subDiv = document.createElement('div');
      subDiv.className = 'cat-subfilters';
      const allSub = document.createElement('button');
      allSub.className = 'cat-sub-btn'; allSub.id = 'sub-ALL-'+g.key.replace(/[^a-z0-9]/gi,'_');
      allSub.innerHTML = \`<span>All \${g.label}</span><span class="sub-count">\${total}</span>\`;
      allSub.onclick = () => selectParent(g.key);
      subDiv.appendChild(allSub);
      g.subcats.forEach(cat => {
        const cnt = catCounts[cat]||0; if (!cnt) return;
        const btn = document.createElement('button');
        btn.className = 'cat-sub-btn'; btn.id = 'sub-'+cat.replace(/[^a-z0-9]/gi,'_');
        btn.innerHTML = \`<span>\${cat}</span><span class="sub-count">\${cnt}</span>\`;
        btn.onclick = () => selectSub(g.key, cat);
        subDiv.appendChild(btn);
      });
      groupDiv.appendChild(subDiv);
    }
    catGroupList.appendChild(groupDiv);
  });
  buildVendorList();
}

function buildVendorList() {
  const vCounts = {};
  const src = activeParent ? allProducts.filter(p => { const g = GROUPS.find(x=>x.key===activeParent); return g && (activeSub ? p.category===activeSub : g.subcats.includes(p.category)); }) : allProducts;
  src.forEach(p => { if (p.vendor) vCounts[p.vendor]=(vCounts[p.vendor]||0)+1; });
  const vList = document.getElementById('vendorList'); vList.innerHTML='';
  Object.entries(vCounts).sort((a,b)=>b[1]-a[1]).forEach(([v,cnt])=>{
    const btn = document.createElement('button');
    btn.className = 'vendor-btn'+(activeVendor===v?' active':''); btn.id='vnd-'+v.replace(/[^a-z0-9]/gi,'_');
    btn.innerHTML = \`<span>\${v}</span><span class="vendor-count">\${cnt}</span>\`;
    btn.onclick = () => selectVendor(v);
    vList.appendChild(btn);
  });
}

// ── Navigation ───────────────────────────────────────────────────────────────────
function toggleGroup(key) {
  const el = document.getElementById('grp-'+key.replace(/[^a-z0-9]/gi,'_'));
  if (!el) return;
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.cat-group').forEach(g=>g.classList.remove('open'));
  if (!wasOpen) { el.classList.add('open'); selectParent(key); }
}

function selectParent(key) {
  activeParent=key; activeSub=null; activeVendor=''; currentPage=1;
  const allBtn=document.getElementById('btn-all');
  if(allBtn) allBtn.className='w-full flex items-center justify-between p-2.5 rounded-lg text-sm font-semibold transition-all '+(key===null?'bg-navy-700 text-white':'bg-slate-100 text-navy-700 hover:bg-slate-200');
  document.querySelectorAll('.cat-group-header').forEach(h=>h.classList.remove('active-parent'));
  if(key) { const g=document.getElementById('grp-'+key.replace(/[^a-z0-9]/gi,'_')); if(g) g.querySelector('.cat-group-header').classList.add('active-parent'); }
  document.querySelectorAll('.cat-sub-btn').forEach(b=>b.classList.remove('active'));
  if(key) { const grp=GROUPS.find(x=>x.key===key); if(grp&&grp.subcats.length>1){ document.querySelectorAll('.cat-group').forEach(g=>g.classList.remove('open')); const el=document.getElementById('grp-'+key.replace(/[^a-z0-9]/gi,'_')); if(el)el.classList.add('open'); } const sid='sub-ALL-'+key.replace(/[^a-z0-9]/gi,'_'); const sel=document.getElementById(sid); if(sel)sel.classList.add('active'); }
  buildVendorList(); applyFilters();
}

function selectSub(parentKey, catName) {
  activeParent=parentKey; activeSub=catName; activeVendor=''; currentPage=1;
  const allBtn=document.getElementById('btn-all'); if(allBtn) allBtn.className='w-full flex items-center justify-between p-2.5 rounded-lg text-sm font-semibold transition-all bg-slate-100 text-navy-700 hover:bg-slate-200';
  document.querySelectorAll('.cat-group-header').forEach(h=>h.classList.remove('active-parent'));
  const grp=document.getElementById('grp-'+parentKey.replace(/[^a-z0-9]/gi,'_')); if(grp)grp.querySelector('.cat-group-header').classList.add('active-parent');
  document.querySelectorAll('.cat-sub-btn').forEach(b=>b.classList.remove('active'));
  const sel=document.getElementById('sub-'+catName.replace(/[^a-z0-9]/gi,'_')); if(sel)sel.classList.add('active');
  buildVendorList(); applyFilters();
}

function selectVendor(vendor) {
  activeVendor=(activeVendor===vendor?'':vendor); currentPage=1;
  document.querySelectorAll('.vendor-btn').forEach(b=>b.classList.remove('active'));
  if(activeVendor){ const el=document.getElementById('vnd-'+vendor.replace(/[^a-z0-9]/gi,'_')); if(el)el.classList.add('active'); }
  applyFilters();
}

function toggleInStock() {
  inStockOnly=!inStockOnly; currentPage=1;
  document.getElementById('inStockToggle').classList.toggle('active',inStockOnly);
  applyFilters();
}

function toggleMobileSidebar() { document.getElementById('storeSidebar').classList.toggle('open'); }

// ── Filter + render ─────────────────────────────────────────────────────────────
function applyFilters() {
  const query=document.getElementById('searchInput').value.toLowerCase().trim();
  const sort=document.getElementById('sortSelect').value;
  let allowedCats=null;
  if(activeParent){const g=GROUPS.find(x=>x.key===activeParent); if(g) allowedCats=activeSub?[activeSub]:g.subcats;}
  filtered=allProducts.filter(p=>{
    if(allowedCats&&!allowedCats.includes(p.category))return false;
    if(activeVendor&&p.vendor!==activeVendor)return false;
    if(inStockOnly&&!p.inStock)return false;
    if(query){const s=((p.name||'')+' '+(p.category||'')+' '+(p.vendor||'')+' '+(p.description||'')).toLowerCase(); if(!s.includes(query))return false;}
    return true;
  });
  if(sort==='name-asc') filtered.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sort==='name-desc') filtered.sort((a,b)=>b.name.localeCompare(a.name));
  else if(sort==='price-asc') filtered.sort((a,b)=>a.price-b.price);
  else if(sort==='price-desc') filtered.sort((a,b)=>b.price-a.price);
  else if(sort==='category') filtered.sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
  renderResults(); renderPagination(); updateResultsInfo(); updateActiveFiltersRow(); updateActiveHeading();
}

function updateActiveHeading() {
  const el=document.getElementById('activeHeading'); if(!el)return;
  if(activeSub){el.textContent=activeSub;el.classList.remove('hidden');}
  else if(activeParent){el.textContent=activeParent;el.classList.remove('hidden');}
  else el.classList.add('hidden');
}

function updateActiveFiltersRow() {
  const row=document.getElementById('activeFiltersRow'); if(!row)return;
  const pills=[];
  if(activeParent){const label=activeSub||activeParent; pills.push(\`<span class="active-filter-pill">\${label}<button onclick="\${activeSub?'selectParent(activeParent)':'selectParent(null)'}">×</button></span>\`);}
  if(activeVendor) pills.push(\`<span class="active-filter-pill">\${activeVendor}<button onclick="selectVendor(activeVendor)">×</button></span>\`);
  if(inStockOnly) pills.push(\`<span class="active-filter-pill">In Stock<button onclick="toggleInStock()">×</button></span>\`);
  row.innerHTML=pills.join(''); row.classList.toggle('hidden',!pills.length);
  const badge=document.getElementById('activeFilterCount');
  if(badge){const cnt=(activeParent?1:0)+(activeVendor?1:0)+(inStockOnly?1:0); badge.textContent=cnt; badge.classList.toggle('hidden',!cnt);}
}

function updateResultsInfo() {
  const total=filtered.length, start=(currentPage-1)*PAGE_SIZE+1, end=Math.min(currentPage*PAGE_SIZE,total);
  const el=document.getElementById('resultsInfo'); if(!el)return;
  el.innerHTML=total===0?'No products found':\`Showing <strong>\${start}–\${end}</strong> of <strong>\${total}</strong> products\`;
}

function renderResults() {
  const grid=document.getElementById('productGrid'), empty=document.getElementById('emptyState');
  const page=filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  if(!filtered.length){grid.innerHTML='';empty.classList.remove('hidden');return;}
  empty.classList.add('hidden');
  grid.innerHTML=page.map((p,i)=>{
    const imgUrl=getProductImage(p), cfg=catConfig(p.category);
    const imgContent=imgUrl?\`<img src="\${imgUrl}" alt="\${p.name}" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'">\`:'';
    const phStyle=imgUrl?'display:none':'display:flex';
    return \`<div class="product-card fade-in" style="animation-delay:\${i*0.015}s" onclick="openModal(\${p.id})">
      <div class="product-img-wrap">
        \${p.vendor?\`<div class="vendor-badge">\${p.vendor}</div>\`:''}
        \${imgContent}
        <div class="\${cfg[1]} product-img-placeholder" style="\${phStyle}">\${cfg[0]}</div>
      </div>
      <div class="p-3 flex flex-col flex-1">
        <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">\${cfg[2]}</div>
        <div class="font-semibold text-slate-800 text-sm leading-snug mb-auto line-clamp-2">\${p.name}</div>
        <div class="flex items-center justify-between mt-2">
          <span class="font-bold text-navy-700">\${formatPrice(p.price)}</span>
          <i class="fas fa-chevron-right text-gold-400 text-xs"></i>
        </div>
      </div>
    </div>\`;
  }).join('');
}

function renderPagination() {
  const totalPages=Math.ceil(filtered.length/PAGE_SIZE), pag=document.getElementById('pagination');
  if(totalPages<=1){pag.innerHTML='';return;}
  let html='';
  if(currentPage>1) html+=\`<button class="page-btn" onclick="goPage(\${currentPage-1})"><i class="fas fa-chevron-left text-xs"></i></button>\`;
  const range=[]; for(let i=1;i<=totalPages;i++){if(i===1||i===totalPages||(i>=currentPage-2&&i<=currentPage+2))range.push(i);}
  let last=0; range.forEach(i=>{if(last&&i-last>1)html+=\`<span class="page-btn cursor-default">…</span>\`;html+=\`<button class="page-btn \${i===currentPage?'active':''}" onclick="goPage(\${i})">\${i}</button>\`;last=i;});
  if(currentPage<totalPages) html+=\`<button class="page-btn" onclick="goPage(\${currentPage+1})"><i class="fas fa-chevron-right text-xs"></i></button>\`;
  pag.innerHTML=html;
}

function goPage(n) { currentPage=n; renderResults(); renderPagination(); updateResultsInfo(); window.scrollTo({top:160,behavior:'smooth'}); }

function resetAll() {
  activeParent=null;activeSub=null;activeVendor='';inStockOnly=false;currentPage=1;
  document.getElementById('searchInput').value='';
  document.getElementById('sortSelect').value='default';
  document.getElementById('inStockToggle').classList.remove('active');
  document.getElementById('clearSearch').classList.add('hidden');
  document.querySelectorAll('.cat-group').forEach(g=>g.classList.remove('open'));
  document.querySelectorAll('.cat-sub-btn,.vendor-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.cat-group-header').forEach(h=>h.classList.remove('active-parent'));
  const allBtn=document.getElementById('btn-all'); if(allBtn)allBtn.className='w-full flex items-center justify-between p-2.5 rounded-lg text-sm font-semibold transition-all bg-navy-700 text-white';
  buildVendorList(); applyFilters();
}

// ── Data loading ────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    let products=null;
    try { const r=await fetch('/admin/api/public/catalog'); if(r.ok){const d=await r.json(); if(d.products&&d.products.length)products=d.products;} } catch(e){}
    if(!products){const r=await fetch('/static/products-data.json'); if(!r.ok)throw new Error('Failed'); products=await r.json();}
    allProducts=products;
    const badge=document.getElementById('productCountBadge'); if(badge){badge.textContent=products.length+' products';badge.classList.remove('hidden');}
    buildSidebar(); applyFilters();
  } catch(e) {
    console.error(e);
    document.getElementById('productGrid').innerHTML='<div class="col-span-full text-center py-12 text-red-500"><i class="fas fa-exclamation-circle mr-2"></i>Failed to load products. Please refresh.</div>';
  }
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function openModal(id) {
  const p=allProducts.find(x=>x.id===id); if(!p)return;
  const cfg=catConfig(p.category), imgUrl=getProductImage(p);
  const imgEl=document.getElementById('modalImg'), fallbackEl=document.getElementById('modalImgFallback');
  fallbackEl.innerHTML='<i class=\"fas fa-box text-4xl\"></i>'; fallbackEl.className=cfg[1]+' w-28 h-28 rounded-full flex items-center justify-center';
  if(imgUrl){imgEl.src=imgUrl;imgEl.alt=p.name;imgEl.style.display='block';fallbackEl.style.display='none';}
  else{imgEl.style.display='none';fallbackEl.style.display='flex';}
  document.getElementById('modalBadges').innerHTML=\`
    <span class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full \${cfg[1]}">\${cfg[0]} \${p.category}</span>
    \${p.vendor?\`<span class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-navy-700">\${p.vendor}</span>\`:''}
    \${p.inStock?\`<span class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-700"><i class="fas fa-check-circle"></i> In Stock</span>\`:''}
  \`;
  document.getElementById('modalName').textContent=p.name;
  document.getElementById('modalVendorCat').textContent=[p.vendor,p.category].filter(Boolean).join(' · ');
  document.getElementById('modalPrice').textContent=formatPrice(p.price);
  document.getElementById('modalDescription').textContent=p.description||'No description available.';
  const vw=document.getElementById('modalVideoWrap');
  if(p.videoUrl&&vw){let e='';const yt=p.videoUrl.match(new RegExp('(?:youtube\\.com/watch\\?v=|youtu\\.be/)([\\w-]+)'));if(yt)e=\`<iframe width="100%" height="220" src="https://www.youtube.com/embed/\${yt[1]}" frameborder="0" allowfullscreen style="border-radius:10px"></iframe>\`;const vi=p.videoUrl.match(new RegExp('vimeo\\.com/(\\d+)'));if(vi)e=\`<iframe width="100%" height="220" src="https://player.vimeo.com/video/\${vi[1]}" frameborder="0" allowfullscreen style="border-radius:10px"></iframe>\`;if(!e&&(p.videoUrl.includes('.mp4')||p.videoUrl.includes('.webm')))e=\`<video src="\${p.videoUrl}" controls style="width:100%;max-height:220px;border-radius:10px"></video>\`;if(e){vw.innerHTML=\`<div class="mt-4"><div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"><i class="fas fa-play-circle text-purple-400 mr-1"></i>Product Video</div>\${e}</div>\`;vw.style.display='block';}else{vw.innerHTML='';vw.style.display='none';}}else if(vw){vw.innerHTML='';vw.style.display='none';}
  const ew=document.getElementById('modalExtra');
  if(ew){let ex='';
    if(p.bestFor)ex+=\`<div class="mt-3 text-sm"><span class="font-semibold text-navy-700">Best For: </span><span class="text-gray-600">\${p.bestFor}</span></div>\`;
    if(p.features&&p.features.length)ex+=\`<div class="mt-3"><div class="text-sm font-semibold text-navy-700 mb-1.5">Key Features:</div><ul class="list-disc list-inside text-sm text-gray-600 space-y-0.5">\${p.features.map(f=>\`<li>\${f}</li>\`).join('')}</ul></div>\`;
    if(p.protein||p.fat||p.fiber)ex+=\`<div class="mt-3 flex gap-3 flex-wrap">\${p.protein?\`<div class="text-center bg-blue-50 rounded-lg px-3 py-2"><div class="text-lg font-bold text-navy-700">\${p.protein}%</div><div class="text-xs text-gray-500">Protein</div></div>\`:''}\${p.fat?\`<div class="text-center bg-amber-50 rounded-lg px-3 py-2"><div class="text-lg font-bold text-amber-700">\${p.fat}%</div><div class="text-xs text-gray-500">Fat</div></div>\`:''}\${p.fiber?\`<div class="text-center bg-green-50 rounded-lg px-3 py-2"><div class="text-lg font-bold text-green-700">\${p.fiber}%</div><div class="text-xs text-gray-500">Fiber</div></div>\`:''}</div>\`;
    ew.innerHTML=ex;
  }
  document.getElementById('productModal').classList.remove('hidden');
  document.body.style.overflow='hidden';
}

function closeModal(){document.getElementById('productModal').classList.add('hidden');document.body.style.overflow='';}
function closeModalBg(e){if(e.target.id==='productModal')closeModal();}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

// ── Event listeners ─────────────────────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input',function(){document.getElementById('clearSearch').classList.toggle('hidden',!this.value);currentPage=1;applyFilters();});
document.getElementById('clearSearch').addEventListener('click',function(){document.getElementById('searchInput').value='';this.classList.add('hidden');currentPage=1;applyFilters();});
document.getElementById('sortSelect').addEventListener('change',()=>{currentPage=1;applyFilters();});

document.addEventListener('DOMContentLoaded', loadData);
</script>
</body>
</html>`
}
