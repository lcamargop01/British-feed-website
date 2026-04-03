import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { admin } from './admin'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  BF_STORE: KVNamespace
  ADMIN_PASSWORD: string
  RESEND_API_KEY: string
  NOTIFY_EMAIL: string
  NOTIFY_PHONE: string
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
        model: 'gpt-5',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('OpenAI API error:', response.status, errText)
      return c.json({ reply: `Sorry, I'm having trouble connecting right now. Please call us at (561) 633-6003 for expert help!` })
    }
    const data: any = await response.json()
    const reply = data.choices?.[0]?.message?.content || ''
    if (!reply) {
      console.error('Empty reply from OpenAI, full response:', JSON.stringify(data))
      return c.json({ reply: "I'm not sure about that one — please call us at (561) 633-6003 and our team will be happy to help!" })
    }
    // Save conversation snippet to history
    if (kv && messages.length >= 1) {
      try {
        const histRaw = await kv.get('chat_history')
        const history: any[] = histRaw ? JSON.parse(histRaw) : []
        history.push({
          date: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
          messages: [...messages, { role:'assistant', content: reply }]
        })
        // Keep only last 200 sessions
        if (history.length > 200) history.splice(0, history.length - 200)
        await kv.put('chat_history', JSON.stringify(history))
      } catch {}
    }
    return c.json({ reply })
  } catch (e: any) {
    console.error('Chat exception:', e?.message || e)
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

  // 2. Send notification via Resend
  const name    = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown'
  const subject = lead.subject || 'General'
  const phone   = lead.phone   || 'not provided'
  const email   = lead.email   || 'not provided'
  const message = lead.message || ''
  const resendKey = c.env?.RESEND_API_KEY || ''

  if (resendKey) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'British Feed Website <onboarding@resend.dev>',
          to:   ['sales@britishfeed.com', 'laura@britishfeed.com'],
          reply_to: email !== 'not provided' ? email : undefined,
          subject: `🐴 New Contact: ${name} — ${subject}`,
          html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#1B2A4A;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h2 style="color:#C9A84C;margin:0;font-size:20px;">🐴 New Contact Form Submission</h2>
    <p style="color:#fff;opacity:0.7;margin:4px 0 0;font-size:13px;">British Feed &amp; Supplies Website</p>
  </div>
  <div style="background:#f9f7f3;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0d9cc;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 12px;font-weight:bold;color:#1B2A4A;width:120px;">Name</td><td style="padding:8px 12px;">${name}</td></tr>
      <tr style="background:#fff;"><td style="padding:8px 12px;font-weight:bold;color:#1B2A4A;">Email</td><td style="padding:8px 12px;"><a href="mailto:${email}" style="color:#1B2A4A;">${email}</a></td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;color:#1B2A4A;">Phone</td><td style="padding:8px 12px;"><a href="tel:${phone}" style="color:#1B2A4A;">${phone}</a></td></tr>
      <tr style="background:#fff;"><td style="padding:8px 12px;font-weight:bold;color:#1B2A4A;">Subject</td><td style="padding:8px 12px;">${subject}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;color:#1B2A4A;vertical-align:top;">Message</td><td style="padding:8px 12px;white-space:pre-wrap;">${message}</td></tr>
      <tr style="background:#fff;"><td style="padding:8px 12px;font-weight:bold;color:#1B2A4A;">Submitted</td><td style="padding:8px 12px;color:#666;">${lead.date} at ${lead.time} ET</td></tr>
    </table>
    <div style="margin-top:20px;padding:12px 16px;background:#1B2A4A;border-radius:6px;text-align:center;">
      <a href="mailto:${email}" style="color:#C9A84C;font-weight:bold;text-decoration:none;">Reply to ${name}</a>
    </div>
  </div>
</div>`,
        }),
      })
      if (!emailRes.ok) {
        const errText = await emailRes.text()
        console.error('Resend error:', emailRes.status, errText)
      }
    } catch (e: any) {
      console.error('Resend exception:', e?.message)
    }
  } else {
    console.error('RESEND_API_KEY not set — email notification skipped')
  }

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
      if (raw && Array.isArray(raw) && raw.length > 0) products = applyExpertDescriptions(raw)
    } catch (_) {}
  }
  return c.html(getCatalogPrintHTML(products))
})

// ── Public products API (no auth — used by catalog-print page) ────────────────
// Expert product descriptions (ingredient-focused, curated for the print catalog)
const EXPERT_DESCRIPTIONS: Record<string, string> = {
  "mosquito halt gal": "Dual-action permethrin + prallethrin formula with aloe and lanolin soothes skin while repelling mosquitoes, gnats, and flies. DEET-free and safe for daily use. Ideal for horses pastured in South Florida's humid, mosquito-prone environment.",
  "mosquito halt 32oz": "Dual-action permethrin + prallethrin formula with aloe and lanolin soothes skin while repelling mosquitoes, gnats, and flies. DEET-free and safe for daily use. A must-have in South Florida's mosquito season.",
  "endure gal": "Farnam's patented RepeLock® technology bonds active ingredients (cypermethrin, pyrethrins) to the coat so sweat doesn't wash them away. Ideal for Florida horses in heavy work—one application lasts all day. Added conditioners leave the coat gleaming.",
  "endure 32oz": "Farnam's RepeLock® technology bonds cypermethrin and pyrethrins to the coat through sweat. Perfect for performance horses in South Florida's heat and humidity. Conditioners boost coat shine while you protect.",
  "tri-tec 14 gal": "Fourteen days of fly, tick, and mosquito protection per application. Pyrethrins plus permethrin deliver broad-spectrum coverage with a pleasant citronella scent. Great value for busy barns needing long-interval protection.",
  "tri-tec 14 32oz": "Fourteen days of fly, tick, and mosquito protection per application. Pyrethrins plus permethrin with citronella scent. Long-interval coverage ideal for horses with light riding schedules.",
  "bronco gal": "Broad-spectrum permethrin fly spray with a pleasant horse-friendly scent. Repels flies, gnats, horse flies, and ticks. Economical gallon size great for whole-barn use.",
  "bronco 32oz": "Broad-spectrum permethrin fly spray with a pleasant scent. Repels flies, gnats, horse flies, and ticks. Convenient spray bottle for daily barn use.",
  "flysect super 7 gal": "Seven-active-ingredient formula targeting flies, mosquitoes, gnats, ticks, chiggers, mites, and lice. One of the most comprehensive insect-control sprays available. Ideal for horses with severe insect sensitivity.",
  "flysect super 7 32oz": "Seven-active-ingredient formula targeting flies, mosquitoes, gnats, ticks, chiggers, mites, and lice. Comprehensive protection in a handy spray bottle.",
  "horse & pony spray gal": "Absorbine's economical everyday fly repellent for horses and ponies. Pyrethrins-based with conditioners for a healthy coat. Great as a daily barn spray for the whole herd.",
  "horse & pone spray 32oz": "Absorbine everyday fly repellent for horses and ponies. Pyrethrins-based with coat conditioners. Convenient 32 oz spray for daily use.",
  "wipe ii 32oz": "Wipe-on or spray-on convenience with oil of citronella, pyrethrins, and piperonyl butoxide. Leaves coat shiny and repels flies, gnats, and mosquitoes for hours. Popular choice for show horses needing extra shine.",
  "ultrashield ex gal": "Absorbine's professional-strength formula: 0.50% permethrin and 0.10% pyrethrins with 1% piperonyl butoxide. Safe for horses, ponies, foals 12 weeks+, and dogs. Up to 17 days per application—the gold standard for serious fly control.",
  "ultrashield ex 32oz": "Professional-strength 0.50% permethrin + 0.10% pyrethrins. Safe for horses, ponies, foals, and dogs. Up to 17 days protection—exceptional value for serious competitors.",
  "ultrashield sport 32oz": "UltraShield's sport formula with sweat-resistant barrier. Ideal for performance horses competing in hot, humid conditions. Repels flies, gnats, and mosquitoes without greasy residue.",
  "ultrashield green 32oz": "Natural botanical formula with essential oils: citronella, clove, thyme, and rosemary. No harsh chemicals—ideal for horses with skin sensitivities or for use around foals. Effective, eco-conscious fly control.",
  "ultrashield red 32oz": "Water-based permethrin formula that's gentle on sensitive skin while providing reliable fly repellency. Leaves a clean, non-greasy finish. Trusted by grooming professionals at top show barns.",
  "wipe n spray gal": "Dual-purpose concentrate: apply with a cloth for grooming sessions or spray for quick daily protection. Pyrethrins with coat conditioners deliver fly repellency and shine simultaneously. Economical gallon size for large barns.",
  "wipe n spray 32oz": "Dual-purpose spray or wipe-on fly repellent with coat-conditioning pyrethrins. Convenient 32 oz for grooming sessions and daily barn use.",
  "zero-bite gal": "Durvet's Zero-Bite uses permethrin and piperonyl butoxide for effective fly, tick, and mosquito control. Gallon size for cost-conscious barns that won't compromise on protection.",
  "zero-bite 32oz": "Durvet Zero-Bite delivers permethrin-based fly and tick control. Affordable 32 oz option for everyday use.",
  "legacy 32oz": "Durvet Legacy combines pyrethrins and piperonyl butoxide for effective fly, mosquito, and tick repellency. Great everyday option for budget-conscious horse owners.",
  "pro-force 32oz": "Durvet Pro-Force provides concentrated permethrin protection against flies, mosquitoes, and ticks. Strong-formula 32 oz bottle ideal for horses in high-insect-pressure environments.",
  "natures defense 32oz": "Botanical blend of essential oils—eucalyptus, clove, citronella, and thyme—for chemical-free fly control. Safe around children and sensitive animals. Ideal for holistic horse owners.",
  "natures defense concentrate": "Durvet's botanical concentrate: dilute with water for customizable strength. Essential oils of eucalyptus, clove, citronella, and thyme. One bottle makes multiple quarts—excellent value for organic-minded barns.",
  "fiebings saddle soap spray": "Fiebing's trusted spray saddle soap cleans and conditions leather in one step. Glycerin formula removes sweat and grime without drying. Essential for maintaining saddle suppleness in Florida's humidity.",
  "fiebings glycerine saddle soap bar": "Classic glycerin bar soap gently lifts dirt and sweat from all leather tack. Rich lather penetrates stitching and seams. A barn staple for generations of riders.",
  "fiebings mink oil": "Pure mink oil deeply penetrates stiff leather, restoring pliability and creating a water-resistant barrier. Ideal for reviving dried tack after Florida's harsh sun exposure. Extends saddle life significantly.",
  "belvoir tack cleaner": "Carr & Day & Martin's Belvoir two-step system starts here: biodegradable formula dissolves sweat, grease, and deep-seated grime without stripping natural oils. Leaves leather perfectly prepped for conditioning.",
  "belvoir tack conditioner": "Step two of the Belvoir system: lanolin-rich conditioner nourishes leather fibers, restores elasticity, and leaves a protective, non-greasy finish. Used by top riders and tack rooms worldwide.",
  "belvoir glycerine saddle soap": "Belvoir's glycerin saddle soap cleans, conditions, and preserves leather simultaneously. Classic formulation trusted by equestrian professionals. Convenient bar format for thorough tack-room cleaning.",
  "belvoir tack wipes": "Pre-moistened cleaning and conditioning wipes—clean and condition in one stroke. Perfect for quick post-ride tack care. No rinsing needed, no mess. Ideal for busy show schedules.",
  "equi-care saddle soap 152oz": "Professional-grade, economy-size saddle soap for high-volume tack rooms. Cleans, conditions, and preserves leather naturally. Excellent value per application for large facilities.",
  "equi-care saddle soap 41oz": "Equi-Care saddle soap in a practical mid-size format. Cleans and conditions leather, removing sweat and grime while maintaining natural oils. Reliable everyday tack care.",
  "equi-care saddle ointment 106oz": "Extra-large supply of Equi-Care's penetrating leather ointment. Deeply conditions and waterproofs, restoring life to dry or cracked tack. Economy size for professional tack rooms.",
  "equi-care saddle ointment 32oz": "Equi-Care penetrating leather ointment deeply conditions and waterproofs leather. Excellent for restoring dry, stiff tack. Handy 32 oz size for personal use.",
  "tack sponge 12 pack": "Professional natural sea sponges ideal for applying saddle soap and conditioner evenly across leather surfaces. Twelve-pack value for the whole barn. A tack-room essential.",
  "belvoir tack sponge": "Belvoir-branded natural sponge designed for precise application of soap and conditioner. Creates ideal lather without oversaturating leather. Reusable and long-lasting.",
  "honeycomb tack sponge": "Honeycomb-textured sponge provides superior lather distribution for saddle soap application. Gentle on leather grain, effective at lifting grime. Classic tack-room tool.",
  "endurix": "Belgian-engineered slow-release energy for endurance, dressage, and eventing horses. Puffed grains aid digestion while flaxseed, soybean, and sunflower oils fuel long aerobic efforts. Pre- and probiotics maintain gut function. The choice of Olympic-level competitors worldwide.",
  "fiberforce": "High-fiber feed with alfalfa stems, timothy, and beet pulp encourages natural chewing behavior, buffers stomach acid, and delivers probiotics for exceptional gut health. Ideal for horses prone to ulcers, poor condition, or digestive sensitivity.",
  "fiberforce gastro": "Cavalor's specialized formula for horses with gastric issues: high digestible fiber soothes the stomach lining while probiotics restore healthy gut flora. The go-to choice for ulcer-prone competition horses.",
  "fiber care silhouette": "Low-starch, high-fiber formula for horses that need to maintain lean muscle without excess weight. Balanced amino acids support topline and muscle definition. Perfect for easy keepers and insulin-resistant horses.",
  "mash & mix": "Warm, comforting mash formula ideal for horses recovering from illness, post-surgery, or dental challenges. Beet pulp and grain mash is highly palatable and easy to digest. Add warm water for a soothing recovery meal.",
  "performix": "High-energy competition formula delivering sustained power for demanding sport horses. Rich in oils and digestible fiber for clean energy without hot behavior. The training and competition feed chosen by top European equestrians.",
  "pianissimo": "Cavalor's calming formula for excitable or anxiety-prone sport horses. Magnesium and B-vitamins reduce nervous tension while maintaining peak energy levels. Horses remain focused and manageable without sedation.",
  "strucomix original": "Traditional Belgian muesli-style mix combining grains, chaff, and seeds for a varied, appetizing ration. Encourages slow eating and promotes digestive health. Ideal for horses needing variety and mental stimulation.",
  "strucomix senior": "Senior-specific Belgian muesli designed for older horses with reduced digestive efficiency. Highly digestible ingredients support weight maintenance, joint health, and coat condition in aging horses.",
  "wholegain": "Ultra-high-fat supplement feed for horses needing rapid weight gain or improved coat and skin condition. Rice bran oil and flaxseed provide omega fatty acids. Ideal for hard-keeping horses, rescues, or those recovering from illness.",
  "cadence ultra": "Buckeye's ultra-premium performance feed with controlled starch and superior omega-3 fatty acids from flaxseed. Supports peak muscle function and quick recovery. Ideal for high-level sport horses and competitive barrel racers.",
  "eq8 gut health": "Feed with an integrated 8-component digestive health system including prebiotics, probiotics, and digestive enzymes. Targets ulcer prevention and hindgut stability. Excellent for horses on intensive training schedules.",
  "eq8 senior": "Senior formula with the EQ8 digestive system plus extra amino acids and omega-3s to maintain muscle mass in aging horses. Easy-to-chew pellet format suitable for horses with dental issues.",
  "gro n win": "Vitamin-mineral concentrate for horses on forage-based diets. Balances nutritional gaps in hay and pasture without adding excess calories. Ideal for easy-keeper broodmares, weanlings, and horses in light work.",
  "safe n easy pellet": "Low-starch, pelleted feed designed for horses prone to metabolic issues, laminitis, or Cushing's disease. Consistent pelleted form ensures every horse gets a balanced ration with no sorting.",
  "safe n easy performance": "Performance version of Buckeye's low-starch formula for active metabolic horses. Higher fat content supports sustained energy without glycemic spikes. Safe for insulin-resistant horses in work.",
  "ultimate finish 25": "25% fat supplement for rapid weight gain, exceptional coat bloom, and sustained energy. The highest-fat option in our feed lineup—ideal for show horses needing maximum shine and condition before the ring.",
  "wholefood": "Crypto Aero's whole-food formula made with natural, minimally processed ingredients: whole oats, flaxseed, and alfalfa. No synthetic additives—just clean nutrition for horses thriving on a natural diet.",
  "wild forage": "Crypto Aero's forage-based formula mimicking the horse's natural grazing diet. High in digestible fiber and low in starch. Perfect for laminitis-prone horses and those managed on grass pasture.",
  "all-phase": "KER's versatile maintenance feed suitable for horses in all life stages and work levels. Scientifically formulated with digestive buffer and balanced vitamins and minerals to complement forage-based diets.",
  "re-leve original": "KER's landmark low-starch, low-sugar formula for horses with polysaccharide storage myopathy (PSSM), tying-up, or metabolic syndrome. Fat and fermentable fiber replace starch for safe, sustained energy.",
  "re-leve sport": "Sport version of KER's Re-Leve with added protein and essential amino acids for horses in moderate to heavy work. Manages metabolic risk while fueling performance. Safe for horses with muscle disorders.",
  "sentinel senior": "Pelleted senior complete feed with beet pulp, alfalfa, and essential amino acids for horses 15 and older. Added joint support nutrients and elevated vitamin E keep aging horses comfortable and thriving.",
  "sentinel performance l5": "High-energy performance pellet at 14% protein with controlled starch for horses in heavy training. Consistent pelleted form ensures precise nutrient delivery for competition horses.",
  "balancer gold": "Triple Crown's concentrated balancer provides comprehensive vitamins, minerals, and organic trace minerals for horses on forage-only diets. Biotin, zinc, and copper support hooves, coat, and immune function at a low feeding rate.",
  "grass": "Triple Crown Grass is a low-starch, low-sugar feed designed for easy keepers on grass pasture. Prevents nutritional deficiencies without adding unnecessary calories. Ideal for horses with weight management challenges.",
  "rice bran": "Stabilized rice bran at 20% fat—nature's best weight and condition supplement. High in omega-6 fatty acids for coat bloom and sustained energy. Palatable addition to any ration.",
  "safe starch": "Triple Crown's low-starch, high-fiber forage formula for horses sensitive to carbohydrates. Provides safe, sustained energy from fat and fermentable fiber without glycemic spikes.",
  "senior": "Triple Crown Senior is a complete-feed formula with beet pulp, alfalfa, and high digestibility—horses can thrive on this as their entire diet. Elevated lysine supports muscle maintenance in aging horses.",
  "senior gold": "Triple Crown's premium senior formula with added antioxidants, joint-support nutraceuticals (glucosamine + MSM), and omega-3 fatty acids. The gold standard for maintaining older horses at peak quality of life.",
  "stressfree forage": "High-fiber, low-starch forage replacement for horses that can't access quality hay. Encourages slow eating behavior and supports hindgut health. Essential for horses during Florida's dry-season hay shortages.",
  "30% ration balancer": "Triple Crown's concentrated 30% protein balancer: feed just 1 lb/day with hay to deliver a complete vitamin-mineral profile. Excellent for miniature horses, easy keepers, and horses in light work needing nutritional balance without calories.",
  "comfort mash": "Red Mills warm mash with alfalfa, beet pulp, apple, and carrot—irresistibly palatable and highly digestible. Add warm water for a soothing recovery meal. Ideal post-competition or for horses recovering from illness.",
  "competition 10 mix": "Red Mills Competition 10 Mix: Irish-made grain mix at 10% protein, 3.5% fat for horses in light to moderate competition work. Highly digestible ingredients formulated by FEI-level nutritionists.",
  "competition 12 mix": "Red Mills Competition 12 Mix: 12% protein blend for performance horses in moderate to heavy work. Digestible fiber and controlled starch support sustained energy without excitability.",
  "competition 14 mix": "Red Mills Competition 14 Mix: 14% protein high-performance blend for horses in intense training or top-level competition. Premium Irish ingredients trusted by Olympic and Grand Prix riders.",
  "cool n condition pellets": "Red Mills pellets delivering premium conditioning without excitability. High digestible fiber and oil promote weight gain and coat condition while keeping temperament calm. Ideal for sensitive or highly strung horses.",
  "horse care 10 pellet": "Red Mills Horse Care 10 Pellet: 10% protein, 7.5% fat, 14% fiber—low-starch formula with highly digestible fiber and oil for horses needing safe, sustained energy. Suitable for horses with metabolic concerns.",
  "horse care 14 pellet": "Red Mills Horse Care 14 Pellet: 14% protein with beet pulp, alfalfa, and linseed for horses in demanding work. Low starch and high digestible fiber keep energy levels even and temperament manageable.",
  "horse care 10 mix": "Red Mills Horse Care 10 Mix in a palatable grain format. Low starch and high fiber designed for temperamental or metabolic horses needing moderate protein support.",
  "horse care 14 mix": "Red Mills Horse Care 14 Mix: high protein, low starch blend with beet pulp, linseed, and soy for performance horses. Consistently chosen by top Irish and European eventers and show jumpers.",
  "horse care ultra": "Red Mills' top-tier formula for elite competition horses in maximum work. Ultra-high digestible fiber and oil provide peak energy while keeping horses calm and focused. Trusted at the highest levels of equestrian sport.",
  "horse care mash": "Red Mills mash with alfalfa, beet pulp, apple, carrot, and full-fat linseed—warm and deeply nourishing. Exceptional for horses with chewing difficulties, post-travel recovery, or returning to training.",
  "performa care balancer": "Concentrated Red Mills balancer delivering premium vitamins, minerals, and amino acids at a low feeding rate. Ideal for horses on forage-based diets needing nutritional precision without excessive calories.",
  "define and shine": "Red Mills conditioning formula designed to build lean muscle definition and exceptional coat bloom. High omega-3 content from linseed supports skin health and dazzling show coat. A show barn favorite.",
  "fibrenergy": "Hallway Feeds' high-fiber, high-energy formula combining beet pulp and alfalfa for sustained performance. Supports gut health while fueling active horses. Ideal for Florida horses in year-round work.",
  "luminance": "Hallway Feeds' premium conditioning feed with elevated fat content for remarkable coat bloom and condition. Omega fatty acids and biotin create the visual brilliance demanded in the show ring.",
  "stamm 30": "Hallway's 30% protein concentrate for balancing hay-based diets. Provides essential amino acids—lysine, methionine, threonine—for muscle development in young horses, broodmares, and performance horses.",
  "total equine": "Complete hay-alternative pelleted feed by Total Equine. High in digestible fiber from alfalfa and grass, suitable as a hay replacement when quality forage is unavailable. Excellent for horses with respiratory issues or hay allergies.",
  "coolstance": "Coprice's stabilized coconut meal: 60% digestible fiber, high lauric acid content supports immune function, and ultra-low starch makes this ideal for metabolic, Cushing's, and laminitis horses. Extraordinary coat bloom from medium-chain triglycerides.",
  "crimped oats": "Fresh-crimped whole oats—a traditional, natural energy source easily digested by horses. High in B-vitamins and vitamin E. Ideal for adding energy to performance horses' rations without excessive starch.",
  "fibrebeet": "British Horse Feeds' flagship supplement: unmolassed beet pulp flakes that expand to 5× their volume when soaked. Exceptional source of digestible fiber supporting hindgut health and weight gain without sugar loading.",
  "ground flax": "Cold-pressed ground flaxseed delivering a natural 3:1 ratio of omega-3 to omega-6 fatty acids. Supports coat shine, hoof quality, inflammatory response management, and reproductive health. A daily addition to any ration.",
  "renew gold": "Renew Gold's stabilized rice bran plus coconut meal and flaxseed: triple-source omega fatty acids for extraordinary coat condition, weight gain, and sustained energy. A conditioning powerhouse for hard keepers.",
  "speedibeet": "British Horse Feeds' fast-soaking unmolassed beet pulp—ready in just 10 minutes. Provides safe, highly digestible fiber for weight gain and hindgut health without sugar loading. Ideal for ulcer-prone and metabolic horses.",
  "standlee beetpulp shreds": "Standlee's premium shredded beet pulp without molasses: a safe, high-fiber caloric source for horses needing weight gain. Soak before feeding to prevent choke. Excellent hindgut support.",
  "steamed rolled oats": "Steamed and rolled for superior digestibility, these oats offer higher starch availability than whole oats. A natural energy source rich in B-vitamins. A classic performance horse staple.",
  "soybean meal": "High-protein soybean meal (44% crude protein) for balancing low-protein hay diets. Delivers essential amino acids—especially lysine—for muscle development in growing horses, broodmares, and hard-working performance horses.",
  "wheat bran 5lbs": "Traditional wheat bran mash ingredient that softens feed rations and encourages water consumption. High in phosphorus and fiber. Use in rotation as a palatable treat or recovery mash.",
  "wheat bran 40lbs": "Economy 40 lb supply of wheat bran for high-volume barns. Mix with warm water to create a classic bran mash—ideal for post-competition recovery and horses prone to dehydration.",
  "whole flax 5lbs": "Whole flaxseeds as a natural source of omega-3 fatty acids, lignans, and mucilage. Supports coat bloom, hoof health, and gut motility. Grind before feeding for maximum nutrient absorption.",
  "whole flax": "Whole flaxseed: a natural, unprocessed source of omega-3 ALA fatty acids supporting skin, coat, hooves, and inflammatory balance. Cold-press or grind for best bioavailability.",
  "whole oats": "Unprocessed whole oats—the classic natural horse energy source. High in B-vitamins, vitamin E, and soluble fiber. Easy to digest and well-tolerated by most horses. Popular with traditional horsekeepers.",
  "synnutra synchill daily": "Daily calming supplement with magnesium, B-vitamins, and L-tryptophan. Promotes consistent composure and focus without sedation. Ideal for competition horses that need to stay sharp yet relaxed under pressure.",
  "synnutra synchill paste": "Rapid-acting calming paste for high-stress situations: trailering, competitions, farrier visits, or veterinary procedures. Magnesium and tryptophan promote relaxation within hours.",
  "synnutra synchill paste af": "Alcohol-free version of SynNutra's calming paste—ideal for horses with alcohol sensitivities or competing under organizations with strict substance guidelines. Same calming efficacy without the carrier.",
  "synnutra g-chill": "SynNutra's gut-focused calming formula combining digestive support with magnesium and tryptophan. Addresses the gut-brain connection—reduces anxiety while simultaneously supporting digestive health.",
  "total calm & focus 1.12lbs": "Finish Line's scientifically formulated daily calming powder: 2,000 mg thiamine B1, 1,600 mg magnesium, 1,000 µg B12, 500 mg Ramisol™. Supports mental focus without sedation. USA-made and competition-safe.",
  "total calm & focus paste": "Finish Line's rapid-acting calming paste with 2,000 mg thiamine B1, 1,600 mg magnesium, and Ramisol™. Use 2–4 hours before stressful events. Competition-safe and USEF-compliant.",
  "foran nutri-calm 2.5l": "Foran's premium liquid calming formula: L-tryptophan, magnesium, and B-vitamins in a palatable liquid. Supports composure and concentration for performance horses. European-formulated, trusted by top equestrian professionals.",
  "foran nutri-calm 1l": "Foran Nutri-Calm liquid in a 1L bottle: L-tryptophan, magnesium, and B-vitamins for daily calm without sedation. Ideal starter size for single horses.",
  "foran nutri-calm gel": "Foran's calming gel for rapid pre-event action: L-tryptophan, magnesium, pyridoxine, B12, and nicotinic acid. Convenient syringe delivery for precise dosing at shows and competitions.",
  "mare magic 32oz": "Pure dried raspberry leaf (Rubus idaeus) for natural hormonal balance in mares. Reduces cycling-related mood swings, irritability, and unpredictable behavior. A beloved natural solution for challenging mares.",
  "mare magic 8oz": "Mare Magic raspberry leaf in a trial/travel size. Pure, natural, and effective for mares struggling with hormonal behavior. Easy to dose over feed daily.",
  "havens magnesium": "Pure magnesium supplement supporting muscle function, nerve transmission, and a calm temperament. Essential mineral often deficient in Florida forage. Beneficial for horses prone to muscle cramping or anxiety.",
  "foran pre-fuel 2.5l": "Foran's pre-workout liquid supplement with B-vitamins, amino acids, and energy-supporting nutrients. Primes muscles and metabolism 1–2 hours before competition. Used by top eventing and show jumping professionals.",
  "foran pre-fuel paste": "Convenient syringe delivery of Foran's pre-competition energy blend. B-vitamins and amino acids support muscle readiness and focus. Ideal for competition morning administration.",
  "foran re-fuel 5l": "Foran's post-exercise recovery liquid replenishing B-vitamins, electrolytes, and amino acids lost during intense work. Accelerates recovery and reduces post-competition fatigue. Economy 5L size for professional barns.",
  "foran re-fuel 1l": "Post-exercise recovery with Foran's B-vitamin and amino acid formula. Replenish depleted nutrients within hours of competition. Convenient 1L for individual horse management.",
  "foran re-fuel paste": "Immediate post-competition recovery in a syringe: Foran's B-vitamin complex and amino acids for rapid muscle and metabolic recovery. Administer within the first hour after intense effort for best results.",
  "total energy & stamina paste": "Finish Line's stamina paste delivering B-vitamins, electrolytes, and rapidly available energy substrates. Ideal for horses competing multiple days or covering long distances. USA-made.",
  "elevate se 2lbs": "Kentucky Performance Products' natural vitamin E (1,500 IU/serving) with organic selenium yeast. Supports healthy muscle function, reproductive health, immune response, and nerve integrity. Superior bioavailability over synthetic vitamin E.",
  "elevate 10lbs": "Economy 10 lb supply of KPP Elevate natural vitamin E. The gold standard antioxidant supplement for horses with neurological conditions (EPM recovery, EDM), muscle disorders, or breeding stock.",
  "vita e & selenium crumbs 3lb": "Budget-friendly vitamin E and selenium crumbles for daily antioxidant support. Supports muscle health, immune function, and reproductive performance. Economical option for multiple-horse farms.",
  "cavalor nano-e": "Cavalor's liquid nano-emulsified vitamin E—highest bioavailability of any vitamin E supplement. Nano-particle size allows absorption without dietary fat. Ideal for horses under competition stress or with muscle and neurological challenges.",
  "hepato liq 250ml": "Foran's liver-support liquid supplement combining artichoke, choline, and B-vitamins to support hepatic function and detoxification. Beneficial for horses on intensive medication programs or with liver challenges.",
  "hepato liq 2l": "Economy 2L of Foran's liver-support formula. Artichoke and choline support healthy liver function, metabolic efficiency, and toxin processing. Ideal for horses on long-term medication.",
  "foran v.s.l 2.5l": "Foran VSL (Vitamin-Supplement-Liquid): comprehensive multi-vitamin formula for horses under physical and environmental stress. Supports energy metabolism, immune function, and overall vitality.",
  "foran v.s.l 1l": "Foran VSL multi-vitamin liquid in a 1L bottle. Complete B-vitamin and trace mineral support for performance horses and breeding stock.",
  "foran coppervit 2.5l": "Foran's copper and vitamin supplement supporting coat pigmentation, hoof quality, and joint cartilage formation. Essential for horses on copper-deficient forage diets—common in South Florida soils.",
  "foran coppervit 1l": "Foran Coppervit 1L: copper and vitamins for coat color intensity, hoof strength, and connective tissue health. Ideal for grey or dark-coated horses prone to fading.",
  "foran b-complete 2.5l": "Foran's comprehensive B-vitamin liquid with a prebiotic for digestive health. Supports energy metabolism, nervous system function, coat quality, and appetite during stress, illness, or intense training.",
  "foran b-complete 1l": "Foran B-Complete 1L: essential B-vitamins with prebiotic support for horses in work, recovery, or under stress. Improves feed conversion efficiency and maintains energy levels.",
  "foran chevinal 2.5l": "Foran's flagship multi-vitamin and mineral tonic: broad-spectrum vitamins, trace minerals, and amino acids in a highly bioavailable liquid. The daily foundation supplement for performance and breeding horses.",
  "m.s.m": "Methylsulfonylmethane (MSM) provides bioavailable sulfur supporting joint cartilage integrity, soft tissue repair, and natural anti-inflammatory response. Popular daily supplement for horses with stiffness, arthritis, or athletic recovery needs.",
  "vita b-1 crumbs 3lb": "Thiamine (Vitamin B1) crumbles at a therapeutic dose. Supports carbohydrate metabolism, nervous system function, and calming in anxious or nervous horses. A natural calming support without sedation.",
  "vita b-12 crumbs 3lb": "Vitamin B12 crumbles for horses with poor feed conversion, anemia, or intensive work schedules. Supports red blood cell production and energy metabolism for peak performance.",
  "farriers formula refill": "Life Data Labs' gold-standard hoof supplement: biotin, methionine, phospholipids, omega-3 fatty acids, and minerals. Grows stronger, more resilient hoof wall from the coronary band down. Economy refill for ongoing hoof health programs.",
  "kombat kool": "Cooling supplement supporting thermoregulation during intense work in hot weather. Electrolytes and supportive nutrients help horses maintain normal body temperature. Essential for Florida's demanding summer competition season.",
  "one ac": "One AC is a daily supplement combining antifungal and immune-support ingredients to help horses in humid climates resist skin and respiratory challenges. Beneficial for horses in South Florida's year-round warm weather.",
  "simplifly 20lbs": "Farnam's SimpliFly with LarvaStop contains diflubenzuron which prevents fly larvae from developing in manure. Feed daily throughout fly season for dramatic reduction of breeding flies. Economy 20 lb for large barns.",
  "simplifly 10lbs": "SimpliFly with LarvaStop: feed diflubenzuron daily to interrupt the fly life cycle in manure. Reduces fly populations by up to 97% when fed consistently. 10 lb for mid-sized barns.",
  "simplifly 3.75": "SimpliFly starter or trial size. Diflubenzuron prevents fly pupae from developing in manure—the most effective and economical approach to barn-wide fly control.",
  "total gut health 1.12lbs": "Finish Line's 8-in-1 gut health system: digestive enzymes, pre- and probiotics, L-glutamine, and gastric buffer. Supports healthy gastric pH, hindgut microbiome, and epithelial integrity. USA-made and competition-safe.",
  "total gut health 6.75lbs": "Economy 6.75 lb of Finish Line's comprehensive Total Gut Health. Complete digestive support system for performance horses requiring ongoing gastric and hindgut protection.",
  "total gut health paste": "Finish Line's Gut Health formula in a paste syringe for rapid gastric support during travel, competition, or stressful situations. Administer before high-risk events to buffer stomach acid and protect gut lining.",
  "total pre & probiotic 5lbs": "Finish Line's blend of prebiotics (FOS) and probiotics supporting a healthy hindgut microbiome. Improves nutrient absorption, immune function, and manure consistency. Economy 5 lb for ongoing management.",
  "total pre & probiotic 8oz": "Trial size of Finish Line's pre- and probiotic blend. Establishes beneficial gut bacteria after antibiotic treatment, stressful events, or feed changes. A foundational supplement for digestive health.",
  "probios 5lbs": "Probios live direct-fed microbial supplement: proven Lactobacillus and Enterococcus cultures support gut flora restoration after stress, antibiotics, or illness. The most widely used probiotic in equine practice.",
  "probios 240g": "Probios in a practical powder format. Sprinkle on feed to deliver beneficial live cultures. Essential after antibiotic treatment, shipping stress, or changes in diet.",
  "probios chews": "Probios in a palatable chewable form—ideal for horses that resist powder or paste supplements. Live microbials in a treat horses willingly accept. Excellent for daily gut maintenance or post-stress recovery.",
  "ulcergard": "FDA-approved omeprazole paste for ulcer prevention and treatment in horses. The gold standard for gastric ulcer management by Merial. Use during high-risk periods: intensive training, transport, and competition seasons.",
  "gastroade gal": "Gastroade is a buffering liquid supplement that neutralizes excess stomach acid, supports gastric mucosa integrity, and promotes healthy digestive function. Beneficial for horses showing signs of gastric discomfort.",
  "gastroade paste": "Gastroade paste for immediate gastric buffering relief. Administer before stressful events, travel, or when ulcer symptoms are observed. Convenient syringe delivery.",
  "sand purge 5lbs": "Farnam Sand Purge: psyllium husks that expand in the gut to trap and carry ingested sand out of the digestive tract. Critical for Florida horses grazing sandy pastures. Use one week per month as a preventive protocol.",
  "sand purge 10lbs": "Farnam Sand Purge psyllium blend in a 10 lb supply. One-week monthly psyllium purge protocol significantly reduces sand colic risk. A must-have for Florida and South Florida horse owners.",
  "sand purge 20lbs": "Economy 20 lb of Farnam Sand Purge psyllium. Year-round sand colic prevention for South Florida horses exposed to sandy soils. One of the most important supplements for horses in this region.",
  "sand clear 3lbs": "Farnam Sand Clear with apple flavor: psyllium husks plus probiotics for sand removal and gut support. Horses love the taste, making compliance easy. 3 lb starter size.",
  "sand clear 10lbs": "Farnam Sand Clear psyllium plus probiotics in a 10 lb supply. Apple-flavored for easy feeding. Combine psyllium's sand-clearing action with gut flora support for comprehensive digestive health.",
  "sand clear 20lbs": "Economy 20 lb of Farnam Sand Clear with apple flavor and probiotics. Complete sand removal and gut health support for horses on sandy Florida pastures. Essential year-round protocol.",
  "apple a day 5lbs": "Farnam Apple A Day electrolyte powder: sodium, chloride, potassium, and magnesium in an apple-flavored formula horses love. Replaces minerals lost through sweat. Essential during Florida's hot, humid summers.",
  "apple a day 15lbs": "Mid-size supply of Farnam Apple A Day electrolyte. Balanced mineral formula supports hydration and prevents dehydration-related colic during intense work and hot weather.",
  "apple a day 30lbs": "Economy 30 lb of Farnam Apple A Day electrolyte. Bulk supply for multi-horse barns managing summer heat and heavy training schedules. Ensures consistent electrolyte replenishment.",
  "stress dex 4lbs": "Farnam Stress Dex electrolyte powder with B-vitamins for added stress support. Replenishes sodium, potassium, and chloride while supporting energy metabolism. A step above basic electrolyte formulas.",
  "stress dex 12lbs": "Stress Dex 12 lb electrolyte with B-vitamin complex. Comprehensive hydration and stress support for performance horses during competition seasons and demanding training.",
  "stress dex 20lbs": "Economy 20 lb Stress Dex electrolyte with B-vitamins. Bulk supply for barns managing multiple performance horses through Florida's demanding warm-weather competition schedule.",
  "apple elite 5lbs": "Farnam's Apple Elite electrolyte: a premium apple-flavored formula with enhanced ratios of sodium, potassium, chloride, and magnesium. Supports rapid rehydration after intense exercise or heat stress.",
  "apple elite 7.5lbs": "Apple Elite electrolyte in a convenient 7.5 lb size. Premium apple-flavored electrolyte blend for horses in active performance programs. Supports rapid rehydration and peak hydration status.",
  "apple dex 30lbs": "Economy 30 lb Apple Dex electrolyte powder for high-volume barns. Apple-flavored and palatable. Maintains electrolyte balance and encourages water intake during Florida's year-round heat.",
  "k.e.r. re-store 4.5lbs": "KER's scientifically formulated electrolyte based on the actual electrolyte composition of equine sweat: sodium, chloride, potassium, and magnesium in precise ratios. No fillers—just pure sweat replacement for peak rehydration.",
  "e3 antifungal/antibacterial gal": "E3's professional-grade antifungal and antibacterial shampoo targets ringworm, rain rot, and skin infections. Broad-spectrum treatment safe for daily use. Gallon size for high-volume barn treatment programs.",
  "e3 argan oil gal": "E3 Argan Oil shampoo: Moroccan argan oil deeply nourishes coat, mane, and tail while providing antifungal protection. Leaves hair brilliantly shiny and tangle-free. Gallon for large barn use.",
  "e3 tea tree gal": "E3 Tea Tree shampoo: Australian tea tree oil's natural antimicrobial properties fight skin infections and soothe irritated skin. Safe for sensitive skin, effective for horses with skin challenges. Gallon size.",
  "e3 antifungal/antibacterial 32oz": "E3's antifungal and antibacterial treatment shampoo in a convenient 32 oz bottle. Broad-spectrum protection against ringworm, rain rot, and bacterial skin infections. Ideal for targeted treatment.",
  "e3 argan oil 32oz": "E3 Argan Oil shampoo 32 oz: nourishing Moroccan argan oil enriches coat, mane, and tail. Antifungal properties protect while delivering exceptional shine and manageability.",
  "e3 tea tree 32oz": "E3 Tea Tree shampoo 32 oz: natural tea tree oil antimicrobial action for horses with skin sensitivities or fungal challenges. Soothing and effective.",
  "cowboy magic shampoo gal": "Cowboy Magic's ultra-concentrated rose-water shampoo: a little goes a very long way. Creates deep-cleaning lather that removes sweat, dirt, and residue without stripping natural oils. Gallon for professional use.",
  "cowboy magic shampoo 32oz": "Cowboy Magic rose-water concentrated shampoo. Cleans deeply while leaving hair soft and manageable. A show circuit staple for achieving a spotlessly clean horse.",
  "cowboy magic shampoo 16oz": "Cowboy Magic concentrated shampoo in a convenient 16 oz travel and show size. The same professional-grade cleaning power in a portable format.",
  "cowboy magic conditioner gal": "Cowboy Magic's silicone conditioner delivers silky, tangle-free mane and tail hair. Prevents breakage during brushing and creates extraordinary shine. Gallon for high-volume professional use.",
  "cowboy magic conditioner 32oz": "Cowboy Magic conditioner for silky, manageable mane and tail. Reduces breakage and adds brilliant shine. The show ring standard for tangle-free presentation.",
  "cowboy magic conditioner 16oz": "Cowboy Magic conditioner in a 16 oz portable size. Perfect for the show bag—delivers professional tangle-free results wherever you compete.",
  "cowboy magic greenspot remover gal": "Cowboy Magic Greenspot Remover: waterless spot cleaner removes manure stains, urine stains, and green spots without hosing. Essential for show prep. Gallon for professional barn use.",
  "vetrolin bath shampoo 64oz": "Absorbine Vetrolin Bath: enriched with liniment ingredients for a refreshing, muscle-soothing bath experience. Cleans deeply while the cooling liniment extracts invigorate sore muscles. Ideal post-workout.",
  "vetrolin bath shampoo 32oz": "Vetrolin Bath shampoo with liniment extracts: cleans coat while soothing muscles and joints. The choice of endurance and eventing riders for post-competition bathing.",
  "mane n tail shampoo gal": "The legendary Mane 'n Tail shampoo: originally formulated for horses. Fortified proteins strengthen hair fibers. Creates rich lather that deeply cleans while promoting healthy mane and tail growth.",
  "mane n tail shampoo 32oz": "Mane 'n Tail protein-fortified shampoo in a convenient 32 oz size. The iconic formula that promotes thick, healthy mane and tail growth. Used by horse owners worldwide.",
  "fc animal shampoo gal": "FC Animal Shampoo: professional-grade, pH-balanced formula for horses, dogs, and livestock. Gentle daily cleaning that maintains natural coat oils. Economical gallon for whole-barn use.",
  "fc animal shampoo 32oz": "FC Animal Shampoo 32 oz: pH-balanced daily shampoo safe for all coat types. Gentle cleaning without stripping natural oils.",
  "fc antifungal shampoo gal": "FC Antifungal Shampoo: broad-spectrum antifungal formula for horses with rain rot, ringworm, or other fungal skin conditions. Professional-grade gallon for high-volume treatment programs.",
  "fc antifungal shampoo 32oz": "FC Antifungal Shampoo 32 oz for targeted treatment of fungal skin conditions. Broad-spectrum antifungal action safe for regular use during Florida's humid wet season.",
  "fc citronella shampoo 32oz": "FC Citronella Shampoo: natural citronella oil provides insect-repelling properties during the bath. Leaves a fresh scent while helping to deter flies and mosquitoes post-bath.",
  "quic silver whitening shampoo 64oz": "Absorbine Quic Silver: purple-pigment whitening shampoo neutralizes yellow tones in grey, white, and light-colored horses. Brightens coat for the show ring. Professional 64 oz for large barns.",
  "quic silver whitening shampoo 16oz": "Quic Silver whitening shampoo 16 oz: professional purple-pigment formula brightens grey and white coats. Essential show prep for grey and light-colored horses.",
  "e3 whitening shampoo 32oz": "E3 Whitening Shampoo: optical brighteners and blue-violet pigments neutralize yellowing in white and grey coats. Delivers a crisp, bright appearance for the show ring.",
  "vetrolin white n brite 32oz": "Absorbine's Vetrolin White 'n Brite: targeted brightening treatment for white markings, socks, and grey coats. Removes stains and enhances brightness for impeccable show presentation.",
  "fungasol shampoo 20oz": "Broad-spectrum antifungal shampoo with miconazole for treating ringworm, rain rot, and other fungal skin infections in horses. Veterinarian-recommended formula for resistant or widespread infections.",
  "corakko skin care shampoo 32oz": "Corakko's therapeutic skincare shampoo formulated for horses with dry, itchy, or irritated skin. Soothing botanicals and moisturizing agents support healthy skin barrier function.",
  "corakko skin care shampoo 18oz": "Corakko Skin Care Shampoo 18 oz: soothing botanical formula for horses with sensitive or problem skin. Trial and travel size.",
  "canter mane & tail conditioner gal": "Canter's premium mane and tail conditioner: penetrating formula deeply conditions dry, brittle hair. Restores elasticity and shine while preventing breakage. Gallon size for professional grooming routines.",
  "mineral oil": "Food-grade mineral oil for internal use as a mild laxative to support gut motility and prevent sand impaction. Also used externally as a coat sheen. A classic and versatile tool in equine management.",
  "rice bran oil": "Cold-pressed rice bran oil: 20% fat, high in gamma-oryzanol (natural anti-inflammatory), balanced omega-3 and omega-6 fatty acids. Excellent for coat condition, weight gain, and muscle development. A performance favorite.",
  "wheat germ oil": "Rich in vitamin E, omega-6 fatty acids, and octacosanol. Supports reproductive health, muscle oxygenation, and coat condition. A natural, cold-pressed oil with decades of equine use.",
  "flaxseed oil": "Cold-pressed flaxseed oil: nature's richest plant source of omega-3 ALA fatty acids. Supports a brilliant coat, healthy hooves, inflammatory balance, and immune function. Add to feed daily.",
  "dac oil": "DAC's blend of soybean, corn, and wheat germ oils providing a balanced omega fatty acid profile. Cost-effective caloric supplement for weight gain, coat condition, and sustained energy in performance horses.",
  "havens equi-force 5l": "Havens' premium 5L oil blend with sunflower, soybean, and linseed oils. Optimized omega-3 to omega-6 ratio supports coat bloom, cardiovascular health, and anti-inflammatory response in sport horses.",
  "karron oil 5l": "Foran's Karron Oil: traditional blend of multiple oils formulated to promote digestive health, coat shine, and overall condition. A long-standing Irish equestrian supplement trusted by generations of horsekeepers.",
  "linseed oil": "Cold-pressed linseed (flaxseed) oil in a pure, unblended form. The highest plant-source omega-3 fatty acid content available. Supports coat, hooves, immune function, and inflammatory management.",
  "k.e.r. eo3 oil": "KER EO-3: fish oil-derived omega-3 supplement providing EPA and DHA—the most bioavailable forms of omega-3 fatty acids for horses. Scientifically proven to reduce inflammation, support joint health, and improve cognitive function.",
  "oilmega 10l": "Economy 10L omega-rich oil blend for large barns or multiple-horse operations. Balanced omega-3 and omega-6 fatty acids support coat condition, energy, and overall health at a cost-effective per-dose price.",
  "healthy coat": "Farnam Healthy Coat: omega-3 and omega-6 fatty acid supplement with vitamin E. Supports a dazzling coat, healthy skin, and immune function. Economical everyday option for coat condition.",
  "cocosoya": "Uckele's CocoSoya: coconut and soybean oil combination delivering medium-chain triglycerides (MCTs) from coconut for quick energy and lauric acid for immune support, balanced with soybean oil's omega-6 profile.",
  "showsheen gal": "Absorbine ShowSheen: the original dimethicone spray that detangles, prevents manure staining, and creates extraordinary shine. A show ring staple for over 40 years. Gallon for high-volume professional use.",
  "showsheen 32oz with sprayer": "ShowSheen 32 oz with ready-to-use sprayer. Detangles mane and tail, prevents staining, and produces brilliant show-ring shine. Convenient trigger sprayer for daily grooming.",
  "showsheen 32oz refill": "ShowSheen 32 oz refill—economical way to keep your ShowSheen pump bottle topped up. The same legendary formula at a lower per-use cost.",
  "showsheen detangler gel": "ShowSheen in a gel formula: concentrated dimethicone gel that penetrates and releases even the most severe tangles in mane and tail. Apply directly to knots before brushing.",
  "quic braid 16oz": "Absorbine Quic Braid: styling gel that controls flyaways, secures braids, and keeps manes lying flat. Beeswax and dimethicone create a durable hold without stiffness. A braiding staple at top show barns.",
  "cowboy magic detangler and shine": "Cowboy Magic's legendary silicone detangler creates slip that releases severe tangles without pulling or breaking hair. Leaves an extraordinary shine and prevents future tangles. A show circuit essential.",
  "cowboy magic greenspot remover": "Cowboy Magic Greenspot Remover: waterless formula that lifts manure, urine stains, and grass stains without water. Essential show-day spot cleaner when time is short.",
  "canter mane & tail spray 1l": "Canter's premium spray conditioner for mane and tail: lightweight formula detangles and adds shine without weighing hair down. 1L professional size for daily barn grooming.",
  "canter mane & tail spray 500ml": "Canter Mane & Tail Spray 500 ml: lightweight detangling conditioner for daily use. Adds shine and reduces breakage in even the thickest manes and tails.",
  "canter dream coat 1l": "Canter Dream Coat: silicone-based body coat spray creating a dazzling mirror-like shine on the coat. UV protection prevents bleaching. The choice of competitive groomers at top international shows. 1L professional size.",
  "canter dream coat 500ml": "Canter Dream Coat 500 ml: professional coat shine spray with UV protection. Creates show-ready brilliance while protecting coat color from sun bleaching.",
  "canter coat shine 500ml": "Canter Coat Shine: lightweight daily shine spray that enhances natural coat luster and repels dust. Adds a beautiful natural glow without a heavy product buildup.",
  "fungasol spray": "Topical antifungal spray with broad-spectrum efficacy against ringworm, rain rot, and other dermatophyte infections. Convenient spray application for hard-to-reach areas and large treatment zones.",
  "fungasol ointment": "Antifungal ointment for concentrated treatment of localized skin infections. Penetrating formula stays on affected areas longer than spray for enhanced treatment efficacy.",
  "vetericyn foamcare spray": "Vetericyn FoamCare: oxygenating foam spray that cleans, moisturizes, and supports healthy skin without rinsing. Ideal for sensitive skin and between full baths. Wound-compatible and pH-balanced.",
  "m-t-g": "Shapley's MTG (Mane, Tail, and Groom): sulphur-based formula stops itching, promotes hair regrowth, and treats skin conditions including sweet itch. Legendary for rebuilding rubbed-out manes and tails.",
  "t-10 blades": "T-10 fine clipper blades for close body clipping and detail work around the face, ears, and legs. Compatible with most professional clipper systems. Surgical-grade steel for long-lasting sharpness.",
  "t-84 blades": "T-84 medium clipper blades ideal for body clipping and trace clips. Provides a clean, even finish. Widely compatible with professional clipper brands.",
  "andis clipper agc2 super": "Andis AGC2 Super 2-speed professional clipper: the industry standard for equine body clipping. Powerful rotary motor handles thick winter coats effortlessly. Two speeds for versatile use from face detail to full body clips.",
  "andis clipper emerge cordless": "Andis Emerge cordless clipper: professional performance without cord restrictions. Lithium-ion battery delivers up to 80 minutes of run time. Ideal for shows, trailers, and precise detail work.",
  "andis clipper oil 4oz": "Andis blade oil: lightweight mineral oil lubricant that reduces friction, prevents rust, and extends blade life. Apply a few drops before and after each use to maintain peak cutting performance.",
  "andis clipper cool care spray": "Andis 5-in-1 Cool Care: cools, cleans, disinfects, lubricates, and prevents rust in one spray. Apply during clipping sessions to keep blades cool and running smoothly.",
  "andis clipper blade care spray": "Andis Blade Care: sanitizing spray that cleans and disinfects clipper blades between horses. Essential for preventing cross-contamination of skin conditions in a barn environment.",
  "andis clipper blade care dip plus": "Andis Blade Care Plus liquid dip: soak blades to remove hair and debris completely. Cleans, lubricates, and protects blades in one immersion step. Professional-grade blade maintenance.",
  "1st cut timothy (3-string)": "First-cut Timothy hay: high in fiber, moderate protein, lower calcium—ideal for easy-keeper horses and those with metabolic concerns. Long-stem fiber supports natural digestive function and satisfies foraging instincts.",
  "2nd cut timothy (3-string)": "Second-cut Timothy hay: higher protein, increased digestibility, and finer stem texture than first cut. Preferred by performance horses, broodmares, and young growing horses with elevated nutritional needs.",
  "2nd cut grassy timothy (3-string)": "Second-cut Grassy Timothy blend: a mix of timothy with orchard and other grasses for palatability and nutritional variety. Excellent for horses that are picky eaters or transitioning between hay types.",
  "premium alfalfa (3-string)": "Premium sun-cured alfalfa: 18–20% protein, high calcium, and rich in vitamins A, D, and E. Ideal for hard-working performance horses, lactating mares, and growing youngsters with high protein and energy demands.",
  "orchard (3-string)": "Orchard grass hay: highly palatable with a soft texture that horses love. Moderate protein, high in digestible fiber. Excellent for horses that refuse stemmy hay or those transitioning from pasture.",
  "teff (3-string)": "Teff grass hay: the premium warm-season grass hay for horses with metabolic syndrome, insulin resistance, or Cushing's disease. Ultra-low non-structural carbohydrate (NSC) content provides safe, satisfying forage.",
  "1st cut alberta timothy (2-string)": "Premium Alberta, Canada first-cut Timothy: cooler growing conditions produce exceptionally clean, dust-free hay with consistent quality. Two-string bale ideal for individual horse owners.",
  "2nd cut alberta timothy (2-string)": "Alberta second-cut Timothy: Canada's premium climate produces fine-stemmed, highly palatable second-cut hay. Two-string format for smaller barns and individual horses.",
  "premium t/a (2-string)": "Premium Timothy-Alfalfa blend in two-string bales: the ideal performance horse forage combining Timothy's fiber with Alfalfa's protein and energy. Balanced nutrition for horses in moderate to heavy work.",
  "special reserve (2-string)": "Special Reserve premium blend: hand-selected top-quality hay with exceptional palatability and visual appeal. The choice for discerning horsekeepers who accept only the finest forage for their horses.",
  "compressed t/a": "Compressed Timothy-Alfalfa blend: high-density compressed bales reduce storage space and minimize waste. Consistent nutrient delivery with less dust than conventional bales. Excellent for barn efficiency.",
  "quebec t/a": "Quebec Timothy-Alfalfa blend: grown in eastern Canada's ideal cool-season hay climate. Rich flavor and exceptional palatability make this a top choice for horses that are selective about their hay.",
  "twyla o/t/a": "Twyla brand Orchard-Timothy-Alfalfa blend: a tri-grass-legume combination for maximum palatability and nutritional breadth. Horses love the variety of textures and flavors.",
  "valley green 2nd cut o/t/a": "Valley Green second-cut Orchard-Timothy-Alfalfa: premium Western blend with exceptional color, smell, and nutritional consistency. A show-barn staple for horses demanding the best forage.",
  "supergrass 2nd cut orchard": "Supergrass premium second-cut Orchard grass: intensely palatable, soft-textured hay ideal for picky eaters and horses recovering from respiratory conditions. Excellent dustiness control.",
  "compressed alfalfa": "Compressed pure alfalfa bales: high-density, low-dust format delivering premium 18–20% protein alfalfa. Excellent for hard-working performance horses, lactating mares, and growing horses.",
  "peanut": "Peanut hay: unique Southern forage with moderate protein and high palatability. A flavorful alternative forage accepted readily by most horses. Well-suited to Florida's growing conditions.",
  "lucerne hi-fiber gold": "Standlee Lucerne Hi-Fiber Gold: premium chopped alfalfa in a compressed bale. High protein alfalfa in a convenient, low-waste format. Excellent gastric buffer when fed before exercise.",
  "standlee alfalfa/timothy": "Standlee's compressed Timothy-Alfalfa blend: all the benefits of the classic performance horse forage combination in a convenient, low-waste compressed format. Consistent quality and nutrient density.",
  "standlee alfalfa": "Standlee compressed alfalfa: premium sun-cured alfalfa in a compressed, low-dust format. Ideal for horses with high protein and calcium demands. Convenient and virtually waste-free.",
  "standlee timothy": "Standlee compressed Timothy hay: pure first-quality Timothy in a convenient, low-dust compressed format. Excellent for easy-keeper horses and those with metabolic sensitivities.",
  "alfalfa cubes": "Pure compressed alfalfa cubes: a high-protein, calcium-rich forage alternative. Soak in water for horses with dental issues or choke risk. Ideal gastric buffer when fed before grain or exercise.",
  "alfalfa pellets": "Compressed pure alfalfa pellets: all the benefits of premium alfalfa in a convenient, dust-free format. Easy to store, virtually no waste, and highly palatable. Excellent for horses with respiratory sensitivity to hay dust.",
  "blue mountain timothy pellets": "Blue Mountain Timothy pellets: premium compressed Timothy grass in pellet form. Pure, dust-free forage for horses with respiratory sensitivities or dental challenges. Excellent for easy keepers needing controlled nutrition.",
  "mini alfalfa cubes": "Smaller-format alfalfa cubes suitable for miniature horses, ponies, and donkeys, or horses with dental challenges. Premium alfalfa nutrition in a bite-sized, manageable cube.",
  "t/a cubes": "Timothy-Alfalfa blend cubes: the best of both forages in a convenient cube format. Balanced protein and fiber ideal for horses in moderate work. Soak for horses with choke history.",
  "timothy pellets": "Pure compressed Timothy pellets: a clean, dust-free forage supplement for horses with respiratory issues or those requiring precise fiber supplementation. Easy to store and eliminate wastage.",
  "world cup large 10 cu/ft": "World Cup Large Flake shavings: 10 cubic feet of premium kiln-dried pine for luxurious stall bedding. Extra-large flakes provide exceptional absorbency, superior ammonia control, and comfortable cushioning for resting horses.",
  "obec large 10 cu/ft": "OBEC Large Flake shavings: 10 cubic feet of kiln-dried pine shavings with large, fluffy flakes for excellent absorbency and comfort. Easy to muck and ideal for horses that spend long hours stalled.",
  "king large 10 cu/ft": "King Large Flake shavings: premium kiln-dried pine in large flakes for outstanding absorbency and odor control. Long-lasting bedding that keeps stalls fresh and horses comfortable.",
  "showtime large 10 cu/ft": "Showtime Large Flake shavings: competition-quality kiln-dried pine bedding. Ultra-clean, low-dust, and highly absorbent. The preferred choice for show barns requiring pristine stall presentation.",
  "beaver large 9 cu/ft": "Beaver Large Flake shavings: 9 cubic feet of premium large-flake pine for excellent absorbency and stall comfort. Reliable everyday bedding for the well-managed barn.",
  "fast track blend 8-9 cu/ft": "Fast Track Blend: a blend of kiln-dried shavings sizes for versatile absorbency and economical coverage. Ideal for high-volume barns balancing cost and quality.",
  "fast track fine": "Fast Track Fine shavings: small-particle kiln-dried pine for maximum surface area and superior absorbency. Excellent for horses with skin sensitivities or those needing extra cushioning.",
  "red grandis fine": "Red Grandis fine hardwood shavings: unique alternative bedding from sustainably sourced eucalyptus. Superior absorbency, minimal dust, and a pleasant natural scent. Excellent for horses with respiratory issues.",
  "wayne davis fine": "Wayne Davis fine pine shavings: premium kiln-dried, finely shredded pine for exceptional absorbency. Low dust and high fluid retention keep stalls drier longer.",
  "wayne davis flake medium": "Wayne Davis medium flake shavings: versatile size offering a balance of absorbency and ease of mucking. Kiln-dried pine maintains freshness and reduces ammonia odor.",
  "wayne davis pelleted": "Wayne Davis pelleted bedding: compressed wood pellets that expand to 3× volume when wet. Exceptional absorbency and ammonia control. Economical—requires less product per stall than traditional shavings.",
  "baled straw": "Traditional wheat straw bedding: natural, biodegradable, and comfortable. Ideal for foaling mares, horses prone to eating bedding, and barns prioritizing natural management.",
  "havens cool mix": "Havens Cool Mix: high-fiber, low-starch performance feed with micronized cereals and elevated beta-carotene from alfalfa. Provides sustained energy without excitability. Ideal for sensitive performance horses.",
  "havens draversbrok": "Havens Draversbrok: specialized harness racing feed formulated for horses in intense anaerobic work. Provides rapidly available starch and protein for peak speed-based performance.",
  "havens endurance 14": "Havens Endurance 14: high-protein, high-energy formula for endurance horses covering long distances. Balanced amino acids support muscle recovery while high-energy grains and oils fuel sustained aerobic effort.",
  "havens gastro plus": "Havens Gastro Plus: feed formulated with sodium bicarbonate, calcium carbonate, magnesium, and probiotics to neutralize excess stomach acid and support gastric health. An exceptional choice for ulcer-prone horses.",
  "havens peformance 14": "Havens Performance 14: premium 14% protein competition feed with controlled starch and high-energy oils. Formulated to fuel demanding sport horses while maintaining an even temperament.",
  "havens power plus": "Havens Power Plus: ultra-high-energy conditioning feed for horses needing rapid weight gain or maximum performance output. Rich in oils and digestible energy for hard-keeping horses and elite competitors.",
  "havens sport muesli": "Havens Sport Muesli: appetizing grain-and-chaff muesli format encouraging natural slow eating. High-quality European grains with balanced vitamins and minerals for sport horses.",
  "havens slobber mash": "Havens Slobber Mash: easily prepared warm mash for horses needing increased water intake, recovering from illness, or with dental challenges. Highly palatable and quickly prepared with warm water.",
  "havens natural balance": "Havens Natural Balance: low-starch maintenance feed for horses in light work or on combined forage and grain diets. Provides essential vitamins and minerals without excessive caloric loading.",
  "havens green-vet": "Havens Green-Vet: formulated for horses recovering from illness, surgery, or those in need of nutritional support. Highly digestible and designed to support immune function and healthy recovery.",
  "havens senior crumbs": "Havens Senior Crumbs: soft, easily digestible crumble format for elderly horses with dental deterioration. High digestibility ensures proper nutrition for aging horses that struggle with hard grains.",
  "havens fibredice": "Havens FibreDice: compressed fiber cubes made from quality European forage. High digestible fiber supports hindgut health, promotes natural chewing, and can replace a portion of hay in the ration.",
  "proforce fuel": "Nutrena ProForce Fuel: high-fat, beet-pulp-based formula with the Digestive Shield blend—controlled starch, pre-/pro-/post-biotics, and calcite. Exceptional for hard-working sport horses needing maximum energy with digestive protection.",
  "proforce senior": "ProForce Senior: high-fat, high-fiber formula with Digestive Shield for older performance horses. Supports weight maintenance, muscle condition, and digestive health in aging high-performance horses.",
  "safechoice original": "Nutrena SafeChoice Original: the foundational lower-starch, higher-fat performance feed with a comprehensive vitamin-mineral package. Supports healthy gut, immune function, coat quality, and consistent energy for horses in regular work.",
  "safechoice senior": "SafeChoice Senior: enhanced digestibility formula for horses 15+ years. Elevated vitamin E and antioxidants support immune health; higher fat maintains condition; softer texture accommodates dental challenges.",
  "safechoice special care": "SafeChoice Special Care: ultra-low starch and sugar for horses with insulin resistance, PPID (Cushing's), or laminitis. Veterinarian-recommended choice for managing metabolic horses while maintaining balanced nutrition.",
  "triumph fiber plus": "Triumph Fiber Plus: value-priced high-fiber formula with elevated fat for condition support. A budget-friendly option that doesn't compromise on fiber quality for horses in light to moderate work.",
  "triumph professional 14%": "Triumph Professional 14%: affordable 14% protein grain mix for horses in moderate to heavy work. Cost-effective performance nutrition for training and competition horses.",
  "triumph senior": "Triumph Senior: budget-friendly complete senior feed with high digestibility and fiber for aging horses. Supports weight maintenance and comfort for horses 15 and older.",
  "triumph southeast 12/8": "Triumph SouthEast 12/8: formulated specifically for the Southeast's forage conditions. 12% protein, 8% fat blend addressing the unique nutritional gaps in Florida and Southeast pasture and hay.",
  "triumph triple 10": "Triumph Triple 10: 10% protein, 10% fat, 10% fiber—a balanced all-purpose formula supporting condition, energy, and digestive health. Excellent versatile option for mixed-use barns.",
  "stock and stable sweet feed": "Nutrena Stock and Stable: classic sweet feed with molasses for maximum palatability. All-purpose nutrition for horses, ponies, and other livestock. A traditional formula that horses enthusiastically consume.",
  "empower digestiver balance": "Nutrena Empower Digestive Balance: ration balancer with probiotic support for horses on forage-based diets. Delivers precision nutrition without excess calories—ideal for easy keepers, minis, and ponies.",
  "empower topline balance": "Nutrena Empower Topline Balance: amino-acid-focused ration balancer targeting topline development. Lysine, methionine, and threonine in precise ratios build and maintain healthy back muscle in all horses.",
  "proelite grass advantage": "ProElite Grass Advantage: formulated to complement grass hay diets—fills the nutritional gaps typical in grass forage. Premium amino acids, vitamins, and minerals support horses on pasture or grass-based hay.",
  "proelite growth": "ProElite Growth: high-protein, high-mineral formula for developing horses from weanling to 2 years old. Precise calcium-to-phosphorus ratio supports healthy bone development and growth-plate integrity.",
  "proelite omega advantage": "ProElite Omega Advantage: elevated omega-3 and -6 fatty acids from flaxseed for exceptional coat bloom, skin health, and anti-inflammatory support. Premium option for show horses requiring maximum visual appeal.",
  "proelite performance": "ProElite Performance: ultra-premium performance feed with beet pulp, alfalfa, and flaxseed. Low starch, high fat and fiber for peak athletic performance. The top-tier Nutrena feed for elite competition horses.",
  "proelite starch wise": "ProElite Starch Wise: low-starch formula for metabolic, PPID, or laminitis-prone horses needing performance-level nutrition. Premium ingredients with controlled glycemic response.",
  "proelite senior": "ProElite Senior: premium senior formula with elevated essential amino acids, omega fatty acids, and antioxidants. Maintains topline, coat, and immune health in aging high-performance horses.",
  "proelite topline advantage": "ProElite Topline Advantage: the ultimate topline-building formula with elevated lysine, methionine, and threonine for targeted back-muscle development. Includes flaxseed for coat bloom. The choice of discerning performance horse owners.",
  "vetrolin liniment gal": "Absorbine Vetrolin Liniment: a blend of glycerin, plant extracts, and menthol that soothes tired muscles, reduces joint stiffness, and promotes circulation. A show barn staple for decades. Gallon size for professional use.",
  "vetrolin liniment 32oz": "Vetrolin Liniment 32 oz: muscle-soothing plant extracts, glycerin, and menthol for post-workout recovery and pre-competition leg preparation. The classic choice for professional grooms.",
  "absorbine cooldown": "Absorbine CoolDown: spray-on cooling liniment with menthol and essential oils. Rapidly cools legs and muscles after intense work. Reduces inflammation and leaves legs feeling refreshed and ready for the next day.",
  "absorbine veterinary liniment gel": "Absorbine Veterinary Liniment Gel: gel formulation with 4% natural menthol, chloroxylenol, and botanical extracts. Faster application and no drips. Targets sore joints, arthritic pain, and muscle stiffness.",
  "carr & day & martin ice blue": "Carr & Day & Martin Ice Blue: cooling leg gel with menthol and witch hazel that rapidly reduces heat and minor swelling in legs. A top British grooming product used by Olympic equestrians worldwide.",
  "relief poultice": "Traditional kaolin clay poultice for drawing heat and minor swelling from tired legs. Apply, wrap overnight, and remove in the morning for visibly reduced inflammation and refreshed legs.",
  "kool-out 45lbs": "Kool-Out poultice: premium kaolin clay formula in economy 45 lb bucket. Draws heat, reduces minor swelling, and soothes hard-working legs. A show-barn staple for overnight leg wrapping.",
  "kool-out 23lbs": "Kool-Out kaolin clay poultice in a practical 23 lb size. Professional-grade post-work leg treatment for drawing heat and reducing minor inflammation. Apply, wrap, and remove the next morning.",
  "kool-out 12.9lbs": "Kool-Out poultice in a convenient 12.9 lb size. Kaolin clay draws heat and reduces minor swelling after intense work. Ideal for individual horse owners or those with limited storage.",
}

function applyExpertDescriptions(products: any[]): any[] {
  return products.map(p => {
    const key = (p.name || '').toLowerCase().trim()
    const expert = EXPERT_DESCRIPTIONS[key]
    if (expert) {
      return { ...p, description: expert }
    }
    return p
  })
}

app.get('/api/public/products', async (c) => {
  const kv = c.env?.BF_STORE
  if (kv) {
    try {
      const raw = await kv.get('catalog_products', 'json') as any[] | null
      if (raw && Array.isArray(raw) && raw.length > 0) {
        return c.json({ products: applyExpertDescriptions(raw), source: 'kv' })
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
        <a href="#guidelines" class="nav-link hover:text-gold-400 transition-colors">Feeding Guide</a>
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
      <a href="#guidelines" onclick="closeMobileMenu()" class="block py-2 hover:text-gold-400">Feeding Guide</a>
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
<!-- ═══════════════════════ EQUINE NUTRITION ══════════════════════ -->
<section id="guidelines" class="py-20 bg-white">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

    <!-- Header -->
    <div class="text-center mb-12 scroll-reveal">
      <div class="flex items-center justify-center gap-2 mb-3">
        <div class="h-px w-10 bg-gold-400"></div>
        <span class="text-gold-500 font-semibold text-xs tracking-widest uppercase">Equine Nutrition</span>
        <div class="h-px w-10 bg-gold-400"></div>
      </div>
      <h2 class="font-serif text-4xl font-bold text-navy-700 mb-3">Horse Feeding Guidelines</h2>
      <p class="text-gray-500 text-lg max-w-2xl mx-auto">A practical South Florida reference from our team — because proper care starts long before the ride.</p>
    </div>

    <!-- Rule #1 banner -->
    <div class="bg-navy-700 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center gap-5 scroll-reveal">
      <div class="flex-shrink-0 w-14 h-14 rounded-full bg-gold-400 flex items-center justify-center text-navy-700 text-2xl font-serif font-bold">1</div>
      <div>
        <div class="text-gold-400 text-xs font-bold uppercase tracking-widest mb-1">Rule #1 — Always</div>
        <div class="text-white font-serif text-xl font-bold mb-1">Forage First</div>
        <p class="text-gray-300 text-sm leading-relaxed">Horses are hindgut fermenters built to eat small amounts continuously. <strong class="text-white">Feed 1.5–2% of body weight in quality hay per day</strong> (15–20 lbs for a 1,000 lb horse). Good forage buffers stomach acid, fuels hindgut bacteria, reduces ulcer risk, and prevents sand impaction. Grain supplements forage — it never replaces it.</p>
      </div>
    </div>

    <!-- Two-column main content -->
    <div class="grid lg:grid-cols-2 gap-8 mb-8">

      <!-- Feeding reference table -->
      <div class="bg-cream rounded-2xl p-6 scroll-reveal">
        <div class="flex items-center gap-2 mb-4">
          <i class="fas fa-table text-gold-400"></i>
          <h3 class="font-bold text-navy-700 text-lg">Daily Feeding Reference</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-navy-700 text-white">
                <th class="text-left py-2 px-3 rounded-tl-lg text-xs uppercase tracking-wider">Horse Type</th>
                <th class="text-left py-2 px-3 text-xs uppercase tracking-wider">Hay / Day</th>
                <th class="text-left py-2 px-3 text-xs uppercase tracking-wider">Grain</th>
                <th class="text-left py-2 px-3 rounded-tr-lg text-xs uppercase tracking-wider">Key Focus</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${[
                ['Idle / Easy Keeper','1.5% BW','Balancer only','Weight & minerals'],
                ['Light / Pleasure','1.8% BW','2–4 lbs','Steady energy'],
                ['Moderate Work','2.0% BW','4–6 lbs','Stamina, topline'],
                ['Heavy / Competition','2.0% BW','6–10 lbs','Peak performance'],
                ['Senior Horse','2.0–2.5% BW','4–8 lbs senior','Digestion, joints'],
                ['Pregnant / Lactating','2.0–2.5% BW','4–8 lbs','Protein & calcium'],
                ['Growing Youngster','2.0% BW','0.5–1% BW','Balanced growth'],
                ['Metabolic / IR / EMS','1.5% BW low-NSC','Low-starch only','Blood sugar control'],
              ].map(([type,hay,grain,focus],i) => `
              <tr class="${i%2===1?'bg-cream-dark':'bg-white'}">
                <td class="py-2 px-3 font-semibold text-navy-700 text-xs">${type}</td>
                <td class="py-2 px-3 text-xs text-gray-600">${hay}</td>
                <td class="py-2 px-3 text-xs text-gray-600">${grain}</td>
                <td class="py-2 px-3 text-xs text-gray-500">${focus}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-400 mt-3">BW = Body Weight. Split grain into 2–3 meals. Never exceed 5 lbs in a single feeding.</p>
      </div>

      <!-- Hay selection table -->
      <div class="bg-cream rounded-2xl p-6 scroll-reveal">
        <div class="flex items-center gap-2 mb-4">
          <i class="fas fa-leaf text-gold-400"></i>
          <h3 class="font-bold text-navy-700 text-lg">Hay Selection Guide</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-navy-700 text-white">
                <th class="text-left py-2 px-3 rounded-tl-lg text-xs uppercase tracking-wider">Hay Type</th>
                <th class="text-left py-2 px-3 text-xs uppercase tracking-wider">Protein</th>
                <th class="text-left py-2 px-3 rounded-tr-lg text-xs uppercase tracking-wider">Best Suited For</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${[
                ['Premium Alfalfa','15–22%','Hard keepers, lactating mares, young horses'],
                ['Timothy 1st Cut','8–10%','All-around; lower sugar, excellent fiber'],
                ['Timothy 2nd Cut','10–12%','Performance horses; softer, more palatable'],
                ['Orchard Grass','10–12%','Horses that refuse timothy; highly palatable'],
                ['T/A Blend','12–16%','Performance; balances fiber + protein'],
                ['Peanut Hay','14–18%','Underweight horses & growing youngsters'],
                ['Teff Grass','8–10%','Metabolic/IR/Cushings horses — ultra-low NSC'],
              ].map(([type,prot,use],i) => `
              <tr class="${i%2===1?'bg-cream-dark':'bg-white'}">
                <td class="py-2 px-3 font-semibold text-navy-700 text-xs">${type}</td>
                <td class="py-2 px-3 text-xs text-gold-600 font-semibold">${prot}</td>
                <td class="py-2 px-3 text-xs text-gray-600">${use}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-400 mt-3 italic">"We're very picky about our hay — if a shipment isn't up to our standards, we send it back." — Vieri Bracco</p>
      </div>
    </div>

    <!-- South Florida + Pro Tips + Feed Selector row -->
    <div class="grid lg:grid-cols-3 gap-6 mb-8">

      <!-- South Florida specifics -->
      <div class="bg-navy-700 rounded-2xl p-6 scroll-reveal">
        <div class="flex items-center gap-2 mb-4">
          <i class="fas fa-sun text-gold-400"></i>
          <h3 class="font-bold text-white text-base">South Florida Specifics</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="flex gap-3">
            <span class="text-gold-400 mt-0.5 flex-shrink-0">⚡</span>
            <div><strong class="text-white">Electrolytes year-round</strong><p class="text-gray-300 text-xs mt-0.5">Florida heat causes 2–4x more sweat loss than cool climates. Supplement sodium, potassium & chloride daily in summer.</p></div>
          </div>
          <div class="flex gap-3">
            <span class="text-gold-400 mt-0.5 flex-shrink-0">🏜️</span>
            <div><strong class="text-white">Sand colic prevention</strong><p class="text-gray-300 text-xs mt-0.5">Sandy Loxahatchee soil is ingested with every bite off the ground. Feed hay in racks. Use psyllium (SandClear/SandPurge) one week per month.</p></div>
          </div>
          <div class="flex gap-3">
            <span class="text-gold-400 mt-0.5 flex-shrink-0">🦟</span>
            <div><strong class="text-white">Flies never stop</strong><p class="text-gray-300 text-xs mt-0.5">Fly season is year-round here. Combine topical sprays with a feed-through IGR supplement for full-season protection.</p></div>
          </div>
          <div class="flex gap-3">
            <span class="text-gold-400 mt-0.5 flex-shrink-0">🏆</span>
            <div><strong class="text-white">WEF & show stress</strong><p class="text-gray-300 text-xs mt-0.5">Hauling and stabling changes spike ulcer risk. Use gastric buffering supplements before and during show weeks.</p></div>
          </div>
        </div>
      </div>

      <!-- Pro tips -->
      <div class="bg-gold-50 border border-gold-200 rounded-2xl p-6 scroll-reveal" style="background:rgba(201,168,76,0.07)">
        <div class="flex items-center gap-2 mb-4">
          <i class="fas fa-lightbulb text-gold-500"></i>
          <h3 class="font-bold text-navy-700 text-base">Pro Tips from Our Team</h3>
        </div>
        <ul class="space-y-2.5 text-sm">
          ${[
            ['Transition any new feed gradually over 10–14 days to avoid digestive upset.'],
            ['<strong>Weigh, don\'t scoop.</strong> The same scoop of pellets vs. textured feed can differ by 2–3 lbs.'],
            ['Fresh, clean water at all times — horses drink 5–10 gallons daily, more in summer.'],
            ['If hay quality is unknown, add a ration balancer to fill vitamin and mineral gaps.'],
            ['Have your hay tested — NSC levels matter greatly for metabolic horses and visual appearance doesn\'t tell the full story.'],
            ['Not sure what to feed? Call us — we offer free nutritional consultations and barn visits.'],
          ].map(([tip]) => `
          <li class="flex gap-2.5">
            <span class="text-gold-500 font-bold flex-shrink-0 mt-0.5">✓</span>
            <span class="text-gray-700 text-xs leading-relaxed">${tip}</span>
          </li>`).join('')}
        </ul>
      </div>

      <!-- When to call -->
      <div class="bg-orange-50 border-l-4 border-orange-400 rounded-r-2xl p-6 scroll-reveal">
        <div class="flex items-center gap-2 mb-4">
          <i class="fas fa-exclamation-triangle text-orange-500"></i>
          <h3 class="font-bold text-navy-700 text-base">Signs to Watch For</h3>
        </div>
        <p class="text-xs text-gray-600 mb-3">Call your vet or schedule a nutrition consult if you notice:</p>
        <ul class="space-y-1.5 text-xs text-gray-600">
          ${['Sudden weight loss or gain','Poor topline despite adequate feeding','Recurring colic episodes','Loose or dark manure lasting 48+ hours','Coat dullness or excessive shedding','Hoof rings or laminitis signs','Changes in energy, attitude or focus','Difficulty chewing or dropping feed'].map(s=>`<li class="flex gap-2"><span class="text-orange-400 flex-shrink-0">•</span>${s}</li>`).join('')}
        </ul>
        <div class="mt-4 p-3 bg-navy-700 rounded-xl text-white text-xs">
          <i class="fas fa-phone text-gold-400 mr-1"></i>
          <strong>Free barn visits available</strong> — call <strong class="text-gold-400">(561) 633-6003</strong> to schedule a nutritional consultation.
        </div>
      </div>
    </div>

    <!-- ── Feed Finder Questionnaire ── -->
    <div id="feed-finder" class="bg-cream rounded-2xl p-8 shadow-sm border border-gray-100 scroll-reveal">
      <div class="text-center mb-8">
        <div class="inline-flex items-center gap-2 mb-3">
          <div class="h-px w-8 bg-gold-400"></div>
          <span class="text-gold-500 font-semibold text-xs tracking-widest uppercase">Feed Finder</span>
          <div class="h-px w-8 bg-gold-400"></div>
        </div>
        <h3 class="font-serif text-3xl font-bold text-navy-700 mb-2">Not Sure What to Feed?</h3>
        <p class="text-gray-500 text-base">Answer 3 quick questions and we'll recommend the best options for your horse.</p>
        <!-- Progress indicator -->
        <div id="finder-progress" class="flex items-center justify-center gap-2 mt-5">
          <div class="finder-dot active w-8 h-8 rounded-full bg-navy-700 text-white text-xs font-bold flex items-center justify-center transition-all">1</div>
          <div class="h-px w-8 bg-gray-300"></div>
          <div class="finder-dot w-8 h-8 rounded-full bg-gray-200 text-gray-400 text-xs font-bold flex items-center justify-center transition-all">2</div>
          <div class="h-px w-8 bg-gray-300"></div>
          <div class="finder-dot w-8 h-8 rounded-full bg-gray-200 text-gray-400 text-xs font-bold flex items-center justify-center transition-all">3</div>
        </div>
      </div>

      <!-- Step 1: Horse Type -->
      <div id="finder-q1">
        <h4 class="font-bold text-navy-700 text-base mb-4 text-center">
          <span class="text-gold-400 font-serif text-xl mr-1">1.</span> What best describes your horse?
        </h4>
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
            <button onclick="finderQ1('${o.val}')" class="finder-option flex items-center gap-3 p-4 bg-white rounded-xl border-2 border-gray-200 hover:border-navy-700 hover:bg-navy-50 transition-all text-left font-medium text-navy-700">
              <i class="fas ${o.icon} text-gold-400 w-5 text-center"></i>${o.label}
            </button>`).join('')}
        </div>
      </div>

      <!-- Step 2: Primary Goal -->
      <div id="finder-q2" class="hidden">
        <div class="flex items-center gap-2 mb-5">
          <button onclick="finderBack(1)" class="text-sm text-gray-400 hover:text-navy-700 flex items-center gap-1"><i class="fas fa-arrow-left"></i> Back</button>
        </div>
        <h4 class="font-bold text-navy-700 text-base mb-4 text-center">
          <span class="text-gold-400 font-serif text-xl mr-1">2.</span> What is your <em>primary</em> goal or concern?
        </h4>
        <div id="finder-q2-options" class="grid sm:grid-cols-2 gap-3"></div>
      </div>

      <!-- Step 3: Activity Level -->
      <div id="finder-q3" class="hidden">
        <div class="flex items-center gap-2 mb-5">
          <button onclick="finderBack(2)" class="text-sm text-gray-400 hover:text-navy-700 flex items-center gap-1"><i class="fas fa-arrow-left"></i> Back</button>
        </div>
        <h4 class="font-bold text-navy-700 text-base mb-4 text-center">
          <span class="text-gold-400 font-serif text-xl mr-1">3.</span> What is your horse's current activity level?
        </h4>
        <div class="grid sm:grid-cols-2 gap-3">
          ${[
            {val:'light',label:'Light — trail rides, occasional arena work',icon:'fa-walking'},
            {val:'moderate',label:'Moderate — regular training, local shows',icon:'fa-horse'},
            {val:'intense',label:'Intense — competition, heavy daily work',icon:'fa-bolt'},
            {val:'retired',label:'Retired / Pasture only',icon:'fa-tree'},
          ].map(o=>`
            <button onclick="finderQ3('${o.val}')" class="finder-option flex items-center gap-3 p-4 bg-white rounded-xl border-2 border-gray-200 hover:border-navy-700 hover:bg-navy-50 transition-all text-left font-medium text-navy-700">
              <i class="fas ${o.icon} text-gold-400 w-5 text-center"></i>${o.label}
            </button>`).join('')}
        </div>
      </div>

      <!-- Results -->
      <div id="finder-results" class="hidden">
        <div class="flex items-center gap-3 mb-6">
          <button onclick="resetFinder()" class="text-sm text-gray-400 hover:text-navy-700 flex items-center gap-1"><i class="fas fa-arrow-left"></i> Start over</button>
          <h4 class="font-bold text-navy-700 text-lg">Recommended for Your Horse</h4>
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
            <button onclick="openDeliveryModal()"
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
          <li><a href="#guidelines" class="hover:text-gold-400 transition-colors">Feeding Guide</a></li>
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
// ─── Feed Finder (3-step questionnaire) ──────────────────────────────────────
const finderState = { q1: null, q2: null };

// Q2 options per horse type
const finderQ2Options = {
  competition: [
    {val:'energy',      label:'Sustained energy & stamina',      icon:'fa-bolt'},
    {val:'muscle',      label:'Topline & muscle development',     icon:'fa-dumbbell'},
    {val:'recovery',    label:'Faster recovery after work',       icon:'fa-redo'},
    {val:'gut',         label:'Gut health / ulcer prevention',    icon:'fa-stethoscope'},
  ],
  senior: [
    {val:'digestion',   label:'Easier digestion & dental support',icon:'fa-tooth'},
    {val:'weight',      label:'Maintain or gain weight',          icon:'fa-balance-scale'},
    {val:'joints',      label:'Joint & mobility support',         icon:'fa-running'},
    {val:'overall',     label:'All-round senior health',          icon:'fa-heart'},
  ],
  easy: [
    {val:'lowstarch',   label:'Low NSC / insulin management',     icon:'fa-tint'},
    {val:'minerals',    label:'Vitamins & minerals without calories',icon:'fa-capsules'},
    {val:'calming',     label:'Calming & focus',                  icon:'fa-brain'},
    {val:'coat',        label:'Coat & hoof quality',              icon:'fa-star'},
  ],
  hard: [
    {val:'weightgain',  label:'Safe weight gain',                 icon:'fa-arrow-up'},
    {val:'highfat',     label:'High-fat / high-calorie feed',     icon:'fa-fire'},
    {val:'topline',     label:'Build topline & muscle',           icon:'fa-dumbbell'},
    {val:'gut',         label:'Gut health support during gain',   icon:'fa-stethoscope'},
  ],
  young: [
    {val:'growth',      label:'Bone & muscle development',        icon:'fa-bone'},
    {val:'balancer',    label:'Ration balancer (low calorie)',     icon:'fa-balance-scale'},
    {val:'foal',        label:'Foal / weanling specific',         icon:'fa-baby'},
    {val:'broodmare',   label:'Pregnant or lactating mare',       icon:'fa-female'},
  ],
  broodmare: [
    {val:'pregnant',    label:'Pregnant mare nutrition',          icon:'fa-baby'},
    {val:'lactating',   label:'Lactating / nursing mare',         icon:'fa-heart'},
    {val:'balancer',    label:'Pasture balancer',                 icon:'fa-leaf'},
    {val:'protein',     label:'High protein & calcium',           icon:'fa-capsules'},
  ],
  endurance: [
    {val:'stamina',     label:'Long-distance stamina',            icon:'fa-route'},
    {val:'electrolytes',label:'Electrolyte & hydration support',  icon:'fa-tint'},
    {val:'fatfuel',     label:'Fat-based slow energy',            icon:'fa-fire'},
    {val:'recovery',    label:'Post-ride recovery',               icon:'fa-redo'},
  ],
  digestive: [
    {val:'ulcer',       label:'Ulcer risk / gastric sensitivity', icon:'fa-fire-alt'},
    {val:'colic',       label:'Colic prevention',                 icon:'fa-exclamation-triangle'},
    {val:'microbiome',  label:'Gut microbiome support',           icon:'fa-bacteria'},
    {val:'mash',        label:'Easy-digest / recovery mash',      icon:'fa-blender'},
  ],
};

// Recommendation database keyed by [q1][q2][activity]
const finderRecs = {
  competition: {
    energy: {
      light:    [{brand:'Cavalor Performix',desc:'Premium muesli for sport horses — puffed & extruded cereals for optimal digestibility and sustained energy.',tags:['Performance']},{brand:'Red Mills Horse Care 14',desc:'14% protein mix suited for moderate training and local shows with good digestibility.',tags:['Performance']}],
      moderate: [{brand:'Cavalor Performix',desc:'Level 5 formula with puffed & extruded cereals — ideal for horses in regular training.',tags:['Performance']},{brand:'Havens Performance 14',desc:'Complete 14% protein muesli for jumping, dressage, or eventing.',tags:['Performance','Muesli']}],
      intense:  [{brand:'Pro Elite Performance',desc:'High-fat beet-pulp textured feed for peak stamina, muscle strength and endurance. Guaranteed amino acids.',tags:['Performance','Show Horse']},{brand:'Red Mills Competition 14',desc:'High-energy 14% protein mix for horses in intense competition training.',tags:['Competition','High Protein']},{brand:'Cavalor Performix',desc:'Level 5 puffed & extruded formula maximising energy output for hard-working sport horses.',tags:['Performance']}],
      retired:  [{brand:'Havens Natural Balance',desc:'Balanced muesli providing steady energy — ideal for lightly worked ex-competition horses.',tags:['Balanced']}],
    },
    muscle: {
      light:    [{brand:'Cavalor Muscle Force',desc:'Targeted amino acid supplement to build and maintain topline for horses in light work.',tags:['Muscle','Supplement']}],
      moderate: [{brand:'Pro Elite Topline Advantage',desc:'Lysine, methionine & threonine blend specifically targeting topline and muscle building.',tags:['Topline','Muscle']}],
      intense:  [{brand:'Pro Elite Performance',desc:'Complete performance feed with guaranteed amino acids for muscle synthesis and topline.',tags:['Performance','Topline']},{brand:'Pro Elite Topline Advantage',desc:'High-quality amino acid concentrate to accelerate muscle and topline development.',tags:['Topline']}],
      retired:  [{brand:'Cavalor Muscle Force',desc:'Amino acid supplement to preserve muscle mass in retired horses.',tags:['Muscle']}],
    },
    recovery: {
      light:    [{brand:'Cavalor Endurix',desc:'L-carnitine formula supporting fat metabolism and faster recovery between work sessions.',tags:['Recovery']}],
      moderate: [{brand:'Cavalor Endurix',desc:'Energy-dense muesli with L-carnitine for improved recovery and stamina.',tags:['Recovery','Stamina']}],
      intense:  [{brand:'Cavalor Endurix',desc:'Elite recovery support — L-carnitine, antioxidants, electrolytes for hard-working competition horses.',tags:['Recovery','Endurance']},{brand:'Pro Elite Performance',desc:'Rich in vitamin E and omega-3s for post-competition muscle recovery.',tags:['Recovery']}],
      retired:  [{brand:'Cavalor Strucomix Original',desc:'Gentle fibre-rich muesli supporting overall wellbeing in retired horses.',tags:['Maintenance']}],
    },
    gut: {
      light:    [{brand:'Cavalor FiberGastro',desc:'High-fiber, low-starch formula with natural gastric buffering — excellent for ulcer-prone horses.',tags:['Gastric','Ulcer']}],
      moderate: [{brand:'Cavalor FiberGastro',desc:'Gastric buffering formula keeping gut health stable during regular training.',tags:['Gastric']}],
      intense:  [{brand:'Cavalor FiberGastro',desc:'Intensive gastric support for show horses under travel and competition stress.',tags:['Gastric','Ulcer']},{brand:'Havens Gastro Plus',desc:'Prebiotics & probiotics to maintain gut balance during intense competition schedules.',tags:['Gut Health']}],
      retired:  [{brand:'Cavalor FiberForce',desc:'High-fibre complete feed supporting digestive health in retired horses.',tags:['Fibre','Gut']}],
    },
  },
  senior: {
    digestion: {
      light:    [{brand:'Nutrena SafeChoice Senior',desc:'High-fat, controlled-starch formula with Digestive Shield™ — ideal for older horses needing easy digestion.',tags:['Senior','Digestive Shield']}],
      moderate: [{brand:'Nutrena SafeChoice Senior',desc:'Digestive Shield™ technology supports hindgut health for senior horses in light to moderate work.',tags:['Senior']}],
      intense:  [{brand:'Buckeye EQ8 Senior',desc:'Gut health support system combined with high fiber and energy for active senior horses.',tags:['Senior','Gut Health']}],
      retired:  [{brand:'Cavalor Strucomix Senior',desc:'Long alfalfa fibres stimulate chewing and digestion — perfect for retired seniors.',tags:['Senior','Fibre']}],
    },
    weight: {
      light:    [{brand:'Nutrena SafeChoice Senior',desc:'Complete nutrition formula helping seniors maintain healthy body condition.',tags:['Senior','Complete Feed']}],
      moderate: [{brand:'Pro Elite Senior',desc:'Low-starch textured feed for seniors needing to maintain weight during regular activity.',tags:['Senior']}],
      intense:  [{brand:'Buckeye EQ8 Senior',desc:'Higher-calorie senior formula with gut support for active older horses.',tags:['Senior','High Fiber']}],
      retired:  [{brand:'Cavalor Strucomix Senior',desc:'Easy-to-eat fibre muesli for retired seniors with lower calorie needs.',tags:['Senior']}],
    },
    joints: {
      light:    [{brand:'Buckeye EQ8 Senior',desc:'Comprehensive joint and gut support in one senior-specific feed.',tags:['Senior','Joint']}],
      moderate: [{brand:'Buckeye EQ8 Senior',desc:'Active senior support: joint health, gut balance and sustained energy.',tags:['Senior','Joint']}],
      intense:  [{brand:'Buckeye EQ8 Senior',desc:'Full-spectrum senior nutrition — joints, gut, energy for competition-level older horses.',tags:['Senior']}],
      retired:  [{brand:'Cavalor Strucomix Senior',desc:'Gentle muesli with long fibre and joint-friendly nutrients for retired seniors.',tags:['Senior']}],
    },
    overall: {
      light:    [{brand:'Nutrena SafeChoice Senior',desc:'All-in-one senior formula — complete, balanced and easy to digest.',tags:['Senior','Complete']},{brand:'Pro Elite Senior',desc:'Textured senior feed addressing metabolic, dental and digestive needs.',tags:['Senior']}],
      moderate: [{brand:'Buckeye EQ8 Senior',desc:'Multi-dimensional senior health: digestion, joints, energy.',tags:['Senior','Gut Health']}],
      intense:  [{brand:'Buckeye EQ8 Senior',desc:'Full-spectrum active senior nutrition.',tags:['Senior']},{brand:'Cavalor Strucomix Senior',desc:'European-style fibre muesli for the hardworking senior horse.',tags:['Senior']}],
      retired:  [{brand:'Cavalor Strucomix Senior',desc:'Retirement-focused fibre muesli: easy to eat, easy to digest.',tags:['Senior']},{brand:'Nutrena SafeChoice Senior',desc:'Complete senior maintenance at any activity level.',tags:['Senior']}],
    },
  },
  easy: {
    lowstarch: {
      light:    [{brand:'Nutrena SafeChoice Special Care',desc:'Only 10% NSC — lowest starch formula for insulin-resistant horses and easy keepers. Digestive Shield™.',tags:['Low NSC','Metabolic']}],
      moderate: [{brand:'Pro Elite Starch Wise',desc:'Low starch and sugar, corn-free pellet for metabolic horses in moderate work.',tags:['Metabolic','Low Starch']}],
      intense:  [{brand:'Pro Elite Starch Wise',desc:'Performance-supporting yet low-starch formula — critical for IR horses in heavy work.',tags:['Low Starch','Metabolic']},{brand:'Nutrena SafeChoice Special Care',desc:'Ultra-low NSC with Digestive Shield™ even for horses in active competition.',tags:['Low NSC']}],
      retired:  [{brand:'Nutrena SafeChoice Special Care',desc:'Pasture & retirement management for metabolic horses — ultra-low NSC.',tags:['Easy Keeper','Low NSC']}],
    },
    minerals: {
      light:    [{brand:'Pro Elite Grass Advantage',desc:'Ration balancer providing vitamins and minerals without excess calories — ideal for easy keepers on good pasture.',tags:['Balancer','Easy Keeper']}],
      moderate: [{brand:'Pro Elite Grass Advantage',desc:'Low-rate balancer ensuring micronutrient coverage for horses in moderate work.',tags:['Balancer']}],
      intense:  [{brand:'Pro Elite Grass Advantage',desc:'Minerals and vitamins concentrated for performance without adding starch.',tags:['Balancer','Performance']}],
      retired:  [{brand:'Pro Elite Grass Advantage',desc:'Pasture balancer perfect for retired easy keepers needing nutrients without calories.',tags:['Balancer','Easy Keeper']}],
    },
    calming: {
      light:    [{brand:'Cavalor Pianissimo',desc:'Calming muesli with low sugar for sensitive or excitable horses.',tags:['Calming','Low Sugar']}],
      moderate: [{brand:'Cavalor Pianissimo',desc:'Keeps energy steady and behaviour calm during regular training.',tags:['Calming']}],
      intense:  [{brand:'Cavalor Pianissimo',desc:'Calming formula for metabolically sensitive horses in competition environments.',tags:['Calming','Show']}],
      retired:  [{brand:'Cavalor Pianissimo',desc:'Gentle calming muesli for retired horses prone to excitability.',tags:['Calming']}],
    },
    coat: {
      light:    [{brand:'Pro Elite Omega Advantage',desc:'24% fat supplement boosting coat shine and hoof quality.',tags:['Coat','Omega']}],
      moderate: [{brand:'Pro Elite Omega Advantage',desc:'High-fat supplement for visible coat and hoof improvement in working horses.',tags:['Coat','Omega']}],
      intense:  [{brand:'Pro Elite Omega Advantage',desc:'Omega-rich fat supplement — coat, hoof and anti-inflammatory support for active horses.',tags:['Coat','Omega','Anti-inflammatory']}],
      retired:  [{brand:'Pro Elite Omega Advantage',desc:'Keep retired horses looking their best with omega-3 and vitamin E support.',tags:['Coat']}],
    },
  },
  hard: {
    weightgain: {
      light:    [{brand:'Cavalor WholyGain',desc:'High-quality fats and proteins for safe weight gain in easy-going horses.',tags:['Weight Gain']}],
      moderate: [{brand:'Buckeye Cadence Ultra',desc:'Calorie-dense sweet pelleted feed for moderate-work hard keepers.',tags:['Weight Gain','High Calorie']}],
      intense:  [{brand:'Pro Elite Omega Advantage',desc:'24% fat extruded pellet for dramatic weight and condition gains in hard-working horses.',tags:['Weight Gain','High Fat']},{brand:'Havens Power Plus Mix',desc:'High-energy power muesli for horses struggling to maintain weight under heavy workload.',tags:['Hard Keeper','High Energy']}],
      retired:  [{brand:'Cavalor WholyGain',desc:'Concentrated weight support for retired horses losing condition.',tags:['Weight Gain']}],
    },
    highfat: {
      light:    [{brand:'Cavalor WholyGain',desc:'Concentrated fat and protein blend for safe calorie addition.',tags:['High Fat']}],
      moderate: [{brand:'Havens Power Plus Mix',desc:'High-fat power muesli sustaining moderate-work hard keepers.',tags:['High Fat','Hard Keeper']}],
      intense:  [{brand:'Pro Elite Omega Advantage',desc:'24% fat + vitamin E — maximum calorie density for competition hard keepers.',tags:['High Fat','Performance']},{brand:'Buckeye Cadence Ultra',desc:'Sweet pelleted high-calorie feed for intensely working hard keepers.',tags:['High Calorie']}],
      retired:  [{brand:'Cavalor WholyGain',desc:'Gentle high-fat supplement for retired horses.',tags:['High Fat']}],
    },
    topline: {
      light:    [{brand:'Pro Elite Topline Advantage',desc:'Targeted amino acids (lysine, methionine, threonine) to build topline in light-work horses.',tags:['Topline']}],
      moderate: [{brand:'Pro Elite Topline Advantage',desc:'Topline building amino acid blend for horses in regular training.',tags:['Topline','Muscle']}],
      intense:  [{brand:'Pro Elite Performance',desc:'Full performance feed with amino acids and energy to support topline in hard-working horses.',tags:['Topline','Performance']},{brand:'Pro Elite Topline Advantage',desc:'Stack with base feed for accelerated topline development.',tags:['Topline']}],
      retired:  [{brand:'Cavalor Muscle Force',desc:'Maintain topline and muscle in retired horses with targeted amino acids.',tags:['Topline','Retired']}],
    },
    gut: {
      light:    [{brand:'Cavalor FiberGastro',desc:'High-fiber, low-starch formula protecting gut health while adding safe nutrition.',tags:['Gastric','Gut']}],
      moderate: [{brand:'Cavalor FiberForce',desc:'Fibre-rich complete feed supporting hindgut health in moderate-work hard keepers.',tags:['Fibre','Gut']}],
      intense:  [{brand:'Cavalor FiberGastro',desc:'Gastric buffering with high fibre — critical during intensive weight-gain programmes.',tags:['Gastric','Fibre']},{brand:'Havens Gastro Plus',desc:'Probiotics and prebiotics maintaining microbiome balance in horses gaining weight.',tags:['Gut','Probiotics']}],
      retired:  [{brand:'Cavalor FiberForce',desc:'Comprehensive fibre support for retired hard keepers.',tags:['Fibre','Gut']}],
    },
  },
  young: {
    growth: {
      light:    [{brand:'Pro Elite Growth',desc:'Balanced amino acids for healthy bone and muscle development in young horses.',tags:['Growing','Foals']}],
      moderate: [{brand:'Pro Elite Growth',desc:'Textured growing horse feed for young horses in light training.',tags:['Growing']}],
      intense:  [{brand:'Pro Elite Growth',desc:'Complete growth formula supporting young competition horses in intense work.',tags:['Growing','Performance']}],
      retired:  [{brand:'Buckeye Gro-N-Win',desc:'Ration balancer for young horses at pasture needing nutrients without excess calories.',tags:['Growing','Balancer']}],
    },
    balancer: {
      light:    [{brand:'Buckeye Gro-N-Win',desc:'Low-rate ration balancer fortifying pasture and hay for easy-keeper youngsters.',tags:['Balancer','Growing']}],
      moderate: [{brand:'Buckeye Gro-N-Win',desc:'Essential nutrients without excess energy for growing horses in moderate work.',tags:['Balancer']}],
      intense:  [{brand:'Pro Elite Growth',desc:'Full-spectrum growth nutrition for young horses in active training.',tags:['Growing','Performance']}],
      retired:  [{brand:'Buckeye Gro-N-Win',desc:'Pasture balancer ensuring growing horses get what hay alone cannot provide.',tags:['Balancer']}],
    },
    foal: {
      light:    [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Controlled starch pelleted formula for weanlings and yearlings with Digestive Shield™.',tags:['Foal','Growing']}],
      moderate: [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Supports foal development alongside early light groundwork.',tags:['Foal']}],
      intense:  [{brand:'Pro Elite Growth',desc:'Performance-oriented growth formula for foals entering early training.',tags:['Foal','Performance']}],
      retired:  [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Complete nutrition for pasture foals.',tags:['Foal']}],
    },
    broodmare: {
      light:    [{brand:'Nutrena SafeChoice Mare & Foal',desc:'16% protein controlled-starch formula for pregnant or lactating mares.',tags:['Mare','Broodmare']}],
      moderate: [{brand:'Pro Elite Growth',desc:'Covers nutritional needs of both mare and foal in moderate-work scenarios.',tags:['Mare','Foal']}],
      intense:  [{brand:'Red Mills Horse Care 14',desc:'14% protein complete diet supporting reproductive performance.',tags:['Broodmare','14% Protein']}],
      retired:  [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Pasture broodmare nutrition — complete and balanced.',tags:['Mare']}],
    },
  },
  broodmare: {
    pregnant: {
      light:    [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Complete controlled-starch formula supporting pregnant mares throughout gestation.',tags:['Pregnant','Mare']}],
      moderate: [{brand:'Pro Elite Growth',desc:'Textured feed with balanced amino acids for pregnant mares in moderate work.',tags:['Pregnant']}],
      intense:  [{brand:'Red Mills Horse Care 14',desc:'High-protein formula for intensely worked pregnant mares.',tags:['Pregnant','High Protein']}],
      retired:  [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Gentle complete nutrition for pasture pregnant mares.',tags:['Pregnant']}],
    },
    lactating: {
      light:    [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Supports milk production and mare recovery — high protein and calcium.',tags:['Lactating','Mare']}],
      moderate: [{brand:'Pro Elite Growth',desc:'Fuels milk production and supports mare condition during nursing.',tags:['Lactating']}],
      intense:  [{brand:'Red Mills Horse Care 14',desc:'14% protein for high-demand lactating mares in active use.',tags:['Lactating','High Protein']}],
      retired:  [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Pasture nutrition supporting milk production.',tags:['Lactating']}],
    },
    balancer: {
      light:    [{brand:'Pro Elite Grass Advantage',desc:'Ration balancer for broodmares on good pasture — nutrients without excess calories.',tags:['Balancer','Broodmare']}],
      moderate: [{brand:'Pro Elite Grass Advantage',desc:'Mineral and vitamin coverage for working broodmares on forage.',tags:['Balancer']}],
      intense:  [{brand:'Nutrena SafeChoice Mare & Foal',desc:'Complete nutrition when pasture alone is not enough.',tags:['Broodmare','Complete']}],
      retired:  [{brand:'Pro Elite Grass Advantage',desc:'Low-rate pasture balancer for retired broodmares.',tags:['Balancer']}],
    },
    protein: {
      light:    [{brand:'Nutrena SafeChoice Mare & Foal',desc:'16% protein controlled-starch formula — balanced calcium for bone development.',tags:['High Protein','Calcium']}],
      moderate: [{brand:'Red Mills Horse Care 14',desc:'14% protein breeding stock formula.',tags:['High Protein']}],
      intense:  [{brand:'Red Mills Horse Care 14',desc:'High protein and energy for actively worked broodmares.',tags:['High Protein','Performance']}],
      retired:  [{brand:'Pro Elite Growth',desc:'Amino acid-rich pasture supplement for broodmares.',tags:['Protein']}],
    },
  },
  endurance: {
    stamina: {
      light:    [{brand:'Havens Natural Balance',desc:'Steady, long-lasting energy for trail horses in light recreational work.',tags:['Trail','Balanced']}],
      moderate: [{brand:'Cavalor Endurix',desc:'L-carnitine formula supporting fat metabolism and sustained stamina.',tags:['Endurance','Stamina']}],
      intense:  [{brand:'Havens Endurance',desc:'Purpose-built for long-distance endurance — high fibre and slow-release energy.',tags:['Endurance','Long Distance']},{brand:'Cavalor Endurix',desc:'Energy-dense with L-carnitine for elite endurance horses.',tags:['Endurance','Performance']}],
      retired:  [{brand:'Havens Natural Balance',desc:'Balanced muesli for retired endurance horses maintaining light fitness.',tags:['Balanced']}],
    },
    electrolytes: {
      light:    [{brand:'Havens Natural Balance',desc:'Balanced muesli — pair with an electrolyte supplement for Florida trail riding.',tags:['Trail','Balanced']}],
      moderate: [{brand:'Cavalor Endurix',desc:'Includes electrolyte support — ideal for moderate-distance Florida riding.',tags:['Electrolytes','Endurance']}],
      intense:  [{brand:'Havens Endurance',desc:'High-fibre endurance feed — pair with Cavalor Electroliq Sweat for intensive hydration management.',tags:['Endurance','Electrolytes']}],
      retired:  [{brand:'Havens Natural Balance',desc:'Maintenance muesli with electrolyte supplement support.',tags:['Balanced']}],
    },
    fatfuel: {
      light:    [{brand:'Havens Natural Balance',desc:'Fat-based steady energy for trail horses.',tags:['Fat Fuel']}],
      moderate: [{brand:'Cavalor Endurix',desc:'L-carnitine enhances fat utilisation — ideal fat-fuel formula.',tags:['Fat Fuel','Endurance']}],
      intense:  [{brand:'Havens Endurance',desc:'High-fibre, fat-fuelled formula designed for competition endurance horses.',tags:['Fat Fuel','Long Distance']}],
      retired:  [{brand:'Cavalor Strucomix Original',desc:'Fibre muesli providing fat-based maintenance energy for retired horses.',tags:['Fat Fuel']}],
    },
    recovery: {
      light:    [{brand:'Cavalor Endurix',desc:'L-carnitine and antioxidants to aid recovery after trail rides.',tags:['Recovery']}],
      moderate: [{brand:'Cavalor Endurix',desc:'Post-ride recovery support with muscle-protecting antioxidants.',tags:['Recovery']}],
      intense:  [{brand:'Havens Endurance',desc:'High fibre sustains hindgut bacteria critical for endurance recovery.',tags:['Recovery','Endurance']},{brand:'Cavalor Endurix',desc:'Elite recovery blend for competition endurance horses.',tags:['Recovery']}],
      retired:  [{brand:'Cavalor Strucomix Original',desc:'Gentle maintenance and recovery support for retired endurance horses.',tags:['Recovery','Retired']}],
    },
  },
  digestive: {
    ulcer: {
      light:    [{brand:'Cavalor FiberGastro',desc:'High-fibre, low-starch formula with natural gastric buffering — first choice for ulcer-prone horses.',tags:['Gastric','Ulcer']}],
      moderate: [{brand:'Cavalor FiberGastro',desc:'Sustained gastric protection for horses in regular training.',tags:['Gastric','Ulcer']}],
      intense:  [{brand:'Cavalor FiberGastro',desc:'Intensive gastric protection for show and competition horses under stress.',tags:['Gastric','Show']},{brand:'Havens Gastro Plus',desc:'Probiotics and prebiotics to maintain gut balance during intense schedules.',tags:['Gut','Probiotics']}],
      retired:  [{brand:'Cavalor FiberForce',desc:'High-fibre complete maintenance feed for retired ulcer-history horses.',tags:['Fibre','Gut']}],
    },
    colic: {
      light:    [{brand:'Cavalor FiberForce',desc:'Fibre-rich complete feed reducing colic risk in horses on limited turnout.',tags:['Fibre','Colic Prevention']}],
      moderate: [{brand:'Cavalor FiberGastro',desc:'High fibre and low starch minimises colic risk during regular work.',tags:['Fibre','Colic']}],
      intense:  [{brand:'Cavalor FiberGastro',desc:'Comprehensive fibre and gastric support reducing colic risk in competition horses.',tags:['Fibre','Gastric']}],
      retired:  [{brand:'Cavalor FiberForce',desc:'High-fibre retirement diet — colic prevention through consistent forage support.',tags:['Fibre','Retired']}],
    },
    microbiome: {
      light:    [{brand:'Havens Gastro Plus',desc:'Prebiotics and probiotics supporting a healthy gut microbiome.',tags:['Probiotics','Gut Health']}],
      moderate: [{brand:'Buckeye EQ8 Performance',desc:'Pre-, pro- and postbiotics combined in an extruded feed for optimal microbiome balance.',tags:['Gut Health','Extruded']}],
      intense:  [{brand:'Buckeye EQ8 Performance',desc:'Full-spectrum gut microbiome support for competition horses.',tags:['Gut Health','Performance']},{brand:'Havens Gastro Plus',desc:'Pre- and probiotic gastro support during high-stress schedules.',tags:['Probiotics']}],
      retired:  [{brand:'Havens Gastro Plus',desc:'Gentle microbiome support for retired horses.',tags:['Probiotics','Retired']}],
    },
    mash: {
      light:    [{brand:'Red Mills Comfort Mash',desc:'Easy-to-digest mash — ideal for horses recovering from illness, dental challenges or surgery.',tags:['Recovery','Mash']}],
      moderate: [{brand:'Red Mills Comfort Mash',desc:'Gentle mash supporting gut health during moderate work.',tags:['Mash']}],
      intense:  [{brand:'Red Mills Comfort Mash',desc:'Recovery mash providing calories and nutrients for hard-working sensitive horses.',tags:['Mash','Recovery']}],
      retired:  [{brand:'Red Mills Comfort Mash',desc:'Soft easy-digest mash perfect for retired or dental-challenged horses.',tags:['Mash','Retired']}],
    },
  },
};

function finderSetStep(step) {
  ['finder-q1','finder-q2','finder-q3','finder-results'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  if (step >= 1) document.getElementById('finder-q1').classList.remove('hidden');
  if (step >= 2) { document.getElementById('finder-q1').classList.add('hidden'); document.getElementById('finder-q2').classList.remove('hidden'); }
  if (step >= 3) { document.getElementById('finder-q2').classList.add('hidden'); document.getElementById('finder-q3').classList.remove('hidden'); }
  if (step === 4) { document.getElementById('finder-q3').classList.add('hidden'); document.getElementById('finder-results').classList.remove('hidden'); }
  // Update progress dots
  document.querySelectorAll('.finder-dot').forEach((dot, i) => {
    dot.classList.toggle('bg-navy-700', i < step && step <= 3);
    dot.classList.toggle('text-white', i < step && step <= 3);
    dot.classList.toggle('bg-gold-400', step === 4 && i < 3);
    dot.classList.toggle('bg-gray-200', !(i < step && step <= 3) && !(step === 4 && i < 3));
    dot.classList.toggle('text-gray-400', !(i < step && step <= 3));
  });
}

function finderQ1(type) {
  finderState.q1 = type;
  finderState.q2 = null;
  // Populate Q2 options
  const opts = finderQ2Options[type] || [];
  document.getElementById('finder-q2-options').innerHTML = opts.map(o => \`
    <button onclick="finderQ2('\${o.val}')" class="finder-option flex items-center gap-3 p-4 bg-white rounded-xl border-2 border-gray-200 hover:border-navy-700 hover:bg-navy-50 transition-all text-left font-medium text-navy-700">
      <i class="fas \${o.icon} text-gold-400 w-5 text-center"></i>\${o.label}
    </button>\`).join('');
  finderSetStep(2);
}

function finderQ2(goal) {
  finderState.q2 = goal;
  finderSetStep(3);
}

function finderQ3(activity) {
  const q1 = finderState.q1, q2 = finderState.q2;
  const recs = (finderRecs[q1] && finderRecs[q1][q2] && finderRecs[q1][q2][activity]) || [];
  const html = recs.length
    ? recs.map(r=>\`
    <div class="bg-cream rounded-xl p-5 border border-gray-200">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="font-bold text-navy-700">\${r.brand}</div>
        <div class="flex flex-wrap gap-1 justify-end">\${r.tags.map(t=>\`<span class="tag tag-perf text-xs">\${t}</span>\`).join('')}</div>
      </div>
      <p class="text-sm text-gray-600">\${r.desc}</p>
    </div>\`).join('')
    : \`<div class="bg-cream rounded-xl p-5 border border-gray-200 text-gray-600 text-sm">We'd love to help you personally — call <strong>(561) 633-6003</strong> or chat with Bri below for a custom recommendation.</div>\`;
  document.getElementById('finder-recs').innerHTML = html;
  finderSetStep(4);
}

function finderBack(toStep) {
  finderSetStep(toStep);
}

function resetFinder(){
  finderState.q1 = null; finderState.q2 = null;
  finderSetStep(1);
}
// Legacy alias kept for any inline onclick references
function selectHorse(type){ finderQ1(type); }

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

// Holds the active schedule (default or from KV)
let ACTIVE_DELIVERY_SCHEDULE = DEFAULT_DELIVERY_SCHEDULE;

function renderDeliverySchedule(raw) {
  let days = DEFAULT_DELIVERY_SCHEDULE;
  if (raw) {
    try {
      const parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length) days = parsed;
    } catch(_) {}
  }
  ACTIVE_DELIVERY_SCHEDULE = days;
  // Also populate modal if it's already open
  const el = document.getElementById('delivery-schedule-days');
  if (el) el.innerHTML = buildScheduleHTML(days);
}

function buildScheduleHTML(days) {
  return days.map(d => \`
    <div class="delivery-day">
      <span class="delivery-day-name">\${d.day}</span>
      <span style="color:rgba(255,255,255,0.8);">\${d.areas}</span>
    </div>
  \`).join('');
}

function openDeliveryModal() {
  const el = document.getElementById('delivery-schedule-days');
  if (el) el.innerHTML = buildScheduleHTML(ACTIVE_DELIVERY_SCHEDULE);
  document.getElementById('delivery-modal-overlay').classList.add('open');
}

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
function getCatalogPrintHTML(_liveProducts: any[]): string {
  const year = new Date().getFullYear()
  const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Category display order (priority first, rest alphabetically after)
  const CAT_ORDER = [
    'Shavings & Bedding',
    'Hay',
    'Hay Cubes & Pellets',
    'Horse Feed',
    'Supplements',
    'Fly Sprays',
    'Fly Control Supplements',
    'Electrolytes',
    'Gut Health',
    'Psyllium Supplements',
    'Oils',
    'Grooming',
    'Shampoo & Coat Care',
    'Liniments & Topicals',
    'Clippers & Tools',
    'Leather Care',
  ]

  const CAT_META: Record<string, { color: string; accent: string; label: string }> = {
    'Horse Feed':               { color: '#1B2A4A', accent: '#C9A84C', label: 'Horse Feed' },
    'Supplements':              { color: '#2E5339', accent: '#7FBF8E', label: 'Supplements' },
    'Hay':                      { color: '#4A6741', accent: '#A8C97F', label: 'Hay' },
    'Hay Cubes & Pellets':      { color: '#4A6741', accent: '#A8C97F', label: 'Hay Cubes & Pellets' },
    'Shavings & Bedding':       { color: '#5C4A1E', accent: '#C9A84C', label: 'Shavings & Bedding' },
    'Fly Sprays':               { color: '#5C2E1E', accent: '#E8956A', label: 'Fly Sprays' },
    'Fly Control Supplements':  { color: '#5C2E1E', accent: '#E8956A', label: 'Fly Control Supplements' },
    'Grooming':                 { color: '#3B2A5C', accent: '#B89FE8', label: 'Grooming' },
    'Shampoo & Coat Care':      { color: '#3B2A5C', accent: '#B89FE8', label: 'Shampoo & Coat Care' },
    'Clippers & Tools':         { color: '#1E3A5C', accent: '#7FB5E8', label: 'Clippers & Tools' },
    'Liniments & Topicals':     { color: '#5C1E1E', accent: '#E88F8F', label: 'Liniments & Topicals' },
    'Electrolytes':             { color: '#1A4055', accent: '#7FC9E8', label: 'Electrolytes' },
    'Gut Health':               { color: '#4A2A5C', accent: '#C97FE8', label: 'Gut Health' },
    'Psyllium Supplements':     { color: '#1E5C3A', accent: '#7FE8B5', label: 'Psyllium Supplements' },
    'Oils':                     { color: '#5C4A00', accent: '#E8C97F', label: 'Oils' },
    'Leather Care':             { color: '#4A2A1E', accent: '#C9956A', label: 'Leather Care' },
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>British Feed & Supplies — Product Catalog ${year}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Nunito+Sans:wght@300;400;600;700;800&display=swap" rel="stylesheet"/>
<style>
/* ═══ PRINT COLOR FIX — the #1 reason pages go white ════════════════ */
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }

/* ═══ RESET ══════════════════════════════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 10pt; }
body { font-family: 'Nunito Sans', sans-serif; color: #1a1a2e; background: #d0d0d0; }

/* ═══ PAGE SETUP ═════════════════════════════════════════════════════ */
/* Single @page rule — size + zero margins */
@page { size: 8.5in 11in; margin: 0; }
@media print {
  html, body { background: white !important; }
  .no-print { display: none !important; }
  /* Every .page div = exactly one sheet */
  .page { page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  a { color: inherit !important; text-decoration: none !important; }
  .print-bar { display: none !important; }
  .loading-overlay { display: none !important; }
  body { padding-top: 0 !important; }
}

/* ═══ PAGE SHELL ═════════════════════════════════════════════════════ */
.page {
  width: 8.5in;
  height: 11in;
  position: relative;
  overflow: hidden;
  background: #ffffff;
  display: flex;
  flex-direction: column;
}
/* cat-page inherits .page (height:11in, overflow:hidden) — JS splits content into pages */
@media screen {
  .page {
    margin: 0 auto 32px auto;
    box-shadow: 0 6px 32px rgba(0,0,0,0.22);
  }
  body { padding: 80px 20px 40px; }
  .loading-overlay {
    position: fixed; inset: 0; background: rgba(27,42,74,0.93); z-index: 1000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #fff; font-family: 'Nunito Sans', sans-serif;
  }
  .loading-overlay h2 { font-size: 22px; margin-bottom: 10px; color: #C9A84C; }
  .loading-overlay p  { opacity: 0.75; font-size: 14px; }
  .spinner {
    width: 48px; height: 48px; border: 4px solid rgba(201,168,76,0.3);
    border-top-color: #C9A84C; border-radius: 50%;
    animation: spin 0.9s linear infinite; margin-bottom: 20px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
}

/* ═══ PRINT BAR (screen only) ════════════════════════════════════════ */
.print-bar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 999;
  background: #1B2A4A; color: #fff; padding: 12px 24px;
  display: flex; align-items: center; justify-content: space-between;
  font-family: 'Nunito Sans', sans-serif; font-size: 13px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.bar-left { display: flex; align-items: center; gap: 16px; }
.bar-title { font-weight: 800; font-size: 15px; color: #C9A84C; }
.bar-sub   { opacity: 0.7; font-size: 11px; margin-top: 1px; }
.back-btn  {
  background: transparent; color: #C9A84C; border: 1px solid rgba(201,168,76,0.4);
  cursor: pointer; padding: 7px 14px; border-radius: 7px; font-size: 12px;
  font-family: 'Nunito Sans', sans-serif; text-decoration: none;
  display: flex; align-items: center; gap: 5px;
}
.print-btn {
  background: #C9A84C; color: #1B2A4A; border: none; cursor: pointer;
  padding: 10px 24px; border-radius: 8px; font-weight: 800; font-size: 13px;
  font-family: 'Nunito Sans', sans-serif; display: flex; align-items: center; gap: 8px;
}
.print-btn:hover { background: #E0C87A; }

/* ═══ COMMON INNER PAGE ══════════════════════════════════════════════ */
.page-header {
  background: #1B2A4A;
  color: #fff;
  padding: 12px 0.5in;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.ph-left  { flex: 1; }
.ph-title { font-family: 'Cormorant Garamond', serif; font-size: 15pt; font-weight: 700; line-height: 1.1; }
.ph-sub   { font-size: 7.5pt; opacity: 0.6; margin-top: 2px; letter-spacing: 0.03em; }
.ph-logo  {
  font-family: 'Cormorant Garamond', serif; font-size: 9pt;
  text-align: right; opacity: 0.7; line-height: 1.4; white-space: nowrap;
}
.page-body { flex: 1; padding: 0.3in 0.5in 0.2in; overflow: hidden; }
.page-footer {
  background: #f4f4f4;
  border-top: 1px solid #ddd;
  padding: 6px 0.5in;
  font-size: 6.5pt; color: #999;
  display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0;
}

/* ═══ COVER PAGE ═════════════════════════════════════════════════════ */
.cover-page {
  background: #0d1b35;
  display: flex; flex-direction: column;
  height: 11in;
}
.cover-top-band {
  background: #C9A84C;
  padding: 14px 0.65in;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.cover-band-logo { height: 44px; filter: brightness(0); }
.cover-band-tagline {
  font-family: 'Cormorant Garamond', serif;
  font-size: 10pt; font-style: italic; color: #1B2A4A; font-weight: 600;
}
.cover-band-year {
  font-family: 'Nunito Sans', sans-serif;
  font-size: 10pt; font-weight: 800; color: #1B2A4A;
  letter-spacing: 0.08em;
}

.cover-body {
  flex: 1;
  display: grid;
  grid-template-columns: 0.55fr 0.45fr;
  overflow: hidden;
}
.cover-left {
  padding: 0.55in 0.35in 0.55in 0.65in;
  display: flex; flex-direction: column; justify-content: center;
  background: linear-gradient(135deg, #0d1b35 0%, #1B2A4A 100%);
}
.cover-eyebrow {
  font-family: 'Nunito Sans', sans-serif;
  font-size: 7pt; letter-spacing: 0.28em; text-transform: uppercase;
  color: #C9A84C; margin-bottom: 18px;
}
.cover-headline {
  font-family: 'Cormorant Garamond', serif;
  font-size: 46pt; font-weight: 700; line-height: 1.0;
  color: #ffffff; margin-bottom: 8px;
}
.cover-headline em { font-style: italic; color: #C9A84C; }
.cover-subline {
  font-family: 'Cormorant Garamond', serif;
  font-size: 13pt; font-style: italic; color: rgba(255,255,255,0.7);
  margin-bottom: 30px; line-height: 1.4;
}
.cover-rule { width: 60px; height: 2px; background: #C9A84C; margin-bottom: 30px; }
.cover-stats {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin-bottom: 36px;
}
.cover-stat-num {
  font-family: 'Cormorant Garamond', serif;
  font-size: 26pt; font-weight: 700; color: #C9A84C; line-height: 1;
}
.cover-stat-label {
  font-size: 6.5pt; color: rgba(255,255,255,0.55);
  text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px;
}
.cover-address {
  font-size: 7.5pt; color: rgba(255,255,255,0.5); line-height: 1.7;
  border-top: 1px solid rgba(201,168,76,0.25); padding-top: 16px;
}
.cover-address strong { color: rgba(255,255,255,0.8); }

.cover-right {
  position: relative; overflow: hidden;
  background: #0a1628;
}
.cover-right-img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  object-position: center top;
  opacity: 0.95;
  display: block;
}
.cover-right-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to right, #1B2A4A 0%, transparent 40%);
}
.cover-right-badge {
  position: absolute; bottom: 0.5in; right: 0.3in;
  background: rgba(201,168,76,0.92); color: #0d1b35;
  font-family: 'Cormorant Garamond', serif;
  font-size: 10pt; font-weight: 700; padding: 10px 16px;
  border-radius: 6px; text-align: center; line-height: 1.4;
}

.cover-bottom-band {
  background: rgba(255,255,255,0.05);
  border-top: 1px solid rgba(201,168,76,0.2);
  padding: 12px 0.65in;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.cover-bottom-info { font-size: 7.5pt; color: rgba(255,255,255,0.45); line-height: 1.6; }
.cover-bottom-web  {
  font-family: 'Cormorant Garamond', serif;
  font-size: 11pt; color: #C9A84C; font-style: italic; font-weight: 600;
}

/* ═══ TOC PAGE ═══════════════════════════════════════════════════════ */
.toc-page .page-body { padding: 0.35in 0.5in; }
.toc-eyebrow {
  font-size: 7pt; text-transform: uppercase; letter-spacing: 0.2em;
  color: #C9A84C; margin-bottom: 6px;
}
.toc-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 26pt; font-weight: 700; color: #1B2A4A; line-height: 1.1;
  margin-bottom: 4px;
}
.toc-rule { width: 50px; height: 2px; background: #C9A84C; margin: 12px 0 20px; }
.toc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 36px; }
.toc-section-label {
  font-size: 6.5pt; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.15em; color: #C9A84C;
  border-bottom: 1px solid #e8dcc8; padding-bottom: 5px; margin: 14px 0 6px;
}
.toc-row {
  display: flex; align-items: baseline; padding: 3.5px 0;
}
.toc-row-num {
  font-size: 7pt; color: #C9A84C; font-weight: 700;
  min-width: 22px; font-variant-numeric: tabular-nums;
}
.toc-row-title { font-size: 8.5pt; color: #1B2A4A; flex: 1; }
.toc-row-count { font-size: 7pt; color: #aaa; margin-left: 6px; white-space: nowrap; }
.toc-row-page  { font-size: 8.5pt; font-weight: 700; color: #1B2A4A; min-width: 20px; text-align: right; }
.toc-dots      { flex: 1; border-bottom: 1px dotted #ccc; margin: 0 6px; position: relative; top: -3px; }
.toc-info-box {
  margin-top: 18px;
  background: #1B2A4A; color: #fff; border-radius: 8px;
  padding: 16px 18px;
}
.toc-info-box-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 12pt; font-weight: 700; color: #C9A84C; margin-bottom: 10px;
}
.toc-info-line {
  font-size: 8pt; line-height: 2.0; opacity: 0.85;
}
.toc-info-line strong { color: #C9A84C; }

/* ═══ CATEGORY PAGES ═════════════════════════════════════════════════ */
/* cat-page layout — body flex-fills remaining space */
.cat-page { }
.cat-header {
  padding: 14px 0.5in;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.cat-header-left  { display: flex; align-items: center; gap: 14px; }
.cat-header-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 20pt; font-weight: 700; color: #fff; line-height: 1.1;
}
.cat-header-sub   { font-size: 7.5pt; color: rgba(255,255,255,0.65); margin-top: 3px; }
.cat-header-right {
  font-family: 'Cormorant Garamond', serif;
  font-size: 8.5pt; text-align: right; opacity: 0.6; line-height: 1.5; color: #fff;
}
/* Continuation page mini-header */
.cat-cont-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0.5in; flex-shrink: 0;
}
.cat-cont-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 13pt; font-weight: 700; color: #fff;
}
.cat-cont-label {
  font-size: 7pt; color: rgba(255,255,255,0.55); font-style: italic; margin-left: 8px; flex: 1;
}
.cat-cont-right {
  font-family: 'Cormorant Garamond', serif;
  font-size: 8pt; opacity: 0.55; color: #fff; text-align: right;
}

/* product table */
.cat-body { padding: 0.04in 0.4in 0.18in; flex: 1; overflow: hidden; }
.vgroup { margin-top: 8px; }
.vgroup-label {
  font-size: 6.5pt; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.12em; color: #fff;
  padding: 3px 10px; display: inline-block;
  border-radius: 3px 3px 0 0; margin-bottom: 0;
}
/* Vendor divider row inside the unified table */
tr.vendor-row td {
  padding: 8px 0 0; border-bottom: none; background: transparent !important;
}
table.ptable {
  width: 100%; border-collapse: collapse;
  font-size: 7.5pt; margin-bottom: 4px;
  table-layout: fixed;
}
table.ptable thead tr { background: #f0ece4; }
table.ptable th {
  padding: 4px 6px; text-align: left;
  font-size: 6.5pt; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: #555;
  border-bottom: 1px solid #ddd;
}
table.ptable tbody tr:nth-child(even) { background: #fafaf8; }
table.ptable td {
  padding: 7px 7px; border-bottom: 1px solid #eee;
  vertical-align: top; line-height: 1.45; overflow: visible;
}
.col-name  { width: 26%; font-weight: 700; color: #1B2A4A; white-space: normal; font-size: 7.5pt; }
.col-desc  { width: 60%; color: #444; font-size: 7pt; white-space: normal; line-height: 1.45; overflow: visible; }
.col-price { width: 14%; text-align: right; font-weight: 700; color: #1B2A4A; font-size: 7.5pt; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ═══ BACK COVER ═════════════════════════════════════════════════════ */
.back-page {
  background: #0d1b35;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 11in; text-align: center; padding: 0.8in;
}
.back-logo { height: 64px; filter: brightness(0) invert(1); margin-bottom: 32px; }
.back-rule { width: 80px; height: 1px; background: #C9A84C; margin: 0 auto 32px; }
.back-headline {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30pt; font-weight: 700; color: #fff; line-height: 1.15; margin-bottom: 10px;
}
.back-headline em { color: #C9A84C; font-style: italic; }
.back-sub {
  font-family: 'Cormorant Garamond', serif;
  font-size: 13pt; font-style: italic; color: rgba(255,255,255,0.65);
  margin-bottom: 40px;
}
.back-contacts {
  display: grid; grid-template-columns: repeat(3,1fr); gap: 24px;
  width: 100%; max-width: 5.2in; margin-bottom: 40px;
}
.back-contact-icon  { font-size: 16pt; margin-bottom: 6px; }
.back-contact-label { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.45); margin-bottom: 4px; }
.back-contact-val   { font-size: 10pt; font-weight: 600; color: #fff; line-height: 1.4; }
.back-site  { font-family: 'Cormorant Garamond', serif; font-size: 12pt; color: #C9A84C; font-style: italic; margin-top: 8px; }
.back-fine  { position: absolute; bottom: 0.35in; font-size: 6pt; color: rgba(255,255,255,0.3); }

/* ═══ OUR STORY PAGE ══════════════════════════════════════════════════ */
.story-page { background: #fff; display: flex; flex-direction: column; }
.story-hero {
  background: #0d1b35;
  padding: 0.32in 0.55in 0.28in;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.story-hero-left { }
.story-hero-eyebrow {
  font-size: 6.5pt; font-weight: 800; letter-spacing: 0.18em;
  text-transform: uppercase; color: #C9A84C; margin-bottom: 6px;
}
.story-hero-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 28pt; font-weight: 700; color: #fff; line-height: 1.05;
}
.story-hero-title em { color: #C9A84C; font-style: italic; }
.story-hero-tagline {
  font-size: 9pt; color: rgba(255,255,255,0.6); margin-top: 8px;
  font-style: italic; font-family: 'Cormorant Garamond', serif;
}
.story-hero-right {
  text-align: right;
}
.story-hero-logo { height: 36px; filter: brightness(0) invert(1); margin-bottom: 6px; }
.story-hero-since {
  font-size: 6.5pt; color: rgba(255,255,255,0.45);
  text-transform: uppercase; letter-spacing: 0.12em;
}

.story-body {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 0; flex: 1; overflow: hidden;
}
.story-left-col {
  background: #FBF7F0;
  padding: 0.18in 0.25in 0.18in 0.45in;
  border-right: 1px solid #e8dcc8;
  display: flex; flex-direction: column; gap: 10px;
}
.story-right-col {
  background: #fff;
  padding: 0.18in 0.45in 0.18in 0.25in;
  display: flex; flex-direction: column; gap: 10px;
}

.story-section-label {
  font-size: 6pt; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.18em; color: #C9A84C;
  border-bottom: 1px solid #e8dcc8; padding-bottom: 4px; margin-bottom: 8px;
}
.story-section-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 12pt; font-weight: 700; color: #1B2A4A; line-height: 1.2; margin-bottom: 5px;
}
.story-text {
  font-size: 7.5pt; color: #444; line-height: 1.55;
}
.story-text strong { color: #1B2A4A; }
.story-quote {
  border-left: 3px solid #C9A84C;
  padding: 6px 10px;
  background: rgba(201,168,76,0.07);
  border-radius: 0 6px 6px 0;
}
.story-quote-text {
  font-family: 'Cormorant Garamond', serif;
  font-size: 9.5pt; font-style: italic; color: #1B2A4A; line-height: 1.4;
}
.story-quote-attr {
  font-size: 6.5pt; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em;
}
.story-pillars {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.story-pillar {
  background: #fff; border: 1px solid #e8dcc8;
  border-radius: 6px; padding: 6px 8px;
}
.story-pillar-icon { font-size: 10pt; margin-bottom: 2px; }
.story-pillar-title { font-size: 7.5pt; font-weight: 700; color: #1B2A4A; margin-bottom: 2px; }
.story-pillar-text  { font-size: 6.5pt; color: #666; line-height: 1.5; }
.story-timeline {
  display: flex; flex-direction: column; gap: 5px;
}
.story-timeline-item {
  display: flex; gap: 10px; align-items: flex-start;
}
.story-timeline-dot {
  width: 28px; height: 28px; border-radius: 50%;
  background: #1B2A4A; color: #C9A84C;
  font-size: 5.5pt; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 1px; text-align: center; line-height: 1.1;
}
.story-timeline-text { font-size: 7.5pt; color: #444; line-height: 1.5; }
.story-timeline-text strong { color: #1B2A4A; }
.story-services {
  display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
}
.story-service {
  display: flex; align-items: flex-start; gap: 7px;
}
.story-service-icon {
  width: 20px; height: 20px; border-radius: 4px;
  background: #1B2A4A; color: #C9A84C;
  font-size: 8pt; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.story-service-text { font-size: 7pt; color: #444; line-height: 1.45; }
.story-service-text strong { color: #1B2A4A; font-size: 7.5pt; display: block; }

/* ═══ FEEDING GUIDE PAGE ══════════════════════════════════════════════ */
.guide-page { background: #fff; display: flex; flex-direction: column; }
.guide-header {
  background: #1B2A4A;
  padding: 0.22in 0.55in;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.guide-header-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 18pt; font-weight: 700; color: #fff;
}
.guide-header-title em { color: #C9A84C; font-style: italic; }
.guide-header-sub { font-size: 7.5pt; color: rgba(255,255,255,0.55); margin-top: 3px; }
.guide-header-logo { height: 28px; filter: brightness(0) invert(1); }

.guide-body {
  flex: 1; padding: 0.14in 0.45in 0.1in;
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.15in;
  overflow: hidden;
}
.guide-col { display: flex; flex-direction: column; gap: 7px; }
.guide-section { }
.guide-section-head {
  font-size: 5.5pt; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.14em; color: #C9A84C;
  border-bottom: 1.5px solid #C9A84C; padding-bottom: 2px; margin-bottom: 4px;
}
.guide-section-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 10pt; font-weight: 700; color: #1B2A4A; margin-bottom: 4px;
}
.guide-text { font-size: 6.5pt; color: #444; line-height: 1.55; }
.guide-text strong { color: #1B2A4A; }

.guide-table {
  width: 100%; border-collapse: collapse; font-size: 6pt; margin-top: 3px;
}
.guide-table th {
  background: #1B2A4A; color: #C9A84C;
  padding: 3px 5px; text-align: left; font-size: 5.5pt;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.guide-table td {
  padding: 3px 5px; border-bottom: 1px solid #eee;
  vertical-align: top; line-height: 1.4; color: #444;
}
.guide-table tr:nth-child(even) td { background: #fafaf8; }
.guide-table td:first-child { font-weight: 700; color: #1B2A4A; }

.guide-tip-box {
  background: rgba(201,168,76,0.1); border: 1px solid #C9A84C;
  border-radius: 6px; padding: 6px 8px;
}
.guide-tip-head { font-size: 6pt; font-weight: 800; color: #a07830; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px; }
.guide-tip-list { list-style: none; padding: 0; margin: 0; }
.guide-tip-list li { font-size: 6.5pt; color: #444; line-height: 1.55; padding-left: 11px; position: relative; }
.guide-tip-list li::before { content: "✓"; position: absolute; left: 0; color: #C9A84C; font-weight: 700; }

.guide-alert-box {
  background: #FFF8F0; border-left: 3px solid #E8956A;
  border-radius: 0 6px 6px 0; padding: 5px 8px;
}
.guide-alert-head { font-size: 6pt; font-weight: 800; color: #b05020; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; }
.guide-alert-text { font-size: 6.5pt; color: #555; line-height: 1.5; }

.guide-brand-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 3px;
}
.guide-brand-cell {
  background: #F8FAFC; border: 1px solid #E2E8F0;
  border-radius: 4px; padding: 4px 5px;
}
.guide-brand-need { font-size: 5.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.06em; }
.guide-brand-name { font-size: 6pt; font-weight: 700; color: #1B2A4A; line-height: 1.3; margin-top: 1px; }

.guide-footer {
  background: #0d1b35; color: rgba(255,255,255,0.7);
  padding: 7px 0.55in; font-size: 6.5pt;
  display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0;
}
.guide-footer strong { color: #C9A84C; }
.guide-footer-cta {
  font-family: 'Cormorant Garamond', serif;
  font-size: 9pt; color: #C9A84C; font-style: italic;
}
</style>
</head>
<body>

<!-- Loading overlay -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="spinner"></div>
  <h2>Building Your Catalog…</h2>
  <p>Loading latest products from inventory</p>
</div>

<!-- Print bar (screen only) -->
<div class="print-bar no-print">
  <div class="bar-left">
    <a href="/products" class="back-btn">&#8592; Back</a>
    <div>
      <div class="bar-title">British Feed &amp; Supplies — Product Catalog ${year}</div>
      <div class="bar-sub">8.5 × 11 in · Print or Save as PDF · Always current</div>
    </div>
  </div>
  <button class="print-btn" onclick="window.print()">
    &#x1F5A8; &nbsp;Print / Save as PDF
  </button>
</div>

<div id="catalogPages"></div>

<script>
const YEAR = ${year};
const MONTH_YEAR = '${monthYear}';

const CAT_ORDER = ${JSON.stringify(CAT_ORDER)};
const CAT_META  = ${JSON.stringify(CAT_META)};

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function sortCats(cats) {
  return cats.sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a);
    const bi = CAT_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return  1;
    return a.localeCompare(b);
  });
}

function buildCatalog(products) {
  // Organise data
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
  const categories = sortCats(Object.keys(byCategory));
  const vendors    = Object.keys(byVendor).sort();
  const totalInStock = products.filter(p => p.inStock !== false).length;

  // ── Product row ───────────────────────────────────────────────────
  function prodRow(p) {
    const price = p.priceFormatted || (p.price ? '$'+Number(p.price).toFixed(2) : 'Call');
    const raw  = (p.description||'').replace(/[—–]\s*available at British Feed.*?to order\.?/gi,'').trim();
    const desc = raw; // show full description — row height auto-expands
    return \`<tr>
      <td class="col-name">\${esc(p.name)}</td>
      <td class="col-desc">\${esc(desc)}</td>
      <td class="col-price">\${esc(price)}</td>
    </tr>\`;
  }

  // ── COVER PAGE ────────────────────────────────────────────────────
  const cover = \`
<div class="page cover-page">
  <!-- Gold top band with logo -->
  <div class="cover-top-band">
    <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed & Supplies" class="cover-band-logo" onerror="this.style.display='none'"/>
    <div class="cover-band-tagline">Serving Wellington's Equestrians Since 2012</div>
    <div class="cover-band-year">\${YEAR}&nbsp;CATALOG</div>
  </div>

  <!-- Body: left content + right photo -->
  <div class="cover-body">
    <div class="cover-left">
      <div class="cover-eyebrow">Premium Equine Nutrition &amp; Supplies</div>
      <div class="cover-headline">For Proper<br/><em>Care &amp;<br/>Nutrition</em></div>
      <div class="cover-subline">Your complete guide to our<br/>full product range</div>
      <div class="cover-rule"></div>
      <div class="cover-stats">
        <div>
          <div class="cover-stat-num">\${products.length}</div>
          <div class="cover-stat-label">Products</div>
        </div>
        <div>
          <div class="cover-stat-num">\${vendors.length}+</div>
          <div class="cover-stat-label">Brands</div>
        </div>
        <div>
          <div class="cover-stat-num">\${categories.length}</div>
          <div class="cover-stat-label">Categories</div>
        </div>
        <div>
          <div class="cover-stat-num">13+</div>
          <div class="cover-stat-label">Yrs Experience</div>
        </div>
      </div>
      <div class="cover-address">
        <strong>(561) 633-6003</strong><br/>
        14589 Southern Blvd, Palm West Plaza<br/>
        Loxahatchee Groves, FL 33470<br/>
        Mon–Fri 9am–6pm &nbsp;·&nbsp; Sat 9am–4pm
      </div>
    </div>
    <div class="cover-right">
      <img class="cover-right-img" src="/static/catalog_cover.jpg" alt="" />
      <div class="cover-right-overlay"></div>
      <div class="cover-right-badge">
        Wellington's Most<br/>Trusted Feed Store
      </div>
    </div>
  </div>

  <!-- Bottom band -->
  <div class="cover-bottom-band">
    <div class="cover-bottom-info">
      Free delivery on orders $150+ &nbsp;·&nbsp; Temporary minimal fuel surcharge in effect<br/>
      Prices subject to change without notice · Call to confirm availability
    </div>
    <div class="cover-bottom-web">britishfeed.com</div>
  </div>
</div>\`;

  // ── TABLE OF CONTENTS ─────────────────────────────────────────────
  // Page 1 = Cover, 2 = TOC, 3 = Our Story, 4 = Feeding Guide, 5+ = categories
  let pageNum = 2; // TOC is page 2
  pageNum++;       // Our Story = 3
  pageNum++;       // Feeding Guide = 4
  const storyPageNum = 3;
  const guidePageNum = 4;
  const catPageNums = {};
  categories.forEach(cat => {
    catPageNums[cat] = pageNum++;
  });
  const backPage = pageNum;

  const toc = \`
<div class="page toc-page">
  <div class="page-header">
    <div class="ph-left">
      <div class="ph-title">Table of Contents</div>
      <div class="ph-sub">\${products.length} products across \${categories.length} categories</div>
    </div>
    <div class="ph-logo">British Feed<br/>&amp; Supplies</div>
  </div>
  <div class="page-body">
    <div class="toc-grid">

      <!-- LEFT COLUMN: front matter + first half of categories -->
      <div>
        <div class="toc-section-label">In This Catalog</div>
        <div class="toc-row">
          <span class="toc-row-title">Our Story &amp; Mission</span>
          <span class="toc-dots"></span>
          <span class="toc-row-page">3</span>
        </div>
        <div class="toc-row">
          <span class="toc-row-title">Horse Feeding Guidelines</span>
          <span class="toc-dots"></span>
          <span class="toc-row-page">4</span>
        </div>
        <div class="toc-row">
          <span class="toc-row-title">About Us &amp; Contact</span>
          <span class="toc-dots"></span>
          <span class="toc-row-page">Back</span>
        </div>

        <div class="toc-section-label" style="margin-top:14px">Product Categories</div>
        \${categories.slice(0, Math.ceil(categories.length / 2)).map(cat => \`
          <div class="toc-row">
            <span class="toc-row-title">\${esc(cat)}</span>
            <span class="toc-row-count">(\${byCategory[cat].length})</span>
            <span class="toc-dots"></span>
            <span class="toc-row-page">\${catPageNums[cat]}</span>
          </div>\`).join('')}
      </div>

      <!-- RIGHT COLUMN: second half of categories + quick reference -->
      <div>
        <div class="toc-section-label">Product Categories (continued)</div>
        \${categories.slice(Math.ceil(categories.length / 2)).map(cat => \`
          <div class="toc-row">
            <span class="toc-row-title">\${esc(cat)}</span>
            <span class="toc-row-count">(\${byCategory[cat].length})</span>
            <span class="toc-dots"></span>
            <span class="toc-row-page">\${catPageNums[cat]}</span>
          </div>\`).join('')}

        <div class="toc-info-box">
          <div class="toc-info-box-title">Quick Reference</div>
          <div class="toc-info-line">&#128222; <strong>(561) 633-6003</strong></div>
          <div class="toc-info-line">&#128205; 14589 Southern Blvd, Loxahatchee Groves FL</div>
          <div class="toc-info-line">&#128336; Store: Mon–Fri 9am–6pm · Sat 9am–4pm</div>
          <div class="toc-info-line">&#128336; Distribution: Mon–Fri 8am–5pm · Sat 9am–4pm</div>
          <div class="toc-info-line">&#127758; britishfeed.com</div>
          <div class="toc-info-line">&#128666; Free delivery on orders \$150+</div>
          <div class="toc-info-line" style="opacity:0.6;font-size:7pt;margin-top:4px">Temporary minimal fuel surcharge currently in effect</div>
        </div>
      </div>

    </div>
  </div>
  <div class="page-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd, Loxahatchee Groves, FL 33470 · (561) 633-6003</span>
    <span>\${MONTH_YEAR}</span>
  </div>
</div>\`;

  // ── CATEGORY PAGES ────────────────────────────────────────────────
  // Page height budget (points at 72pt/in):
  //   Page = 11in = 792pt
  //   cat-header ≈ 52pt  (first page only)
  //   cont-header ≈ 28pt (continuation pages)
  //   thead row   ≈ 18pt
  //   page-footer ≈ 26pt
  //   cat-body padding top+bottom ≈ 29pt (0.3in top + 0.18in bottom)
  //   vendor-row  ≈ 22pt
  //   product row base ≈ 18pt  +  2pt per 55 chars of description (7pt font ~10ch/pt, col 58% of 7in = 4.06in ≈ 293pt wide / 7pt ≈ ~42ch per line)
  const PT = 72; // pt per inch
  const PAGE_H       = 11 * PT;          // 792
  const FOOTER_H     = 26;
  const BODY_PAD     = Math.round(0.48 * PT); // top+bottom padding of cat-body
  const CAT_HDR_H    = 52;               // first-page colored header
  const CONT_HDR_H   = 28;               // continuation mini-header
  const THEAD_H      = 18;
  const VENDOR_ROW_H = 22;
  const ROW_BASE_H   = 20;               // min row height at 7px top+bottom padding
  const DESC_CHARS_PER_LINE = 90;        // ~90 chars per line in col-desc at 7pt
  const LINE_H_PT    = 9;                // 7pt font × 1.45 leading ≈ 9pt per line

  function estimateRowH(p) {
    const desc = (p.description||'').replace(/[—–]\s*available at British Feed.*?to order\.?/gi,'').trim();
    const lines = Math.max(1, Math.ceil(desc.length / DESC_CHARS_PER_LINE));
    return ROW_BASE_H + Math.max(0, lines - 1) * LINE_H_PT;
  }

  // Build flat list of "items" for a category: each item is {type, data, height}
  function buildItems(cat) {
    const prods = byCategory[cat];
    const vg = {};
    prods.forEach(p => {
      const v = p.vendor || p.brand || 'General';
      if (!vg[v]) vg[v] = [];
      vg[v].push(p);
    });
    const vList = Object.entries(vg).sort(([a],[b]) => a.localeCompare(b));
    const items = [];
    vList.forEach(([vendor, vprods]) => {
      items.push({ type: 'vendor', vendor, height: VENDOR_ROW_H });
      vprods.forEach(p => items.push({ type: 'row', p, height: estimateRowH(p) }));
    });
    return items;
  }

  // Emit one fixed-height page div
  function catPageDiv(cat, meta, isFirst, rows_html) {
    const hdr = isFirst
      ? \`<div class="cat-header" style="background:\${meta.color}">
          <div class="cat-header-left"><div>
            <div class="cat-header-title">\${esc(cat)}</div>
            <div class="cat-header-sub">\${byCategory[cat].length} product\${byCategory[cat].length!==1?'s':''} available</div>
          </div></div>
          <div class="cat-header-right">British Feed<br/>&amp; Supplies</div>
        </div>\`
      : \`<div class="cat-cont-header" style="background:\${meta.color}">
          <span class="cat-cont-title">\${esc(cat)}</span>
          <span class="cat-cont-label">continued</span>
          <span class="cat-cont-right">British Feed &amp; Supplies</span>
        </div>\`;
    return \`
<div class="page cat-page">
  \${hdr}
  <div class="cat-body">
    <table class="ptable">
      <thead><tr>
        <th class="col-name">Product</th>
        <th class="col-desc">Description &amp; Benefits</th>
        <th class="col-price">Price</th>
      </tr></thead>
      <tbody>\${rows_html}</tbody>
    </table>
  </div>
  <div class="page-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd · (561) 633-6003 · britishfeed.com</span>
    <span>\${esc(cat)} · \${MONTH_YEAR}</span>
  </div>
</div>\`;
  }

  function rowHtml(item, meta) {
    if (item.type === 'vendor') {
      return \`<tr class="vendor-row"><td colspan="3"><div class="vgroup-label" style="background:\${meta.color}">\${esc(item.vendor)}</div></td></tr>\`;
    }
    return prodRow(item.p);
  }

  const catPages = categories.flatMap(cat => {
    const meta  = CAT_META[cat] || { color:'#1B2A4A', accent:'#C9A84C' };
    const items = buildItems(cat);
    const pages = [];
    let isFirst  = true;
    let usedH    = 0;
    let rowsHtml = '';

    // Calculate available body height for this page
    function bodyBudget() {
      const hdrH = isFirst ? CAT_HDR_H : CONT_HDR_H;
      return PAGE_H - hdrH - THEAD_H - FOOTER_H - BODY_PAD;
    }

    let budget = bodyBudget();

    items.forEach(item => {
      // If vendor label + at least one row won't fit, flush to next page
      if (usedH + item.height > budget && rowsHtml !== '') {
        pages.push(catPageDiv(cat, meta, isFirst, rowsHtml));
        isFirst  = false;
        rowsHtml = '';
        usedH    = 0;
        budget   = bodyBudget();
      }
      rowsHtml += rowHtml(item, meta);
      usedH    += item.height;
    });

    // Flush remaining rows
    if (rowsHtml) pages.push(catPageDiv(cat, meta, isFirst, rowsHtml));
    return pages;
  }).join('\\n');

  // ── BACK COVER ────────────────────────────────────────────────────
  const back = \`
<div class="page back-page">
  <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed & Supplies" class="back-logo" onerror="this.style.display='none'"/>
  <div class="back-rule"></div>
  <div class="back-headline">The Best Care<br/>for <em>Champions</em></div>
  <div class="back-sub">Premium Feed &amp; Supplies for South Florida's Finest Horses</div>
  <div class="back-contacts">
    <div>
      <div class="back-contact-icon">&#128222;</div>
      <div class="back-contact-label">Call Us</div>
      <div class="back-contact-val">(561) 633-6003</div>
    </div>
    <div>
      <div class="back-contact-icon">&#128205;</div>
      <div class="back-contact-label">Visit Us</div>
      <div class="back-contact-val" style="font-size:9pt">14589 Southern Blvd<br/>Loxahatchee Groves, FL 33470</div>
    </div>
    <div>
      <div class="back-contact-icon">&#128336;</div>
      <div class="back-contact-label">Store Hours</div>
      <div class="back-contact-val" style="font-size:9pt">Mon–Fri 9am–6pm<br/>Sat 9am–4pm</div>
    </div>
  </div>
  <div class="back-site">britishfeed.com</div>
  <div class="back-fine">Pricing and availability subject to change. Call (561) 633-6003 to confirm. © \${YEAR} British Feed &amp; Supplies.</div>
</div>\`;

  // ── OUR STORY PAGE ───────────────────────────────────────────────
  const storyPage = \`
<div class="page story-page">

  <!-- ── Dark hero band ───────────────────────────────────────────────── -->
  <div class="story-hero">
    <div class="story-hero-left">
      <div class="story-hero-eyebrow">Our Story &amp; Mission</div>
      <div class="story-hero-title">Wellington's <em>Premier</em><br/>Horse Feed Store</div>
      <div class="story-hero-tagline">"Proper care starts long before the ride."</div>
    </div>
    <div class="story-hero-right">
      <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed &amp; Supplies" class="story-hero-logo" onerror="this.style.display='none'"/>
      <div class="story-hero-since">Serving Equestrians Since 2012</div>
    </div>
  </div>

  <!-- ── Mission statement full-width banner ──────────────────────────── -->
  <div style="background:linear-gradient(135deg,#1B2A4A 0%,#0d1b35 100%);padding:10px 0.55in;border-bottom:2px solid #C9A84C;flex-shrink:0">
    <div style="font-family:'Cormorant Garamond',serif;font-size:11.5pt;font-style:italic;color:rgba(255,255,255,0.92);text-align:center;line-height:1.5">
      "At British Feed &amp; Supplies, we provide <span style="color:#C9A84C;font-weight:700">premium feed, quality hay, and everyday essentials</span>
      with dedicated service you can count on — so your horse gets the care they deserve."
    </div>
  </div>

  <!-- ── Two-column body ───────────────────────────────────────────────── -->
  <div class="story-body">

    <!-- LEFT COLUMN -->
    <div class="story-left-col">

      <div>
        <div class="story-section-label">Who We Are</div>
        <div class="story-section-title">A Dream Come True<br/>for a True Horseman</div>
        <div class="story-text">
          <strong>British Feed &amp; Supplies</strong> was founded in 2012 right at the border of Wellington and Loxahatchee Groves — steps from the equestrian heart of Palm Beach County. In May 2016, <strong>Vieri Bracco</strong> purchased the store and immediately embarked on a complete renovation, transforming it into the full-service equine supply destination it is today.
          <br/><br/>
          Vieri came from 25 years in international banking, but his heart was always with animals — cattle ranching, sheep breeding, and show jumping shaped his life before he found his way to South Florida. "When I found this business for sale, it was like a dream come true," he says. "It's the perfect blend of my business background with my personal passion."
          <br/><br/>
          Day-to-day operations are led by <strong>Carmine Garrett</strong>, whose deep knowledge of equine nutrition and personal relationships with every customer define the British Feed experience. Together, they have built something rare: a store where horse people feel genuinely at home.
        </div>
      </div>

      <div class="story-quote">
        <div class="story-quote-text">"This business is a life-changing prospect. I haven't worked this hard in 20 years — but I love every day. It's a real pleasure doing something I believe in with all my heart."</div>
        <div class="story-quote-attr">— Vieri Bracco, Owner, British Feed &amp; Supplies</div>
      </div>

      <div>
        <div class="story-section-label">Our Journey</div>
        <div class="story-timeline">
          <div class="story-timeline-item">
            <div class="story-timeline-dot">2012</div>
            <div class="story-timeline-text"><strong>Founded</strong> — British Feed opens at 14589 Southern Blvd, Loxahatchee Groves. The store quickly becomes an anchor for the western communities of Palm Beach County.</div>
          </div>
          <div class="story-timeline-item">
            <div class="story-timeline-dot">2016</div>
            <div class="story-timeline-text"><strong>New ownership &amp; full renovation</strong> — Vieri Bracco acquires the store in May. Complete renovation expands product lines: Nutrena, Cavalor, Red Mills, Havens, Buckeye, Foran, and more.</div>
          </div>
          <div class="story-timeline-item">
            <div class="story-timeline-dot">2017</div>
            <div class="story-timeline-text"><strong>Community partnerships</strong> — Named exclusive feed &amp; hay supplier for Nona Garson's Ridge Farm show series. Exclusive Palm Beach County dealer for Poulin Grain multi-species lines.</div>
          </div>
          <div class="story-timeline-item">
            <div class="story-timeline-dot">Now</div>
            <div class="story-timeline-text"><strong>\${products.length} products · 16+ categories · Nutrena Certified</strong> — One of South Florida's most complete equine destinations, trusted by competition riders, pleasure riders, and livestock owners alike.</div>
          </div>
        </div>
      </div>

    </div>

    <!-- RIGHT COLUMN -->
    <div class="story-right-col">

      <div>
        <div class="story-section-label">Our Values &amp; What Sets Us Apart</div>
        <div class="story-pillars">
          <div class="story-pillar">
            <div class="story-pillar-icon">&#127968;</div>
            <div class="story-pillar-title">Your Local Store</div>
            <div class="story-pillar-text">Locally owned and operated. "Being here is like being home," says one long-time customer. We know your name, your horse's name, and what works for them.</div>
          </div>
          <div class="story-pillar">
            <div class="story-pillar-icon">&#127942;</div>
            <div class="story-pillar-title">Quality Without Compromise</div>
            <div class="story-pillar-text">"We may not be the cheapest, but we have great, consistent quality. If a customer ever gets a bad bale, we cheerfully exchange it." — Vieri Bracco</div>
          </div>
          <div class="story-pillar">
            <div class="story-pillar-icon">&#127758;</div>
            <div class="story-pillar-title">World-Class Brands</div>
            <div class="story-pillar-text">Nutrena, Cavalor, Red Mills, Pro Elite, Havens, Buckeye, Foran — the same brands trusted by Olympic riders at the WEF, stocked right here in Wellington.</div>
          </div>
          <div class="story-pillar">
            <div class="story-pillar-icon">&#128203;</div>
            <div class="story-pillar-title">Expert Guidance</div>
            <div class="story-pillar-text">We don't just sell feed — we help you build the right program. Our team knows the science, the products, and the specific needs of Florida horses.</div>
          </div>
        </div>
      </div>

      <div>
        <div class="story-section-label">Our Services</div>
        <div class="story-services">
          <div class="story-service">
            <div class="story-service-icon">&#128666;</div>
            <div class="story-service-text"><strong>Free Local Delivery</strong>Orders $150+ delivered to Wellington, Loxahatchee, Royal Palm Beach, Lake Worth, Jupiter Farms &amp; surrounding areas. Fuel surcharge temporarily in effect on some routes.</div>
          </div>
          <div class="story-service">
            <div class="story-service-icon">&#128300;</div>
            <div class="story-service-text"><strong>Nutritional Barn Visits</strong>One-on-one sessions with a certified equine nutritionist. We evaluate your horse's condition, workload, and forage and build a personalized program.</div>
          </div>
          <div class="story-service">
            <div class="story-service-icon">&#127942;</div>
            <div class="story-service-text"><strong>Nutrena Certified Farm Program</strong>Earn rewards on every qualifying Nutrena bag purchased. Ask us how to enroll and start earning today.</div>
          </div>
          <div class="story-service">
            <div class="story-service-icon">&#128222;</div>
            <div class="story-service-text"><strong>Text &amp; Call Ordering</strong>Text your order or call <strong>(561) 633-6003</strong> — we get right back to you. Convenient for trainers managing multiple horses across multiple barns.</div>
          </div>
        </div>
      </div>

      <div>
        <div class="story-section-label">Hay We Carry — Picky About Quality</div>
        <div class="story-text">
          "We're very picky about the quality of our hay, and if a shipment isn't up to our standards, we send it back." Our hay selection spans Canadian &amp; US sources:
          <br/><span style="color:#1B2A4A;font-weight:700">Timothy</span> (1st &amp; 2nd cut) · <span style="color:#1B2A4A;font-weight:700">Alfalfa</span> · <span style="color:#1B2A4A;font-weight:700">Orchard</span> · <span style="color:#1B2A4A;font-weight:700">T/A Blends</span> · <span style="color:#1B2A4A;font-weight:700">Peanut</span> · <span style="color:#1B2A4A;font-weight:700">Teff</span> · <span style="color:#1B2A4A;font-weight:700">O/T/A Mix</span> · <span style="color:#1B2A4A;font-weight:700">Special Reserve</span> · <span style="color:#1B2A4A;font-weight:700">Quebec</span> · <span style="color:#1B2A4A;font-weight:700">Alberta</span>
          <br/>Available in 2-string (48–60 lb) and 3-string (100–110 lb) bales, plus compressed and pelleted formats.
        </div>
      </div>

      <div style="background:#0d1b35;border-radius:8px;padding:11px 13px">
        <div class="story-section-label" style="color:#C9A84C;border-color:rgba(201,168,76,0.3)">Visit Us · Order · Deliver</div>
        <div style="color:rgba(255,255,255,0.88);font-size:7.5pt;line-height:1.9">
          &#128205; <strong style="color:#fff">14589 Southern Blvd</strong>, Palm West Plaza, Loxahatchee Groves, FL 33470<br/>
          &#128222; <strong style="color:#C9A84C">(561) 633-6003</strong> &nbsp;·&nbsp; &#127758; britishfeed.com<br/>
          &#128336; <strong style="color:#fff">Store:</strong> Mon–Fri 9am–6pm &nbsp;·&nbsp; Sat 9am–4pm<br/>
          &#128666; <strong style="color:#fff">Distribution Center:</strong> Mon–Fri 8am–5pm &nbsp;·&nbsp; Sat 9am–4pm<br/>
          <span style="color:rgba(255,255,255,0.4);font-size:6pt">Free delivery on orders $150+. Temporary minimal fuel surcharge currently in effect on some delivery routes.</span>
        </div>
      </div>

    </div>
  </div>
</div>\`;

  // ── FEEDING GUIDE PAGE ───────────────────────────────────────────────
  const feedingGuidePage = \`
<div class="page guide-page">

  <!-- ── Header ─────────────────────────────────────────────────────── -->
  <div class="guide-header">
    <div>
      <div class="guide-header-title">Horse Feeding <em>Guidelines</em></div>
      <div class="guide-header-sub">A practical South Florida reference — brought to you by British Feed &amp; Supplies, Wellington's trusted equine supply store since 2012</div>
    </div>
    <img src="/admin/api/catalog/image/img_img_site_logo_white" alt="British Feed" class="guide-header-logo" onerror="this.style.display='none'"/>
  </div>

  <!-- ── Body ───────────────────────────────────────────────────────── -->
  <div class="guide-body">

    <!-- LEFT COLUMN -->
    <div class="guide-col">

      <div class="guide-section">
        <div class="guide-section-head">Rule #1 — Forage First</div>
        <div class="guide-section-title">The Foundation of Every Diet</div>
        <div class="guide-text">
          Horses are hindgut fermenters built to eat small amounts continuously. <strong>Forage should always be the largest component of the diet</strong> — aim for <strong>1.5–2% of body weight in hay per day</strong> (15–20 lbs for a 1,000 lb horse). Good hay buffers stomach acid, supports hindgut bacteria, prevents sand impaction, and reduces ulcer risk. Concentrates supplement forage — they never replace it.
        </div>
      </div>

      <div class="guide-section">
        <div class="guide-section-head">Daily Feeding Reference by Horse Type</div>
        <table class="guide-table">
          <thead><tr><th>Horse Type</th><th>Hay / Day</th><th>Grain / Day</th><th>Key Priority</th></tr></thead>
          <tbody>
            <tr><td>Idle / Easy Keeper</td><td>1.5% BW</td><td>Balancer only</td><td>Weight &amp; mineral balance</td></tr>
            <tr><td>Light / Pleasure Work</td><td>1.8% BW</td><td>2–4 lbs</td><td>Consistent energy</td></tr>
            <tr><td>Moderate Work</td><td>2.0% BW</td><td>4–6 lbs</td><td>Stamina &amp; topline</td></tr>
            <tr><td>Heavy / Competition</td><td>2.0% BW</td><td>6–10 lbs</td><td>Peak performance, recovery</td></tr>
            <tr><td>Senior Horse</td><td>2.0–2.5% BW</td><td>4–8 lbs (senior formula)</td><td>Digestion, joints, condition</td></tr>
            <tr><td>Pregnant / Lactating</td><td>2.0–2.5% BW</td><td>4–8 lbs</td><td>Protein, calcium, energy</td></tr>
            <tr><td>Growing Youngster</td><td>2.0% BW</td><td>0.5–1% BW</td><td>Balanced skeletal growth</td></tr>
            <tr><td>Metabolic / IR / EMS</td><td>1.5% BW — low NSC</td><td>Low-starch only</td><td>Blood sugar control</td></tr>
          </tbody>
        </table>
        <div class="guide-text" style="margin-top:4px;font-size:6pt;color:#888">BW = Body Weight. Split concentrate into 2–3 meals. Never feed more than 5 lbs of grain in a single meal — colic risk increases significantly above this threshold.</div>
      </div>

      <div class="guide-section">
        <div class="guide-section-head">South Florida Feeding Realities</div>
        <div class="guide-section-title">What's Different Here</div>
        <div class="guide-text">
          Florida's heat, humidity, and sandy soil create challenges unique to our region:<br/><br/>
          <strong>&#9889; Electrolytes year-round</strong> — Horses sweating in Florida's summer heat can lose 2–4x the electrolytes of horses in cooler climates. Supplement sodium, potassium, and chloride daily, not just during competition.<br/><br/>
          <strong>&#128681; Sand colic</strong> — Our sandy Loxahatchee soil is silently ingested with every bite of ground hay. Feed hay in racks, not directly on the ground. Use psyllium (SandClear, SandPurge) for one week every month as a preventive cleanse.<br/><br/>
          <strong>&#128027; Flies all year</strong> — Unlike northern states, fly season never truly ends here. Combine topical sprays with a feed-through fly control supplement (Solitude IGR, SimpliFly) for comprehensive coverage.<br/><br/>
          <strong>&#127784; Show &amp; travel stress</strong> — WEF season brings hauling, stabling changes, and irregular schedules. Ulcer risk spikes during these periods — consider gastric buffering supplements before and during show weeks.
        </div>
      </div>

      <div class="guide-tip-box">
        <div class="guide-tip-head">&#10022; Pro Tips from the British Feed Team</div>
        <ul class="guide-tip-list">
          <li>Transition any new feed gradually over 10–14 days — even premium feeds cause upset if switched abruptly.</li>
          <li><strong>Weigh, don't scoop.</strong> The same "scoop" of pellets vs. textured feed can differ by 2–3 lbs.</li>
          <li>Fresh, clean water at all times — horses drink 5–10 gallons daily, more in summer heat.</li>
          <li>If hay quality is unknown, add a ration balancer to fill vitamin and mineral gaps.</li>
          <li>Have your hay tested — NSC levels matter greatly for metabolic horses, and visual appearance doesn't tell the whole story.</li>
          <li>Not sure what to feed? Call us — we offer free nutritional consultations and barn visits.</li>
        </ul>
      </div>

    </div>

    <!-- RIGHT COLUMN -->
    <div class="guide-col">

      <div class="guide-section">
        <div class="guide-section-head">Hay Selection — We're Picky So You Don't Have To Be</div>
        <div class="guide-section-title">Choosing the Right Hay for Your Horse</div>
        <table class="guide-table">
          <thead><tr><th>Hay Type</th><th>Crude Protein</th><th>Best Suited For</th></tr></thead>
          <tbody>
            <tr><td>Premium Alfalfa</td><td>15–22%</td><td>Hard keepers, lactating mares, young horses needing extra calories &amp; protein</td></tr>
            <tr><td>Timothy 1st Cut</td><td>8–10%</td><td>All-around choice; lower sugar, excellent long-stem fiber for gut health</td></tr>
            <tr><td>Timothy 2nd Cut</td><td>10–12%</td><td>Softer, leafier, more palatable; ideal for performance horses in moderate work</td></tr>
            <tr><td>Orchard Grass</td><td>10–12%</td><td>Horses that refuse timothy; high palatability, excellent fiber source</td></tr>
            <tr><td>T/A Blend</td><td>12–16%</td><td>Performance horses — balances Timothy fiber with Alfalfa protein &amp; energy</td></tr>
            <tr><td>Peanut Hay</td><td>14–18%</td><td>High-protein legume; excellent for underweight horses and growing youngsters</td></tr>
            <tr><td>Teff Grass</td><td>8–10%</td><td>Metabolic, IR, and Cushings horses — ultra-low NSC, safe warm-season forage</td></tr>
          </tbody>
        </table>
        <div class="guide-text" style="margin-top:4px;font-size:6pt;color:#888">"If a shipment isn't up to our standards, we send it back." — Vieri Bracco. We carry 3-string (100–110 lb) and 2-string (48–60 lb) bales plus compressed and cubed/pelleted formats.</div>
      </div>

      <div class="guide-section">
        <div class="guide-section-head">British Feed Quick-Match Guide</div>
        <div class="guide-section-title">Find the Right Feed — Ask Us for Details</div>
        <div class="guide-brand-grid">
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Competition</div>
            <div class="guide-brand-name">Pro Elite Performance · Cavalor Performix · Red Mills Competition 14 · Havens Performance 14</div>
          </div>
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Senior Horse</div>
            <div class="guide-brand-name">SafeChoice Senior · Pro Elite Senior · Buckeye EQ8 Senior · Cavalor Strucomix Senior</div>
          </div>
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Easy Keeper / IR</div>
            <div class="guide-brand-name">SafeChoice Special Care · Pro Elite Starch Wise · Cavalor Pianissimo · Havens Cool Mix</div>
          </div>
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Hard Keeper</div>
            <div class="guide-brand-name">Pro Elite Omega Advantage · Cavalor WholyGain · Havens Power Plus · Buckeye Cadence Ultra</div>
          </div>
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Gut Health / Ulcers</div>
            <div class="guide-brand-name">Cavalor FiberGastro · Cavalor FiberForce · Havens Gastro Plus · Red Mills Comfort Mash</div>
          </div>
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Young / Growing</div>
            <div class="guide-brand-name">Pro Elite Growth · Buckeye Gro-N-Win · SafeChoice Mare &amp; Foal · Red Mills Horse Care 14</div>
          </div>
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Endurance</div>
            <div class="guide-brand-name">Havens Endurance · Cavalor Endurix · CocoSoya Oil · Havens Equi-Force Oil</div>
          </div>
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Topline &amp; Muscle</div>
            <div class="guide-brand-name">Pro Elite Topline Advantage · Cavalor Muscle Force · Topline Xtreme · Vita-E &amp; Selenium</div>
          </div>
          <div class="guide-brand-cell">
            <div class="guide-brand-need">Natural / Whole Food</div>
            <div class="guide-brand-name">Crypto Aero Wholefood · Red Mills Horse Care 10 Mix · Cavalor Strucomix Original</div>
          </div>
        </div>
      </div>

      <div class="guide-alert-box">
        <div class="guide-alert-head">&#9888; Signs Your Horse Needs a Nutrition Review</div>
        <div class="guide-alert-text">
          <strong>Call your vet or schedule a barn visit with us if you notice:</strong> sudden weight loss or gain · poor topline despite adequate feeding · recurring colic · loose or dark manure lasting 48+ hours · coat dullness, excessive shedding · hoof rings or laminitis signs · changes in energy, attitude, or focus · difficulty chewing or dropping feed (quidding).
          <br/><strong style="color:#b05020">Free nutritional barn visits available — call (561) 633-6003 to schedule.</strong>
        </div>
      </div>

    </div>
  </div>

  <!-- ── Footer ──────────────────────────────────────────────────────── -->
  <div class="guide-footer">
    <span>British Feed &amp; Supplies · 14589 Southern Blvd, Loxahatchee Groves FL 33470 · <strong>(561) 633-6003</strong> · britishfeed.com</span>
    <span><em>For proper care &amp; nutrition</em></span>
  </div>
</div>\`;

  return cover + toc + storyPage + feedingGuidePage + catPages + back;
}

// Boot: load products then render
async function boot() {
  try {
    let products = [];
    try {
      const r = await fetch('/api/public/products');
      if (r.ok) {
        const d = await r.json();
        if (d.products && d.products.length > 0) products = d.products;
      }
    } catch(_) {}
    if (products.length === 0) {
      const r = await fetch('/static/products-data.json');
      if (r.ok) products = await r.json();
    }
    document.getElementById('catalogPages').innerHTML = buildCatalog(products);
  } catch(err) {
    document.getElementById('catalogPages').innerHTML =
      '<div style="padding:40px;text-align:center;color:#c00">Error: '+err.message+'. <a href="/products">Return to catalog</a></div>';
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
    <a href="/catalog-print" target="_blank"
       style="display:inline-flex;align-items:center;gap:6px;background:#C9A84C;color:#1B2A4A;font-weight:700;font-size:12px;padding:7px 14px;border-radius:7px;text-decoration:none;white-space:nowrap;"
       onmouseover="this.style.background='#E0C87A'" onmouseout="this.style.background='#C9A84C'">
      <i class="fas fa-file-pdf"></i>
      <span class="hidden sm:inline">Download Catalog</span>
      <span class="sm:hidden">PDF</span>
    </a>
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
    // Use /api/public/products which applies expert descriptions over live KV data
    try { const r=await fetch('/api/public/products'); if(r.ok){const d=await r.json(); if(d.products&&d.products.length)products=d.products;} } catch(e){}
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
