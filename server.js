import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

// Logic bot
import config from './config.js';
import { launchBrowser } from './src/browser.js';
import { checkLoginStatus, forceLogin, getUserProfile } from './src/auth.js';
import { scrapeJoinedGroups } from './src/scraper.js';
import { postToGroup } from './src/poster.js';
import { parseSpintax } from './src/spintax.js';

const app = express();
const server = createServer(app);
const io = new Server(server);

// Multer Config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.resolve('images');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/upload', upload.array('images'), (req, res) => {
    const filenames = req.files.map(f => f.filename);
    res.json({ filenames });
});

const CAMPAIGN_FILE = path.resolve('campaigns.json');
const FAILED_LOG_FILE = path.resolve('failed_post.txt');
const SUCCESS_LOG_FILE = path.resolve('success_post.txt');
const DRAFT_FILE = path.resolve('drafts.json');

app.use(express.static('public'));

function loadDrafts() {
    if (fs.existsSync(DRAFT_FILE)) {
        return JSON.parse(fs.readFileSync(DRAFT_FILE, 'utf8'));
    }
    return {};
}

function saveDraftToDisk(name, text) {
    const drafts = loadDrafts();
    drafts[name] = text;
    fs.writeFileSync(DRAFT_FILE, JSON.stringify(drafts, null, 2));
}

function loadCampaigns() {
    if (fs.existsSync(CAMPAIGN_FILE)) {
        return JSON.parse(fs.readFileSync(CAMPAIGN_FILE, 'utf8'));
    }
    return {};
}

function saveCampaign(name, groups) {
    const campaigns = loadCampaigns();
    campaigns[name] = groups;
    fs.writeFileSync(CAMPAIGN_FILE, JSON.stringify(campaigns, null, 2));
}

function getAvailableImages() {
    const imagesDir = path.resolve('images');
    if (fs.existsSync(imagesDir)) {
        return fs.readdirSync(imagesDir).filter(file => {
            return ['.jpg', '.jpeg', '.png', '.mp4'].includes(path.extname(file).toLowerCase());
        });
    }
    return [];
}

// Global browser context
let browserContext = null;

