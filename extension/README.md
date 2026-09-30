# Akıllı Ürün Sıralama v3

Hepsiburada, Trendyol ve Amazon Türkiye ürün listeleme sayfalarını yalnızca yıldız puanına göre değil; kanıt gücü, fiyat, indirim, satış, teslimat ve satıcı sinyallerine göre sıralayan Chrome/Edge eklentisi.

## Kurulum

1. ZIP dosyasını çıkartın ve klasörü kalıcı bir yerde tutun.
2. Chrome'da `chrome://extensions` (Edge'de `edge://extensions`) adresini açın.
3. **Geliştirici modu**nu etkinleştirin.
4. **Paketlenmemiş öğe yükle** seçeneğine basın.
5. Çıkarttığınız `akilli-urun-siralama` klasörünü seçin.

Eski sürüm kuruluysa uzantılar sayfasındaki **Yeniden yükle** düğmesine basın ve alışveriş sayfasını yenileyin.

## Sıralama modları

- **Dengeli:** Yüksek ve güvenilir puanı ana sinyal tutar; fiyat, indirim, satış ve teslimatı destekleyici sinyal olarak kullanır.
- **Kalite:** Puan, yorum güveni, yorumların olumlu/olumsuz sinyali ve satıcı güvenine odaklanır.
- **Fiyat / performans:** Kalite tabanını korurken sayfadaki benzer ürünlere göre fiyatı, indirimi ve teslimatı daha güçlü değerlendirir.
- **Popülerlik:** Yorum sayısı, görünür satış adedi ve “Çok Satan” benzeri rozetlere öncelik verir.
- **Özel:** Kalite, fiyat, popülerlik ve kargo eksenlerini 0–10 arası kaydırıcılarla kendin ağırlıklandırırsın.

Kısayol: **Alt+Shift+S** paneli açar/kapatır (`chrome://extensions/shortcuts` üzerinden değiştirilebilir).

## Kullanılan veriler

Liste kartında görünüyorsa otomatik okunur:

- yıldız puanı ve değerlendirme sayısı;
- güncel ve eski fiyat;
- indirim yüzdesi;
- bugün/yarın kargo, hızlı teslimat, Prime veya ücretsiz kargo sinyalleri;
- görünür satış adedi;
- “Çok Satan” ve “Amazon'un Seçimi” rozetleri;
- satıcı puanı.

**Derin analiz** isteğe bağlıdır ve ilk 24 görünür ürünün detay sayfasını en fazla üç eşzamanlı istekle inceler. Sayfadaki yapılandırılmış verilerde bulunursa şunları ekler:

- güncellenmiş puan ve yorum sayısı;
- görünür satış adedi ve satıcı puanı;
- yorum metinlerinden cihaz üzerinde hesaplanan basit olumlu/olumsuz sinyal;
- yorum bölümündeki fotoğraf sinyali.

Analiz metinleri herhangi bir sunucuya veya yapay zekâ servisine gönderilmez. Siteler detay sayfası isteğini engellerse liste kartındaki verilerle çalışmaya devam eder.

## Skor davranışı

- Az yorumlu 5,0 puanlar 4,2'lik genel ön kabul ve 30 sanal değerlendirmeyle ortalamaya yaklaştırılır.
- Yorum ve satış adetleri logaritmik değerlendirilir; çok büyük sayılar skoru sınırsız yükseltmez.
- Fiyat yalnızca aynı sonuç sayfasındaki okunabilen ürünlerle kıyaslanır.
- Eksik satıcı, yorum duygu veya fotoğraf verisi uydurulmaz; mevcut sinyaller kendi ağırlıkları içinde yeniden dengelenir.
- Puanı okunamayan ürün skorsuz kalır ve listenin sonuna gider.

## Gizlilik ve yük

- Otomatik detay sayfası taraması yapılmaz; yalnızca kullanıcı **Derin analiz** düğmesine bastığında çalışır.
- Bir çalıştırmada en fazla 24 ürün ve üç paralel istek kullanılır.
- Ürün veya kullanıcı verisi dışarı aktarılmaz. Fiyat hafızası sadece bu tarayıcıda durur (`storage` izni bunun için).

## Sürüm geçmişi

### 3.0.0

**Doğruluk düzeltmeleri (canlı HB + Amazon sayfasında doğrulandı, 2026-09-30):**

- Fiyat artık önce sitenin kendi fiyat alanından okunuyor (HB `final-price`, Amazon `.a-price`, Trendyol fiyat sınıfları + "Sepette" fiyatı). v2'de karttaki en küçük "TL" sayısı fiyat sanılıyordu; HB'de "Ek 200 TL Kupon" yüzünden 2.748 TL'lik ürün 200 TL ve %80 indirimli görünüyordu.
- Eski fiyat yalnızca üstü çizili fiyattan alınıyor; "%10 kupon", "2. ürüne %50", taksit tutarı ve "150 TL üzeri kargo" artık fiyat/indirim sayılmıyor.
- HB'nin tam sayı puanları ("Ürün puanı 5, 1 değerlendirme") okunuyor; v2'de bu ürünler "Veri yetersiz" olup sona gidiyordu.
- Yorum dili analizi: "sorunsuz / sorun yok" olumlu, "iyi değil / tavsiye etmem" olumsuz sayılıyor (v2 tersini yapıyordu).
- Test: HB 36/36, Amazon 60/60 kartta okunan fiyat sayfadaki fiyatla birebir aynı. Trendyol bot koruması yüzünden canlı doğrulanamadı.

