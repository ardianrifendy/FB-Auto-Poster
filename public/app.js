const socket = io();

// UI Elements
const btnCheckAuth = document.getElementById('btn-check-auth');
const authStatus = document.getElementById('auth-status');
const stepTarget = document.getElementById('step-target');
const stepContent = document.getElementById('step-content');
const stepExecute = document.getElementById('step-execute');
const consoleBody = document.getElementById('console-body');
const floatingConsole = document.getElementById('floating-console');
const consoleTitle = document.getElementById('console-title');

let scrapedGroupsData = [];
let savedCampaignsData = {};
let savedDraftsData = {};

// Live stats tracking
let liveStats = { success: 0, skip: 0, fail: 0 };

function updateStat(type) {
    liveStats[type]++;
    const el = document.getElementById(`stat-${type}`);
    if (el) {
        el.textContent = liveStats[type];
        // Pulse animation
        el.closest('.stat-card').classList.remove('pulse');
        void el.closest('.stat-card').offsetWidth; // force reflow
        el.closest('.stat-card').classList.add('pulse');
    }
}

function logToConsole(msg) {
    // Otomatis munculkan konsol jika ada pesan masuk
    floatingConsole.classList.remove('hidden');
    floatingConsole.classList.remove('minimized');
    document.getElementById('btn-min-console').textContent = '▼';

    const p = document.createElement('p');
    p.textContent = `> ${msg}`;
    
    // Smart coloring
    if (msg.includes('❌') || msg.includes('Error')) {
        p.className = 'log-error';
        updateStat('fail');
    } else if (msg.includes('⚠️')) {
        p.className = 'log-warn';
    } else if (msg.includes('TERVERIFIKASI')) {
        p.className = 'log-success';
        updateStat('success');
    } else if (msg.includes('Diproses')) {
        p.className = 'log-success';
        updateStat('success');
    } else if (msg.includes('⏩') || msg.includes('SKIP')) {
        p.className = 'log-skip';
        updateStat('skip');
    } else if (msg.includes('Batch')) {
        p.className = 'log-batch';
    } else if (msg.includes('🔗')) {
        p.className = 'log-url';
    }

    consoleBody.appendChild(p);
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

socket.on('log', (msg) => logToConsole(msg));

// Console controls
let savedConsoleHeight = '';
const header = document.getElementById('console-header');

header.addEventListener('click', (e) => {
    if (e.target.id === 'btn-close-console') {
        floatingConsole.classList.add('hidden');
    } else if (e.target.id === 'btn-min-console') {
        const isMinimized = floatingConsole.classList.toggle('minimized');
        document.getElementById('btn-min-console').textContent = isMinimized ? '▲' : '▼';
        
        if (isMinimized) {
            savedConsoleHeight = floatingConsole.style.height;
            floatingConsole.style.height = 'auto';
        } else {
            if (savedConsoleHeight) floatingConsole.style.height = savedConsoleHeight;
        }
    }
});

// Drag functionality for the console
let isDragging = false;
let startX, startY, initialLeft, initialTop;

header.addEventListener('mousedown', (e) => {
    if (e.target.id === 'btn-close-console' || e.target.id === 'btn-min-console') return;
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = floatingConsole.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    
    floatingConsole.style.right = 'auto';
    floatingConsole.style.bottom = 'auto';
    floatingConsole.style.left = initialLeft + 'px';
    floatingConsole.style.top = initialTop + 'px';
    
    document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    floatingConsole.style.left = (initialLeft + dx) + 'px';
    floatingConsole.style.top = (initialTop + dy) + 'px';
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
    }
});

// --- Auth Step ---
btnCheckAuth.addEventListener('click', () => {
    btnCheckAuth.disabled = true;
    btnCheckAuth.textContent = 'Memeriksa...';
    socket.emit('checkAuth');
});

socket.on('authStatus', (res) => {
    authStatus.classList.remove('hidden');
    if (res.loggedIn) {
        authStatus.className = 'status-box success';
        authStatus.innerHTML = `
            <div class="user-profile">
                <img src="${res.profile.photo}" alt="Profile" class="profile-pic" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png'">
                <div class="profile-info">
                    <span class="profile-name">${res.profile.name}</span>
                    <span class="profile-status">✅ Terhubung dengan Facebook</span>
                </div>
            </div>
        `;
        btnCheckAuth.style.display = 'none';
        
        // Unlock next steps
        stepTarget.classList.remove('disabled');
        stepContent.classList.remove('disabled');
        stepExecute.classList.remove('disabled');
    } else {
        authStatus.className = 'status-box error';
        authStatus.innerHTML = `
            <p>⚠️ Anda belum login!</p>
            <p style="font-size:0.8rem; font-weight:normal; margin: 10px 0;">Sebuah jendela Chrome telah terbuka. Silakan login di sana, lalu klik tombol di bawah ini.</p>
            <button id="btn-confirm-login" class="btn primary" style="width:100%">Saya Sudah Login!</button>
        `;
        document.getElementById('btn-confirm-login').addEventListener('click', () => {
            socket.emit('confirmLogin');
            authStatus.innerHTML = 'Memverifikasi...';
        });
        btnCheckAuth.disabled = false;
        btnCheckAuth.textContent = 'Cek Ulang';
    }
});

