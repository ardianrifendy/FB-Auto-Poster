import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { parseSpintax } from './src/spintax.js';

const GROUP_URL = 'https://web.facebook.com/groups/JualBeliHpAreaGresik/';
const TITLE = '{Redmi Pad 2|Xiaomi Redmi Pad 2|Tablet Redmi Pad 2} {4/128GB|RAM 8 128GB|4+4/128} {Baru Segel|Segel Dus|New Sealed} {Resmi|Garansi Resmi} - {COD Gresik|Area Gresik|Gresik Sekitarnya}';
const PRICE = '2300000';
const DESC = `{🔥|💥|⚡} {Redmi Pad 2|Xiaomi Redmi Pad 2|Tablet Redmi Pad 2} - {BARU SEGEL DUS|FRESH SEGEL|NEW SEALED BOX} {🔥|💥|⚡}

{📱 Spesifikasi|📋 Detail|📝 Spec}:
• RAM 4+4GB {(Extended)|Extended RAM|(8GB Total)}
• Internal 128GB
• Layar 12.21" FHD+ 90Hz
• Baterai {7000mAh|7.000 mAh}
• {Garansi Resmi Xiaomi Indonesia|Garansi Resmi|Gransi TAM Resmi}

{🎨 Ready Warna|🎨 Pilihan Warna|🎨 Warna Tersedia}:
✅ Gray
✅ Purple
✅ Green

💰 {Harga|Price}: Rp {2.300.000|2.300K|2,3jt}

📍 {Lokasi|Alamat}: Cerme, Gresik
🗺️ {Maps|Google Maps|Lokasi Maps}: Bagaskara Cell
📲 {WA|WhatsApp|Chat}: 0895-1367-9939

{✅ Barang 100% baru segel|✅ Original 100% segel dus|✅ Brand new sealed}
{✅ Garansi resmi|✅ Bergaransi resmi Xiaomi|✅ Warranty resmi}
{✅ Bisa COD sekitar Gresik|✅ COD area Gresik & sekitarnya|✅ Terima COD Gresik}
{✅ Siap kirim via ekspedisi|✅ Bisa kirim luar kota|✅ Ready kirim seluruh Indonesia}`;

// Cari gambar yang ada di folder images
const IMAGES_DIR = path.resolve('images');
const allImages = fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR) : [];
console.log('📁 Gambar tersedia:', allImages);

// Pakai gambar yang ada (sesuaikan nama file)
const IMAGES = allImages
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .slice(0, 3)
    .map(f => path.resolve(IMAGES_DIR, f));

console.log('📸 Gambar yang akan diupload:', IMAGES);

