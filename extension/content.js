(() => {
  "use strict";

  if (window.__akilliUrunSiralamaLoaded) return;
  window.__akilliUrunSiralamaLoaded = true;

  const S = globalThis.AkilliUrunScore;

  const SITE = (() => {
    const testSite = document.documentElement.dataset.ausTestSite;
    if (testSite) return testSite;
    const host = location.hostname;
    if (host.includes("amazon.com.tr")) return "amazon";
    if (host.includes("trendyol.com")) return "trendyol";
    if (host.includes("hepsiburada.com")) return "hepsiburada";
    return null;
  })();

  if (!SITE || !S) return;

  const SITE_LABEL = { amazon: "Amazon TR", trendyol: "Trendyol", hepsiburada: "Hepsiburada" }[SITE];
  const SITE_LOC = { amazon: "Amazon TR'de", trendyol: "Trendyol'da", hepsiburada: "Hepsiburada'da" }[SITE];

  const CARD_SELECTORS = {
    amazon: [
      '[data-component-type="s-search-result"][data-asin]',
      '.s-result-item[data-asin]:not([data-asin=""])'
    ],
    trendyol: [
      '[data-testid="product-card"]',
      '.p-card-wrppr',
      '.prdct-cntnr-wrppr .p-card-wrppr'
    ],
    hepsiburada: [
      '[data-test-id="product-card"]',
      'li[class*="productListContent"]',
      'div[class*="productCard"]'
    ]
  };

  const TITLE_SELECTORS = {
    amazon: ["h2 span", "h2", '[data-cy="title-recipe"]'],
    trendyol: ['[data-testid="product-name"]', ".prdct-desc-cntnr-name", '[class*="product-name"]', "h3", "h2"],
    hepsiburada: ['[data-test-id^="title"]', '[data-test-id="product-card-name"]', '[class*="title"]', "h3", "h2"]
  };

  // Fiyat alanları: metinden tahmin etmek yerine önce sitenin kendi fiyat elemanı okunur.
  const PRICE_SELECTORS = {
    hepsiburada: {
      current: ['[data-test-id^="final-price"]', '[data-test-id*="price-current"]'],
      basket: ['[data-test-id*="basket-price"]', '[data-test-id*="price-in-basket"]'],
      original: ['[data-test-id^="prev-price"]', '[data-test-id*="old-price"]', '[data-test-id*="original-price"]']
    },
    amazon: {
      current: ['.a-price:not(.a-text-price) .a-offscreen'],
      basket: [],
      original: ['.a-price.a-text-price[data-a-strike] .a-offscreen', '.a-text-price .a-offscreen']
    },
    trendyol: {
      current: ['[data-testid="price-current-price"]', '[data-testid*="current-price"]', '[data-testid*="discounted-price"]', '[class*="discounted-price"]', '.prc-box-dscntd', '[class*="sale-price"]', '[class*="selling-price"]', '.prc-box-sllng', '[class*="price-value"]', '.price-item'],
      basket: ['[data-testid*="basket-price"]', '[class*="basket-price"]', '[class*="in-basket"]'],
      original: ['[data-testid*="original-price"]', '[class*="original-price"]', '[class*="old-price"]', '.prc-box-orgnl', '[class*="strikethrough"]']
    }
  };

  const MODES = {
    balanced: { label: "Dengeli", hint: "Güvenilir puan önde; fiyat, satış ve kargo destekler." },
    quality: { label: "Kalite", hint: "Puan, yorum güveni, yorum dili ve satıcıya bakar." },
    value: { label: "F/P", hint: "Kalite tabanını korur, sayfadaki fiyata ve indirime yüklenir." },
    popular: { label: "Popüler", hint: "Yorum sayısı, satış adedi ve favoriye öncelik verir." },
    custom: { label: "Özel", hint: "Dört ekseni kendin ayarla." }
  };

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(`aus-${key}`);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`aus-${key}`, JSON.stringify(value)); } catch (_) { /* depolama kapalı */ }
    }
  };

  // v2'deki düz metin mod kaydını da oku.
  const legacyMode = (() => { try { return localStorage.getItem("aus-sort-mode"); } catch (_) { return null; } })();
  const storedMode = store.get("mode", null) || legacyMode;

  const state = {
    active: false,
    mode: MODES[storedMode] ? storedMode : "balanced",
    custom: { quality: 7, price: 4, popular: 3, shipping: 2, ...store.get("custom", {}) },
    prefs: { dimSponsored: false, dimWeak: false, autoApply: false, ...store.get("prefs", {}) },
    panelOpen: !store.get("collapsed", false),
    scheduled: false,
    deepRunning: false,
    deepCache: new Map(Object.entries(readDeepCache())),
    originalOrder: new Map(),
    touchedCards: new Set(),
    lastItems: [],
    observer: null,
    filters: readFilters(),
    userOpened: false,
    autoCollapsed: false,
    bootAt: Date.now()
  };

  function emptyFilters() {
    return { minRating: 0, minReviews: 0, priceMin: "", priceMax: "", include: "", exclude: "", hide: false };
  }

  // Filtreler aramaya özeldir: sekme oturumunda tutulur, başka aramaya taşınmaz.
  function readFilters() {
    try { return { ...emptyFilters(), ...JSON.parse(sessionStorage.getItem("aus-filters") || "{}") }; } catch (_) { return emptyFilters(); }
  }

  function writeFilters() {
    try { sessionStorage.setItem("aus-filters", JSON.stringify(state.filters)); } catch (_) { /* depolama kapalı */ }
  }

  /* ---------- Fiyat hafızası (chrome.storage.local, cihazda kalır) ---------- */

  const priceMemory = {
    data: {},
    loaded: false,
    timer: null,
    async load() {
      try {
        if (globalThis.chrome?.storage?.local) {
          const result = await chrome.storage.local.get("aus-ph");
          this.data = result["aus-ph"] || {};
        } else {
          this.data = store.get("ph", {});
        }
      } catch (_) { this.data = {}; }
      this.loaded = true;
    },
    stats(key) {
      return key && this.data[key] ? S.historyStats(this.data[key]) : null;
    },
    record(items) {
      if (!this.loaded) return;
      let dirty = false;
      items.forEach((item) => {
        if (!item.key || !(item.price > 0)) return;
        const previous = this.data[item.key] || [];
        const next = S.recordPrice(previous.map((entry) => [...entry]), item.price);
        if (JSON.stringify(previous) !== JSON.stringify(next)) {
          this.data[item.key] = next;
          dirty = true;
        }
      });
      if (dirty && !this.timer) this.timer = setTimeout(() => this.save(), 3000);
    },
    save() {
      this.timer = null;
      const keys = Object.keys(this.data);
      if (keys.length > 4000) {
        keys.sort((a, b) => (this.data[a].at(-1)?.[0] || 0) - (this.data[b].at(-1)?.[0] || 0))
          .slice(0, keys.length - 4000)
          .forEach((key) => delete this.data[key]);
      }
      try {
        if (globalThis.chrome?.storage?.local) chrome.storage.local.set({ "aus-ph": this.data });
        else store.set("ph", this.data);
      } catch (_) { /* uzantı yeniden yüklendiyse bağlam kopmuş olabilir */ }
    }
  };

  // Ürünün kalıcı kimliği: URL'deki ref/sıra parçaları her aramada değişir.
  function productKey(card, url) {
    if (SITE === "amazon") {
      const asin = card.dataset.asin || url.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
      return asin ? `amazon:${asin}` : "";
    }
    const id = url.match(/-pm?-([A-Za-z0-9]+)/)?.[1];
    return id ? `${SITE}:${id}` : url;
  }

  const normalize = (value) => String(value || "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  const fmtRating = (value) => Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt = (value, digits = 1) => Number(value).toLocaleString("tr-TR", { minimumFractionDigits: value % 1 ? digits : 0, maximumFractionDigits: digits });
  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  /* ---------- Derin analiz önbelleği (sekme oturumu boyunca) ---------- */

  function readDeepCache() {
    try { return JSON.parse(sessionStorage.getItem("aus-deep") || "{}"); } catch (_) { return {}; }
  }

  function writeDeepCache() {
    try {
      const entries = [...state.deepCache.entries()].slice(-200);
      sessionStorage.setItem("aus-deep", JSON.stringify(Object.fromEntries(entries)));
    } catch (_) { /* kota dolu olabilir */ }
  }

  /* ---------- Karttan veri okuma ---------- */

  function firstText(card, selectors) {
    for (const selector of selectors) {
      const element = card.querySelector(selector);
      if (element) {
        const value = element.getAttribute("aria-label") || element.textContent;
        if (value && value.trim()) return value.trim();
      }
    }
    return "";
  }

  function extractRating(card, text) {
    const hbMetric = S.parseHepsiburadaMetricLine(text);
    if (hbMetric) return hbMetric.rating;

    const candidates = [
      firstText(card, [
        ".a-icon-alt",
        '[aria-label*="yıldız"]',
        '[aria-label*="üzerinden"]',
        '[data-test-id*="rating"]',
        '[class*="rating-score"]',
        '[class*="ratingScore"]',
        '[class*="ratingscore"]',
        ".rating-score"
      ]),
      card.getAttribute("aria-label") || ""
    ];

    for (const candidate of candidates) {
      const explicit = candidate.match(/5\s*yıldız\s*üzerinden\s*([0-5](?:[.,]\d+)?)/i)
        || candidate.match(/([0-5](?:[.,]\d+)?)\s*(?:üzerinden|out of)\s*5/i)
        || candidate.match(/([0-5](?:[.,]\d+)?)\s*(?:puan|yıldız|\/\s*5)/i);
      if (explicit) {
        const rating = Number(explicit[1].replace(",", "."));
        if (rating >= 0 && rating <= 5) return rating;
      }
    }

    const fallback = normalize(text).slice(0, 1400).match(/([1-5](?:[.,]\d)?)\s*(?:puan|yıldız|\/\s*5)/i);
    return fallback ? Number(fallback[1].replace(",", ".")) : 0;
  }

  function extractReviewCount(card, text) {
    const hbMetric = S.parseHepsiburadaMetricLine(text);
    if (hbMetric) return hbMetric.reviews;

    const selectorText = firstText(card, [
      ".a-size-base.s-underline-text",
      '[aria-label*="değerlendirme"]',
      '[aria-label*="yorum"]',
      '[data-test-id*="review"]',
      '[class*="review-count"]',
      '[class*="ratingCount"]',
      '[class*="ratingsCount"]',
      '[class*="rating-count"]'
    ]);

    for (const candidate of [selectorText, normalize(text).slice(0, 1600)]) {
      const labeled = candidate.match(/([\d.,]+\s*(?:bin|b|k)?)\s*(?:değerlendirme|yorum)/i);
      if (labeled) return S.parseCompactCount(labeled[1]);
      const bracketed = candidate.match(/[([]\s*([\d.,]+\s*(?:bin|b|k)?)\s*[)\]]/i);
      if (bracketed) return S.parseCompactCount(bracketed[1]);
      if (candidate === selectorText && candidate) {
        const direct = S.parseCompactCount(candidate);
        if (direct) return direct;
      }
    }
    return 0;
  }

  function extractSalesSignal(text) {
    const value = normalize(text).slice(0, 1800);
    if (/çok satan|en çok satan|#\s*1 çok satan|bestseller/.test(value)) return 1;
    if (/amazon'un seçimi|amazon’s choice|amazon's choice/.test(value)) return 0.45;
    return 0;
  }

  function extractTitle(card) {
    // aria-label değil görünen metin: HB başlığın aria-label'ına "Sepete ekle, fiyat…" yazıyor.
    const element = TITLE_SELECTORS[SITE].map((selector) => card.querySelector(selector)).find((el) => el?.textContent.trim());
    const title = element?.textContent || card.querySelector("img[alt]")?.alt || "";
    return title.replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function extractImage(card) {
    const img = card.querySelector("img");
    if (!img) return "";
    const src = img.currentSrc || img.src || img.dataset.src || "";
    return src.startsWith("data:") && src.length < 200 ? "" : src;
  }

  function elementPrice(element) {
    if (!element) return 0;
    const text = element.textContent || "";
    const values = S.priceValues(text);
    if (values.length) return values[0];
    const bare = text.match(/\d[\d.,]*/);
    const value = bare ? S.parseLocaleNumber(bare[0]) : NaN;
    return Number.isFinite(value) && value >= 1 ? value : 0;
  }

  function firstPrice(card, selectors) {
    for (const selector of selectors) {
      for (const element of card.querySelectorAll(selector)) {
        const value = elementPrice(element);
        if (value) return value;
      }
    }
    return 0;
  }

  function strikePrice(card) {
    for (const element of card.querySelectorAll("del, s, strike, span, div, p")) {
      if (element.children.length > 2) continue;
      const text = element.textContent || "";
      if (text.length > 40 || !/tl|₺/i.test(text)) continue;
      if (getComputedStyle(element).textDecorationLine.includes("line-through")) {
        const value = elementPrice(element);
        if (value) return value;
      }
    }
    return 0;
  }

  // Sıra: site fiyat alanı -> sepette fiyatı -> üstü çizili eski fiyat -> son çare temizlenmiş metin.
  function extractPrices(card, text) {
    const selectors = PRICE_SELECTORS[SITE];
    const fromText = S.parsePrices(text);
    let price = firstPrice(card, selectors.current);
    const basket = firstPrice(card, selectors.basket);
    let source = price ? "alan" : "metin";
    let originalPrice = firstPrice(card, selectors.original) || strikePrice(card);

    if (basket && (!price || basket < price)) {
      if (price && !originalPrice) originalPrice = price;
      price = basket;
    }
    if (!price) price = fromText.price;
    if (!originalPrice && fromText.price === price && fromText.originalPrice > price) originalPrice = fromText.originalPrice;
    if (!(originalPrice > price) || originalPrice > price * 5) originalPrice = 0;
    return { price, originalPrice, priceSource: price ? source : "yok" };
  }

  function isSponsored(card, text) {
    if (card.querySelector('.puis-sponsored-label-text, [data-component-type="sp-sponsored-result"], [class*="sponsored" i], [data-testid*="ad-badge"]')) return true;
    return S.isSponsoredText(text);
  }

  // Kart metni değişmediyse DOM'u baştan taramaya gerek yok (getComputedStyle pahalı).
  const visibleCache = new WeakMap();

  function readVisible(card) {
    const text = card.innerText || "";
    const cached = visibleCache.get(card);
    if (cached && cached.text === text) return cached.data;
    const data = computeVisible(card, text);
    visibleCache.set(card, { text, data });
    return data;
  }

  function analyze(card) {
    const visible = readVisible(card);
    const key = productKey(card, visible.url);
    return {
      card,
      key,
      history: priceMemory.stats(key),
      ...visible,
      deep: state.deepCache.has(visible.url),
      ...(state.deepCache.get(visible.url) || {})
    };
  }

  function computeVisible(card, text) {
    const { price, originalPrice, priceSource } = extractPrices(card, text);
    const url = productLink(card);
    return {
      card,
      url,
      title: extractTitle(card),
      image: extractImage(card),
      sponsored: isSponsored(card, text),
      rating: extractRating(card, text),
      reviews: extractReviewCount(card, text),
      salesSignal: extractSalesSignal(text),
      salesCount: S.parseSalesCount(text),
      interestCount: S.parseInterestCount(text),
      price,
      originalPrice,
      priceSource,
      discountPct: S.parseDiscount(text, price, originalPrice),
      shippingScore: S.parseShippingScore(text),
      sellerRating: S.parseSellerRating(text),
      sentiment: null,
      photoReviews: 0
    };
  }

  function getCards() {
    const found = new Set();
    CARD_SELECTORS[SITE].forEach((selector) => {
      document.querySelectorAll(selector).forEach((card) => {
        if (card.closest("#aus-root")) return;
        const hasLink = card.matches("a[href]") || card.querySelector("a[href]");
        if (hasLink && card.innerText.trim().length > 15) found.add(card);
      });
    });
    return [...found].filter((card) => ![...found].some((other) => other !== card && other.contains(card)));
  }

  function productLink(card) {
    const selectors = SITE === "amazon"
      ? ['a[href*="/dp/"]']
      : SITE === "trendyol"
        ? ['a[href*="-p-"]', 'a[href*="/p-"]']
        : ['a[href*="-p-"]', 'a[href*="/p-"]', 'a[href*="/urun/"]'];
    for (const selector of selectors) {
      const link = card.matches(selector) ? card : card.querySelector(selector);
      if (link?.href) return link.href.split("?")[0];
    }
    return ((card.matches("a[href]") ? card.href : card.querySelector("a[href]")?.href) || "").split("?")[0];
  }

  /* ---------- Skorlama ve sıralama ---------- */

  function computeItems() {
    const scored = S.scoreProducts(getCards().map(analyze), state.mode, state.custom);
    const filtering = S.activeFilterCount(state.filters) > 0;
    scored.forEach((item) => { item.filtered = filtering ? S.filterReason(item, state.filters) : null; });
    const sponsoredLast = state.prefs.dimSponsored;
    // Sıra: filtreye uyanlar önde; sponsorlular (isteğe bağlı) sonda; sonra skor.
    const ranked = scored.filter((item) => item.score > 0).sort((a, b) => {
      if (Boolean(a.filtered) !== Boolean(b.filtered)) return a.filtered ? 1 : -1;
      if (sponsoredLast && a.sponsored !== b.sponsored) return a.sponsored ? 1 : -1;
      return b.score - a.score;
    });
    ranked.forEach((item, index) => { item.rank = index + 1; });
    scored.forEach((item) => { item.explain = S.explainProduct(item); });
    priceMemory.record(scored);
    return scored;
  }

  function storeOriginal(element, index) {
    if (state.originalOrder.has(element)) return;
    state.originalOrder.set(element, {
      order: element.style.getPropertyValue("order"),
      priority: element.style.getPropertyPriority("order"),
      index
    });
  }

  function weakThreshold(items) {
    const scores = items.filter((item) => item.score > 0).map((item) => item.score).sort((a, b) => b - a);
    if (scores.length < 6) return -1;
    return scores[Math.floor(scores.length * 0.6)];
  }

  function applyDecorations(items) {
    const threshold = weakThreshold(items);
    items.forEach((item) => {
      const card = item.card;
      const dim = (state.prefs.dimSponsored && item.sponsored)
        || (state.prefs.dimWeak && (!item.score || item.score < threshold));
      const out = Boolean(state.active && item.filtered);
      card.classList.toggle("aus-hide", out && state.filters.hide);
      card.classList.toggle("aus-dim", Boolean(state.active && (dim || (out && !state.filters.hide))));
      if (state.active) {
        addScoreBadge(item);
        state.touchedCards.add(card);
      }
    });
  }

  function applySort(items) {
    const grouped = new Map();
    items.forEach((item, index) => {
      storeOriginal(item.card, index);
      const parent = item.card.parentElement;
      if (!parent) return;
      if (!grouped.has(parent)) grouped.set(parent, []);
      grouped.get(parent).push(item);
    });

    grouped.forEach((group, parent) => {
      const siblings = [...parent.children];
      const productSlots = group.map((item) => siblings.indexOf(item.card)).filter((index) => index >= 0).sort((a, b) => a - b);
      siblings.forEach((sibling, index) => {
        storeOriginal(sibling, index);
        sibling.style.setProperty("order", String(index), "important");
      });
      const sorted = [...group].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
      sorted.forEach((item, index) => item.card.style.setProperty("order", String(productSlots[index] ?? index), "important"));
    });
  }

  function refresh() {
    const items = computeItems();
    state.lastItems = items;
    if (state.active) applySort(items);
    applyDecorations(items);
    renderPanel(items);
    autoCollapse(items.length);
  }

  // Ürün detay sayfası gibi liste olmayan yerlerde panel yer kaplamasın (kalıcı ayarı bozmaz).
  function autoCollapse(total) {
    if (state.userOpened || Date.now() - state.bootAt < 2500) return;
    if (total < 3 && state.panelOpen) {
      togglePanel(false, false);
      state.autoCollapsed = true;
    } else if (total >= 3 && state.autoCollapsed && !store.get("collapsed", false)) {
      togglePanel(true, false);
      state.autoCollapsed = false;
    }
  }

  function restoreOrder() {
    state.originalOrder.forEach((original, element) => {
      if (!element?.style) return;
      if (original.order) element.style.setProperty("order", original.order, original.priority);
      else element.style.removeProperty("order");
    });
    state.touchedCards.forEach((card) => {
      card.querySelector(":scope > .aus-score-badge")?.remove();
      card.classList.remove("aus-scored-card", "aus-dim", "aus-hide");
    });
    state.touchedCards.clear();
    state.originalOrder.clear();
  }

  function setActive(active) {
    state.active = active;
    if (!active) restoreOrder();
    refresh();
    if (state.prefs.autoApply) store.set("active", active);
  }

  function scheduleRefresh() {
    if (state.scheduled) return;
    state.scheduled = true;
    setTimeout(() => {
      state.scheduled = false;
      refresh();
    }, 500);
  }

  /* ---------- Kart rozeti + açıklama kartı ---------- */

  function tierOf(score) {
    if (score >= 80) return "hi";
    if (score >= 65) return "mid";
    return "lo";
  }

  function addScoreBadge(item) {
    let badge = item.card.querySelector(":scope > .aus-score-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "aus-score-badge";
      badge.addEventListener("mouseenter", () => showTip(badge));
      badge.addEventListener("mouseleave", hideTip);
      item.card.appendChild(badge);
    }
    item.card.classList.add("aus-scored-card");
    badge.__ausItem = item;
    const warn = item.explain.warnings.length ? '<i class="aus-b-warn" aria-hidden="true">!</i>' : "";
    badge.dataset.tier = item.score ? tierOf(item.score) : "none";
    badge.innerHTML = item.score
      ? `<span class="aus-b-rank">${item.rank}</span><span class="aus-b-score">${fmt(item.score)}</span>${warn}`
      : '<span class="aus-b-score">Veri yok</span>';
    badge.setAttribute("aria-label", item.score ? `Akıllı sıra ${item.rank}, skor ${fmt(item.score)}` : "Puan okunamadı");
  }

  function bar(label, value) {
    if (value == null) return `<div class="aus-t-row"><span>${label}</span><div class="aus-t-bar is-empty"></div><em>—</em></div>`;
    const pct = Math.round(value * 100);
    return `<div class="aus-t-row"><span>${label}</span><div class="aus-t-bar"><i style="width:${pct}%"></i></div><em>${pct}</em></div>`;
  }

  const CONFIDENCE = { low: "Zayıf kanıt", medium: "Orta kanıt", high: "Güçlü kanıt" };

  function showTip(badge) {
    const item = badge.__ausItem;
    const tip = document.querySelector("#aus-tip");
    if (!item || !tip) return;
    if (!item.score) {
      tip.innerHTML = '<p class="aus-t-empty">Bu kartta puan ya da yorum sayısı okunamadı. Sıralamada sona alındı.</p>';
    } else {
      const axes = S.axisScores(item.components);
      const facts = [
        `★ ${fmtRating(item.rating)} · ${item.reviews.toLocaleString("tr-TR")} yorum`,
        item.price ? `${item.price.toLocaleString("tr-TR")} TL${item.originalPrice ? ` (eski ${item.originalPrice.toLocaleString("tr-TR")})` : ""}` : "Fiyat okunamadı",
        item.deep ? "Derin analizli" : null
      ].filter(Boolean).join(" · ");
      const h = item.history;
      const memory = h && h.n >= 2
        ? `<p class="aus-t-memory"><span>Fiyat hafızası · ${h.span} gün</span>en düşük <b>${Math.round(h.min).toLocaleString("tr-TR")}</b> · en yüksek <b>${Math.round(h.max).toLocaleString("tr-TR")}</b> TL</p>`
        : "";
      const filtered = item.filtered ? `<p class="aus-t-filter">Filtre dışı: ${escapeHtml(item.filtered)}</p>` : "";
      tip.innerHTML = `
        <header><b>#${item.rank}</b><strong>${fmt(item.score)}</strong><span class="aus-t-conf" data-level="${item.explain.confidence}">${CONFIDENCE[item.explain.confidence]}</span></header>
        <p class="aus-t-facts">${escapeHtml(facts)}</p>${filtered}
        ${bar("Kalite", axes.quality)}${bar("Fiyat", axes.price)}${bar("Popülerlik", axes.popular)}${bar("Kargo", axes.shipping)}
        ${item.explain.reasons.length ? `<ul class="aus-t-good">${item.explain.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
        ${item.explain.warnings.length ? `<ul class="aus-t-warn">${item.explain.warnings.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
        ${memory}`;
    }
    tip.hidden = false;
    const rect = badge.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + tipRect.width > innerWidth - 12) left = innerWidth - tipRect.width - 12;
    if (top + tipRect.height > innerHeight - 12) top = rect.top - tipRect.height - 8;
    tip.style.left = `${Math.max(12, left)}px`;
    tip.style.top = `${Math.max(12, top)}px`;
  }

  function hideTip() {
    const tip = document.querySelector("#aus-tip");
    if (tip) tip.hidden = true;
  }

  /* ---------- Derin analiz ---------- */

  function jsonLdNodes(value, output = []) {
    if (!value || typeof value !== "object") return output;
    if (Array.isArray(value)) value.forEach((item) => jsonLdNodes(item, output));
    else {
      output.push(value);
      Object.values(value).forEach((item) => jsonLdNodes(item, output));
    }
    return output;
  }

  function parseDeepDocument(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nodes = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try { jsonLdNodes(JSON.parse(script.textContent), nodes); } catch (_) { /* bozuk şemayı geç */ }
    });
    const product = nodes.find((node) => {
      const type = node["@type"];
      return type === "Product" || (Array.isArray(type) && type.includes("Product"));
    });
    const aggregate = product?.aggregateRating || nodes.find((node) => node.ratingValue && node.reviewCount);
    let reviews = nodes
      .filter((node) => node.reviewBody || (node["@type"] === "Review" && node.description))
      .map((node) => node.reviewBody || node.description)
      .slice(0, 30);
    // Amazon JSON-LD vermez; yorumlar HTML'de data-hook ile durur.
    if (!reviews.length) {
      reviews = [...doc.querySelectorAll('[data-hook="review-body"], [data-hook="reviewText"], [data-hook="review-collapsed"]')]
        .map((element) => element.textContent.trim()).filter(Boolean).slice(0, 30);
    }
    const bodyText = doc.body?.textContent || "";
    const sellerRating = S.parseSellerRating(bodyText);
    const salesCount = S.parseSalesCount(bodyText);
    // Sadece gerçek müşteri fotoğrafı döşemeleri; profil resimleri sayılmaz.
    const reviewImages = doc.querySelectorAll('[data-hook="ReviewMediaList"] img, [data-hook="review-image-tile-gallery"] img, img[data-hook="review-image-tile"], img.review-image-tile').length;
    const amazonRating = doc.querySelector("#acrPopover")?.getAttribute("title") || doc.querySelector("#averageCustomerReviews .a-icon-alt")?.textContent || "";
    const amazonRatingValue = amazonRating.match(/üzerinden\s*([0-5](?:[.,]\d)?)/i)?.[1];
    const rating = Number(String(aggregate?.ratingValue || amazonRatingValue || "").replace(",", "."));
    const reviewCount = S.parseCompactCount(aggregate?.reviewCount || aggregate?.ratingCount || doc.querySelector("#acrCustomerReviewText")?.textContent || "");
    const sentiment = S.parseSentiment(reviews);
    return {
      ...(Number.isFinite(rating) && rating > 0 ? { rating } : {}),
      ...(reviewCount ? { reviews: reviewCount } : {}),
      ...(sellerRating != null ? { sellerRating } : {}),
      ...(salesCount ? { salesCount } : {}),
      ...(sentiment != null ? { sentiment } : {}),
      ...(reviewImages ? { photoReviews: Math.min(reviewImages, 99) } : {})
    };
  }

  async function fetchDeep(url) {
    if (!url || !url.startsWith(location.origin)) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, { credentials: "same-origin", signal: controller.signal });
      if (!response.ok) return false;
      const deep = parseDeepDocument(await response.text());
      state.deepCache.set(url, deep);
      return Object.keys(deep).length > 0;
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function runDeepAnalysis() {
    if (state.deepRunning) return;
    const urls = [...new Set(getCards().map(productLink))].filter((url) => url && !state.deepCache.has(url)).slice(0, 24);
    if (!urls.length) {
      setDeepStatus("Görünen tüm ürünler zaten analiz edildi", 1);
      return;
    }
    state.deepRunning = true;
    let cursor = 0;
    let done = 0;
    let enriched = 0;
    setDeepStatus(`Detay sayfaları okunuyor 0/${urls.length}`, 0);
    const worker = async () => {
      while (cursor < urls.length) {
        const url = urls[cursor++];
        if (await fetchDeep(url)) enriched += 1;
        done += 1;
        setDeepStatus(`Detay sayfaları okunuyor ${done}/${urls.length}`, done / urls.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, urls.length) }, worker));
    state.deepRunning = false;
    writeDeepCache();
    setDeepStatus(enriched ? `${enriched} ürün zenginleştirildi` : "Site detay verisi vermedi, kart verisiyle devam", 1);
    refresh();
  }

  function setDeepStatus(text, progress) {
    const status = document.querySelector("#aus-deep-status");
    const fill = document.querySelector("#aus-deep-fill");
    const button = document.querySelector("#aus-deep");
    if (status) status.textContent = text;
    if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
    document.querySelector("#aus-root")?.classList.toggle("aus-deep-running", state.deepRunning);
    if (button) button.disabled = state.deepRunning;
  }

  /* ---------- Panel ---------- */

  function renderPanel(items) {
    const root = document.querySelector("#aus-root");
    if (!root) return;
    const scored = items.filter((item) => item.score > 0);
    const total = items.length;
    const deepCount = items.filter((item) => item.deep).length;
    const sponsored = items.filter((item) => item.sponsored).length;
    const noPrice = items.filter((item) => !item.price).length;
    const filteredOut = items.filter((item) => item.filtered).length;
    const filterCount = S.activeFilterCount(state.filters);
    const countPill = root.querySelector("#aus-filter-count");
    countPill.textContent = filterCount;
    countPill.hidden = !filterCount;
    root.querySelector("#aus-filter-clear").hidden = !filterCount;

    root.classList.toggle("is-active", state.active);
    root.classList.toggle("is-empty", total < 2);

    const main = root.querySelector("#aus-main");
    main.textContent = state.active ? "Orijinal sıraya dön" : "Akıllı sıralamayı uygula";
    main.classList.toggle("is-on", state.active);

    root.querySelector("#aus-stats").innerHTML = total
      ? `<span><b>${total}</b> ürün</span><span><b>${scored.length}</b> skorlu</span>${total - scored.length ? `<span><b>${total - scored.length}</b> veri yok</span>` : ""}${deepCount ? `<span><b>${deepCount}</b> derin</span>` : ""}${sponsored ? `<span><b>${sponsored}</b> sponsorlu</span>` : ""}${noPrice ? `<span><b>${noPrice}</b> fiyatsız</span>` : ""}${filteredOut ? `<span><b>${filteredOut}</b> filtre dışı</span>` : ""}`
      : "<span>Bu sayfada sıralanacak ürün listesi yok</span>";

    root.querySelector(".aus-mini-dot").hidden = !state.active;

    const podium = root.querySelector("#aus-podium");
    const top = [...scored].filter((item) => !item.filtered).sort((a, b) => a.rank - b.rank).slice(0, 3);
    podium.innerHTML = top.length
      ? top.map((item) => `
          <li><button type="button" data-rank="${item.rank}" title="${escapeHtml(item.title)}">
            <span class="aus-p-rank">${item.rank}</span>
            ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="aus-p-img"></span>'}
            <span class="aus-p-body">
              <span class="aus-p-title">${escapeHtml(item.title || "İsimsiz ürün")}</span>
              <span class="aus-p-why">${escapeHtml([...item.explain.reasons.slice(0, 2), ...item.explain.warnings.slice(0, 1).map((w) => `⚠ ${w}`)].join(" · ") || `★ ${fmtRating(item.rating)} · ${item.reviews.toLocaleString("tr-TR")} yorum`)}</span>
            </span>
            <span class="aus-p-score" data-tier="${tierOf(item.score)}">${fmt(item.score)}</span>
          </button></li>`).join("")
      : "";
    root.querySelector(".aus-podium-wrap").hidden = !top.length;
  }

  function jumpTo(rank) {
    const item = state.lastItems.find((entry) => entry.rank === rank);
    if (!item) return;
    item.card.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    item.card.classList.remove("aus-flash");
    void item.card.offsetWidth;
    item.card.classList.add("aus-flash");
    setTimeout(() => item.card.classList.remove("aus-flash"), 1800);
  }

  async function copyTop() {
    const button = document.querySelector("#aus-copy");
    const top = state.lastItems.filter((item) => item.score > 0 && !item.filtered).sort((a, b) => a.rank - b.rank).slice(0, 5);
    if (!top.length) return;
    const lines = top.map((item) => [
      `${item.rank}. ${item.title}`,
      `   ${item.price ? `${item.price.toLocaleString("tr-TR")} TL · ` : ""}★ ${fmtRating(item.rating)} (${item.reviews.toLocaleString("tr-TR")}) · skor ${fmt(item.score)}`,
      `   ${item.url}`
    ].join("\n"));
    const text = `${SITE_LABEL} · ${MODES[state.mode].label} sıralama\n\n${lines.join("\n\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Kopyalandı ✓";
    } catch (_) {
      button.textContent = "Kopyalanamadı";
    }
    setTimeout(() => { button.textContent = "İlk 5'i kopyala"; }, 1600);
  }

  // Panel başlığından sürüklenir; konum sitede hatırlanır, çift tık varsayılana döndürür.
  function applyPosition(root, pos) {
    if (!pos) {
      ["left", "top", "right", "bottom", "--aus-maxh"].forEach((prop) => root.style.removeProperty(prop));
      return;
    }
    const width = root.offsetWidth || 356;
    const x = Math.min(Math.max(8, pos.x), innerWidth - width - 8);
    const y = Math.min(Math.max(8, pos.y), innerHeight - 120);
    root.style.setProperty("left", `${x}px`);
    root.style.setProperty("top", `${y}px`);
    root.style.setProperty("right", "auto");
    root.style.setProperty("bottom", "auto");
    root.style.setProperty("--aus-maxh", `${innerHeight - y - 12}px`);
  }

  function enableDrag(root) {
    const handle = root.querySelector(".aus-head");
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = root.getBoundingClientRect();
      const dx = event.clientX - rect.left;
      const dy = event.clientY - rect.top;
      handle.setPointerCapture(event.pointerId);
      root.classList.add("is-dragging");
      hideTip();
      const move = (e) => applyPosition(root, { x: e.clientX - dx, y: e.clientY - dy });
      const up = () => {
        handle.removeEventListener("pointermove", move);
        root.classList.remove("is-dragging");
        const r = root.getBoundingClientRect();
        store.set("pos", { x: Math.round(r.left), y: Math.round(r.top) });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up, { once: true });
      handle.addEventListener("pointercancel", up, { once: true });
    });
    handle.addEventListener("dblclick", (event) => {
      if (event.target.closest("button")) return;
      store.set("pos", null);
      applyPosition(root, null);
    });
    addEventListener("resize", () => applyPosition(root, store.get("pos", null)));
    applyPosition(root, store.get("pos", null));
  }

  function renderFilterUi(root) {
    const f = state.filters;
    root.querySelectorAll(".aus-chips").forEach((group) => {
      group.querySelectorAll("button").forEach((button) => {
        button.classList.toggle("is-on", Number(button.dataset.value) === Number(f[group.dataset.filter]));
      });
    });
    root.querySelectorAll("[data-filter-input]").forEach((input) => {
      const key = input.dataset.filterInput;
      if (input.type === "checkbox") input.checked = Boolean(f[key]);
      else if (document.activeElement !== input) input.value = f[key] ?? "";
    });
  }

  function onFilterChange(root, immediate) {
    writeFilters();
    renderFilterUi(root);
    // Filtreye dokunulduysa amaç sıralı listeyi görmektir.
    if (!state.active && S.activeFilterCount(state.filters)) {
      state.active = true;
      if (state.prefs.autoApply) store.set("active", true);
    }
    if (immediate) refresh(); else scheduleRefresh();
  }

  function renderModeUi(root) {
    root.querySelectorAll(".aus-seg button").forEach((button) => {
      const on = button.dataset.mode === state.mode;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-checked", String(on));
    });
    root.querySelector("#aus-hint").textContent = MODES[state.mode].hint;
    root.querySelector(".aus-custom").hidden = state.mode !== "custom";
  }

  function mountPanel() {
    if (document.querySelector("#aus-root")) return;
    const root = document.createElement("aside");
    root.id = "aus-root";
    root.setAttribute("aria-label", "Akıllı Ürün Sıralama");
    const sliders = [
      ["quality", "Kalite"], ["price", "Fiyat"], ["popular", "Popülerlik"], ["shipping", "Kargo"]
    ].map(([key, label]) => `
      <label class="aus-slider"><span>${label}</span>
        <input type="range" min="0" max="10" step="1" data-axis="${key}" value="${state.custom[key]}">
        <output>${state.custom[key]}</output>
      </label>`).join("");

    root.innerHTML = `
      <button class="aus-mini" id="aus-mini" type="button" aria-label="Akıllı Ürün Sıralama panelini aç">
        <svg class="aus-mark" viewBox="18 14 92 96" aria-hidden="true"><path d="M64.0 19.0L69.3 32.7L84.0 33.5L72.6 42.8L76.3 57.0L64.0 49.0L51.7 57.0L55.4 42.8L44.0 33.5L58.7 32.7Z"/><rect x="24" y="80" width="24" height="26" rx="5" opacity=".62"/><rect x="52" y="68" width="24" height="38" rx="5"/><rect x="80" y="88" width="24" height="18" rx="5" opacity=".38"/></svg>
        <span class="aus-mini-dot" hidden></span>
      </button>
      <section class="aus-panel" role="dialog" aria-label="Akıllı Ürün Sıralama">
        <header class="aus-head">
          <div class="aus-brand">
            <span class="aus-logo" aria-hidden="true"><svg class="aus-mark" viewBox="18 14 92 96" aria-hidden="true"><path d="M64.0 19.0L69.3 32.7L84.0 33.5L72.6 42.8L76.3 57.0L64.0 49.0L51.7 57.0L55.4 42.8L44.0 33.5L58.7 32.7Z"/><rect x="24" y="80" width="24" height="26" rx="5" opacity=".62"/><rect x="52" y="68" width="24" height="38" rx="5"/><rect x="80" y="88" width="24" height="18" rx="5" opacity=".38"/></svg></span>
            <div><h2>Akıllı Sıralama</h2><p>${SITE_LABEL}<span class="aus-live"> · uygulandı</span></p></div>
          </div>
          <button id="aus-collapse" class="aus-icon" type="button" aria-label="Paneli küçült" title="Küçült (Alt+Shift+S)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
          </button>
        </header>

        <div class="aus-seg" role="radiogroup" aria-label="Sıralama modu">
          ${Object.entries(MODES).map(([key, mode]) => `<button type="button" role="radio" data-mode="${key}">${mode.label}</button>`).join("")}
        </div>
        <p id="aus-hint" class="aus-hint"></p>
        <div class="aus-custom" hidden>${sliders}</div>

        <details class="aus-filters">
          <summary>Filtreler <span id="aus-filter-count" class="aus-count-pill" hidden>0</span><button id="aus-filter-clear" class="aus-link" type="button" hidden>Temizle</button></summary>
          <div class="aus-f-row"><span>Puan</span>
            <div class="aus-chips" data-filter="minRating">
              <button type="button" data-value="0">Hepsi</button><button type="button" data-value="3.5">3,5+</button><button type="button" data-value="4">4+</button><button type="button" data-value="4.5">4,5+</button>
            </div>
          </div>
          <div class="aus-f-row"><span>Yorum</span>
            <div class="aus-chips" data-filter="minReviews">
              <button type="button" data-value="0">Hepsi</button><button type="button" data-value="10">10+</button><button type="button" data-value="50">50+</button><button type="button" data-value="200">200+</button>
            </div>
          </div>
          <div class="aus-f-row"><span>Fiyat</span>
            <div class="aus-range">
              <input type="number" inputmode="numeric" min="0" placeholder="en az" data-filter-input="priceMin" aria-label="En az fiyat">
              <i>–</i>
              <input type="number" inputmode="numeric" min="0" placeholder="en çok" data-filter-input="priceMax" aria-label="En çok fiyat">
              <em>TL</em>
            </div>
          </div>
          <label class="aus-f-row"><span>Olsun</span><input type="text" placeholder="ör. 17 pro, magsafe" data-filter-input="include" spellcheck="false"></label>
          <label class="aus-f-row"><span>Olmasın</span><input type="text" placeholder="ör. max, 17e" data-filter-input="exclude" spellcheck="false"></label>
          <label class="aus-check aus-f-hide"><input type="checkbox" data-filter-input="hide"><span>Uymayanları soldurma, tamamen gizle</span></label>
        </details>

        <div class="aus-podium-wrap" hidden>
          <div class="aus-label-row"><p class="aus-label">Senin için ilk 3</p><button id="aus-copy" class="aus-link" type="button">İlk 5'i kopyala</button></div>
          <ol id="aus-podium" class="aus-podium"></ol>
        </div>

        <button id="aus-main" class="aus-primary" type="button">Akıllı sıralamayı uygula</button>

        <div class="aus-deep">
          <button id="aus-deep" class="aus-secondary" type="button">Derin analiz <small>detay sayfalarından yorum + satıcı</small></button>
          <div class="aus-deep-bar"><i id="aus-deep-fill"></i></div>
          <p id="aus-deep-status" class="aus-deep-status">24 ürüne kadar · 3 paralel istek · veri dışarı çıkmaz</p>
        </div>

        <div id="aus-stats" class="aus-stats"></div>

        <details class="aus-opts">
          <summary>Görünüm ve otomatik</summary>
          <label class="aus-check"><input type="checkbox" data-pref="dimSponsored"><span>Sponsorluları soldur ve sona at</span></label>
          <label class="aus-check"><input type="checkbox" data-pref="dimWeak"><span>Alt %40'ı soldur</span></label>
          <label class="aus-check"><input type="checkbox" data-pref="autoApply"><span>${SITE_LOC} otomatik uygula</span></label>
        </details>
      </section>
      <div id="aus-tip" class="aus-tip" role="tooltip" hidden></div>`;
    document.body.appendChild(root);

    root.querySelector("#aus-main").addEventListener("click", () => setActive(!state.active));
    root.querySelector("#aus-deep").addEventListener("click", runDeepAnalysis);
    root.querySelector("#aus-collapse").addEventListener("click", () => togglePanel(false));
    root.querySelector("#aus-mini").addEventListener("click", () => {
      state.userOpened = true;
      state.autoCollapsed = false;
      togglePanel(true);
    });
    root.querySelector("#aus-copy").addEventListener("click", copyTop);

    root.querySelectorAll(".aus-chips button").forEach((button) => {
      button.addEventListener("click", () => {
        state.filters[button.parentElement.dataset.filter] = Number(button.dataset.value);
        onFilterChange(root, true);
      });
    });
    root.querySelectorAll("[data-filter-input]").forEach((input) => {
      const key = input.dataset.filterInput;
      input.addEventListener(input.type === "checkbox" ? "change" : "input", () => {
        state.filters[key] = input.type === "checkbox" ? input.checked : input.value;
        onFilterChange(root, input.type === "checkbox");
      });
    });
    root.querySelector("#aus-filter-clear").addEventListener("click", (event) => {
      event.preventDefault();
      state.filters = emptyFilters();
      onFilterChange(root, true);
    });
    // Sitenin klavye kısayolları panelde yazarken tetiklenmesin.
    root.addEventListener("keydown", (event) => event.stopPropagation());
    root.querySelector("#aus-podium").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-rank]");
      if (button) jumpTo(Number(button.dataset.rank));
    });

    root.querySelectorAll(".aus-seg button").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        store.set("mode", state.mode);
        renderModeUi(root);
        refresh();
      });
    });

    root.querySelectorAll(".aus-custom input").forEach((input) => {
      input.addEventListener("input", () => {
        state.custom[input.dataset.axis] = Number(input.value);
        input.nextElementSibling.textContent = input.value;
        store.set("custom", state.custom);
        scheduleRefresh();
      });
    });

    root.querySelectorAll("[data-pref]").forEach((input) => {
      input.checked = Boolean(state.prefs[input.dataset.pref]);
      input.addEventListener("change", () => {
        state.prefs[input.dataset.pref] = input.checked;
        store.set("prefs", state.prefs);
        if (input.dataset.pref === "autoApply") store.set("active", input.checked && state.active);
        refresh();
      });
    });

    renderModeUi(root);
    renderFilterUi(root);
    if (S.activeFilterCount(state.filters)) root.querySelector(".aus-filters").open = true;
    enableDrag(root);
    togglePanel(state.panelOpen, false);
  }

  function togglePanel(force, persist = true) {
    state.panelOpen = typeof force === "boolean" ? force : !state.panelOpen;
    document.querySelector("#aus-root")?.classList.toggle("aus-collapsed", !state.panelOpen);
    if (!state.panelOpen) hideTip();
    if (persist) store.set("collapsed", !state.panelOpen);
  }

  mountPanel();
  if (state.prefs.autoApply && store.get("active", false)) state.active = true;
  if (S.activeFilterCount(state.filters)) state.active = true;
  refresh();
  priceMemory.load().then(refresh);
  setTimeout(refresh, 3000);

  state.observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      if (record.target.closest?.("#aus-root, .aus-score-badge")) return false;
      const changedNodes = [...record.addedNodes, ...record.removedNodes];
      return !changedNodes.length || !changedNodes.every((node) => node.nodeType === 1 && node.matches?.(".aus-score-badge"));
    });
    if (relevant) scheduleRefresh();
  });
  state.observer.observe(document.body, { childList: true, subtree: true });
  addEventListener("scroll", hideTip, { passive: true });

  // Test yardımcısı: içerik betiği izole dünyada çalışır, sayfa bunu göremez.
  globalThis.__ausDebug = () => state.lastItems.map(({ card, components, explain, ...item }) => ({ ...item, qa: card.dataset.qa }));

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "AUS_TOGGLE_PANEL") togglePanel();
    });
  }
})();