// --- Target Step ---
// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

// Scrape
const btnScrape = document.getElementById('btn-scrape');
btnScrape.addEventListener('click', () => {
    const keyword = document.getElementById('input-keyword').value;
    document.getElementById('scrape-results').classList.add('hidden');
    
    btnScrape.disabled = true;
    btnScrape.innerHTML = '<span class="spinner"></span> Menarik Data...';
    
    socket.emit('scrapeGroups', keyword);
});

socket.on('scrapeResult', (groups) => {
    btnScrape.disabled = false;
    btnScrape.innerHTML = 'Tarik Data';

    scrapedGroupsData = groups;
    const list = document.getElementById('group-list');
    list.innerHTML = '';
    groups.forEach((g, i) => {
        const item = document.createElement('label');
        item.className = 'check-item';
        item.innerHTML = `<input type="checkbox" value="${i}" class="group-cb"> <span title="${g.name}">${g.name.length > 25 ? g.name.substring(0,25)+'...' : g.name}</span>`;
        list.appendChild(item);
    });
    document.getElementById('scrape-results').classList.remove('hidden');
});

document.getElementById('check-all').addEventListener('change', (e) => {
    document.querySelectorAll('.group-cb').forEach(cb => cb.checked = e.target.checked);
});

// Save Campaign
document.getElementById('btn-save-campaign').addEventListener('click', () => {
    const name = document.getElementById('input-campaign-name').value;
    if (!name) return alert('Nama tidak boleh kosong');
    
    const selected = Array.from(document.querySelectorAll('.group-cb:checked')).map(cb => scrapedGroupsData[cb.value]);
    if (selected.length === 0) return alert('Pilih minimal 1 grup');
    
    socket.emit('saveCampaign', { name, groups: selected });
    document.getElementById('input-campaign-name').value = '';
});

// Init Data (Campaigns, Drafts & Images)
socket.on('initData', (data) => {
    savedCampaignsData = data.campaigns;
    const select = document.getElementById('select-campaign');
    select.innerHTML = '<option value="">-- Pilih Riwayat Tersimpan --</option>';
    Object.keys(data.campaigns).forEach(c => {
        select.innerHTML += `<option value="${c}">${c} (${data.campaigns[c].length} grup)</option>`;
    });

    savedDraftsData = data.drafts;
    const selectDraft = document.getElementById('select-draft');
    selectDraft.innerHTML = '<option value="">-- Kosongkan Form / Pilih Draft Tersimpan --</option>';
    Object.keys(data.drafts).forEach(d => {
        selectDraft.innerHTML += `<option value="${d}">${d}</option>`;
    });
});

// --- Draft Logic ---
const inputTitle = document.getElementById('input-title');
const inputPrice = document.getElementById('input-price');
const inputText = document.getElementById('input-text');
const selectDraft = document.getElementById('select-draft');

function getDraftData() {
    return {
        title: inputTitle.value,
        price: inputPrice.value,
        text: inputText.value
    };
}

function setDraftData(data) {
    inputTitle.value = data?.title || '';
    inputPrice.value = data?.price || '';
    inputText.value = data?.text || '';
}

// Load dari local storage saat halaman pertama kali dibuka
if (localStorage.getItem('draft_autosave_obj')) {
    try {
        const saved = JSON.parse(localStorage.getItem('draft_autosave_obj'));
        setDraftData(saved);
    } catch (e) {}
}

// Auto-save ke local storage setiap kali mengetik
const saveToLocal = () => {
    localStorage.setItem('draft_autosave_obj', JSON.stringify(getDraftData()));
};
inputTitle.addEventListener('input', saveToLocal);
inputPrice.addEventListener('input', saveToLocal);
inputText.addEventListener('input', saveToLocal);

// Load dari draft tersimpan
selectDraft.addEventListener('change', () => {
    const val = selectDraft.value;
    if (val && savedDraftsData[val]) {
        if (typeof savedDraftsData[val] === 'string') {
            setDraftData({ text: savedDraftsData[val] });
        } else {
            setDraftData(savedDraftsData[val]);
        }
        saveToLocal();
    } else {
        setDraftData({});
        localStorage.removeItem('draft_autosave_obj');
    }
});

