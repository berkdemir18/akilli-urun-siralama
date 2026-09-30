"use strict";

((root) => {
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

  function parseLocaleNumber(raw) {
    const value = String(raw || "").replace(/\s/g, "").replace(/[^\d.,]/g, "");
    if (!value) return NaN;
    const lastComma = value.lastIndexOf(",");
    const lastDot = value.lastIndexOf(".");
    if (lastComma > lastDot) return Number(value.replace(/\./g, "").replace(",", "."));
    if (lastDot > lastComma && /\.\d{3}(?:\D|$)/.test(value)) return Number(value.replace(/\./g, ""));
    return Number(value.replace(/,/g, ""));
  }

  function parseCompactCount(raw) {
    const match = String(raw || "").trim().toLocaleLowerCase("tr-TR").match(/([\d.,]+)\s*(bin|b|k)?/i);
    if (!match) return 0;
    const number = parseLocaleNumber(match[1]);
    return Number.isFinite(number) ? Math.round(number * (match[2] ? 1000 : 1)) : 0;
  }

  function parseHepsiburadaMetricLine(text) {
    const value = String(text || "");
    // "Ürün puanı 4, 28 değerlendirme" — tam sayı puanlar da burada yakalanır.
    const labeled = value.match(/ürün puanı\s*([1-5](?:[.,]\d{1,2})?)\s*,\s*([\d.,]+)\s*değerlendirme/i);
    const match = labeled || value.match(/(?:★|⭐)?\s*(?<![\d.,])([1-5][.,]\d{1,2})\s*\(\s*([\d.,]+)\s*\)/);
    if (!match) return null;
    const rating = Number(match[1].replace(",", "."));
    const reviews = parseLocaleNumber(match[2]);
    return Number.isFinite(rating) && Number.isFinite(reviews) ? { rating, reviews } : null;
  }

  const PRICE_RE = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:TL|₺)(?![a-zçğıöşü])|₺\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi;

  // Fiyat olmayan ama "TL" içeren satırlar: kupon, taksit, kargo eşiği, birim fiyat, tasarruf, diğer satıcılar.
  const PRICE_NOISE_RE = /kupon|taksit|peşin fiyatına|\d\s*x\s*\d|\bx\s*$|^\s*\d+\s*x\b|üzeri|kargo|tasarruf|kazan|indirim kodu|birim|\/\s*(?:adet|kg|g|gr|lt|l|ml|100|metre|m)\b|diğer satın alma|yeni ürün|ikinci el|puan|chip-?para|hepsipara|cashback/i;

  function priceValues(text) {
    return [...String(text || "").matchAll(PRICE_RE)]
      .map((match) => parseLocaleNumber(match[1] || match[2]))
      .filter((value) => Number.isFinite(value) && value >= 1);
  }

  function cleanPriceLines(text) {
    const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const noisy = lines.filter((line) => PRICE_NOISE_RE.test(line));
    // Gürültü satırındaki tutarlar (ör. "Peşin fiyatına 3 x 916 TL") ayrı satırda tekrar yazılırsa onları da at.
    const banned = new Set(noisy.flatMap(priceValues));
    return lines.filter((line, index) => {
      if (PRICE_NOISE_RE.test(line)) return false;
      if (index > 0 && /^\d+\s*x$|peşin fiyatına$|taksit$/i.test(lines[index - 1]) && priceValues(line).length) return false;
      const values = priceValues(line);
      return !(values.length && values.every((value) => banned.has(value)));
    });
  }

  // Metinden fiyat: yalnızca seçicilerle fiyat alanı bulunamazsa kullanılır.
  function parsePrices(text) {
    const lines = cleanPriceLines(text);
    const basket = lines.find((line) => /sepette/i.test(line) && priceValues(line).length);
    const prices = priceValues(lines.join("\n"));
    if (!prices.length) return { price: 0, originalPrice: 0 };
    const price = basket ? Math.min(...priceValues(basket)) : Math.min(...prices);
    let originalPrice = Math.max(...prices);
    // Aynı kartta 5 katından büyük fark neredeyse her zaman başka bir sayıdır (paket, eşik vb.).
    if (originalPrice > price * 5) originalPrice = price;
    return { price, originalPrice };
  }

  function parseDiscount(text, price, originalPrice) {
    if (originalPrice > price && price > 0) {
      return clamp(Math.round((1 - (price / originalPrice)) * 100), 0, 80);
    }
    // Eski fiyat yoksa sadece kupon/2. ürün gibi koşulsuz olmayan yüzdeleri dışarıda bırakarak oku.
    const explicit = cleanPriceLines(text)
      .filter((line) => !/ürün|al\b|öde|sepet|kupon|kod/i.test(line))
      .flatMap((line) => [...line.matchAll(/%\s*(\d{1,2})\b|\b(\d{1,2})\s*%/g)].map((match) => Number(match[1] || match[2])));
    return clamp(Math.max(0, ...explicit), 0, 80);
  }

  function parseSalesCount(text) {
    const patterns = [
      /(?:son|geçen)\s+\d*\s*(?:saat|gün|ay)[^\d]{0,30}([\d.,]+\s*(?:bin|b|k)?\+?)\s*(?:adetten|üründen)\s*fazla\s*satın alındı/i,
      /(?:son\s+\d+\s+(?:saat|gün|ay)[^\d]{0,30})?([\d.,]+\s*(?:bin|b|k)?\+?)\s*(?:adet\s*)?(?:satıldı|satın alındı|kişi aldı)/i,
      /([\d.,]+\s*(?:bin|b|k)?\+?)\s+satış\b/i
    ];
    for (const pattern of patterns) {
      const match = String(text || "").match(pattern);
      if (match) return parseCompactCount(match[1]);
    }
    return 0;
  }

  function parseInterestCount(text) {
    const match = String(text || "").match(/([\d.,]+\s*(?:bin|b|k)?\+?)\s*kişi\s*(?:favoriledi|ekledi|inceliyor|görüntüledi)/i);
    return match ? parseCompactCount(match[1]) : 0;
  }

  function parseSellerRating(text) {
    const match = String(text || "").match(/satıcı\s*(?:puanı|skoru|değerlendirmesi)?\s*[:\-]?\s*([1-9](?:[.,]\d+)?|10)(?:\s*\/\s*10)?/i);
    if (!match) return null;
    const value = Number(match[1].replace(",", "."));
    return value <= 5 ? clamp(value / 5) : clamp(value / 10);
  }

  function parseShippingScore(text) {
    const value = String(text || "").toLocaleLowerCase("tr-TR");
    if (/bugün kargoda|aynı gün|bugün teslim/.test(value)) return 1;
    if (/yarın kargoda|yarın teslim|hızlı teslimat/.test(value)) return 0.82;
    if (/prime|ücretsiz kargo|kargo bedava/.test(value)) return 0.48;
    return null;
  }

  // Türkçe yorum dili: kelime kökü + olumsuzluk. "sorunsuz"/"sorun yok" olumlu, "iyi değil" olumsuz sayılır.
  const SENTIMENT_RULES = [
    [/sorunsuz|sorun (?:yok|olmadı|yaşamadım)|şikayet(?:im)? yok|pişman değil|tavsiye ederim|tavsiye edilir/g, 2],
    [/(?:iyi|güzel|kaliteli|sağlam|başarılı|memnun|kullanışlı)\s+(?:değil|olmadı|değildi)/g, -2],
    [/tavsiye etmem|tavsiye etmiyorum|almayın|pişman oldum|para(?:nıza)? yazık/g, -2],
    [/harika|mükemmel|kaliteli|başarılı|memnun|sağlam|kullanışlı|beğendim|süper|güzel|\biyi\b|hızlı (?:geldi|kargo|teslim)/g, 1],
    [/kötü|kalitesiz|bozuk|kırık|çizik|pişman|iade et|sorun|berbat|uyumsuz|uymadı|sahte|yamuk|geç geldi|dayanıksız|sarardı/g, -1]
  ];

  function parseSentiment(texts) {
    if (!Array.isArray(texts) || !texts.length) return null;
    let pos = 0;
    let neg = 0;
    texts.forEach((text) => {
      let normalized = ` ${String(text).toLocaleLowerCase("tr-TR")} `;
      SENTIMENT_RULES.forEach(([pattern, weight]) => {
        normalized = normalized.replace(pattern, () => {
          if (weight > 0) pos += weight; else neg -= weight;
          return " ";
        });
      });
    });
    return pos + neg ? clamp((pos + 1) / (pos + neg + 2)) : null;
  }

  function priceScores(items) {
    const valid = items.map((item) => item.price).filter((price) => Number.isFinite(price) && price > 0);
    if (valid.length < 2) return new Map(items.map((item) => [item, valid.length ? 0.5 : null]));
    const min = Math.log(Math.min(...valid));
    const max = Math.log(Math.max(...valid));
    return new Map(items.map((item) => {
      if (!item.price) return [item, null];
      return [item, max === min ? 0.5 : clamp(1 - ((Math.log(item.price) - min) / (max - min)))];
    }));
  }

  function isSponsoredText(text) {
    const head = String(text || "").toLocaleLowerCase("tr-TR").slice(0, 400);
    return /(^|\s)(sponsorlu|reklam|sponsored)(\s|$)/.test(head);
  }

  const WEIGHT_SETS = {
    balanced: { rating: 56, reviews: 14, sales: 8, interest: 2, sentiment: 5, seller: 5, shipping: 3, price: 3, discount: 2, photo: 2 },
    quality: { rating: 68, reviews: 10, sentiment: 10, seller: 9, photo: 3 },
    value: { rating: 35, reviews: 8, sentiment: 6, seller: 6, shipping: 8, price: 22, discount: 12, sales: 2, interest: 1 },
    popular: { rating: 20, reviews: 25, sales: 27, interest: 15, sentiment: 5, seller: 3, photo: 5 }
  };

  // Özel mod: kullanıcı dört ana ekseni 0–10 arası ayarlar, alt sinyallere buradan dağıtılır.
  function buildCustomWeights(custom = {}) {
    const q = clamp(Number(custom.quality ?? 7), 0, 10);
    const p = clamp(Number(custom.price ?? 4), 0, 10);
    const s = clamp(Number(custom.popular ?? 3), 0, 10);
    const t = clamp(Number(custom.shipping ?? 2), 0, 10);
    const weights = {
      rating: q * 5.6,
      reviews: (q * 1.4) + (s * 0.6),
      sentiment: q * 0.6,
      seller: q * 0.6,
      photo: q * 0.2,
      price: p * 1.3,
      discount: p * 0.6,
      sales: s * 1.1,
      interest: s * 0.4,
      shipping: t * 1.2
    };
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    return total ? weights : WEIGHT_SETS.balanced;
  }

  function scoreProducts(items, mode = "balanced", custom) {
    const relativePrices = priceScores(items);
    const weights = mode === "custom" ? buildCustomWeights(custom) : (WEIGHT_SETS[mode] || WEIGHT_SETS.balanced);

    return items.map((item) => {
      if (!item.rating) return { ...item, score: 0, components: {} };
      const priorRating = 4.2;
      const priorWeight = 30;
      const adjustedRating = ((item.rating * item.reviews) + (priorRating * priorWeight)) / (item.reviews + priorWeight);
      const salesCountScore = item.salesCount ? clamp(Math.log10(item.salesCount + 1) / 5) : 0;
      const salesScore = clamp(salesCountScore + ((item.salesSignal || 0) * 0.35));
      const interestScore = item.interestCount ? clamp(Math.log10(item.interestCount + 1) / 5) : 0;
      const components = {
        rating: clamp(adjustedRating / 5),
        reviews: clamp(Math.log10((item.reviews || 0) + 1) / 4),
        sales: salesScore,
        interest: interestScore,
        sentiment: item.sentiment,
        seller: item.sellerRating,
        shipping: item.shippingScore,
        price: relativePrices.get(item),
        discount: item.discountPct != null ? clamp(item.discountPct / 50) : null,
        photo: item.photoReviews ? clamp(Math.log10(item.photoReviews + 1) / 2) : null
      };

      let total = 0;
      let weightTotal = 0;
      Object.entries(weights).forEach(([key, weight]) => {
        const value = components[key];
        if (value == null || !Number.isFinite(value)) return;
        total += value * weight;
        weightTotal += weight;
      });
      const score = weightTotal ? Math.round((total / weightTotal) * 1000) / 10 : 0;
      return { ...item, score, components };
    });
  }

  const avg = (values) => {
    const valid = values.filter((value) => value != null && Number.isFinite(value));
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  };

  // Rozet açıklamasındaki dört çubuk: alt sinyallerin eksen ortalaması (veri yoksa null).
  function axisScores(components = {}) {
    return {
      quality: avg([components.rating, components.rating, components.sentiment, components.seller]),
      price: avg([components.price, components.discount]),
      popular: avg([components.reviews, components.sales || null, components.interest || null]),
      shipping: components.shipping ?? null
    };
  }

  /* ---------- Filtreler ---------- */

  const words = (value) => String(value || "").toLocaleLowerCase("tr-TR").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const padded = (value) => ` ${words(value).join(" ")} `;

  function parsePhraseList(raw) {
    return String(raw || "").split(/[,;\n]+/).map((part) => words(part).join(" ")).filter(Boolean);
  }

  // Tam kelime eşleşmesi: "pro" yazınca "Pro Max" yakalanır ama "profesyonel" yakalanmaz.
  function filterReason(item, filters = {}) {
    const title = padded(item.title);
    const minRating = Number(filters.minRating) || 0;
    const minReviews = Number(filters.minReviews) || 0;
    const priceMin = Number(filters.priceMin) || 0;
    const priceMax = Number(filters.priceMax) || 0;
    if (minRating && !(item.rating >= minRating)) return `Puan ${minRating.toLocaleString("tr-TR")} altı`;
    if (minReviews && !(item.reviews >= minReviews)) return `${minReviews} yorumdan az`;
    if ((priceMin || priceMax) && !item.price) return "Fiyat okunamadı";
    if (priceMin && item.price < priceMin) return "Fiyat aralığı dışında";
    if (priceMax && item.price > priceMax) return "Fiyat aralığı dışında";
    const missing = parsePhraseList(filters.include).find((phrase) => !title.includes(` ${phrase} `));
    if (missing) return `"${missing}" geçmiyor`;
    const banned = parsePhraseList(filters.exclude).find((phrase) => title.includes(` ${phrase} `));
    if (banned) return `"${banned}" geçiyor`;
    return null;
  }

  function activeFilterCount(filters = {}) {
    return ["minRating", "minReviews"].filter((key) => Number(filters[key]) > 0).length
      + (Number(filters.priceMin) > 0 || Number(filters.priceMax) > 0 ? 1 : 0)
      + (parsePhraseList(filters.include).length ? 1 : 0)
      + (parsePhraseList(filters.exclude).length ? 1 : 0);
  }

  /* ---------- Fiyat hafızası ---------- */

  const today = () => Math.floor(Date.now() / 864e5);

  // entries: [[gün, fiyat], ...] — gün başına en düşük fiyat tutulur, en fazla 60 kayıt.
  function recordPrice(entries = [], price, day = today()) {
    if (!(price > 0)) return entries;
    const next = entries.filter(([d]) => day - d <= 180);
    const last = next[next.length - 1];
    if (last && last[0] === day) last[1] = Math.min(last[1], price);
    else next.push([day, price]);
    return next.slice(-60);
  }

  function historyStats(entries = [], day = today()) {
    if (!entries.length) return null;
    const prices = entries.map(([, price]) => price);
    const min = Math.min(...prices);
    const minEntry = entries.find(([, price]) => price === min);
    return {
      n: entries.length,
      min,
      max: Math.max(...prices),
      span: day - entries[0][0],
      minDaysAgo: day - minEntry[0]
    };
  }

  function historyNotes(item) {
    const h = item.history;
    const reasons = [];
    const warnings = [];
    if (!h || h.n < 2 || h.span < 2 || !item.price) return { reasons, warnings };
    const tl = (value) => `${Math.round(value).toLocaleString("tr-TR")} TL`;
    if (item.price <= h.min * 1.001 && h.max > item.price * 1.03) reasons.push(`${h.span} günün en düşük fiyatı`);
    else if (item.price > h.min * 1.08) warnings.push(`${h.minDaysAgo} gün önce ${tl(h.min)}'ydi`);
    if (item.originalPrice && h.span >= 7 && item.originalPrice > h.max * 1.15) {
      warnings.push("Üstü çizili fiyat hiç görülmedi, indirim şişirilmiş olabilir");
    }
    return { reasons, warnings };
  }

  function confidenceLevel(reviews) {
    if (!reviews || reviews < 20) return "low";
    if (reviews < 200) return "medium";
    return "high";
  }

  // Kısa, insan diliyle "neden bu sırada" etiketleri ve uyarılar.
  function explainProduct(item) {
    const c = item.components || {};
    const reasons = [];
    const warnings = [];
    if (!item.score) return { reasons, warnings: ["Puan okunamadı"], confidence: "low" };

    if (item.rating >= 4.5 && item.reviews >= 200) reasons.push("Güvenilir yüksek puan");
    else if (item.rating >= 4.3 && item.reviews >= 50) reasons.push("İyi puan");
    if (c.price != null && c.price >= 0.75) reasons.push("Sayfadaki uygun fiyatlılardan");
    if (item.discountPct >= 20) reasons.push(`%${item.discountPct} indirim`);
    if (c.shipping != null && c.shipping >= 0.82) reasons.push(c.shipping >= 1 ? "Bugün kargoda" : "Hızlı kargo");
    if (item.salesCount >= 100) reasons.push(`${item.salesCount.toLocaleString("tr-TR")}+ satış`);
    else if (item.salesSignal >= 1) reasons.push("Çok satan");
    if (item.interestCount >= 1000) reasons.push("Çok favorilenmiş");
    if (item.sentiment != null && item.sentiment >= 0.72) reasons.push("Yorumlar olumlu");

    if (item.rating >= 4.8 && item.reviews < 20) warnings.push(`Sadece ${item.reviews || 0} yorum — 5 yıldız yanıltıcı olabilir`);
    else if (item.reviews < 10) warnings.push("Çok az yorum");
    if (item.sentiment != null && item.sentiment < 0.45) warnings.push("Yorum metinlerinde şikâyet ağırlıklı");
    if (item.rating >= 4.5 && item.sentiment != null && item.sentiment < 0.5) warnings.push("Yıldız yüksek ama yorumlar karışık");
    if (item.sellerRating != null && item.sellerRating < 0.8) warnings.push("Satıcı puanı düşük");
    if (item.sponsored) warnings.push("Sponsorlu / reklam");

    const history = historyNotes(item);
    return {
      reasons: [...history.reasons, ...reasons].slice(0, 3),
      warnings: [...new Set([...history.warnings, ...warnings])].slice(0, 2),
      confidence: confidenceLevel(item.reviews)
    };
  }

  const api = {
    isSponsoredText,
    buildCustomWeights,
    axisScores,
    confidenceLevel,
    parsePhraseList,
    filterReason,
    activeFilterCount,
    recordPrice,
    historyStats,
    historyNotes,
    explainProduct,
    parseLocaleNumber,
    parseCompactCount,
    parseHepsiburadaMetricLine,
    parsePrices,
    priceValues,
    cleanPriceLines,
    parseDiscount,
    parseSalesCount,
    parseInterestCount,
    parseSellerRating,
    parseShippingScore,
    parseSentiment,
    scoreProducts
  };
  root.AkilliUrunScore = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
