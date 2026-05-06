import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

/**
 * Membuka browser Chrome menggunakan direktori sesi lokal (independent)
 */
export async function launchBrowser(isHeadless = true) {
    console.log(`Membuka browser internal bot (${isHeadless ? 'Berjalan Sembunyi di Latar Belakang' : 'Menampilkan Jendela'})...`);
    
    // Path folder 'session' di dalam project kita
    const userDataDir = path.resolve('./session');
    
    try {
        // Jika belum ada folder session, Playwright akan otomatis membuatnya
        const browserContext = await chromium.launchPersistentContext(userDataDir, {
            headless: isHeadless, // Tampilkan/sembunyikan browser sesuai parameter
            channel: 'chrome', // Gunakan browser Chrome yg terinstall di PC
            args: ['--disable-blink-features=AutomationControlled'], // Mencegah terdeteksi sebagai bot
            viewport: null // Gunakan ukuran jendela default
        });

        await new Promise(resolve => setTimeout(resolve, 2000));
        return browserContext;
    } catch (error) {
        console.error("❌ Gagal membuka Chrome. Error:", error.message);
        process.exit(1);
    }
}
