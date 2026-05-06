import config from '../config.js';
import path from 'path';
import fs from 'fs';

export async function postToGroup(browserContext, group, title, price, textContent, imageNames = []) {
    console.log(`\n➡️ Membuka grup: ${group.name}`);
    const page = await browserContext.newPage();
    
    try {
        await page.goto(group.url, { waitUntil: 'domcontentloaded' });
        
        console.log(`⏳ Menunggu halaman termuat...`);
        await page.waitForTimeout(config.delayAction);

        // --- 1. MENCOBA POSTINGAN NORMAL DULU ---
        let writeButton = page.getByRole('button', { name: /Write something|Tulis sesuatu|Create a public post|Buat postingan publik/i }).first();
        let isVisible = await writeButton.isVisible({ timeout: 3000 }).catch(() => false);
        
        // --- 2. JIKA TIDAK ADA, COBA CARI TAB DISKUSI ---
        if (!isVisible) {
            console.log(`⚠️ Tombol "Tulis Sesuatu" tidak terlihat. Mencari tab Diskusi...`);
            const diskusiTab = page.locator('a[role="tab"], div[role="tab"]').filter({ hasText: /Diskusi|Bahas|Discussion|Discuss/i }).first();
            
            if (await diskusiTab.isVisible({ timeout: 3000 }).catch(() => false)) {
                await diskusiTab.click();
                await page.waitForTimeout(3000);
                writeButton = page.getByRole('button', { name: /Write something|Tulis sesuatu|Create a public post|Buat postingan publik/i }).first();
                isVisible = await writeButton.isVisible({ timeout: 3000 }).catch(() => false);
            }
        }

        // --- 3. JIKA MASIH TIDAK ADA, BERARTI INI GRUP JUAL-BELI STRICT (MARKETPLACE FORM) ---
        if (!isVisible) {
            console.log(`🛒 Grup ini mewajibkan form Jual-Beli (Marketplace). Mengalihkan ke mode Marketplace...`);
            
            const sellBtn = page.getByRole('button', { name: /Jual Sesuatu|Sell Something/i }).first();
            if (await sellBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                await sellBtn.click({ force: true });
                await page.waitForTimeout(3000);
                
                // === STEP 1: Pilih "Barang dijual" ===
                // Ini bukan menuitem, melainkan card/div clickable di dalam dialog "Buat tawaran baru"
                console.log(`📦 Memilih jenis tawaran: Barang dijual...`);
                const itemCard = page.locator('span, div').filter({ hasText: /^Barang dijual$|^Item for sale$/i }).first();
                await itemCard.waitFor({ state: 'visible', timeout: 5000 });
                await itemCard.click({ force: true });
                await page.waitForTimeout(4000);

                // Deteksi dialog form (TANPA Escape — Escape membunuh dialog!)
                const allDialogs = page.getByRole('dialog');
                const dialogCount = await allDialogs.count();
                let formDialog = null;
                for (let i = 0; i < dialogCount; i++) {
                    const dlg = allDialogs.nth(i);
                    const hasFile = await dlg.locator('input[type="file"]').count() > 0;
                    const hasJudul = await dlg.locator('label').filter({ hasText: /^Judul$/ }).first().isVisible({ timeout: 500 }).catch(() => false);
                    if (hasFile || hasJudul) { formDialog = dlg; break; }
                }
                if (!formDialog) formDialog = allDialogs.last();
                await formDialog.waitFor({ state: 'visible', timeout: 5000 });

                console.log(`📝 Mengisi formulir Jual Beli...`);

                // === Isi Judul — <label>Judul<input></label> ===
                console.log(`📝 Mengisi judul...`);
                const titleInput = formDialog.locator('label').filter({ hasText: /^Judul$/ }).locator('input').first();
                await titleInput.waitFor({ state: 'attached', timeout: 10000 });
                await titleInput.focus();
                await titleInput.fill(title || 'Promo / Penawaran Menarik');

                // === Isi Harga ===
                console.log(`💰 Mengisi harga...`);
                const priceInput = formDialog.locator('label').filter({ hasText: /^Harga$/ }).locator('input').first();
                await priceInput.focus();
                await priceInput.fill(price || '123');

                // === Pilih Kondisi (Opsional) ===
                // === Pilih Kondisi: WAJIB! Field = <label role="combobox"> ===
                console.log(`📋 Memilih kondisi barang: Baru...`);
                try {
                    const combobox = formDialog.locator('[role="combobox"]').first();
                    await combobox.waitFor({ state: 'visible', timeout: 5000 });
                    await combobox.click({ force: true });
                    await page.waitForTimeout(1500);
                    // Pilih "Baru" dari role="option"
                    const baruOpt = page.getByRole('option', { name: /^Baru$/i }).first();
                    await baruOpt.waitFor({ state: 'visible', timeout: 3000 });
                    await baruOpt.click({ force: true });
                    await page.waitForTimeout(1000);
                    console.log(`  ✅ Kondisi: Baru`);
                } catch (e) {
                    console.log(`  ⚠️ Gagal memilih kondisi: ${e.message}`);
                }

                // === Expand "Detail selengkapnya" + isi Keterangan ===
                console.log(`📄 Membuka bagian 'Detail selengkapnya'...`);
                try {
                    const expander = formDialog.locator('span, div').filter({ hasText: /^Detail selengkapnya$|^More details$/i }).first();
                    if (await expander.isVisible({ timeout: 3000 }).catch(() => false)) {
                        await expander.click({ force: true });
                        await page.waitForTimeout(2000);
                    }
                } catch (e) {}

                console.log(`📝 Mengisi keterangan/deskripsi...`);
                const descInput = formDialog.locator('label').filter({ hasText: /^Keterangan$/ }).locator('textarea, input').first();
                await descInput.waitFor({ state: 'attached', timeout: 5000 });
                await descInput.focus();
                await descInput.fill(textContent);

                // === Centang checkbox preferensi pertemuan via role="checkbox" ===
                console.log(`✅ Mencentang preferensi pertemuan...`);
                try {
                    const meetCheckboxes = formDialog.locator('[role="checkbox"]');
                    const meetCount = await meetCheckboxes.count();
                    for (let i = 0; i < meetCount; i++) {
                        const cb = meetCheckboxes.nth(i);
                        const checked = await cb.getAttribute('aria-checked');
                        if (checked !== 'true') {
                            await cb.scrollIntoViewIfNeeded().catch(() => {});
                            await cb.click({ force: true });
                            await page.waitForTimeout(300);
                        }
                    }
                    console.log(`  ✅ ${meetCount} preferensi diproses`);
                } catch (e) {
                    console.log(`  ⚠️ Gagal centang preferensi: ${e.message}`);
                }

                // === Upload Gambar ===
                if (imageNames && imageNames.length > 0) {
                    const validImagePaths = [];
                    for (const imgName of imageNames) {
                        const imgPath = path.resolve('images', imgName);
                        if (fs.existsSync(imgPath)) validImagePaths.push(imgPath);
                    }
                    if (validImagePaths.length > 0) {
                        console.log(`📸 Mengunggah ${validImagePaths.length} gambar...`);
                        const fileInput = formDialog.locator('input[type="file"]').first();
                        if (await fileInput.count() > 0) {
                            await fileInput.setInputFiles(validImagePaths);
                        } else {
                            await page.locator('input[type="file"]').last().setInputFiles(validImagePaths);
                        }
                        await page.waitForTimeout(config.delayAction + 5000);
                    }
                }

                // === Klik "Berikutnya" ===
                console.log(`➡️ Menuju langkah konfirmasi...`);
                const nextBtn = formDialog.getByRole('button', { name: /Berikutnya|Next/i }).first();
                await nextBtn.waitFor({ state: 'visible', timeout: 5000 });
                await nextBtn.click({ force: true });
                await page.waitForTimeout(6000);

                // === Centang grup yang RELEVAN di halaman "Bagikan ke lebih banyak tempat" ===
                // Hanya centang grup yang mengandung "Jual" DAN "HP" + selalu centang Marketplace
                console.log(`📢 Mencentang grup relevan untuk dibagikan...`);
                let shared = 0;
                const sharedGroupNames = [];
                try {
                    const shareDialog = page.getByRole('dialog').last();
                    const allCb = shareDialog.locator('[role="checkbox"]');
                    const cbCount = await allCb.count();
                    let skipped = 0;
                    for (let i = 0; i < cbCount; i++) {
                        const cb = allCb.nth(i);
                        const checked = await cb.getAttribute('aria-checked');
                        const text = await cb.textContent().then(t => t.trim()).catch(() => '');
                        const textLower = text.toLowerCase();

                        // Catat grup yang sudah tercentang (termasuk grup asal)
                        if (checked === 'true') {
                            sharedGroupNames.push(text.split(/\d/)[0].trim()); // Ambil nama sebelum angka anggota
                            continue;
                        }

                        // Centang jika: Marketplace ATAU (mengandung "jual" DAN "hp")
                        const isMarketplace = textLower.includes('marketplace');
                        const isRelevant = textLower.includes('jual') && textLower.includes('hp');

                        if (isMarketplace || isRelevant) {
                            await cb.scrollIntoViewIfNeeded().catch(() => {});
                            await cb.click({ force: true });
                            shared++;
                            sharedGroupNames.push(text.split(/\d/)[0].trim());
                            await page.waitForTimeout(300);
                        } else {
                            skipped++;
                        }
                    }
                    console.log(`  ✅ ${shared} grup relevan dicentang, ${skipped} tidak relevan di-skip`);
                    console.log(`  📋 Total ter-cover: ${sharedGroupNames.length} grup`);
                    await page.waitForTimeout(1000);
                } catch (e) {
                    console.log(`  ⚠️ Halaman berbagi tidak ditemukan, lanjut posting...`);
                }

                // === Klik tombol "Posting" ===
                console.log(`🚀 Menekan tombol Posting...`);
                let publishBtn = page.getByRole('button', { name: /^Posting$|^Post$/i }).first();
                if (!await publishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                    publishBtn = page.getByRole('button', { name: /Terbitkan|Publikasikan|Publish|Posting/i }).first();
                }
                await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
                await publishBtn.click({ force: true });
                
                // === VERIFIKASI: Tunggu dialog tertutup = posting berhasil ===
                console.log(`⏳ Memverifikasi posting...`);
                let verified = false;
                for (let v = 0; v < 20; v++) {
                    await page.waitForTimeout(1000);
                    const dialogsLeft = await page.getByRole('dialog').count().catch(() => 0);
                    if (dialogsLeft === 0) {
                        verified = true;
                        break;
                    }
                }
                
                if (verified) {
                    console.log(`✅ TERVERIFIKASI! Postingan berhasil diterbitkan di ${group.name}`);
                    await page.waitForTimeout(3000);
                    // Ambil URL postingan
                    let postUrl = page.url();
                    try {
                        // Cari permalink postingan terbaru di halaman
                        const permalink = await page.locator('a[href*="/permalink/"], a[href*="/posts/"], a[href*="/marketplace/item/"]').first().getAttribute('href', { timeout: 3000 }).catch(() => null);
                        if (permalink) {
                            postUrl = permalink.startsWith('http') ? permalink : `https://web.facebook.com${permalink}`;
                        }
                    } catch (e) {}
                    console.log(`🔗 URL: ${postUrl}`);
                    await page.close();
                    return { success: true, verified: true, mode: 'marketplace', sharedGroups: shared || 0, sharedGroupNames, postUrl };
                } else {
                    console.log(`⚠️ Dialog belum tertutup, tapi posting mungkin sedang diproses...`);
                    const postUrl = page.url();
                    await page.waitForTimeout(5000);
                    await page.close();
                    return { success: true, verified: false, mode: 'marketplace', sharedGroups: shared || 0, sharedGroupNames, postUrl };
                }
            } else {
                console.log(`⚠️ Gagal mendeteksi mode apapun (Normal/Marketplace).`);
                await page.close();
                return { success: false, error: 'Tidak dapat menemukan cara untuk memposting di grup ini.' };
            }
        }

        // --- 4. EKSEKUSI POSTINGAN NORMAL (Jika masuk kriteria 1 atau 2) ---
        console.log(`✅ Mode postingan NORMAL terdeteksi.`);
        await writeButton.click({ force: true });
        await page.waitForTimeout(2000);

        console.log(`✍️ Mengetik isi postingan...`);
        // PENTING: Ambil textbox HANYA dari dalam dialog "Buat Postingan", BUKAN dari komentar orang lain!
        const dialog = page.getByRole('dialog').first();
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        
        const textBox = dialog.locator('div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"]').first();
        await textBox.waitFor({ state: 'visible', timeout: 10000 });
        
        // GUNAKAN FOCUS DAN FORCE KLIK MENGHINDARI INTERCEPTION
        await textBox.focus(); 
        await textBox.click({ force: true }).catch(() => {});
        
        // Gabungkan judul, harga, dan teks jika ini postingan normal tapi user mengisi judul/harga
        let finalText = textContent;
        if (title || price) {
            finalText = `${title ? title + '\n' : ''}${price ? 'Harga: Rp ' + price + '\n' : ''}\n${textContent}`;
        }
        
        // Gunakan fill() agar TIDAK memicu submit komentar (type() menekan Enter = kirim komentar!)
        await textBox.fill(finalText);
        await page.waitForTimeout(config.delayAction);

        if (imageNames && imageNames.length > 0) {
            const validImagePaths = [];
            for (const imgName of imageNames) {
                const imgPath = path.resolve('images', imgName);
                if (fs.existsSync(imgPath)) validImagePaths.push(imgPath);
            }

            if (validImagePaths.length > 0) {
                console.log(`📸 Mengunggah ${validImagePaths.length} gambar...`);
                let fileInput = dialog.locator('input[type="file"]').first();
                if (!(await fileInput.isVisible({timeout: 1000}).catch(()=>false)) && !(await fileInput.count() > 0)) {
                    fileInput = dialog.locator('input[type="file"][multiple]').last();
                }

                if (await fileInput.count() > 0) {
                    await fileInput.setInputFiles(validImagePaths);
                    await page.waitForTimeout(config.delayAction + 5000);
                }
            }
        }

        console.log(`🚀 Menekan tombol Posting...`);
        const postButton = dialog.getByRole('button', { name: /^(Post|Posting|Kirim)$/i }).first();
        await postButton.click({ force: true });

        // === VERIFIKASI: Tunggu dialog tertutup ===
        console.log(`⏳ Memverifikasi posting...`);
        let verified = false;
        for (let v = 0; v < 15; v++) {
            await page.waitForTimeout(1000);
            const dialogsLeft = await page.getByRole('dialog').count().catch(() => 0);
            if (dialogsLeft === 0) {
                verified = true;
                break;
            }
        }
        
        if (verified) {
            console.log(`✅ TERVERIFIKASI! Postingan berhasil diterbitkan di ${group.name}`);
        } else {
            console.log(`⚠️ Dialog belum tertutup, posting mungkin sedang diproses...`);
        }
        await page.waitForTimeout(3000);
        // Ambil URL postingan
        let postUrl = page.url();
        try {
            const permalink = await page.locator('a[href*="/permalink/"], a[href*="/posts/"]').first().getAttribute('href', { timeout: 3000 }).catch(() => null);
            if (permalink) {
                postUrl = permalink.startsWith('http') ? permalink : `https://web.facebook.com${permalink}`;
            }
        } catch (e) {}
        console.log(`🔗 URL: ${postUrl}`);
        await page.close();
        return { success: true, verified, mode: 'normal', postUrl };
        
    } catch (error) {
        console.error(`❌ Gagal posting di ${group.name}. Error: ${error.message}`);
        await page.close();
        return { success: false, error: error.message };
    }
}
