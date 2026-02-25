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
- Email: admin@britishfeed.com
- Owner: Vieri Bracco | General Manager: Carmine Garrett
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
        max_tokens: 400,
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
  const kv = c.env?.BF_STORE
  const body = await c.req.json()
  if (kv) {
    try {
      const raw = await kv.get('contacts')
      const contacts: any[] = raw ? JSON.parse(raw) : []
      contacts.push({
        ...body,
        date: new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
      })
      await kv.put('contacts', JSON.stringify(contacts))
    } catch {}
  }
  return c.json({ success: true, message: 'Thank you! We will contact you within 24 hours.' })
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
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
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
            serif: ['Playfair Display', 'Georgia', 'serif'],
            sans:  ['Inter', 'system-ui', 'sans-serif'],
          }
        }
      }
    }
  </script>
  <style>
    html { scroll-behavior: smooth; }
    .hero-bg {
      background: linear-gradient(135deg, rgba(27,42,74,0.85) 0%, rgba(27,42,74,0.50) 55%, rgba(0,0,0,0.25) 100%),
                  url('https://sspark.genspark.ai/cfimages?u1=hzEbAV4lPpykIa5X9lcQ4jr%2Fm9mpHj9nzVfssr4frp4kAfrI%2BXGE%2BRdSmGkNbIxpnhntyl9t3x6ivKuK9ssLhnalkfNY3MPhQuv3a11VUri%2F6A%3D%3D&u2=Y3f3oehzecr27oyj&width=2560') center/cover no-repeat;
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
        <img src="https://www.genspark.ai/api/files/s/P7DEplwl" alt="British Feed Logo" class="h-10 brightness-0 invert" onerror="this.style.display='none'" />
        <span class="text-white font-serif text-lg font-semibold hidden sm:block">British Feed & Supplies</span>
      </a>
      <div class="hidden md:flex items-center gap-6 text-sm font-medium text-white/90">
        <a href="#about"    class="nav-link hover:text-gold-400 transition-colors">About</a>
        <a href="#products" class="nav-link hover:text-gold-400 transition-colors">Products</a>
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
<section id="home" class="hero-bg min-h-screen flex flex-col justify-center relative overflow-hidden">
  <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-navy-900/50"></div>
  <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-white">
    <div class="max-w-2xl">
      <div class="flex items-center gap-2 mb-4">
        <div class="h-px w-12 bg-gold-400"></div>
        <span class="text-gold-400 font-semibold tracking-widest text-xs uppercase">Wellington · Loxahatchee · Palm Beach County</span>
      </div>
      <h1 class="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight mb-6 drop-shadow-lg">
        Premium Feed<br/>
        <span class="text-gold-400">for Champions.</span>
      </h1>
      <p class="text-xl text-white/85 mb-8 leading-relaxed max-w-xl">
        Serving Wellington's equestrian community since 2012. Expert nutrition, top brands, and personalized service for horses, livestock, and pets.
      </p>
      <div class="flex flex-wrap gap-4">
        <a href="#products" class="bg-gold-400 hover:bg-gold-500 text-navy-700 font-bold px-8 py-4 rounded-full text-lg transition-all hover:scale-105 shadow-lg">
          <i class="fas fa-search mr-2"></i>Find the Right Feed
        </a>
        <a href="#contact" class="border-2 border-white/60 hover:border-white text-white hover:bg-white/10 font-semibold px-8 py-4 rounded-full text-lg transition-all">
          <i class="fas fa-envelope mr-2"></i>Contact Us
        </a>
      </div>
      <div class="flex flex-wrap gap-6 mt-10 text-sm text-white/75">
        <div class="flex items-center gap-2"><i class="fas fa-star text-gold-400"></i><span>Since 2012</span></div>
        <div class="flex items-center gap-2"><i class="fas fa-truck text-gold-400"></i><span>Free Local Delivery</span></div>
        <div class="flex items-center gap-2"><i class="fas fa-award text-gold-400"></i><span>10+ Premium Brands</span></div>
        <div class="flex items-center gap-2"><i class="fas fa-horse text-gold-400"></i><span>Equine Nutritionists</span></div>
      </div>
    </div>
  </div>
  <!-- Scroll indicator -->
  <div class="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 animate-bounce">
    <i class="fas fa-chevron-down text-xl"></i>
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
      <div class="scroll-reveal relative">
        <div class="rounded-2xl overflow-hidden shadow-2xl">
          <img src="https://sspark.genspark.ai/cfimages?u1=K2zg5KNpQPqHX6KgPMOu%2BqTtOAdJN%2Fkacb%2B3o1K%2FCWoh8CE4T1yaOqa6a4eTfwczJSJKqVVvn9gLgipg%2F4Vhkxd6dxSHlTaSe4v2P%2Fxqvz2GYw%3D%3D&u2=eFbKamVjWpBxOevY&width=2560" alt="Dressage horse in arena" class="w-full h-96 object-cover" />
        </div>
        <div class="absolute -bottom-6 -left-6 bg-white rounded-2xl p-5 shadow-xl border border-gray-100 max-w-xs hidden lg:block">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-navy-700 rounded-full flex items-center justify-center">
              <i class="fas fa-map-marker-alt text-gold-400 text-xl"></i>
            </div>
            <div>
              <div class="font-bold text-navy-700 text-sm">Find Us</div>
              <div class="text-xs text-gray-500">14589 Southern Blvd</div>
              <div class="text-xs text-gray-500">Loxahatchee Groves, FL 33470</div>
            </div>
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
    <div id="cat-grain" class="product-category mb-12">
      <h3 class="text-2xl font-serif font-bold text-navy-700 mb-6 flex items-center gap-3">
        Grain Brands
        <span class="text-sm font-sans font-normal text-gray-400 ml-2">— click a brand to see all products</span>
      </h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        ${brandCards()}
      </div>
    </div>

    <!-- HAY -->
    <div id="cat-hay" class="product-category mb-12">
      <h3 class="text-2xl font-serif font-bold text-navy-700 mb-6 flex items-center gap-3">Hay Selection</h3>
      <div class="grid md:grid-cols-2 gap-6">
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><i class="fas fa-cubes text-green-600"></i></div>
            <div><h4 class="font-bold text-navy-700">3-String Bales (100–110 lbs)</h4><p class="text-xs text-gray-400">Large format — bulk value</p></div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            ${['Alfalfa','2nd Cut Grassy Timothy','1st Cut Timothy','2nd Cut Orchard','2nd Cut Timothy'].map(h=>`<div class="product-item pl-3 py-1 text-gray-600">${h}</div>`).join('')}
          </div>
        </div>
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center"><i class="fas fa-box text-amber-600"></i></div>
            <div><h4 class="font-bold text-navy-700">2-String Bales (48–60 lbs)</h4><p class="text-xs text-gray-400">Convenient size — easy handling</p></div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            ${['Special Reserve T/A','Premium T/A','Supergrass (Straight Orchard)','Quebec T/A','Twyla T/A (Heavy Alfalfa)','Peanut Hay (High Protein)','Valley Green O/T/A','Alberta Timothy (Straight)','2nd Cut Alberta Timothy'].map(h=>`<div class="product-item pl-3 py-1 text-gray-600">${h}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="mt-4 bg-gold-50 border border-gold-200 rounded-xl p-4 text-sm text-gray-600">
        <i class="fas fa-info-circle text-gold-500 mr-2"></i>
        Hay availability varies by season. Call <strong>(561) 633-6003</strong> or visit the store to check current stock and pricing.
      </div>
    </div>

    <!-- SHAVINGS -->
    <div id="cat-shavings" class="product-category mb-12">
      <h3 class="text-2xl font-serif font-bold text-navy-700 mb-6 flex items-center gap-3">Shavings & Bedding</h3>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
      <p class="text-sm text-gray-500 mt-4 italic"><i class="fas fa-plus-circle text-gold-400 mr-1"></i>Additional options available under special order — ask us!</p>
    </div>

    <!-- SUPPLEMENTS -->
    <div id="cat-supplements" class="product-category mb-12">
      <h3 class="text-2xl font-serif font-bold text-navy-700 mb-6 flex items-center gap-3">Supplements & Additives</h3>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

  </div>
</section>

<!-- ═══════════════════════════ HORSE FINDER TOOL ═══════════════════════════ -->
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
        <div class="h-48 bg-cover bg-center" style="background-image:url('https://sspark.genspark.ai/cfimages?u1=APQFxRzBJu5iRG%2Be6%2BZSpV1FnL4sqrLBF61a2yu9f2v8MWczCNQSIgESkQQbf8iA%2FzJ5bD%2B4dbPiHRXn15DqqHv%2B714IxEzsafrHOXaCIR6eRXI4IYLxCq93T4CTomVNN%2FntdtJmtTsf&u2=FBjs72IGitspXxu9&width=2560')"></div>
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
        <div class="h-48 bg-cover bg-center" style="background-image:url('https://sspark.genspark.ai/cfimages?u1=RSCeq2T%2FVGKFcvxpBbz9PZ4g21WB3CxOr%2B4PODR%2FSirFw%2Bq3FzkaoOwmZbMy%2BLEclsYUzaQtBOMk%2FEtgqFXt7CQ0wymSDb3cvuMDtDlU9qDD34U13PtQiC0Gfu4eOuuWU7nNr1GEyUrPc4eqT1nlVobQrs6F33lAh0NMrF2pJxrrDuw%3D&u2=mo%2FTEXhG78XbzS%2BM&width=2560')"></div>
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
    <div class="grid md:grid-cols-2 gap-10">
      <!-- Vieri Bracco -->
      <div class="bg-cream rounded-2xl p-8 border border-gray-100 shadow-sm card-hover scroll-reveal flex gap-6">
        <div class="flex-shrink-0">
          <div class="w-24 h-24 rounded-full bg-navy-700 flex items-center justify-center shadow-md">
            <span class="text-white font-serif text-3xl font-bold">V</span>
          </div>
        </div>
        <div>
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
      </div>
      <!-- Carmine Garrett -->
      <div class="bg-cream rounded-2xl p-8 border border-gray-100 shadow-sm card-hover scroll-reveal flex gap-6">
        <div class="flex-shrink-0">
          <div class="w-24 h-24 rounded-full bg-gold-400 flex items-center justify-center shadow-md">
            <span class="text-navy-700 font-serif text-3xl font-bold">C</span>
          </div>
        </div>
        <div>
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
        <a href="https://www.google.com/maps/place/British+Feed+and+Supplies" target="_blank" rel="noopener" class="ml-2 text-sm text-navy-500 hover:text-navy-700 underline">View all reviews</a>
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
      <a href="https://www.google.com/maps/place/British+Feed+and+Supplies" target="_blank" rel="noopener"
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
          </div>
        </div>
        <div class="flex gap-5">
          <div class="w-12 h-12 bg-gold-400/20 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-warehouse text-gold-400 text-lg"></i></div>
          <div>
            <div class="font-bold text-white text-lg mb-1">Distribution Center</div>
            <div class="text-white/70">100 Aldi Way, Suite 400<br/>Royal Palm Beach, FL 33411<br/><span class="text-xs">(Visit by appointment only)</span></div>
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
          <div class="w-12 h-12 bg-gold-400/20 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-envelope text-gold-400 text-lg"></i></div>
          <div>
            <div class="font-bold text-white text-lg mb-1">Email</div>
            <a href="mailto:admin@britishfeed.com" class="text-gold-400 hover:text-gold-300">admin@britishfeed.com</a>
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
        <img src="https://www.genspark.ai/api/files/s/P7DEplwl" alt="British Feed Logo" class="h-10 brightness-0 invert mb-4" onerror="this.style.display='none'" />
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
          <div><a href="mailto:admin@britishfeed.com" class="hover:text-gold-400"><i class="fas fa-envelope text-gold-400 mr-2 w-4"></i>admin@britishfeed.com</a></div>
        </div>
      </div>
    </div>
    <div class="border-t border-white/10 pt-6 text-center text-xs text-white/30">
      © 2025 British Feed & Supplies. All rights reserved. | 14589 Southern Blvd, Loxahatchee Groves, FL 33470
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

// ─── Scroll reveal ────────────────────────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
</script>
</body>
</html>`
}

// ── Brand card grid ────────────────────────────────────────────────────────────
function brandCards(): string {
  const brands = [
    { id:'nutrena',   name:'Nutrena',       logo:'https://nutrenaworld.com/wp-content/themes/nutrena/img/logo.svg',         color:'#e8f0fe', tag:'SafeChoice · ProForce · Triumph',       img:'https://sspark.genspark.ai/cfimages?u1=Inli4Vrc%2Bq7q%2Bhejp2YDAGwFAIaUPxW7K%2FwGYXRV7M%2FosuAUR1Dg%2F0CYc7d60OG48eic0M3S7QLmL7rjvtV13G6oK3uyoFxL%2F6mCxQ%2BPP0S%2BoyvO&u2=KfyuzNFlfV1IBWO5&width=600' },
    { id:'proelite',  name:'Pro Elite',      logo:'https://proelitehorsefeed.com/wp-content/uploads/2021/10/ProElite_Logo_Reversed.png', color:'#fef9e8', tag:'Performance · Senior · Growth',       img:'https://sspark.genspark.ai/cfimages?u1=UxSf44ASGNVschWMwLtxVTJm3%2BRiUSyER74fAAsvVIMvRn1hKeSeK4y%2BjKNE8jwMaOERwhJljHYQcYwWUmC1zwynUJr1ADAMOeXYd7zaFrqolHnB&u2=5%2BTutAkigKGikiTN&width=600' },
    { id:'cavalor',   name:'Cavalor',        logo:'https://cavalor.com/wp-content/uploads/2022/09/cavalor-logo.svg',          color:'#f0f7ff', tag:'Performix · FiberGastro · Strucomix',  img:'https://sspark.genspark.ai/cfimages?u1=onNaXY4%2FhbZvy5YUkL6RJRe7GDYh%2FXQ%2F9jUCePwxorXO0SXh9sJ4V5ZlP8bfJnaEM4xvG77mMoaKrx2Kh4NABnoukeaffKYGZCZbO8v6anEF9nDmP8mcozZwUEkzk0ZJI0S3JYPVUJekW5Q%2FTQ7Wo1Ym%2F384PTiYCw%3D%3D&u2=HvaCFz89bIhAFLwE&width=600' },
    { id:'redmills',  name:'Red Mills',      logo:'https://www.redmillshorse.com/wp-content/uploads/2019/01/logo.png',        color:'#fff0f0', tag:'Competition · Horse Care · Comfort',   img:'https://sspark.genspark.ai/cfimages?u1=7osbNYU1ox8HmUk%2Ff45sEFuifDuvcNmaipEgpuBsDXSH2IHPavx1l1F8XyLl6hGDuY9d7%2BNMCEuIiPfiM%2BXq2K%2BeZndZ3qLBoOkpr7yNJg%3D%3D&u2=2MbM4LT9HP0TC4eI&width=600' },
    { id:'havens',    name:'Havens',         logo:'',                                                                          color:'#f0fff4', tag:'Endurance · Gastro · Cool Mix',        img:'https://sspark.genspark.ai/cfimages?u1=dhrtoOORdnVmpeg5tu7Vf6iZPYmcuNy2bGs4%2F7HVf9X7%2FqSEKc8h4k8BEc2V5IGz%2BZu3%2FCtD5Qu55n%2F526YoYwwmmVccVgPnmttMjJxE%2FQk%3D&u2=7nQSyV4Lh9alc6Az&width=600' },
    { id:'buckeye',   name:'Buckeye',        logo:'',                                                                          color:'#fff8f0', tag:'EQ8 · Cadence Ultra · Safe N Easy',    img:'https://sspark.genspark.ai/cfimages?u1=9XhtqN4rYmnFIf9UGMrzL7a9c7Ql2XBXrI6%2BK3o57loRQp60kAcf3xQdI%2BlJC9wcQvXchR9jZmirwQJGcDU%2B5FrgA86yTp6np7%2FN%2BLwuscUFAo2fjOxUxzIVKU4cPngVqwZepEz%2FUKNZINWBMvefKj9PnA%3D%3D&u2=ruqOATUPxWic6yRH&width=600' },
    { id:'cryptoaero',name:'Crypto Aero',   logo:'',                                                                          color:'#f4fff0', tag:'Wholefood · All Natural',              img:'https://sspark.genspark.ai/cfimages?u1=UUsiXOiA0Ei8p%2FfKKGgbk1xAySyI%2FiMwtVhDYyrYBbgpnGA1ZJtkrAhHHwCYX1JzMYoWCDxVgQn44pKRN%2Bml1gVbJzt6nT4%2F%2B%2BDhAQJwPC%2BdZw%3D%3D&u2=QDzJUpsrG0A2lDdk&width=600' },
    { id:'kent',      name:'Kent Sentinel', logo:'',                                                                          color:'#f5f0ff', tag:'Quality Grain Feeds',                  img:'https://sspark.genspark.ai/cfimages?u1=Vxz9lWjwxf2ZDBQw4sfUrkXEXV%2FJcZJZ%2FlYvsjswpMWnkrFwvhy8fUCTlInJHfSAcgbZhxIOUmLFM3lX4GvrTZqxqRl7aGNdVnzq9B9g7wZDh59ixKMAQk8Gp6G6Q1qmrlP2hg1jjhE%3D&u2=rkES%2F33%2By4pHTknJ&width=600' },
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