// Simpan Draft ke Backend
document.getElementById('btn-save-draft').addEventListener('click', () => {
    const draftName = document.getElementById('input-draft-name').value.trim();
    const draftData = getDraftData();
    
    if (!draftName) return alert('Nama draft tidak boleh kosong!');
    if (!draftData.text) return alert('Teks jualan tidak boleh kosong!');
    
    socket.emit('saveDraft', { name: draftName, data: draftData });
    document.getElementById('input-draft-name').value = '';
});

// --- File Input Listener ---
let uploadedFiles = [];
document.getElementById('image-upload').addEventListener('change', function() {
    uploadedFiles = Array.from(this.files);
    const fileCount = uploadedFiles.length;
    const textElement = document.getElementById('file-chosen-text');
    if (fileCount === 0) {
        textElement.textContent = 'Belum ada file dipilih';
    } else if (fileCount === 1) {
        textElement.textContent = uploadedFiles[0].name;
    } else {
        textElement.textContent = `${fileCount} file siap diunggah`;
    }
});

// --- Execute Step ---
document.getElementById('btn-start').addEventListener('click', async () => {
    const activeTab = document.querySelector('.tab-btn.active').dataset.target;
    let targetGroups = [];

    if (activeTab === 'tab-scrape') {
        targetGroups = Array.from(document.querySelectorAll('.group-cb:checked')).map(cb => scrapedGroupsData[cb.value]);
    } else {
        const campName = document.getElementById('select-campaign').value;
        if (campName) targetGroups = savedCampaignsData[campName];
    }

    if (targetGroups.length === 0) return alert('Target grup belum dipilih!');

    const title = document.getElementById('input-title').value;
    const price = document.getElementById('input-price').value;
    const text = document.getElementById('input-text').value;

    if (!text) return alert('Teks jualan tidak boleh kosong!');

    let images = [];
    if (uploadedFiles.length > 0) {
        document.getElementById('btn-start').disabled = true;
        document.getElementById('btn-start').textContent = 'MENGUNGGAH GAMBAR...';
        const formData = new FormData();
        uploadedFiles.forEach(f => formData.append('images', f));
        
        try {
            const res = await fetch('/upload', { method: 'POST', body: formData });
            const data = await res.json();
            images = data.filenames;
        } catch (e) {
            document.getElementById('btn-start').disabled = false;
            document.getElementById('btn-start').textContent = 'MULAI POSTING 3x PARALEL 🔥';
            return alert('Gagal mengunggah gambar!');
        }
    }

    const totalBatches = Math.ceil(targetGroups.length / 3);

    if (confirm(`Siap posting ke ${targetGroups.length} grup?\n\n⚡ Mode: 3 tab paralel\n🧠 Smart dedup aktif\n📦 ~${totalBatches} batch\n\nPostingan akan otomatis di-share ke grup relevan.`)) {
        consoleBody.innerHTML = '';
        document.getElementById('btn-start').disabled = true;
        document.getElementById('btn-start').textContent = 'PROSES POSTING BERJALAN...';
        
        // Reset & show live stats
        liveStats = { success: 0, skip: 0, fail: 0 };
        document.getElementById('stat-success').textContent = '0';
        document.getElementById('stat-skip').textContent = '0';
        document.getElementById('stat-fail').textContent = '0';
        document.getElementById('stat-batch').textContent = `0/${totalBatches}`;
        document.getElementById('live-stats').classList.remove('hidden');
        
        // Munculkan floating console
        floatingConsole.classList.remove('hidden');
        floatingConsole.classList.remove('minimized');
        document.getElementById('btn-min-console').textContent = '▼';
        consoleTitle.textContent = `Memproses 0/${targetGroups.length} Grup`;

        socket.emit('startPosting', { targetGroups, title, price, text, images });
    } else {
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-start').textContent = 'MULAI POSTING 3x PARALEL 🔥';
    }
});

socket.on('postProgress', (data) => {
    document.getElementById('btn-start').textContent = `⚡ PROSES [${data.current}/${data.total}]...`;
    consoleTitle.textContent = `Memproses ${data.current}/${data.total} Grup`;
    
    // Update batch counter
    const totalBatches = Math.ceil(data.total / 3);
    const currentBatch = Math.ceil(data.current / 3);
    document.getElementById('stat-batch').textContent = `${currentBatch}/${totalBatches}`;
});

socket.on('postComplete', (res) => {
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-start').textContent = 'MULAI POSTING 3x PARALEL 🔥';
    
    const skipText = res.skip ? `\nSkip (sudah ter-share): ${res.skip}` : '';
    alert(`SELESAI!\n\n✅ Terposting: ${res.success}\n❌ Gagal: ${res.fail}${skipText}\n\n📄 Cek success_post.txt untuk detail & URL`);
});
