"use strict";

const assert = require("node:assert/strict");
const score = require("./score");

assert.deepEqual(score.parseHepsiburadaMetricLine("★ 4,8 (119)"), { rating: 4.8, reviews: 119 });
assert.deepEqual(score.parseHepsiburadaMetricLine("4,3 (1.140)"), { rating: 4.3, reviews: 1140 });
assert.deepEqual(score.parsePrices("Sepette 873,76 TL %20 699,00 TL"), { price: 699, originalPrice: 873.76 });
assert.equal(score.parseDiscount("Sepette 873,76 TL %20 699,00 TL", 699, 873.76), 20);
assert.equal(score.parseSalesCount("Geçen ay 1.500+ adet satın alındı"), 1500);
assert.equal(score.parseSalesCount("Geçen ay 200 adetten fazla satın alındı"), 200);
assert.equal(score.parseInterestCount("1,4B kişi favoriledi!"), 1400);
assert.equal(score.parseInterestCount("3 günde 329 kişi ekledi!"), 329);
assert.equal(score.parseShippingScore("Bugün kargoda"), 1);
assert.equal(score.parseShippingScore("Yarın kargoda"), 0.82);
assert.equal(score.parseSellerRating("Satıcı puanı: 9,6 / 10"), 0.96);
assert.ok(score.parseSentiment(["Ürün kaliteli ve çok güzel", "Hızlı teslim edildi"]) > 0.5);
assert.ok(score.parseSentiment(["Kırık geldi, iade ettim", "Kalitesiz ve kötü"]) < 0.5);

const products = [
  { id: "kanıtlı", rating: 4.7, reviews: 2000, price: 900, discountPct: 5, salesSignal: 0, salesCount: 0, sentiment: null, sellerRating: null, shippingScore: null, photoReviews: 0 },
  { id: "tek-yorum", rating: 5, reviews: 1, price: 850, discountPct: 0, salesSignal: 0, salesCount: 0, sentiment: null, sellerRating: null, shippingScore: null, photoReviews: 0 },
  { id: "ucuz", rating: 4.4, reviews: 500, price: 400, discountPct: 30, salesSignal: 0, salesCount: 0, sentiment: null, sellerRating: null, shippingScore: 1, photoReviews: 0 }
];

const quality = score.scoreProducts(products, "quality");
const value = score.scoreProducts(products, "value");
assert.ok(quality.find((item) => item.id === "kanıtlı").score > quality.find((item) => item.id === "tek-yorum").score);
assert.ok(value.find((item) => item.id === "ucuz").score > value.find((item) => item.id === "kanıtlı").score);

// v3: açıklama, özel mod, sponsor tespiti
assert.equal(score.isSponsoredText("Sponsorlu\nKılıf"), true);
assert.equal(score.isSponsoredText("Reklam Apple kılıf"), true);
assert.equal(score.isSponsoredText("Kılıf reklamsız paket"), false);
assert.equal(score.confidenceLevel(5), "low");
assert.equal(score.confidenceLevel(150), "medium");
assert.equal(score.confidenceLevel(2000), "high");

const priceHeavy = score.scoreProducts(products, "custom", { quality: 2, price: 10, popular: 0, shipping: 3 });
const qualityHeavy = score.scoreProducts(products, "custom", { quality: 10, price: 0, popular: 0, shipping: 0 });
assert.ok(priceHeavy.find((i) => i.id === "ucuz").score > priceHeavy.find((i) => i.id === "kanıtlı").score);
assert.ok(qualityHeavy.find((i) => i.id === "kanıtlı").score > qualityHeavy.find((i) => i.id === "ucuz").score);

const oneReview = score.explainProduct(quality.find((i) => i.id === "tek-yorum"));
assert.ok(oneReview.warnings.some((w) => w.includes("yanıltıcı")));
assert.equal(oneReview.confidence, "low");
const proven = score.explainProduct(quality.find((i) => i.id === "kanıtlı"));
assert.ok(proven.reasons.includes("Güvenilir yüksek puan"));
assert.equal(score.explainProduct({ score: 0 }).warnings[0], "Puan okunamadı");

