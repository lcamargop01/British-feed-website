import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './' }))

// Chat API endpoint
app.post('/api/chat', async (c) => {
  try {
    const { messages } = await c.req.json()
    const apiKey = c.env?.OPENAI_API_KEY || ''
    const baseUrl = c.env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

    const systemPrompt = `You are a helpful equine nutrition expert and sales assistant for British Feed and Supplies, located at 14589 Southern Blvd, Palm West Plaza, Loxahatchee Groves, FL 33470. Phone: (561) 633-6003.

You help horse owners find the best feed and nutrition for their horses. Be friendly, knowledgeable, and practical.

PRODUCTS WE CARRY:

GRAIN BRANDS:
- Nutrena: SafeChoice Original/Senior/Special Care/Maintenance, ProForce Fuel/Fuel XF/Senior, Empower Digestive Balance, Triumph line (Complete, Professional Pellet, Fiber Plus, Senior, Triple 10)
- Pro Elite: Grass Advantage, Growth, Omega Advantage, Performance, Senior, Starch Wise, Topline Advantage
- Cavalor: Performix, Fiber Force, Strucomix Original/Senior, Mash Mix, Pianissimo, Endurix, Wholegain, FiberGastro
- Red Mills: Competition 10/12/14 Mix, Horse Care 10/14 Pellets/Mix, Horse Care Ultra Pellets, PerformaCare Balancer, Comfort Mash
- Havens: Cool Mix, Draversbrok, Endurance, Gastro Plus, Natural Balance, Performance 14, Power Plus Mix, Slobber Mash, Sport Muesli, Green Vet Herbal Muesli
- Buckeye: EQ8 Performance/Senior, Cadence Ultra, Gro-N-Win, Senior Balancer, Safe N Easy (Pelleted/Performance/Senior/Textured)
- Crypto Aero: Wholefood Horse Feed (organic, natural)
- Kent Sentinel: Premium Horse Feed

HAY:
- 3-string (100-110 lbs): Alfalfa, 2nd cut grassy timothy, 1st cut timothy, 2nd cut orchard, 2nd cut timothy
- 2-string (48-60 lbs): Special Reserve T/A, Premium T/A, Supergrass straight orchard, Quebec T/A, Twyla T/A heavy alfalfa, Peanut hay (high protein), Valley Green O/T/A, Alberta Timothy, 2nd cut Alberta Timothy

BEDDING/SHAVINGS:
- WD Fine, WD Flake, WD Pelleted, Fast Track Blend, Fast Track Fine, World Cup, Baled Straw, Showtime Large, King Large

SUPPLEMENTS: Cavalor (Hepato Liq, Bronchix Pure, Sozen, Muscle Force, Vitamino), Sand Clear, Horseshoer's Secret, Max-E-Glo Rice Bran, Vita E & Selenium, Sand Purge Psyllium, and many more

SERVICES:
- Free delivery ($150 minimum order) to Wellington, Loxahatchee, Loxahatchee Groves, Royal Palm Beach, Lake Worth, Jupiter Farms, Southwest Ranches
- One-on-one nutritional consultation with a local equine nutritionist
- Nutrena Certified Farm Program (earn rewards on feed purchases)
- Expert staff to help with custom feed programs

When recommending feed, ask about:
1. Horse's age (foal, young horse, adult, senior)
2. Activity level (pleasure riding, competition, performance)
3. Health conditions (metabolic issues, ulcers, hard keeper, etc.)
4. Current feed program
5. Budget preference

Always be helpful and suggest visiting the store or calling (561) 633-6003 for personalized advice.`

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 600,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return c.json({ error: 'AI service error', detail: err }, 500)
    }

    const data: any = await response.json()
    const reply = data.choices?.[0]?.message?.content || 'I apologize, I could not generate a response. Please call us at (561) 633-6003 for assistance.'
    return c.json({ reply })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// Contact form endpoint
app.post('/api/contact', async (c) => {
  try {
    const body = await c.req.json()
    // In production, you'd send an email here
    console.log('Contact form submission:', body)
    return c.json({ success: true, message: 'Thank you! We will contact you shortly.' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// Main page
app.get('/', (c) => {
  return c.html(getHTML())
})

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>British Feed & Supplies | Wellington & Loxahatchee, FL</title>
  <meta name="description" content="British Feed & Supplies - Top quality horse feed, hay, bedding & supplements in Wellington, Loxahatchee, FL. Expert equine nutrition advice since 2012."/>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --navy: #1a2f4e;
      --navy-light: #233a60;
      --gold: #c9a84c;
      --gold-light: #e8c96e;
      --cream: #faf8f4;
      --text: #2d3748;
    }
    body { font-family: 'Inter', sans-serif; color: var(--text); background: var(--cream); scroll-behavior: smooth; }
    .font-display { font-family: 'Playfair Display', serif; }
    .bg-navy { background-color: var(--navy); }
    .bg-navy-light { background-color: var(--navy-light); }
    .text-navy { color: var(--navy); }
    .text-gold { color: var(--gold); }
    .bg-gold { background-color: var(--gold); }
    .border-gold { border-color: var(--gold); }
    .hero-bg {
      background: linear-gradient(135deg, rgba(26,47,78,0.92) 0%, rgba(26,47,78,0.75) 100%),
        url('https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=1600&q=80') center/cover no-repeat;
      min-height: 100vh;
    }
    .card-hover { transition: transform 0.3s ease, box-shadow 0.3s ease; }
    .card-hover:hover { transform: translateY(-6px); box-shadow: 0 20px 40px rgba(0,0,0,0.15); }
    .nav-link { transition: color 0.2s; }
    .nav-link:hover { color: var(--gold); }
    .btn-gold { background: var(--gold); color: #fff; transition: all 0.3s; }
    .btn-gold:hover { background: var(--gold-light); transform: translateY(-2px); box-shadow: 0 8px 20px rgba(201,168,76,0.4); }
    .btn-navy { background: var(--navy); color: #fff; transition: all 0.3s; }
    .btn-navy:hover { background: var(--navy-light); transform: translateY(-2px); }
    .tab-active { background: var(--navy); color: #fff; }
    .tab-inactive { background: #e8edf5; color: var(--navy); }
    .tab-inactive:hover { background: #d1dae8; }
    .product-card { background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
    .star-filled { color: #f59e0b; }
    .chatbot-bubble { max-width: 80%; word-wrap: break-word; }
    .chat-user { background: var(--navy); color: #fff; border-radius: 18px 18px 4px 18px; }
    .chat-bot { background: #f0f4f8; color: var(--text); border-radius: 18px 18px 18px 4px; }
    .typing-dot { animation: typing 1.4s infinite; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--navy); margin: 0 2px; }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-6px); opacity: 1; } }
    .section-divider { width: 80px; height: 4px; background: var(--gold); border-radius: 2px; margin: 0 auto 2rem; }
    .brand-logo-card { filter: grayscale(30%); transition: filter 0.3s, transform 0.3s; }
    .brand-logo-card:hover { filter: grayscale(0%); transform: scale(1.05); }
    .scroll-reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.6s ease, transform 0.6s ease; }
    .scroll-reveal.visible { opacity: 1; transform: translateY(0); }
    #chatbot-window { display: none; position: fixed; bottom: 100px; right: 24px; width: 380px; height: 520px; z-index: 1000; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,0.25); flex-direction: column; }
    #chatbot-window.open { display: flex; }
    #chatbot-toggle { position: fixed; bottom: 28px; right: 24px; z-index: 1001; width: 64px; height: 64px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(26,47,78,0.4); }
    #chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    #chat-messages::-webkit-scrollbar { width: 4px; }
    #chat-messages::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 2px; }
    .suggestion-chip { background: #edf2f7; border: 1px solid #e2e8f0; border-radius: 20px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: all 0.2s; color: var(--navy); }
    .suggestion-chip:hover { background: var(--navy); color: #fff; }
    @media (max-width: 768px) {
      #chatbot-window { width: calc(100vw - 24px); right: 12px; bottom: 90px; height: 70vh; }
    }
    .review-card { background: #fff; border-radius: 16px; padding: 24px; border: 1px solid #e2e8f0; }
    .sticky-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; transition: all 0.3s; }
    .nav-scrolled { background: rgba(26,47,78,0.98) !important; backdrop-filter: blur(10px); box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
    .filter-btn { border-radius: 25px; padding: 8px 20px; font-size: 14px; font-weight: 500; transition: all 0.2s; cursor: pointer; }
    .filter-active { background: var(--navy); color: #fff; }
    .filter-inactive { background: #e8edf5; color: var(--navy); }
    .horse-type-btn { border: 2px solid #e2e8f0; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s; text-align: center; }
    .horse-type-btn:hover, .horse-type-btn.selected { border-color: var(--navy); background: var(--navy); color: #fff; }
    .finder-step { display: none; }
    .finder-step.active { display: block; }
  </style>
</head>
<body>

<!-- STICKY NAV -->
<nav id="mainNav" class="sticky-nav bg-navy px-6 py-4">
  <div class="max-w-7xl mx-auto flex items-center justify-between">
    <div class="flex items-center gap-3">
      <img src="https://www.genspark.ai/api/files/s/P7DEplwl" alt="British Feed Logo" class="h-10 w-auto" onerror="this.style.display='none'"/>
      <div>
        <div class="text-white font-display font-bold text-lg leading-tight">BRITISH FEED</div>
        <div class="text-gold text-xs tracking-widest uppercase">& Supplies</div>
      </div>
    </div>
    <div class="hidden md:flex items-center gap-6 text-sm">
      <a href="#about" class="nav-link text-gray-300">About</a>
      <a href="#finder" class="nav-link text-gray-300">Feed Finder</a>
      <a href="#products" class="nav-link text-gray-300">Products</a>
      <a href="#services" class="nav-link text-gray-300">Services</a>
      <a href="#reviews" class="nav-link text-gray-300">Reviews</a>
      <a href="#contact" class="nav-link text-gray-300">Contact</a>
      <a href="tel:5616336003" class="btn-gold px-5 py-2 rounded-full font-semibold text-sm flex items-center gap-2">
        <i class="fas fa-phone text-xs"></i> (561) 633-6003
      </a>
    </div>
    <button id="mobileMenuBtn" class="md:hidden text-white text-xl"><i class="fas fa-bars"></i></button>
  </div>
  <!-- Mobile Menu -->
  <div id="mobileMenu" class="hidden md:hidden mt-4 pb-2 border-t border-white/20">
    <div class="flex flex-col gap-3 pt-4">
      <a href="#about" class="text-gray-300 nav-link py-1">About</a>
      <a href="#finder" class="text-gray-300 nav-link py-1">Feed Finder</a>
      <a href="#products" class="text-gray-300 nav-link py-1">Products</a>
      <a href="#services" class="text-gray-300 nav-link py-1">Services</a>
      <a href="#reviews" class="text-gray-300 nav-link py-1">Reviews</a>
      <a href="#contact" class="text-gray-300 nav-link py-1">Contact</a>
      <a href="tel:5616336003" class="btn-gold px-5 py-2 rounded-full font-semibold text-sm text-center mt-2">
        <i class="fas fa-phone mr-2"></i>(561) 633-6003
      </a>
    </div>
  </div>
</nav>

<!-- HERO -->
<section class="hero-bg flex items-center justify-center relative" style="margin-top:-72px;padding-top:72px;">
  <div class="max-w-7xl mx-auto px-6 py-28 grid md:grid-cols-2 gap-12 items-center w-full">
    <div class="text-white scroll-reveal">
      <div class="inline-flex items-center gap-2 bg-gold/20 border border-gold/40 text-gold px-4 py-2 rounded-full text-sm font-medium mb-6">
        <i class="fas fa-map-marker-alt"></i> Wellington & Loxahatchee, FL • Est. 2012
      </div>
      <h1 class="font-display text-5xl md:text-6xl font-bold leading-tight mb-6">
        Premium Feed<br/>for <span class="text-gold">Champion</span><br/>Horses
      </h1>
      <p class="text-gray-300 text-lg mb-8 leading-relaxed">
        Your trusted local source for top-quality horse feed, hay, bedding & supplements. Expert equine nutrition advice from our knowledgeable team.
      </p>
      <div class="flex flex-wrap gap-4">
        <a href="#finder" class="btn-gold px-8 py-4 rounded-full font-bold text-base flex items-center gap-2">
          <i class="fas fa-search"></i> Find the Right Feed
        </a>
        <a href="#products" class="border-2 border-white/50 text-white px-8 py-4 rounded-full font-semibold text-base hover:bg-white/10 transition-all flex items-center gap-2">
          <i class="fas fa-box-open"></i> View All Products
        </a>
      </div>
      <div class="flex flex-wrap gap-8 mt-10">
        <div class="text-center">
          <div class="font-display text-3xl font-bold text-gold">13+</div>
          <div class="text-gray-400 text-sm">Years in Business</div>
        </div>
        <div class="text-center">
          <div class="font-display text-3xl font-bold text-gold">8</div>
          <div class="text-gray-400 text-sm">Premium Brands</div>
        </div>
        <div class="text-center">
          <div class="font-display text-3xl font-bold text-gold">Free</div>
          <div class="text-gray-400 text-sm">Local Delivery</div>
        </div>
        <div class="text-center">
          <div class="font-display text-3xl font-bold text-gold">4.9★</div>
          <div class="text-gray-400 text-sm">Customer Rating</div>
        </div>
      </div>
    </div>
    <div class="hidden md:flex justify-center items-center">
      <div class="relative">
        <div class="w-80 h-80 rounded-full overflow-hidden border-4 border-gold/40 shadow-2xl">
          <img src="https://images.unsplash.com/photo-1598974357801-cbca100e65d3?w=600&q=80" alt="Beautiful horse" class="w-full h-full object-cover"/>
        </div>
        <div class="absolute -bottom-4 -right-4 bg-gold text-white px-5 py-3 rounded-2xl shadow-xl font-semibold">
          <i class="fas fa-truck mr-2"></i>Free Delivery $150+
        </div>
        <div class="absolute -top-4 -left-4 bg-white text-navy px-4 py-3 rounded-2xl shadow-xl font-semibold text-sm">
          <i class="fas fa-leaf mr-2 text-green-500"></i>Premium Quality
        </div>
      </div>
    </div>
  </div>
  <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-white/60 animate-bounce">
    <i class="fas fa-chevron-down text-2xl"></i>
  </div>
</section>

<!-- TRUST BAR -->
<section class="bg-navy py-5">
  <div class="max-w-7xl mx-auto px-6">
    <div class="flex flex-wrap justify-center md:justify-between items-center gap-4 text-gray-300 text-sm">
      <div class="flex items-center gap-2"><i class="fas fa-truck text-gold"></i> Free Delivery on Orders $150+</div>
      <div class="flex items-center gap-2"><i class="fas fa-user-md text-gold"></i> Expert Equine Nutritionists</div>
      <div class="flex items-center gap-2"><i class="fas fa-star text-gold"></i> 8 Premium Brands</div>
      <div class="flex items-center gap-2"><i class="fas fa-clock text-gold"></i> Mon–Sat 8am–6pm, Sun 9am–3pm</div>
      <div class="flex items-center gap-2"><i class="fas fa-phone text-gold"></i> (561) 633-6003</div>
    </div>
  </div>
</section>

<!-- ABOUT -->
<section id="about" class="py-20 bg-white">
  <div class="max-w-7xl mx-auto px-6">
    <div class="grid md:grid-cols-2 gap-16 items-center">
      <div class="scroll-reveal">
        <div class="relative">
          <img src="https://images.unsplash.com/photo-1508175800969-525c72a047dd?w=700&q=80" alt="British Feed Store" class="rounded-2xl shadow-2xl w-full h-96 object-cover"/>
          <div class="absolute -bottom-6 -right-6 bg-navy text-white p-6 rounded-2xl shadow-xl">
            <div class="font-display text-2xl font-bold text-gold">Since 2012</div>
            <div class="text-sm text-gray-300">Serving South Florida</div>
          </div>
        </div>
      </div>
      <div class="scroll-reveal">
        <div class="text-gold font-semibold uppercase tracking-widest text-sm mb-3">Our Story</div>
        <h2 class="font-display text-4xl font-bold text-navy mb-2">Wellington's Trusted<br/>Feed & Supply Store</h2>
        <div class="section-divider" style="margin:0 0 1.5rem;"></div>
        <p class="text-gray-600 leading-relaxed mb-4">
          Established in 2012, British Feed & Supplies has been providing top-quality feed and supplies for horses and other livestock in the Wellington and Loxahatchee area of Palm Beach County, Florida.
        </p>
        <p class="text-gray-600 leading-relaxed mb-6">
          Under new ownership since 2016, the store underwent a complete renovation with one goal: to better serve our equestrian community. Whether you own a competition horse, pleasure horse, livestock, or pets — our knowledgeable team is dedicated to finding the best nutritional solution for your animals.
        </p>
        <div class="grid grid-cols-2 gap-4 mb-8">
          <div class="flex items-start gap-3 p-4 rounded-xl bg-gray-50">
            <div class="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0">
              <i class="fas fa-medal text-gold"></i>
            </div>
            <div>
              <div class="font-semibold text-navy text-sm">Premium Quality</div>
              <div class="text-gray-500 text-xs">Carefully curated brands</div>
            </div>
          </div>
          <div class="flex items-start gap-3 p-4 rounded-xl bg-gray-50">
            <div class="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0">
              <i class="fas fa-heart text-gold"></i>
            </div>
            <div>
              <div class="font-semibold text-navy text-sm">Community First</div>
              <div class="text-gray-500 text-xs">Supporting local shelters</div>
            </div>
          </div>
          <div class="flex items-start gap-3 p-4 rounded-xl bg-gray-50">
            <div class="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0">
              <i class="fas fa-user-tie text-gold"></i>
            </div>
            <div>
              <div class="font-semibold text-navy text-sm">Expert Staff</div>
              <div class="text-gray-500 text-xs">Trained nutritionists</div>
            </div>
          </div>
          <div class="flex items-start gap-3 p-4 rounded-xl bg-gray-50">
            <div class="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0">
              <i class="fas fa-truck text-gold"></i>
            </div>
            <div>
              <div class="font-semibold text-navy text-sm">Free Delivery</div>
              <div class="text-gray-500 text-xs">$150+ local orders</div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80" alt="Vieri Bracco" class="w-14 h-14 rounded-full object-cover border-2 border-gold"/>
          <div>
            <div class="font-semibold text-navy">Vieri Bracco</div>
            <div class="text-gray-500 text-sm">Owner & General Manager</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FEED FINDER TOOL -->
<section id="finder" class="py-20" style="background: linear-gradient(135deg, #1a2f4e 0%, #233a60 100%);">
  <div class="max-w-4xl mx-auto px-6">
    <div class="text-center mb-12 scroll-reveal">
      <div class="text-gold font-semibold uppercase tracking-widest text-sm mb-3">Smart Tool</div>
      <h2 class="font-display text-4xl font-bold text-white mb-4">🔍 Horse Feed Finder</h2>
      <p class="text-gray-300 text-lg">Answer a few questions to find the perfect feed for your horse</p>
    </div>
    <div id="finderCard" class="bg-white rounded-2xl p-8 shadow-2xl scroll-reveal">
      <!-- Step 1: Horse Type -->
      <div class="finder-step active" id="step1">
        <div class="text-center mb-2"><div class="text-gold text-sm font-semibold uppercase tracking-wide">Step 1 of 4</div></div>
        <div class="w-full bg-gray-200 rounded-full h-2 mb-6"><div class="bg-gold rounded-full h-2" style="width:25%"></div></div>
        <h3 class="font-display text-2xl font-bold text-navy mb-2 text-center">What type of horse do you have?</h3>
        <p class="text-gray-500 text-center mb-6">Select the option that best describes your horse</p>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <button class="horse-type-btn" onclick="selectHorseType('Competition / Show Horse')">
            <div class="text-2xl mb-2">🏆</div>
            <div class="font-semibold text-sm">Competition / Show</div>
          </button>
          <button class="horse-type-btn" onclick="selectHorseType('Pleasure / Trail Horse')">
            <div class="text-2xl mb-2">🌿</div>
            <div class="font-semibold text-sm">Pleasure / Trail</div>
          </button>
          <button class="horse-type-btn" onclick="selectHorseType('Senior Horse (15+ years)')">
            <div class="text-2xl mb-2">🤍</div>
            <div class="font-semibold text-sm">Senior Horse</div>
          </button>
          <button class="horse-type-btn" onclick="selectHorseType('Young / Growing Horse')">
            <div class="text-2xl mb-2">🌱</div>
            <div class="font-semibold text-sm">Young / Growing</div>
          </button>
          <button class="horse-type-btn" onclick="selectHorseType('Hard Keeper')">
            <div class="text-2xl mb-2">💪</div>
            <div class="font-semibold text-sm">Hard Keeper</div>
          </button>
          <button class="horse-type-btn" onclick="selectHorseType('Horse with Health Issues')">
            <div class="text-2xl mb-2">🩺</div>
            <div class="font-semibold text-sm">Health Issues</div>
          </button>
        </div>
      </div>

      <!-- Step 2: Activity Level -->
      <div class="finder-step" id="step2">
        <div class="text-center mb-2"><div class="text-gold text-sm font-semibold uppercase tracking-wide">Step 2 of 4</div></div>
        <div class="w-full bg-gray-200 rounded-full h-2 mb-6"><div class="bg-gold rounded-full h-2" style="width:50%"></div></div>
        <h3 class="font-display text-2xl font-bold text-navy mb-2 text-center">Activity Level?</h3>
        <p class="text-gray-500 text-center mb-6">How much does your horse exercise per week?</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button class="horse-type-btn" onclick="selectActivity('Light (1-3 days/week)')">
            <div class="text-2xl mb-2">🚶</div>
            <div class="font-semibold">Light</div>
            <div class="text-xs text-gray-500">1-3 days/week</div>
          </button>
          <button class="horse-type-btn" onclick="selectActivity('Moderate (4-5 days/week)')">
            <div class="text-2xl mb-2">🏇</div>
            <div class="font-semibold">Moderate</div>
            <div class="text-xs text-gray-500">4-5 days/week</div>
          </button>
          <button class="horse-type-btn" onclick="selectActivity('Heavy / Intense (Daily training)')">
            <div class="text-2xl mb-2">⚡</div>
            <div class="font-semibold">Heavy / Intense</div>
            <div class="text-xs text-gray-500">Daily training</div>
          </button>
        </div>
        <button onclick="prevStep(2)" class="mt-6 text-gray-400 hover:text-navy text-sm flex items-center gap-1"><i class="fas fa-arrow-left"></i> Back</button>
      </div>

      <!-- Step 3: Health Concerns -->
      <div class="finder-step" id="step3">
        <div class="text-center mb-2"><div class="text-gold text-sm font-semibold uppercase tracking-wide">Step 3 of 4</div></div>
        <div class="w-full bg-gray-200 rounded-full h-2 mb-6"><div class="bg-gold rounded-full h-2" style="width:75%"></div></div>
        <h3 class="font-display text-2xl font-bold text-navy mb-2 text-center">Any health concerns?</h3>
        <p class="text-gray-500 text-center mb-6">Select all that apply (optional)</p>
        <div class="grid grid-cols-2 gap-3 mb-4">
          <label class="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-navy transition-all">
            <input type="checkbox" class="health-check w-4 h-4 accent-navy" value="Digestive / Ulcers"/> 
            <span class="text-sm font-medium">Digestive / Ulcers</span>
          </label>
          <label class="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-navy transition-all">
            <input type="checkbox" class="health-check w-4 h-4 accent-navy" value="Metabolic (EMS/IR)"/>
            <span class="text-sm font-medium">Metabolic (EMS/IR)</span>
          </label>
          <label class="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-navy transition-all">
            <input type="checkbox" class="health-check w-4 h-4 accent-navy" value="Joint / Mobility Issues"/>
            <span class="text-sm font-medium">Joint / Mobility</span>
          </label>
          <label class="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-navy transition-all">
            <input type="checkbox" class="health-check w-4 h-4 accent-navy" value="Respiratory Issues"/>
            <span class="text-sm font-medium">Respiratory Issues</span>
          </label>
          <label class="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-navy transition-all">
            <input type="checkbox" class="health-check w-4 h-4 accent-navy" value="Hoof / Coat Issues"/>
            <span class="text-sm font-medium">Hoof / Coat Issues</span>
          </label>
          <label class="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-navy transition-all">
            <input type="checkbox" class="health-check w-4 h-4 accent-navy" value="Muscle Development"/>
            <span class="text-sm font-medium">Muscle Development</span>
          </label>
        </div>
        <button onclick="goToStep4()" class="w-full btn-navy py-3 rounded-xl font-semibold mt-2">Continue <i class="fas fa-arrow-right ml-2"></i></button>
        <button onclick="prevStep(3)" class="mt-3 text-gray-400 hover:text-navy text-sm flex items-center gap-1"><i class="fas fa-arrow-left"></i> Back</button>
      </div>

      <!-- Step 4: Results -->
      <div class="finder-step" id="step4">
        <div class="text-center mb-2"><div class="text-gold text-sm font-semibold uppercase tracking-wide">Your Results</div></div>
        <div class="w-full bg-gold rounded-full h-2 mb-6"></div>
        <h3 class="font-display text-2xl font-bold text-navy mb-4 text-center">✅ Recommended Products</h3>
        <div id="finderResults" class="space-y-3 mb-6"></div>
        <div class="bg-navy/5 rounded-xl p-4 text-center">
          <p class="text-gray-600 text-sm mb-3">Want a personalized consultation with our equine nutritionist?</p>
          <a href="#contact" class="btn-gold px-6 py-2 rounded-full text-sm font-semibold inline-block" onclick="document.getElementById('step1').classList.add('active')">Schedule Free Consultation</a>
        </div>
        <button onclick="restartFinder()" class="mt-4 text-gray-400 hover:text-navy text-sm flex items-center gap-1 mx-auto"><i class="fas fa-redo mr-1"></i> Start Over</button>
      </div>
    </div>
  </div>
</section>

<!-- PRODUCTS -->
<section id="products" class="py-20 bg-gray-50">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center mb-12 scroll-reveal">
      <div class="text-gold font-semibold uppercase tracking-widest text-sm mb-3">What We Carry</div>
      <h2 class="font-display text-4xl font-bold text-navy mb-4">Our Products</h2>
      <div class="section-divider"></div>
      <p class="text-gray-500 max-w-2xl mx-auto">From premium grain and hay to bedding and supplements, we stock everything your horses need</p>
    </div>

    <!-- Category Tabs -->
    <div class="flex flex-wrap justify-center gap-2 mb-10 scroll-reveal">
      <button class="filter-btn filter-active" onclick="filterProducts('all', this)">All Products</button>
      <button class="filter-btn filter-inactive" onclick="filterProducts('grain', this)">🌾 Grain & Feed</button>
      <button class="filter-btn filter-inactive" onclick="filterProducts('hay', this)">🌿 Hay</button>
      <button class="filter-btn filter-inactive" onclick="filterProducts('bedding', this)">🛏️ Bedding</button>
      <button class="filter-btn filter-inactive" onclick="filterProducts('supplements', this)">💊 Supplements</button>
    </div>

    <!-- Product Grid -->
    <div id="productGrid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Nutrena -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&q=80" alt="Nutrena Horse Feed" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-navy text-white text-xs px-3 py-1 rounded-full font-semibold">Premium Brand</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Nutrena</h3>
            <span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Grain</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Industry-leading horse nutrition. SafeChoice, ProForce, Triumph, and Empower lines for every horse type.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">SafeChoice Original</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">SafeChoice Senior</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">ProForce Fuel</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">+8 more</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-green-600 font-medium">
            <i class="fas fa-certificate"></i> Certified Farm Program – Earn Rewards!
          </div>
        </div>
      </div>

      <!-- Pro Elite -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1551730459-92db2a308d6a?w=600&q=80" alt="Pro Elite Horse Feed" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-gold text-white text-xs px-3 py-1 rounded-full font-semibold">Performance</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Pro Elite</h3>
            <span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Grain</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">High-performance nutrition for competition and sport horses. Advanced formulas for optimal health and performance.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Performance</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Omega Advantage</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Senior</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Starch Wise</span>
          </div>
          <div class="text-xs text-gray-400"><i class="fas fa-horse mr-1"></i> Ideal for competition horses</div>
        </div>
      </div>

      <!-- Cavalor -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80" alt="Cavalor Horse Feed" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-purple-600 text-white text-xs px-3 py-1 rounded-full font-semibold">European</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Cavalor</h3>
            <span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Grain</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">European excellence in equine nutrition. Scientifically developed feed for peak performance and wellbeing.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Performix</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">FiberForce Gastro</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Pianissimo</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Endurix</span>
          </div>
          <div class="text-xs text-gray-400"><i class="fas fa-globe-europe mr-1"></i> Premium European formula</div>
        </div>
      </div>

      <!-- Red Mills -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&q=80" alt="Red Mills Horse Feed" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-red-600 text-white text-xs px-3 py-1 rounded-full font-semibold">Irish Quality</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Red Mills</h3>
            <span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Grain</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Irish heritage meets modern nutrition science. Trusted by competitive riders worldwide for generations.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Competition 10/12/14</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Horse Care Ultra</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Comfort Mash</span>
          </div>
          <div class="text-xs text-gray-400"><i class="fas fa-award mr-1"></i> Trusted worldwide</div>
        </div>
      </div>

      <!-- Havens -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1593179357196-ea11a2e7c119?w=600&q=80" alt="Havens Horse Feed" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-green-600 text-white text-xs px-3 py-1 rounded-full font-semibold">Dutch Formula</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Havens</h3>
            <span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Grain</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Dutch-formulated feeds for horses at every level. Natural ingredients with targeted nutritional benefits.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Cool Mix</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Gastro Plus</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Endurance</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Natural Balance</span>
          </div>
          <div class="text-xs text-gray-400"><i class="fas fa-leaf mr-1"></i> Natural ingredients</div>
        </div>
      </div>

      <!-- Buckeye -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&q=80" alt="Buckeye Nutrition" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-yellow-600 text-white text-xs px-3 py-1 rounded-full font-semibold">Gut Health</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Buckeye Nutrition</h3>
            <span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Grain</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Gut-health focused nutrition for horses. The EQ8 line supports digestive wellbeing alongside peak performance.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">EQ8 Performance</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">EQ8 Senior</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Cadence Ultra</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Safe N Easy</span>
          </div>
          <div class="text-xs text-gray-400"><i class="fas fa-heartbeat mr-1"></i> Digestive health focus</div>
        </div>
      </div>

      <!-- Crypto Aero -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=600&q=80" alt="Crypto Aero" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-emerald-600 text-white text-xs px-3 py-1 rounded-full font-semibold">Organic</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Crypto Aero</h3>
            <span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Grain</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">All-natural wholefood horse feed. Non-GMO, grain-free formula that mimics what horses naturally eat in the wild.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Wholefood Feed</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Non-GMO</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Grain-Free Option</span>
          </div>
          <div class="text-xs text-green-600 font-medium"><i class="fas fa-seedling mr-1"></i> 100% natural ingredients</div>
        </div>
      </div>

      <!-- Hay -->
      <div class="product-card card-hover scroll-reveal" data-category="hay">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1464207687429-7505649dae38?w=600&q=80" alt="Premium Hay" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-yellow-500 text-white text-xs px-3 py-1 rounded-full font-semibold">Fresh Hay</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Premium Hay</h3>
            <span class="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">Hay</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Wide selection of 2-string and 3-string bales. Timothy, Alfalfa, Orchard, and specialty blends.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Alfalfa</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Timothy</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Orchard</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Peanut Hay</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">T/A Blends</span>
          </div>
          <div class="text-xs text-gray-400">2-string (48-60 lbs) & 3-string (100-110 lbs)</div>
        </div>
      </div>

      <!-- Bedding -->
      <div class="product-card card-hover scroll-reveal" data-category="bedding">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=600&q=80" alt="Horse Bedding" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-amber-700 text-white text-xs px-3 py-1 rounded-full font-semibold">Premium Shavings</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Bedding & Shavings</h3>
            <span class="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">Bedding</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Multiple shaving options from fine to large flake. Keep your horse comfortable with our quality bedding.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">WD Fine/Flake</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">World Cup</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">King Large</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Pelleted</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Baled Straw</span>
          </div>
          <div class="text-xs text-gray-400">7–10 cu. ft. bags • Special orders available</div>
        </div>
      </div>

      <!-- Supplements -->
      <div class="product-card card-hover scroll-reveal" data-category="supplements">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&q=80" alt="Horse Supplements" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-teal-600 text-white text-xs px-3 py-1 rounded-full font-semibold">Supplements</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Supplements</h3>
            <span class="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded-full">Supplements</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Targeted supplements for joint health, gut support, hoof care, muscle development, and respiratory health.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Cavalor Vitamino</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Sand Clear</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Max-E-Glo</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Vita E & Selenium</span>
          </div>
          <div class="text-xs text-gray-400"><i class="fas fa-capsules mr-1"></i> Ask us for expert recommendations</div>
        </div>
      </div>

      <!-- Pet & Livestock -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&q=80" alt="Pet and Livestock Feed" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-pink-600 text-white text-xs px-3 py-1 rounded-full font-semibold">All Animals</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Pet & Livestock Feed</h3>
            <span class="text-xs bg-pink-50 text-pink-700 px-2 py-1 rounded-full">Multi-Animal</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Feed for dogs, cats, goats, sheep, and poultry. Victor dog food, Nutrena poultry feed, and more.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Victor Dog Food</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Layer Feed</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Scratch Grains</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Goat & Sheep</span>
          </div>
          <div class="text-xs text-gray-400"><i class="fas fa-paw mr-1"></i> We care for all your animals</div>
        </div>
      </div>

      <!-- Kent Sentinel -->
      <div class="product-card card-hover scroll-reveal" data-category="grain">
        <div class="h-48 overflow-hidden relative">
          <img src="https://images.unsplash.com/photo-1470246973918-29a93221c455?w=600&q=80" alt="Kent Sentinel" class="w-full h-full object-cover"/>
          <div class="absolute top-3 left-3 bg-indigo-600 text-white text-xs px-3 py-1 rounded-full font-semibold">Value Pick</div>
        </div>
        <div class="p-5">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-display font-bold text-navy text-lg">Kent Sentinel</h3>
            <span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Grain</span>
          </div>
          <p class="text-gray-500 text-sm mb-3">Premium horse feed combining quality nutrition with excellent value. Perfect for everyday maintenance and growth.</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Sentinel Premium</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Quality Value</span>
          </div>
          <div class="text-xs text-gray-400"><i class="fas fa-dollar-sign mr-1"></i> Excellent value for money</div>
        </div>
      </div>
    </div>

    <div class="text-center mt-10 scroll-reveal">
      <p class="text-gray-500 mb-4">Don't see what you need? We can special order most products!</p>
      <a href="tel:5616336003" class="btn-navy px-8 py-3 rounded-full font-semibold inline-flex items-center gap-2">
        <i class="fas fa-phone"></i> Call for Availability: (561) 633-6003
      </a>
    </div>
  </div>
</section>

<!-- TRUSTED BRANDS BAR -->
<section class="py-12 bg-white border-t border-b border-gray-100">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center mb-8">
      <div class="text-gray-400 uppercase tracking-widest text-xs font-semibold">Trusted Brands We Carry</div>
    </div>
    <div class="flex flex-wrap justify-center items-center gap-8 opacity-70">
      <div class="brand-logo-card text-navy font-display font-bold text-xl cursor-pointer">NUTRENA</div>
      <div class="brand-logo-card text-navy font-display font-bold text-xl cursor-pointer">PRO ELITE</div>
      <div class="brand-logo-card text-navy font-display font-bold text-xl cursor-pointer">CAVALOR</div>
      <div class="brand-logo-card text-navy font-display font-bold text-xl cursor-pointer">RED MILLS</div>
      <div class="brand-logo-card text-navy font-display font-bold text-xl cursor-pointer">HAVENS</div>
      <div class="brand-logo-card text-navy font-display font-bold text-xl cursor-pointer">BUCKEYE</div>
      <div class="brand-logo-card text-navy font-display font-bold text-xl cursor-pointer">CRYPTO AERO</div>
      <div class="brand-logo-card text-navy font-display font-bold text-xl cursor-pointer">KENT</div>
    </div>
  </div>
</section>

<!-- SERVICES -->
<section id="services" class="py-20 bg-white">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center mb-14 scroll-reveal">
      <div class="text-gold font-semibold uppercase tracking-widest text-sm mb-3">What We Offer</div>
      <h2 class="font-display text-4xl font-bold text-navy mb-4">Our Services</h2>
      <div class="section-divider"></div>
    </div>
    <div class="grid md:grid-cols-3 gap-8 mb-16">
      <div class="card-hover scroll-reveal bg-gray-50 rounded-2xl p-8 text-center border border-gray-100">
        <div class="w-20 h-20 bg-navy rounded-full flex items-center justify-center mx-auto mb-6">
          <i class="fas fa-truck text-gold text-3xl"></i>
        </div>
        <h3 class="font-display text-xl font-bold text-navy mb-3">Free Local Delivery</h3>
        <p class="text-gray-500 mb-4">We deliver to Wellington, Loxahatchee, Loxahatchee Groves, Royal Palm Beach, Lake Worth, Jupiter Farms, and surrounding areas.</p>
        <div class="bg-gold/10 rounded-xl p-3 text-sm">
          <strong class="text-gold">$150 minimum order</strong>
          <span class="text-gray-500"> for free delivery</span><br/>
          <span class="text-gray-400 text-xs">$50 fee for orders under $150</span>
        </div>
      </div>
      <div class="card-hover scroll-reveal bg-gray-50 rounded-2xl p-8 text-center border border-gray-100">
        <div class="w-20 h-20 bg-navy rounded-full flex items-center justify-center mx-auto mb-6">
          <i class="fas fa-user-md text-gold text-3xl"></i>
        </div>
        <h3 class="font-display text-xl font-bold text-navy mb-3">Nutritional Consultation</h3>
        <p class="text-gray-500 mb-4">Schedule a one-on-one visit with a local equine nutritionist. We evaluate your horse's condition and recommend a balanced feed program.</p>
        <div class="bg-gold/10 rounded-xl p-3 text-sm">
          <strong class="text-navy">Personalized programs</strong><br/>
          <span class="text-gray-400 text-xs">Call to schedule • Conditions may apply</span>
        </div>
      </div>
      <div class="card-hover scroll-reveal bg-gray-50 rounded-2xl p-8 text-center border border-gray-100">
        <div class="w-20 h-20 bg-navy rounded-full flex items-center justify-center mx-auto mb-6">
          <i class="fas fa-award text-gold text-3xl"></i>
        </div>
        <h3 class="font-display text-xl font-bold text-navy mb-3">Nutrena Farm Program</h3>
        <p class="text-gray-500 mb-4">Join the Nutrena Certified Farm Program and earn cash back on every bag of feed you purchase. Rewards that grow with your herd.</p>
        <div class="bg-gold/10 rounded-xl p-3 text-sm">
          <strong class="text-gold">Earn cashback rewards</strong><br/>
          <span class="text-gray-400 text-xs">Ask us for enrollment details</span>
        </div>
      </div>
    </div>

    <!-- Why British Feed -->
    <div class="bg-navy rounded-3xl overflow-hidden">
      <div class="grid md:grid-cols-2">
        <div class="p-10 md:p-14">
          <div class="text-gold font-semibold uppercase tracking-widest text-sm mb-3">Why Choose Us</div>
          <h3 class="font-display text-3xl font-bold text-white mb-6">What Sets British Feed Apart</h3>
          <div class="space-y-5">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 mt-1">
                <i class="fas fa-check text-gold"></i>
              </div>
              <div>
                <div class="text-white font-semibold">Expert Knowledge</div>
                <div class="text-gray-400 text-sm">Our team is trained in equine nutrition, not just retail. We understand your horse's needs.</div>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 mt-1">
                <i class="fas fa-check text-gold"></i>
              </div>
              <div>
                <div class="text-white font-semibold">Curated Premium Selection</div>
                <div class="text-gray-400 text-sm">Every brand we carry is hand-selected for quality. We don't stock everything — just the best.</div>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 mt-1">
                <i class="fas fa-check text-gold"></i>
              </div>
              <div>
                <div class="text-white font-semibold">Local Community Focus</div>
                <div class="text-gray-400 text-sm">We give back to local animal shelters and support equestrian community events.</div>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 mt-1">
                <i class="fas fa-check text-gold"></i>
              </div>
              <div>
                <div class="text-white font-semibold">Competitive & Fair Pricing</div>
                <div class="text-gray-400 text-sm">Premium products at fair prices, with loyalty programs to reward our regular customers.</div>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 mt-1">
                <i class="fas fa-check text-gold"></i>
              </div>
              <div>
                <div class="text-white font-semibold">Convenient Location</div>
                <div class="text-gray-400 text-sm">Located at the border of Wellington and Loxahatchee Groves — easy access for the whole equestrian community.</div>
              </div>
            </div>
          </div>
        </div>
        <div class="relative hidden md:block">
          <img src="https://images.unsplash.com/photo-1598974357801-cbca100e65d3?w=700&q=80" alt="Happy Horse" class="w-full h-full object-cover"/>
          <div class="absolute inset-0 bg-navy/30"></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- GOOGLE REVIEWS -->
<section id="reviews" class="py-20 bg-gray-50">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center mb-12 scroll-reveal">
      <div class="text-gold font-semibold uppercase tracking-widest text-sm mb-3">Customer Reviews</div>
      <h2 class="font-display text-4xl font-bold text-navy mb-4">What Our Customers Say</h2>
      <div class="section-divider"></div>
      <div class="flex items-center justify-center gap-3 mt-4">
        <div class="flex gap-1">
          <i class="fas fa-star star-filled text-xl"></i>
          <i class="fas fa-star star-filled text-xl"></i>
          <i class="fas fa-star star-filled text-xl"></i>
          <i class="fas fa-star star-filled text-xl"></i>
          <i class="fas fa-star star-filled text-xl"></i>
        </div>
        <span class="font-display text-2xl font-bold text-navy">4.9</span>
        <span class="text-gray-500">/ 5 on Google</span>
        <a href="https://maps.google.com/?cid=britishfeedwellington" target="_blank" class="flex items-center gap-1 text-blue-600 hover:underline text-sm">
          <img src="https://www.google.com/favicon.ico" class="w-4 h-4"/> View on Google
        </a>
      </div>
    </div>
    <div class="grid md:grid-cols-3 gap-6">
      <div class="review-card card-hover scroll-reveal">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-full bg-navy flex items-center justify-center text-white font-bold text-lg">S</div>
          <div>
            <div class="font-semibold text-navy">Sarah M.</div>
            <div class="text-gray-400 text-xs flex items-center gap-1"><img src="https://www.google.com/favicon.ico" class="w-3 h-3"/> Google Review</div>
          </div>
          <div class="ml-auto flex gap-1">
            <i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i>
          </div>
        </div>
        <p class="text-gray-600 text-sm leading-relaxed mb-3">"British Feed is hands down the best feed store in the Wellington area. The staff is incredibly knowledgeable — they helped me transition my senior mare to a new feed program and her coat has never looked better!"</p>
        <div class="text-gray-400 text-xs">2 weeks ago • Competition Horse Owner</div>
      </div>
      <div class="review-card card-hover scroll-reveal">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-full bg-gold flex items-center justify-center text-white font-bold text-lg">J</div>
          <div>
            <div class="font-semibold text-navy">James R.</div>
            <div class="text-gray-400 text-xs flex items-center gap-1"><img src="https://www.google.com/favicon.ico" class="w-3 h-3"/> Google Review</div>
          </div>
          <div class="ml-auto flex gap-1">
            <i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i>
          </div>
        </div>
        <p class="text-gray-600 text-sm leading-relaxed mb-3">"The delivery service is fantastic. Always on time, friendly drivers. I have 6 horses and they make managing my feed orders effortless. The Cavalor Performix has my show horses performing at their best!"</p>
        <div class="text-gray-400 text-xs">1 month ago • Multi-Horse Owner</div>
      </div>
      <div class="review-card card-hover scroll-reveal">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-lg">M</div>
          <div>
            <div class="font-semibold text-navy">Maria L.</div>
            <div class="text-gray-400 text-xs flex items-center gap-1"><img src="https://www.google.com/favicon.ico" class="w-3 h-3"/> Google Review</div>
          </div>
          <div class="ml-auto flex gap-1">
            <i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i>
          </div>
        </div>
        <p class="text-gray-600 text-sm leading-relaxed mb-3">"After struggling to find the right feed for my metabolic horse, the team at British Feed guided me through the options and suggested Cavalor's low-starch line. What a difference! My horse is thriving."</p>
        <div class="text-gray-400 text-xs">3 weeks ago • Metabolic Horse Owner</div>
      </div>
      <div class="review-card card-hover scroll-reveal">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-lg">T</div>
          <div>
            <div class="font-semibold text-navy">Tom C.</div>
            <div class="text-gray-400 text-xs flex items-center gap-1"><img src="https://www.google.com/favicon.ico" class="w-3 h-3"/> Google Review</div>
          </div>
          <div class="ml-auto flex gap-1">
            <i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i>
          </div>
        </div>
        <p class="text-gray-600 text-sm leading-relaxed mb-3">"Best selection of hay I've found locally. The quality is consistent and the pricing is fair. They even helped me figure out which hay blend was best for my horses' hay/grain balance. A true neighborhood gem!"</p>
        <div class="text-gray-400 text-xs">1 month ago • Pleasure Horse Owner</div>
      </div>
      <div class="review-card card-hover scroll-reveal">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-lg">A</div>
          <div>
            <div class="font-semibold text-navy">Amanda K.</div>
            <div class="text-gray-400 text-xs flex items-center gap-1"><img src="https://www.google.com/favicon.ico" class="w-3 h-3"/> Google Review</div>
          </div>
          <div class="ml-auto flex gap-1">
            <i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i>
          </div>
        </div>
        <p class="text-gray-600 text-sm leading-relaxed mb-3">"I switched my Wellington show barn over to British Feed for all our supply needs. The team is professional, the products are top quality, and the nutritional advice is worth its weight in gold. 10/10!"</p>
        <div class="text-gray-400 text-xs">2 months ago • Show Barn Manager</div>
      </div>
      <div class="review-card card-hover scroll-reveal">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg">R</div>
          <div>
            <div class="font-semibold text-navy">Rachel P.</div>
            <div class="text-gray-400 text-xs flex items-center gap-1"><img src="https://www.google.com/favicon.ico" class="w-3 h-3"/> Google Review</div>
          </div>
          <div class="ml-auto flex gap-1">
            <i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i><i class="fas fa-star star-filled text-sm"></i>
          </div>
        </div>
        <p class="text-gray-600 text-sm leading-relaxed mb-3">"I love that they carry Crypto Aero — so hard to find locally! The staff actually knows the products they sell. Free delivery has saved me so much time. Won't go anywhere else for my horse's feed needs."</p>
        <div class="text-gray-400 text-xs">3 weeks ago • Natural Feed Enthusiast</div>
      </div>
    </div>
    <div class="text-center mt-10">
      <a href="https://g.page/britishfeed/review" target="_blank" class="btn-navy px-8 py-3 rounded-full font-semibold inline-flex items-center gap-2">
        <img src="https://www.google.com/favicon.ico" class="w-4 h-4"/> Leave a Review on Google
      </a>
    </div>
  </div>
</section>

<!-- CONTACT -->
<section id="contact" class="py-20 bg-white">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center mb-14 scroll-reveal">
      <div class="text-gold font-semibold uppercase tracking-widest text-sm mb-3">Get In Touch</div>
      <h2 class="font-display text-4xl font-bold text-navy mb-4">Contact Us</h2>
      <div class="section-divider"></div>
    </div>
    <div class="grid md:grid-cols-2 gap-12">
      <!-- Contact Form -->
      <div class="scroll-reveal">
        <h3 class="font-display text-2xl font-bold text-navy mb-6">Send Us a Message</h3>
        <form id="contactForm" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input type="text" id="fname" required placeholder="Your first name" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 transition-all"/>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input type="text" id="lname" placeholder="Your last name" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 transition-all"/>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
            <input type="email" id="email" required placeholder="you@example.com" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 transition-all"/>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input type="tel" id="phone" placeholder="(561) 000-0000" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 transition-all"/>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Reason for Contact</label>
            <select id="reason" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 transition-all">
              <option value="">Select a topic...</option>
              <option>Product Inquiry</option>
              <option>Delivery Information</option>
              <option>Nutritional Consultation Request</option>
              <option>Nutrena Farm Program</option>
              <option>Special Order Request</option>
              <option>General Question</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Message *</label>
            <textarea id="message" required rows="4" placeholder="Tell us about your horse(s) and what you need..." class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 transition-all resize-none"></textarea>
          </div>
          <button type="submit" id="submitBtn" class="w-full btn-gold py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2">
            <i class="fas fa-paper-plane"></i> Send Message
          </button>
          <div id="formSuccess" class="hidden bg-green-50 border border-green-200 text-green-700 rounded-xl p-4 text-sm text-center">
            <i class="fas fa-check-circle text-lg mb-1"></i><br/>
            Thank you! We'll get back to you within 24 hours.
          </div>
        </form>
      </div>

      <!-- Info & Map -->
      <div class="scroll-reveal space-y-6">
        <div class="bg-gray-50 rounded-2xl p-6">
          <h3 class="font-display text-xl font-bold text-navy mb-4">Store Information</h3>
          <div class="space-y-4">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-navy rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas fa-store text-gold text-sm"></i>
              </div>
              <div>
                <div class="font-semibold text-navy text-sm">Store Location</div>
                <div class="text-gray-600 text-sm">14589 Southern Blvd - Palm West Plaza<br/>Loxahatchee Groves, FL 33470</div>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-navy rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas fa-warehouse text-gold text-sm"></i>
              </div>
              <div>
                <div class="font-semibold text-navy text-sm">Distribution Center</div>
                <div class="text-gray-600 text-sm">100 Aldi Way Suite 400<br/>Royal Palm Beach, FL 33411<br/><span class="text-gray-400 text-xs">Visit by appointment only</span></div>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-navy rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas fa-phone text-gold text-sm"></i>
              </div>
              <div>
                <div class="font-semibold text-navy text-sm">Phone</div>
                <a href="tel:5616336003" class="text-navy font-bold hover:text-gold transition-colors">(561) 633-6003</a>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-navy rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas fa-envelope text-gold text-sm"></i>
              </div>
              <div>
                <div class="font-semibold text-navy text-sm">Email</div>
                <a href="mailto:admin@britishfeed.com" class="text-navy hover:text-gold transition-colors text-sm">admin@britishfeed.com</a>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-navy rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas fa-clock text-gold text-sm"></i>
              </div>
              <div>
                <div class="font-semibold text-navy text-sm">Store Hours</div>
                <div class="text-gray-600 text-sm">Mon – Fri: 8:00 AM – 6:00 PM<br/>Saturday: 8:00 AM – 5:00 PM<br/>Sunday: 9:00 AM – 3:00 PM</div>
              </div>
            </div>
          </div>
        </div>
        <!-- Google Map Embed -->
        <div class="rounded-2xl overflow-hidden shadow-md">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3579.3!2d-80.28!3d26.66!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjbCsDM5JzM2LjAiTiA4MMKwMTYnNDguMCJX!5e0!3m2!1sen!2sus!4v1!5m2!1sen!2sus"
            width="100%" height="220" style="border:0;" allowfullscreen="" loading="lazy"
            title="British Feed Location"></iframe>
        </div>
        <div class="flex gap-3">
          <a href="https://www.instagram.com/british_feed_and_supplies/" target="_blank" class="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl py-3 text-center text-sm font-semibold hover:opacity-90 transition-all">
            <i class="fab fa-instagram mr-2"></i> Follow on Instagram
          </a>
          <a href="https://www.facebook.com/british.feed" target="_blank" class="flex-1 bg-blue-600 text-white rounded-xl py-3 text-center text-sm font-semibold hover:opacity-90 transition-all">
            <i class="fab fa-facebook-f mr-2"></i> Like on Facebook
          </a>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer class="bg-navy pt-16 pb-8">
  <div class="max-w-7xl mx-auto px-6">
    <div class="grid md:grid-cols-4 gap-8 mb-10">
      <div class="md:col-span-2">
        <div class="flex items-center gap-3 mb-4">
          <img src="https://www.genspark.ai/api/files/s/P7DEplwl" alt="British Feed Logo" class="h-10 w-auto brightness-200" onerror="this.style.display='none'"/>
          <div>
            <div class="text-white font-display font-bold text-xl">BRITISH FEED</div>
            <div class="text-gold text-xs tracking-widest uppercase">& Supplies</div>
          </div>
        </div>
        <p class="text-gray-400 text-sm leading-relaxed mb-4 max-w-xs">Your trusted local source for premium horse feed, hay, bedding and supplements in the Wellington & Loxahatchee area since 2012.</p>
        <div class="flex gap-3">
          <a href="https://www.instagram.com/british_feed_and_supplies/" target="_blank" class="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gold transition-all">
            <i class="fab fa-instagram"></i>
          </a>
          <a href="https://www.facebook.com/british.feed" target="_blank" class="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gold transition-all">
            <i class="fab fa-facebook-f"></i>
          </a>
        </div>
      </div>
      <div>
        <div class="text-white font-semibold mb-4 text-sm uppercase tracking-wide">Quick Links</div>
        <ul class="space-y-2 text-sm text-gray-400">
          <li><a href="#about" class="hover:text-gold transition-colors">About Us</a></li>
          <li><a href="#finder" class="hover:text-gold transition-colors">Feed Finder</a></li>
          <li><a href="#products" class="hover:text-gold transition-colors">Products</a></li>
          <li><a href="#services" class="hover:text-gold transition-colors">Services</a></li>
          <li><a href="#reviews" class="hover:text-gold transition-colors">Reviews</a></li>
          <li><a href="#contact" class="hover:text-gold transition-colors">Contact</a></li>
        </ul>
      </div>
      <div>
        <div class="text-white font-semibold mb-4 text-sm uppercase tracking-wide">Contact</div>
        <div class="space-y-3 text-sm text-gray-400">
          <div class="flex items-start gap-2">
            <i class="fas fa-map-marker-alt text-gold mt-1"></i>
            <span>14589 Southern Blvd<br/>Loxahatchee Groves, FL 33470</span>
          </div>
          <div class="flex items-center gap-2">
            <i class="fas fa-phone text-gold"></i>
            <a href="tel:5616336003" class="hover:text-gold transition-colors">(561) 633-6003</a>
          </div>
          <div class="flex items-center gap-2">
            <i class="fas fa-envelope text-gold"></i>
            <a href="mailto:admin@britishfeed.com" class="hover:text-gold transition-colors">admin@britishfeed.com</a>
          </div>
          <div class="flex items-start gap-2">
            <i class="fas fa-clock text-gold mt-1"></i>
            <span>Mon–Fri: 8am–6pm<br/>Sat: 8am–5pm | Sun: 9am–3pm</span>
          </div>
        </div>
      </div>
    </div>
    <div class="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500">
      <div>© 2024 British Feed & Supplies. All rights reserved.</div>
      <div>14589 Southern Blvd, Palm West Plaza, Loxahatchee Groves, FL 33470</div>
    </div>
  </div>
</footer>

<!-- AI CHATBOT -->
<div id="chatbot-toggle" class="bg-navy" onclick="toggleChat()">
  <div class="relative">
    <i class="fas fa-horse text-gold text-2xl"></i>
    <div class="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
  </div>
</div>

<div id="chatbot-window" class="flex-col">
  <!-- Chat Header -->
  <div class="bg-navy px-5 py-4 flex items-center justify-between flex-shrink-0">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
        <i class="fas fa-horse text-gold"></i>
      </div>
      <div>
        <div class="text-white font-semibold text-sm">Equine Advisor</div>
        <div class="text-green-400 text-xs flex items-center gap-1"><span class="w-2 h-2 bg-green-400 rounded-full inline-block"></span> British Feed Expert</div>
      </div>
    </div>
    <button onclick="toggleChat()" class="text-gray-400 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">
      <i class="fas fa-times"></i>
    </button>
  </div>

  <!-- Chat Messages -->
  <div id="chat-messages" class="bg-white">
    <div class="chat-bot chatbot-bubble p-3 text-sm">
      <strong>👋 Hi! I'm your British Feed Equine Advisor!</strong><br/><br/>
      I can help you find the perfect feed for your horse based on their age, activity level, and health needs.<br/><br/>
      What can I help you with today?
    </div>
    <div class="flex flex-wrap gap-2 px-1">
      <button class="suggestion-chip" onclick="sendSuggestion('What feed is best for a senior horse?')">Senior horse feed</button>
      <button class="suggestion-chip" onclick="sendSuggestion('What do you recommend for a competition horse?')">Competition horse</button>
      <button class="suggestion-chip" onclick="sendSuggestion('My horse has ulcers - what feed should I use?')">Ulcer management</button>
      <button class="suggestion-chip" onclick="sendSuggestion('Do you offer delivery?')">Delivery info</button>
    </div>
  </div>

  <!-- Chat Input -->
  <div class="bg-white border-t border-gray-100 p-3 flex gap-2 flex-shrink-0">
    <input id="chatInput" type="text" placeholder="Ask about horse feed..." class="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-navy transition-all" onkeypress="if(event.key==='Enter') sendMessage()"/>
    <button onclick="sendMessage()" class="w-10 h-10 bg-navy rounded-full flex items-center justify-center text-gold hover:bg-navy-light transition-all flex-shrink-0">
      <i class="fas fa-paper-plane text-sm"></i>
    </button>
  </div>
</div>

<script>
// ============ NAVIGATION ============
const mainNav = document.getElementById('mainNav');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');

window.addEventListener('scroll', () => {
  if (window.scrollY > 50) mainNav.classList.add('nav-scrolled');
  else mainNav.classList.remove('nav-scrolled');
});

mobileMenuBtn.addEventListener('click', () => {
  mobileMenu.classList.toggle('hidden');
});

document.querySelectorAll('#mobileMenu a').forEach(link => {
  link.addEventListener('click', () => mobileMenu.classList.add('hidden'));
});

// ============ SCROLL REVEAL ============
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));

// ============ PRODUCT FILTER ============
function filterProducts(category, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.className = b.className.replace('filter-active', 'filter-inactive');
  });
  btn.className = btn.className.replace('filter-inactive', 'filter-active');
  document.querySelectorAll('#productGrid .product-card').forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

// ============ FEED FINDER ============
let finderData = { horseType: '', activity: '', health: [] };

function selectHorseType(type) {
  finderData.horseType = type;
  document.querySelectorAll('#step1 .horse-type-btn').forEach(b => b.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  setTimeout(() => goToStep(2), 300);
}

function selectActivity(level) {
  finderData.activity = level;
  document.querySelectorAll('#step2 .horse-type-btn').forEach(b => b.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  setTimeout(() => goToStep(3), 300);
}

function goToStep(n) {
  document.querySelectorAll('.finder-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + n).classList.add('active');
}

function goToStep4() {
  finderData.health = Array.from(document.querySelectorAll('.health-check:checked')).map(c => c.value);
  generateRecommendations();
  goToStep(4);
}

function prevStep(current) {
  goToStep(current - 1);
}

function restartFinder() {
  finderData = { horseType: '', activity: '', health: [] };
  document.querySelectorAll('.horse-type-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.health-check').forEach(c => c.checked = false);
  goToStep(1);
}

function generateRecommendations() {
  const results = document.getElementById('finderResults');
  const recs = getRecommendations(finderData);
  results.innerHTML = recs.map(r => \`
    <div class="flex items-start gap-3 p-4 rounded-xl border-2 border-navy/10 bg-navy/5">
      <div class="w-10 h-10 rounded-full bg-navy flex items-center justify-center flex-shrink-0 text-gold font-bold">\${r.icon}</div>
      <div>
        <div class="font-bold text-navy text-sm">\${r.brand}</div>
        <div class="text-gold text-xs font-semibold mb-1">\${r.product}</div>
        <div class="text-gray-500 text-xs">\${r.reason}</div>
      </div>
    </div>
  \`).join('');
}

function getRecommendations(data) {
  const recs = [];
  const type = data.horseType;
  const activity = data.activity;
  const health = data.health;

  if (type.includes('Competition') || activity.includes('Heavy')) {
    recs.push({ icon: '🏆', brand: 'Cavalor', product: 'Performix', reason: 'High-energy formula perfect for performance & competition horses. Supports stamina and recovery.' });
    recs.push({ icon: '⚡', brand: 'Pro Elite', product: 'Performance', reason: 'Advanced formula for intense training. Optimal protein and fat ratios for peak performance.' });
    recs.push({ icon: '🌟', brand: 'Red Mills', product: 'Competition 14 Mix', reason: 'High protein competition feed trusted by professional riders worldwide.' });
  }
  if (type.includes('Senior')) {
    recs.push({ icon: '🤍', brand: 'Nutrena', product: 'SafeChoice Senior', reason: 'Easy to chew, digestible formula with extra calories for senior horses that need weight support.' });
    recs.push({ icon: '🏥', brand: 'Buckeye', product: 'EQ8 Senior', reason: 'Gut-health focused senior formula. Supports digestion and maintains body condition.' });
    recs.push({ icon: '💊', brand: 'Pro Elite', product: 'Senior', reason: 'Complete senior nutrition with joint support and easy digestibility.' });
  }
  if (type.includes('Young') || type.includes('Growing')) {
    recs.push({ icon: '🌱', brand: 'Pro Elite', product: 'Growth', reason: 'Balanced calcium/phosphorus ratio ideal for growing horses. Supports bone development.' });
    recs.push({ icon: '💪', brand: 'Buckeye', product: 'Gro-N-Win', reason: 'Ration balancer for young horses on forage-based diets.' });
  }
  if (type.includes('Hard Keeper')) {
    recs.push({ icon: '💪', brand: 'Cavalor', product: 'Wholegain', reason: 'High-fat conditioning supplement for hard keepers. Safe weight gain without excitability.' });
    recs.push({ icon: '🌟', brand: 'Nutrena', product: 'ProForce Senior', reason: 'High fat, high fiber formula for horses needing more calories.' });
  }
  if (type.includes('Pleasure') && activity.includes('Light')) {
    recs.push({ icon: '🌿', brand: 'Nutrena', product: 'SafeChoice Maintenance', reason: 'Balanced nutrition for easy keepers and light work horses. Won\\'t cause overheating.' });
    recs.push({ icon: '🌾', brand: 'Nutrena', product: 'SafeChoice Original', reason: 'Versatile all-rounder for everyday pleasure horses. Safe starch levels.' });
  }
  if (health.includes('Digestive / Ulcers')) {
    recs.push({ icon: '🩺', brand: 'Cavalor', product: 'FiberForce Gastro', reason: 'Specifically formulated for horses prone to gastric ulcers. Low starch, high fiber.' });
    recs.push({ icon: '🌿', brand: 'Havens', product: 'Gastro Plus', reason: 'Gentle on the digestive system. Supports gut flora and reduces ulcer risk.' });
  }
  if (health.includes('Metabolic (EMS/IR)')) {
    recs.push({ icon: '⚖️', brand: 'Pro Elite', product: 'Starch Wise', reason: 'Low NSC formula for horses with EMS/IR. Maintains energy without metabolic spikes.' });
    recs.push({ icon: '🌱', brand: 'Crypto Aero', product: 'Wholefood Feed', reason: 'Grain-free, low sugar/starch natural feed. Ideal for metabolic horses.' });
  }
  if (health.includes('Hoof / Coat Issues')) {
    recs.push({ icon: '✨', brand: 'Supplement', product: 'Horseshoer\\'s Secret', reason: 'Pelleted hoof supplement with biotin for stronger, healthier hooves.' });
    recs.push({ icon: '🌟', brand: 'Supplement', product: 'Max-E-Glo Rice Bran', reason: 'Stabilized rice bran supplement for improved coat shine and weight.' });
  }
  if (health.includes('Muscle Development')) {
    recs.push({ icon: '💪', brand: 'Cavalor', product: 'Muscle Force', reason: 'Amino acid complex to support muscle building and recovery.' });
    recs.push({ icon: '🏋️', brand: 'Pro Elite', product: 'Topline Advantage', reason: 'High-quality protein for topline development and muscle definition.' });
  }
  if (health.includes('Respiratory Issues')) {
    recs.push({ icon: '💨', brand: 'Cavalor', product: 'Bronchix Pure', reason: 'Supports respiratory health. Contains herbs to keep airways clear and healthy.' });
  }
  if (recs.length === 0) {
    recs.push({ icon: '🌾', brand: 'Nutrena', product: 'SafeChoice Original', reason: 'Our most popular all-around feed. Balanced nutrition for most adult horses.' });
    recs.push({ icon: '🏇', brand: 'Pro Elite', product: 'Omega Advantage', reason: 'Great for coat, immune system, and overall health. The omega-3 boost horses love.' });
    recs.push({ icon: '📞', brand: 'Expert Advice', product: 'Free Consultation', reason: 'Call us at (561) 633-6003 for a personalized recommendation!' });
  }
  return recs.slice(0, 3);
}

// ============ CONTACT FORM ============
document.getElementById('contactForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('fname').value + ' ' + document.getElementById('lname').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        reason: document.getElementById('reason').value,
        message: document.getElementById('message').value
      })
    });
    document.getElementById('formSuccess').classList.remove('hidden');
    document.getElementById('contactForm').reset();
    btn.innerHTML = '<i class="fas fa-check mr-2"></i> Message Sent!';
    btn.className = btn.className.replace('btn-gold', '') + ' bg-green-500 py-4 rounded-xl font-bold text-base text-white flex items-center justify-center gap-2 w-full';
  } catch (e) {
    btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Send Message';
    btn.disabled = false;
    alert('There was an error. Please call us at (561) 633-6003');
  }
});

// ============ CHATBOT ============
let chatMessages = [];
let chatOpen = false;

function toggleChat() {
  const win = document.getElementById('chatbot-window');
  chatOpen = !chatOpen;
  if (chatOpen) {
    win.classList.add('open');
    document.getElementById('chatInput').focus();
  } else {
    win.classList.remove('open');
  }
}

function sendSuggestion(text) {
  document.getElementById('chatInput').value = text;
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const msgContainer = document.getElementById('chat-messages');

  // Remove suggestion chips after first message
  const chips = msgContainer.querySelector('.flex.flex-wrap.gap-2');
  if (chips) chips.remove();

  // Add user message
  chatMessages.push({ role: 'user', content: text });
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-user chatbot-bubble p-3 text-sm self-end ml-auto';
  userDiv.textContent = text;
  msgContainer.appendChild(userDiv);

  // Add typing indicator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-bot chatbot-bubble p-3 text-sm typing-indicator';
  typingDiv.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  msgContainer.appendChild(typingDiv);
  msgContainer.scrollTop = msgContainer.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatMessages })
    });
    const data = await res.json();
    const reply = data.reply || 'Sorry, I had trouble connecting. Please call us at (561) 633-6003!';
    chatMessages.push({ role: 'assistant', content: reply });

    typingDiv.remove();
    const botDiv = document.createElement('div');
    botDiv.className = 'chat-bot chatbot-bubble p-3 text-sm';
    botDiv.innerHTML = reply.replace(/\\n/g, '<br/>');
    msgContainer.appendChild(botDiv);
  } catch (err) {
    typingDiv.remove();
    const botDiv = document.createElement('div');
    botDiv.className = 'chat-bot chatbot-bubble p-3 text-sm';
    botDiv.innerHTML = 'Sorry, I had trouble connecting. Please call us at <strong>(561) 633-6003</strong> for immediate help!';
    msgContainer.appendChild(botDiv);
  }
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
</script>
</body>
</html>`
}

export default app
