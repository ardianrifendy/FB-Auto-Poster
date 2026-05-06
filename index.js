import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import config from './config.js';
import { launchBrowser } from './src/browser.js';
import { scrapeJoinedGroups } from './src/scraper.js';
import { postToGroup } from './src/poster.js';
import { parseSpintax } from './src/spintax.js';
import { checkLoginStatus, forceLogin, printUserName } from './src/auth.js';

const CAMPAIGN_FILE = path.resolve('campaigns.json');
const FAILED_LOG_FILE = path.resolve('failed_post.txt');
const SUCCESS_LOG_FILE = path.resolve('success_post.txt');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

function logFailed(groupName) {
    const time = new Date().toLocaleString();
    fs.appendFileSync(FAILED_LOG_FILE, `[${time}] Gagal posting di: ${groupName}\n`);
}

async function main() {
    console.log("=========================================");
    console.log("🚀 FB AUTO POSTER V2 (HARDCORE MODE) 🚀");
    console.log("=========================================\n");

    const campaigns = loadCampaigns();
    const campaignNames = Object.keys(campaigns);
    let targetGroups = [];

    // 0. Buka Browser secara sembunyi (background) & Cek Login di awal
    let browserContext = await launchBrowser(true);
    let isLoggedIn = await checkLoginStatus(browserContext);

    if (!isLoggedIn) {
        // Jika belum login, tutup browser background, buka browser layar depan
        await browserContext.close();
        browserContext = await launchBrowser(false);
        
        await forceLogin(browserContext);
        
        // Setelah berhasil login, tutup browser depan, dan jalankan ulang di background agar tidak mengganggu layar user
        await browserContext.close();
        console.log("Memindahkan proses ke latar belakang...");
        browserContext = await launchBrowser(true);
    }

    // Tampilkan nama FB
    await printUserName(browserContext);

    // 1. Pilih Mode
    const { mode } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'mode',
            message: 'Pilih Darimana Anda Ingin Mengambil Target Grup (Ketik angka lalu Enter):',
            choices: [
                { name: 'Tarik Langsung Dari Akun Facebook Saya Sekarang', value: 'new' },
                ...(campaignNames.length > 0 ? [{ name: 'Gunakan Riwayat Grup yang Sudah Pernah Disimpan Sebelumnya', value: 'saved' }] : [])
            ]
        }
    ]);

    if (mode === 'saved') {
        const { selectedCampaign } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedCampaign',
                message: 'Pilih Riwayat Grup yang Tersimpan:',
                choices: campaignNames
            }
        ]);
        targetGroups = campaigns[selectedCampaign];
        console.log(`\n✅ Daftar grup '${selectedCampaign}' dimuat! (${targetGroups.length} grup target).`);
    } else {
        const { keyword } = await inquirer.prompt([
            {
                type: 'input',
                name: 'keyword',
                message: 'Ketik satu kata untuk memfilter grup (contoh: Jual Beli). Atau KOSONGKAN saja lalu tekan ENTER untuk mengambil SEMUA grup Anda:',
                validate: () => true
            }
        ]);

        const scrapedGroups = await scrapeJoinedGroups(browserContext, keyword);

        if (scrapedGroups.length === 0) {
            console.log(`❌ Tidak menemukan grup yang Anda ikuti dengan kata kunci "${keyword}".`);
            await browserContext.close();
            process.exit(0);
        }

        console.log(`\n✅ Ditemukan ${scrapedGroups.length} grup!`);

        const { selectedGroups } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'selectedGroups',
                message: 'Pilih target grup (Gunakan Spasi untuk memilih, Enter untuk lanjut):',
                choices: scrapedGroups.map((g, index) => ({
                    name: `${index + 1}. ${g.name}`,
                    value: g
                })),
                validate: input => input.length > 0 ? true : 'Anda harus memilih minimal 1 grup!'
            }
        ]);

        targetGroups = selectedGroups;

        // Tawarkan Save Campaign
        const { saveCamp } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'saveCamp',
                message: 'Apakah Anda ingin MENYIMPAN daftar grup yang barusan dicentang agar besok tidak perlu repot nyari lagi?',
                default: true
            }
        ]);

        if (saveCamp) {
            const { campName } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'campName',
                    message: 'Beri NAMA untuk simpanan daftar grup ini (Bebas, contoh: Grup Jualan Baju):',
                    validate: input => input ? true : 'Nama tidak boleh kosong!'
                }
            ]);
            saveCampaign(campName, targetGroups);
            console.log(`✅ Daftar grup berhasil disimpan dengan nama: '${campName}'! Besok Anda tinggal memilih opsi ke-2 saat membuka bot.`);
        }
    }

    // 2. Minta Teks Jualan (Dengan Spintax Hint)
    console.log(`\n💡 TIPS: Anda bisa menggunakan format {Kata1|Kata2} untuk mengacak kata (Spintax) agar terhindar dari spam.`);
    const { postText } = await inquirer.prompt([
        {
            type: 'editor',
            name: 'postText',
            message: 'Masukkan teks jualan Anda (Simpan & Tutup file untuk lanjut):',
            default: config.defaultText
        }
    ]);

    // 3. Multi-Image Selection
    const imagesDir = path.resolve('images');
    let availableImages = [];
    if (fs.existsSync(imagesDir)) {
        availableImages = fs.readdirSync(imagesDir).filter(file => {
            return ['.jpg', '.jpeg', '.png', '.mp4'].includes(path.extname(file).toLowerCase());
        });
    }

    let selectedImages = [];
    if (availableImages.length > 0) {
        const { imageOpt } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'imageOpt',
                message: 'Pilih gambar yang ingin diupload (Spasi untuk pilih, bisa lebih dari 1. Kosongkan jika tidak pakai gambar):',
                choices: availableImages.map(img => ({ name: img, value: img }))
            }
        ]);
        selectedImages = imageOpt;
    }

    // 4. Konfirmasi Eksekusi
    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `Siap mengirim postingan ke ${targetGroups.length} grup?`,
            default: true
        }
    ]);

    if (!confirm) {
        console.log("Dibatalkan oleh user.");
        await browserContext.close();
        process.exit(0);
    }

    // 5. Mulai Batch Posting
    console.log("\n=========================================");
    console.log("🔥 MEMULAI AUTO POSTING...");
    console.log("=========================================\n");

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetGroups.length; i++) {
        const group = targetGroups[i];
        console.log(`\n--- Progress: [${i + 1}/${targetGroups.length}] ---`);
        
        // Aplikasikan Spintax ke teks sebelum diposting
        const finalSpinText = parseSpintax(postText);
        console.log(`📝 Teks yang akan dikirim: "${finalSpinText.substring(0, 50)}..."`);
        
        const result = await postToGroup(browserContext, group, '', '', finalSpinText, selectedImages);
        
        if (result.success) {
            successCount++;
            const verifyIcon = result.verified ? '✅' : '⚠️';
            const modeLabel = result.mode === 'marketplace' ? 'Marketplace' : 'Normal';
            const sharedInfo = result.sharedGroups ? ` | Dibagikan ke ${result.sharedGroups} grup` : '';
            console.log(`${verifyIcon} ${result.verified ? 'TERVERIFIKASI' : 'Diproses'} [${modeLabel}]${sharedInfo}`);
            fs.appendFileSync(SUCCESS_LOG_FILE, `[${new Date().toLocaleString('id-ID')}] ${result.verified ? 'VERIFIED' : 'UNVERIFIED'} | ${modeLabel} | ${group.name}${sharedInfo}\n`);
        } else {
            failCount++;
            logFailed(group.name);
        }

        if (i < targetGroups.length - 1) {
            console.log(`\n⏳ Menunggu ${config.delayBetweenGroups / 1000} detik sebelum lanjut...`);
            await delay(config.delayBetweenGroups);
        }
    }

    // Tulis ringkasan sesi
    fs.appendFileSync(SUCCESS_LOG_FILE, `\n========== SESI ${new Date().toLocaleString('id-ID')} ==========\nTotal: ${targetGroups.length} grup | Sukses: ${successCount} | Gagal: ${failCount}\n============================================\n\n`);

    console.log("\n=========================================");
    console.log(`🎉 SELESAI! Sukses: ${successCount} | Gagal/Skip: ${failCount}`);
    if (failCount > 0) {
        console.log(`Catatan grup yang gagal disimpan di: ${FAILED_LOG_FILE}`);
    }
    console.log(`📄 Log sukses: ${SUCCESS_LOG_FILE}`);
    console.log("=========================================\n");

    await browserContext.close();
}

main().catch(err => {
    console.error("Terjadi error tak terduga:", err);
    process.exit(1);
});