io.on('connection', (socket) => {
    console.log('User connected to Web UI');
    
    // Kirim data awal (kampanye tersimpan, draft, dan gambar)
    socket.emit('initData', {
        campaigns: loadCampaigns(),
        drafts: loadDrafts(),
        images: getAvailableImages()
    });

    socket.on('checkAuth', async () => {
        socket.emit('log', '🔄 Memeriksa status login Facebook di latar belakang...');
        if (!browserContext) browserContext = await launchBrowser(true);
        
        let isLoggedIn = await checkLoginStatus(browserContext);
        
        if (!isLoggedIn) {
            socket.emit('log', '⚠️ Anda belum login! Membuka jendela Chrome...');
            socket.emit('authStatus', { loggedIn: false });
            await browserContext.close();
            browserContext = await launchBrowser(false);
            
            // Web akan minta user konfirmasi jika sudah login di Chrome
        } else {
            socket.emit('log', '✅ Sesi aktif ditemukan! Mengambil profil...');
            const profile = await getUserProfile(browserContext);
            socket.emit('log', `👤 Terhubung sebagai: ${profile.name}`);
            socket.emit('authStatus', { loggedIn: true, profile });
        }
    });

    socket.on('confirmLogin', async () => {
        socket.emit('log', '🔄 Memverifikasi ulang login Anda...');
        let isLoggedIn = await checkLoginStatus(browserContext);
        if (isLoggedIn) {
             socket.emit('log', '✅ Login Berhasil! Memindahkan Chrome ke latar belakang...');
             await browserContext.close();
             browserContext = await launchBrowser(true);
             
             socket.emit('log', '✅ Mengambil data profil...');
             const profile = await getUserProfile(browserContext);
             socket.emit('log', `👤 Terhubung sebagai: ${profile.name}`);
             
             socket.emit('authStatus', { loggedIn: true, profile });
        } else {
             socket.emit('log', '❌ Verifikasi gagal. Anda belum terdeteksi login.');
        }
    });

    socket.on('scrapeGroups', async (keyword) => {
        if (!browserContext) return socket.emit('log', '❌ Browser belum siap.');
        socket.emit('log', `🔍 Mencari grup dengan kata kunci: "${keyword}"...`);
        try {
            const groups = await scrapeJoinedGroups(browserContext, keyword);
            socket.emit('scrapeResult', groups);
            socket.emit('log', `✅ Ditemukan ${groups.length} grup!`);
        } catch (e) {
            socket.emit('log', `❌ Error scraping: ${e.message}`);
        }
    });

    socket.on('saveCampaign', (data) => {
        saveCampaign(data.name, data.groups);
        socket.emit('log', `✅ Riwayat grup '${data.name}' berhasil disimpan!`);
        socket.emit('initData', { campaigns: loadCampaigns(), drafts: loadDrafts(), images: getAvailableImages() });
    });

    socket.on('saveDraft', (data) => {
        // data = { name: 'Draft Name', data: { title, price, text } }
        saveDraftToDisk(data.name, data.data || data.text);
        socket.emit('log', `📝 Draft teks '${data.name}' berhasil disimpan!`);
        socket.emit('initData', { campaigns: loadCampaigns(), drafts: loadDrafts(), images: getAvailableImages() });
    });

    socket.on('startPosting', async (data) => {
        const { targetGroups, title, price, text, images } = data;
        if (!targetGroups || targetGroups.length === 0) {
            return socket.emit('log', '❌ Tidak ada grup target.');
        }

        const PARALLEL = 3; // Posting 3 grup bersamaan
        socket.emit('log', `🔥 MEMULAI AUTO POSTING KE ${targetGroups.length} GRUP (${PARALLEL} PARALEL + SMART DEDUP)!`);
        
        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;
        const coveredGroups = new Set(); // Grup yang sudah ter-cover via sharing

        // Helper: cek apakah grup sudah ter-cover
        function isAlreadyCovered(groupName) {
            const nameLower = groupName.toLowerCase();
            for (const covered of coveredGroups) {
                // Fuzzy match: jika 60%+ kata cocok
                const coveredWords = covered.toLowerCase().split(/\s+/);
                const groupWords = nameLower.split(/\s+/);
                const matchCount = coveredWords.filter(w => groupWords.some(gw => gw.includes(w) || w.includes(gw))).length;
                if (matchCount >= Math.max(2, coveredWords.length * 0.5)) return true;
            }
            return false;
        }

        // Helper: proses 1 grup
        async function processGroup(group, index) {
            // Cek deduplication
            if (isAlreadyCovered(group.name)) {
                skipCount++;
                socket.emit('log', `⏩ [${index}/${targetGroups.length}] SKIP (sudah ter-share): ${group.name}`);
                return null;
            }

            socket.emit('log', `➡️ [${index}/${targetGroups.length}] Posting ke: ${group.name}`);
            
            const finalSpinText = parseSpintax(text);
            const finalTitle = parseSpintax(title || '');
            const finalPrice = parseSpintax(price || '');
            
            const result = await postToGroup(browserContext, group, finalTitle, finalPrice, finalSpinText, images);
            
            if (result.success) {
                successCount++;
                const verifyIcon = result.verified ? '✅' : '⚠️';
                const modeLabel = result.mode === 'marketplace' ? 'Marketplace' : 'Normal';
                const sharedInfo = result.sharedGroups ? ` | Dibagikan ke ${result.sharedGroups} grup lain` : '';
                const urlInfo = result.postUrl ? ` | 🔗 ${result.postUrl}` : '';
                socket.emit('log', `${verifyIcon} ${result.verified ? 'TERVERIFIKASI' : 'Diproses'} di: ${group.name} [${modeLabel}]${sharedInfo}${urlInfo}`);
                
                // Tulis ke success_post.txt
                const logLine = `[${new Date().toLocaleString('id-ID')}] ${result.verified ? 'VERIFIED' : 'UNVERIFIED'} | ${modeLabel} | ${group.name} | Judul: ${finalTitle} | Harga: ${finalPrice}${sharedInfo} | URL: ${result.postUrl || 'N/A'}\n`;
                fs.appendFileSync(SUCCESS_LOG_FILE, logLine);

                // Smart Dedup: catat semua grup yang ter-share
                if (result.sharedGroupNames && result.sharedGroupNames.length > 0) {
                    for (const sharedName of result.sharedGroupNames) {
                        coveredGroups.add(sharedName);
                    }
                    socket.emit('log', `  📋 ${result.sharedGroupNames.length} grup ter-cover via sharing (auto-skip berikutnya)`);
                }
            } else {
                failCount++;
                socket.emit('log', `❌ Gagal posting di: ${group.name}. Error: ${result.error || 'Unknown'}`);
                fs.appendFileSync(FAILED_LOG_FILE, `[${new Date().toLocaleString('id-ID')}] Gagal: ${group.name} - ${result.error}\n`);
            }
            
            return result;
        }

        // === EKSEKUSI PARALEL: 3 grup sekaligus ===
        for (let i = 0; i < targetGroups.length; i += PARALLEL) {
            const batch = targetGroups.slice(i, i + PARALLEL);
            const batchNum = Math.floor(i / PARALLEL) + 1;
            const totalBatches = Math.ceil(targetGroups.length / PARALLEL);
            
            socket.emit('log', `\n🔄 Batch ${batchNum}/${totalBatches}: ${batch.map(g => g.name.substring(0, 25)).join(' | ')}`);
            socket.emit('postProgress', { current: Math.min(i + PARALLEL, targetGroups.length), total: targetGroups.length, group: batch.map(g => g.name).join(', ') });

            await Promise.allSettled(
                batch.map((group, j) => processGroup(group, i + j + 1))
            );
        }

        // Tulis ringkasan sesi
        const sessionSummary = `\n========== SESI ${new Date().toLocaleString('id-ID')} ==========\nTotal target: ${targetGroups.length} grup | Posting: ${successCount} | Gagal: ${failCount} | Skip (dedup): ${skipCount}\n============================================\n\n`;
        fs.appendFileSync(SUCCESS_LOG_FILE, sessionSummary);

        socket.emit('log', `\n🎉 SELESAI! Posting: ${successCount} | Gagal: ${failCount} | Skip (sudah ter-share): ${skipCount}`);
        socket.emit('log', `📄 Log: success_post.txt | failed_post.txt`);
        socket.emit('postComplete', { success: successCount, fail: failCount, skip: skipCount });
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