async function testFullPost() {
    const ctx = await chromium.launchPersistentContext(path.resolve('./session'), {
        headless: false, channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'], viewport: null
    });
    const page = await ctx.newPage();

    try {
        console.log('📄 Buka grup...');
        await page.goto(GROUP_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);

        console.log('🛒 Klik Jual Sesuatu...');
        await page.getByRole('button', { name: /Jual Sesuatu/i }).first().click({ force: true });
        await page.waitForTimeout(3000);

        console.log('📦 Klik Barang dijual...');
        await page.locator('span, div').filter({ hasText: /^Barang dijual$/ }).first().click({ force: true });
        await page.waitForTimeout(4000);

        const fd = page.getByRole('dialog').first();

        // Parse spintax
        const finalTitle = parseSpintax(TITLE);
        const finalDesc = parseSpintax(DESC);
        console.log(`📝 Judul: "${finalTitle}"`);
        const ti = fd.locator('label').filter({ hasText: /^Judul$/ }).locator('input').first();
        await ti.waitFor({ state: 'attached', timeout: 10000 });
        await ti.focus(); await ti.fill(finalTitle);
        console.log('  ✅');

        // Harga
        console.log('💰 Harga...');
        const pi = fd.locator('label').filter({ hasText: /^Harga$/ }).locator('input').first();
        await pi.focus(); await pi.fill(PRICE);
        console.log('  ✅');

        // Kondisi - WAJIB via combobox
        console.log('📋 Kondisi: Baru...');
        const combobox = fd.locator('[role="combobox"]').first();
        await combobox.waitFor({ state: 'visible', timeout: 5000 });
        await combobox.click({ force: true });
        await page.waitForTimeout(1500);
        await page.getByRole('option', { name: /^Baru$/i }).first().click({ force: true });
        await page.waitForTimeout(1000);
        console.log('  ✅');

        // Expand Detail + Keterangan
        console.log('📄 Detail + Keterangan...');
        const exp = fd.locator('span, div').filter({ hasText: /^Detail selengkapnya$/ }).first();
        if (await exp.isVisible({ timeout: 3000 }).catch(() => false)) {
            await exp.click({ force: true });
            await page.waitForTimeout(2000);
        }
        const di = fd.locator('label').filter({ hasText: /^Keterangan$/ }).locator('textarea, input').first();
        await di.waitFor({ state: 'attached', timeout: 5000 });
        await di.focus(); await di.fill(finalDesc);
        console.log('  ✅');

        // Checkbox preferensi
        console.log('☑️ Preferensi pertemuan...');
        const cbs = fd.locator('[role="checkbox"]');
        const cbCount = await cbs.count();
        for (let i = 0; i < cbCount; i++) {
            const cb = cbs.nth(i);
            if (await cb.getAttribute('aria-checked') !== 'true') {
                await cb.scrollIntoViewIfNeeded().catch(() => {});
                await cb.click({ force: true });
                await page.waitForTimeout(300);
            }
        }
        console.log(`  ✅ ${cbCount} checkbox`);

        // Upload gambar
        if (IMAGES.length > 0) {
            console.log(`📸 Upload ${IMAGES.length} gambar...`);
            await fd.locator('input[type="file"]').first().setInputFiles(IMAGES);
            await page.waitForTimeout(10000);
            console.log('  ✅');
        }

        // Berikutnya
        console.log('➡️ Berikutnya...');
        await fd.getByRole('button', { name: /Berikutnya/i }).first().click({ force: true });
        await page.waitForTimeout(6000);

        // Halaman sharing
        const postBtnVis = await page.getByRole('button', { name: /^Posting$/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`\n📢 Halaman Sharing: ${postBtnVis ? '✅ BERHASIL' : '❌ GAGAL'}`);

        if (postBtnVis) {
            // Centang grup relevan (jual + hp)
            console.log('☑️ Centang grup relevan...');
            const shareDialog = page.getByRole('dialog').last();
            const shareCbs = shareDialog.locator('[role="checkbox"]');
            const shareCount = await shareCbs.count();
            let shared = 0;
            const sharedNames = [];
            for (let i = 0; i < shareCount; i++) {
                const cb = shareCbs.nth(i);
                const checked = await cb.getAttribute('aria-checked');
                const text = await cb.textContent().then(t => t.trim()).catch(() => '');
                const textLower = text.toLowerCase();

                if (checked === 'true') {
                    sharedNames.push(text.split(/\d/)[0].trim());
                    continue;
                }

                const isRelevant = (textLower.includes('jual') && textLower.includes('hp')) || textLower.includes('marketplace');
                if (isRelevant) {
                    await cb.scrollIntoViewIfNeeded().catch(() => {});
                    await cb.click({ force: true });
                    shared++;
                    sharedNames.push(text.split(/\d/)[0].trim());
                    console.log(`  ☑ ${text.substring(0, 50)}`);
                    await page.waitForTimeout(300);
                }
            }
            console.log(`  ✅ ${shared} grup dicentang`);

            // Klik Posting
            console.log('\n🚀 POSTING!');
            await page.getByRole('button', { name: /^Posting$/i }).first().click({ force: true });

            // Verifikasi
            console.log('⏳ Memverifikasi...');
            let verified = false;
            for (let v = 0; v < 20; v++) {
                await page.waitForTimeout(1000);
                const dlg = await page.getByRole('dialog').count().catch(() => 0);
                if (dlg === 0) { verified = true; break; }
            }

            if (verified) {
                await page.waitForTimeout(3000);
                const postUrl = page.url();
                console.log(`\n🎉🎉🎉 POSTING BERHASIL + TERVERIFIKASI!`);
                console.log(`🔗 URL: ${postUrl}`);
                console.log(`📋 Ter-share ke ${sharedNames.length} grup:`);
                sharedNames.forEach(n => console.log(`   → ${n}`));
            } else {
                console.log('⚠️ Dialog masih terbuka, posting mungkin sedang diproses...');
            }
        }

    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}`);
    }

    console.log('\n⏳ Browser 30 detik...');
    await page.waitForTimeout(30000);
    await ctx.close();
}

testFullPost();
