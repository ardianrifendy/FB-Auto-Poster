import inquirer from 'inquirer';

export async function checkLoginStatus(browserContext) {
    const page = await browserContext.newPage();
    console.log("Memeriksa status login Facebook...");
    try {
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
        // Abaikan timeout ringan
    }

    const isLoginFormVisible = await page.locator('input[name="email"]').isVisible() || 
                               await page.locator('input[name="pass"]').isVisible() ||
                               page.url().includes('login');
    
    await page.close();
    return !isLoginFormVisible; // true jika sudah login, false jika belum
}

export async function forceLogin(browserContext) {
    const page = await browserContext.newPage();
    try {
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {}
    
    console.log("\n=======================================================");
    console.log("⚠️ ANDA BELUM LOGIN DI BROWSER BOT INI ⚠️");
    console.log("=======================================================");
    console.log("1. Silakan lihat jendela Google Chrome yang baru saja terbuka.");
    console.log("2. Masukkan Email dan Password Facebook Anda di sana.");
    console.log("3. Klik Login (Pastikan Anda sudah masuk ke beranda Facebook).");
    console.log("=======================================================\n");

    // Tunggu sampai user menekan Enter di terminal
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '👉 TEKAN [ENTER] DI SINI JIKA ANDA SUDAH BERHASIL LOGIN DI BROWSER!'
        }
    ]);

    // Verifikasi ulang setelah user menekan enter
    console.log("Memverifikasi ulang status login...");
    try {
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
    } catch (e) {}
    
    const isStillLogin = await page.locator('input[name="email"]').isVisible() || page.url().includes('login');
    if (isStillLogin) {
        console.error("❌ Anda sepertinya belum login atau login gagal. Silakan jalankan ulang bot.");
        await browserContext.close();
        process.exit(1);
    }
    
    console.log("✅ Login terkonfirmasi! Sesi Anda telah disimpan otomatis.");
    await page.close();
}

export async function getUserProfile(browserContext) {
    const page = await browserContext.newPage();
    let profile = { 
        name: "Pengguna Facebook", 
        photo: "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png" 
    };

    try {
        await page.goto('https://www.facebook.com/me/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Ambil Nama dari H1
        const h1Element = page.locator('h1').first();
        await h1Element.waitFor({ timeout: 5000 });
        profile.name = await h1Element.innerText();

        // Ambil Foto Profil (Facebook menggunakan <image> di dalam SVG)
        try {
            const imgElement = page.locator('image').first();
            const photoUrl = await imgElement.getAttribute('xlink:href', { timeout: 3000 });
            if (photoUrl) profile.photo = photoUrl;
        } catch (e) {
            // Fallback jika tidak ketemu <image> (mungkin Facebook ubah DOM jadi <img> biasa)
            try {
                const imgTag = page.locator('img[alt*="profile"], img[alt*="profil"]').first();
                const src = await imgTag.getAttribute('src', { timeout: 2000 });
                if (src) profile.photo = src;
            } catch(e2) {}
        }
    } catch (e) {
        console.log("Gagal mengambil profil detail secara penuh.");
    }
    
    await page.close();
    return profile;
}
