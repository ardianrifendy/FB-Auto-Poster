export async function scrapeJoinedGroups(browserContext, keyword) {
    console.log(`\n🔍 Mencari grup yang sudah Anda ikuti dengan kata kunci: "${keyword}"...`);
    const page = await browserContext.newPage();
    
    // Buka halaman list grup yang sudah diikuti
    await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded' });

    console.log("⏳ Sedang memuat daftar grup (mungkin butuh scroll beberapa kali)...");
    
    // Lakukan scroll ke bawah secara agresif agar semua grup (100+) ter-load
    for (let i = 0; i < 15; i++) {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await page.waitForTimeout(1000);
    }

    console.log("⚙️ Mengekstrak data grup...");

    // Ambil semua elemen tautan yang menuju ke /groups/
    const groups = await page.evaluate(() => {
        const result = [];
        // Mengambil semua elemen anchor (link)
        const links = document.querySelectorAll('a[href*="/groups/"]');
        
        const seenUrls = new Set();
        
        links.forEach(link => {
            const url = link.href.split('?')[0]; // buang parameter URL agar bersih
            const name = link.textContent.trim();
            
            // Filter: pastikan URL formatnya benar dan punya nama
            if (url.includes('facebook.com/groups/') && name && name.length > 2) {
                // Hindari duplikat URL dan hapus menu samping (yg biasanya teksnya pendek/tidak relevan)
                if (!seenUrls.has(url) && !url.includes('/groups/joins') && !url.includes('/groups/feed')) {
                    seenUrls.add(url);
                    result.push({ name, url });
                }
            }
        });
        return result;
    });

    await page.close();

    // Filter berdasarkan kata kunci
    const lowerKeyword = keyword.toLowerCase();
    const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(lowerKeyword));

    return filteredGroups;
}