**Yeni özellikler:**

- **Filtreler:** minimum puan (3,5+ / 4+ / 4,5+), minimum yorum (10+ / 50+ / 200+), fiyat aralığı, "başlıkta olsun" ve "olmasın" kelimeleri (tam kelime eşleşmesi: "pro" yazınca "Pro Max" gider, "profesyonel" kalmaz). Uymayanlar soldurulur ya da tamamen gizlenir. Filtreler sekmeye özeldir, başka aramaya taşınmaz.
- **Fiyat hafızası:** Gezdiğin listelerde her ürünün gün başına en düşük fiyatı cihazda (`chrome.storage.local`) saklanır. Rozet açıklamasında "N günün en düşük fiyatı", "X gün önce Y TL'ydi" ve "üstü çizili fiyat hiç görülmedi, indirim şişirilmiş olabilir" uyarıları çıkar. Veri sen gezdikçe birikir; ilk gün boştur.
- **İlk 5'i kopyala:** Fiyat, puan ve linkle panoya; WhatsApp'a yapıştırmalık.
- **Sürüklenebilir panel:** Başlıktan tut, taşı; konum hatırlanır. Çift tık varsayılan köşeye döndürür.
- **Ürün sayfasında otomatik küçülme:** Sıralanacak liste yoksa panel kendini küçültür.
- **Amazon derin analiz:** Yorum metinleri (`reviewText`), puan ve toplam değerlendirme artık Amazon ürün sayfasından okunuyor; fotoğraf sinyali sadece gerçek müşteri görsellerinden sayılıyor.

**Tasarım:**

- Yeni tasarım: sıcak koyu panel, tek turuncu vurgu, site CSS'inin panele sızmasını kesen sıfırlama katmanı.
- Mod seçimi açılır menüden 5'li segment kontrole taşındı; her modun altında ne yaptığı yazıyor.
- **Özel mod:** dört eksen için kaydırıcılar, ayar sitede hatırlanır.
- **Senin için ilk 3:** görselli mini liste; tıklayınca ürüne kaydırır ve kartı vurgular.
- Kart rozeti artık sıra + skor gösterir; üzerine gelince Kalite/Fiyat/Popülerlik/Kargo çubukları, kanıt gücü, "neden bu sırada" etiketleri ve uyarılar (az yorumlu 5 yıldız, olumsuz yorum dili, düşük satıcı puanı, sponsorlu) çıkar.
- Rozet sağ üstten sol üste alındı; sitelerin favori (kalp) düğmesini kapatmıyor.
- Sponsorlu/reklam ürün tespiti; isteğe bağlı olarak soluklaştırılıp sona atılır.
- Alt %40'ı soluklaştırma seçeneği (üzerine gelince normale döner).
- Siteye özel "otomatik uygula": açıksa sayfa açılır açılmaz sıralar.
- Derin analiz sonuçları sekme oturumu boyunca önbellekte; tekrar basınca sadece henüz bakılmamış ürünleri tarar, ilerleme çubuğu gösterir.
- Panelin küçültülmüş hâli hatırlanır; sıralama aktifken küçük düğmede yeşil nokta yanar.
- Kart metni ürün başına bir kez okunur (v2'de dört kez `innerText` çağrılıyordu).
- Alt+Shift+S kısayolu.

### 2.1.0

- Trendyol'un doğrudan bağlantı (`a[data-testid="product-card"]`) biçimindeki güncel ürün kartları desteklendi.
- Trendyol'daki “kişi favoriledi” ve “kişi ekledi” değerleri popülerlik sinyaline eklendi.
- Amazon'un “Geçen ay 200 adetten fazla satın alındı” biçimindeki gerçek satış sinyali desteklenir hâle getirildi.
- Amazon/Trendyol kampanya bantları, sponsor alanları ve sayfalama öğeleri yerinde korunurken yalnızca mevcut ürün yuvaları sıralanıyor.
- Orijinal sıraya dönüşte ürün dışı öğelerin de inline sıra değerleri eksiksiz geri yükleniyor.

### 2.0.0

Fiyat, indirim, teslimat, satıcı, satış adedi, fotoğraflı yorum ve yerel yorum duygu sinyalleri; dört sıralama modu; isteğe bağlı derin analiz; Türkçe sayı gösterimi eklendi.

### 1.0.1

Hepsiburada'nın `★ 4,8 (119)` biçimindeki puan ve değerlendirme gösterimi için destek eklendi.