const axes = score.axisScores(value.find((i) => i.id === "ucuz").components);
assert.equal(axes.shipping, 1);
assert.ok(axes.price > 0.5);

// Gerçek HB/Amazon kart metinleri (2026-09-30): kupon ve taksit fiyat sanılmamalı.
const hbCard = "Ek 200 TL Kupon\nEk 200 TL Kupon\nApple Magsafe Kılıf\nÜrün puanı 4.7, 59 değerlendirme\n4,7\n(59)\nKampanya: Peşin fiyatına 3 x 916 TL\nPeşin fiyatına\n3 x\n916 TL\n2.748,98 TL";
assert.deepEqual(score.parsePrices(hbCard), { price: 2748.98, originalPrice: 2748.98 });
assert.equal(score.parseDiscount(hbCard, 2748.98, 0), 0);
assert.deepEqual(score.parsePrices("Kampanya: Peşin fiyatına 3 x 966 TL\n3 x\n966 TL\n3.899 TL%26\n2.899 TL"), { price: 2899, originalPrice: 3899 });
assert.deepEqual(score.parsePrices("Fiyat, ürün sayfası\n149,00 TL\n149\n,\n00TL\nÜCRETSİZ teslimat 2 Eki"), { price: 149, originalPrice: 149 });
assert.deepEqual(score.parsePrices("1.299 TL\nSepette 999 TL\n150 TL üzeri kargo bedava"), { price: 999, originalPrice: 1299 });
assert.equal(score.parseDiscount("%10 kupon\n2. ürüne %50", 100, 0), 0);
assert.deepEqual(score.parseHepsiburadaMetricLine("Ürün puanı 4, 28 değerlendirme\n4\n(28)"), { rating: 4, reviews: 28 });
assert.equal(score.parseHepsiburadaMetricLine("iPhone 15 (2)"), null);
assert.ok(score.parseSentiment(["Sorunsuz geldi, sorun yok"]) > 0.5);
assert.ok(score.parseSentiment(["Hiç iyi değil, tavsiye etmem"]) < 0.5);

// Filtreler
const card = { title: "Apple iPhone 17 Pro Max Şeffaf Kılıf", rating: 4.6, reviews: 40, price: 900 };
assert.equal(score.filterReason(card, { exclude: "pro, max" }), '"pro" geçiyor');
assert.equal(score.filterReason({ ...card, title: "Profesyonel Kılıf" }, { exclude: "pro" }), null);
assert.equal(score.filterReason(card, { include: "17 pro" }), null);
assert.equal(score.filterReason(card, { include: "17e" }), '"17e" geçmiyor');
assert.equal(score.filterReason(card, { minRating: 4.7 }), "Puan 4,7 altı");
assert.equal(score.filterReason(card, { minReviews: 50 }), "50 yorumdan az");
assert.equal(score.filterReason(card, { priceMax: 500 }), "Fiyat aralığı dışında");
assert.equal(score.filterReason({ ...card, price: 0 }, { priceMin: 100 }), "Fiyat okunamadı");
assert.equal(score.activeFilterCount({ minRating: 4, priceMax: 500, exclude: "pro" }), 3);

// Fiyat hafızası
let hist = score.recordPrice([], 1000, 100);
hist = score.recordPrice(hist, 950, 100);
hist = score.recordPrice(hist, 1200, 105);
hist = score.recordPrice(hist, 900, 110);
assert.deepEqual(hist, [[100, 950], [105, 1200], [110, 900]]);
const stats = score.historyStats(hist, 110);
assert.deepEqual(stats, { n: 3, min: 900, max: 1200, span: 10, minDaysAgo: 0 });
assert.ok(score.historyNotes({ price: 900, history: stats }).reasons[0].includes("en düşük"));
assert.ok(score.historyNotes({ price: 1100, history: score.historyStats(hist.slice(0, 2), 110) }).warnings[0].includes("950"));
assert.ok(score.historyNotes({ price: 900, originalPrice: 2000, history: stats }).warnings[0].includes("şişirilmiş"));

console.log({
  quality: quality.map(({ id, score: value }) => [id, value]),
  value: value.map(({ id, score: result }) => [id, result])
});
