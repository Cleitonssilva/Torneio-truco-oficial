document.addEventListener('DOMContentLoaded', () => {

    // ======================================================
    // 0. CONFIGURAÇÃO (COLE SUAS CHAVES AQUI)
    // ======================================================
   const firebaseConfig = {
  apiKey: "AIzaSyD_VAQLAAu4Nqn39xShIXkvDNddvW_4Tds",
  authDomain: "dba-agrosol.firebaseapp.com",
  databaseURL: "https://dba-agrosol-default-rtdb.firebaseio.com",
  projectId: "dba-agrosol",
  storageBucket: "dba-agrosol.firebasestorage.app",
  messagingSenderId: "527386709919",
  appId: "1:527386709919:web:85ead187c16c8519cd37aa",
  measurementId: "G-KE4R7WNG4V"
};
    // Inicializa Firebase
    let db, auth;
    let isConnected = false;
    let currentUser = null; // Guardará o usuário logado

    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        auth = firebase.auth(); // Inicializa Auth
        isConnected = true;
    } catch (e) {
        console.warn("Erro Firebase:", e);
    }

    // Verifica URL para saber se deve tentar logar como admin
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminMode = urlParams.get('admin') === 'true';

    // Elementos DOM
    const splashArea = document.getElementById('splashArea');
    const mainActionButton = document.getElementById('mainActionButton');
    const manualInput = document.getElementById('manualInput');
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const generateButton = document.getElementById('generateBracketButton');
    const viewPodiumButton = document.getElementById('viewPodiumButton');
    const bracketContainer = document.getElementById('bracketContainer');
    const adminPanel = document.getElementById('adminArea');
    const backToBracketFromPodium = document.getElementById('backToBracketFromPodium');
    
    // Esconde controles inicialmente (libera só após login)
    document.body.classList.add('viewer-mode'); 
    if(adminPanel) adminPanel.style.display = 'none';

    // =============================
    // 1. SISTEMA DE LOGIN (SEGURANÇA)
    // =============================
    
    // Monitora estado do login
    if(isConnected) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                currentUser = user;
                console.log("Admin logado:", user.email);
                // Libera painel de admin
                document.body.classList.remove('viewer-mode');
                if(isAdminMode && splashArea.style.display !== 'none') {
                    // Se estiver no splash e for admin logado, libera entrada
                    mainActionButton.innerText = "Entrar como Admin";
                }
            } else {
                currentUser = null;
                document.body.classList.add('viewer-mode');
            }
        });
    }

    // =============================
    // 2. NAVEGAÇÃO E FLUXO
    // =============================

    function showPage(id) {
        document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
        if(id !== 'splashArea' && splashArea) splashArea.style.display = 'none';
        const target = document.getElementById(id);
        if (target) target.style.display = 'block';
    }

    mainActionButton.onclick = async () => {
        // FLUXO ADMIN
        if (isAdminMode && isConnected) {
            if (!currentUser) {
                // Se não está logado, PEDE SENHA
                const email = prompt("📧 E-mail do Admin:", "admin@agrosol.com");
                if(!email) return;
                const pass = prompt("🔑 Senha:");
                if(!pass) return;

                try {
                    await auth.signInWithEmailAndPassword(email, pass);
                    alert("Login realizado com sucesso!");
                    loadGameData();
                } catch (error) {
                    alert("Erro no login: " + error.message);
                    return; // Não deixa entrar
                }
            } else {
                // Já está logado
                loadGameData();
            }
        } 
        // FLUXO ESPECTADOR
        else {
            splashArea.style.display = 'none';
            if(adminPanel) adminPanel.innerHTML = "<div style='margin-top:50px'><h3>Aguardando dados do torneio...</h3></div>";
            showPage('adminArea'); // Mostra placeholder até dados chegarem
            listenToChanges(); // Começa a ouvir
        }
    };

    function loadGameData() {
        splashArea.style.display = 'none';
        db.ref('torneio').once('value').then(snap => {
            const data = snap.val();
            if (data) {
                renderBracket(data);
                showPage('bracketArea');
                checkPodium(data);
            } else {
                showPage('adminArea');
            }
            listenToChanges(); // Admin também ouve para garantir sync
        });
    }

    // =============================
    // 3. SINCRONIZAÇÃO (REALTIME)
    // =============================

    function save(data) {
        // Só salva se estiver logado (Write rule: auth != null)
        if (isConnected && currentUser) {
            db.ref('torneio').set(data).catch(e => alert("Erro ao salvar (Permissão negada): " + e.message));
        } else if (!isConnected) {
            localStorage.setItem('agroSolLocal', JSON.stringify(data));
        }
    }

    function listenToChanges() {
        if (!isConnected) return;

        db.ref('torneio').on('value', (snapshot) => {
            const data = snapshot.val();
            
            // Se for espectador e os dados chegarem, sai da tela de espera
            if (data && data.rounds) {
                if (!isAdminMode && document.getElementById('adminArea').style.display === 'block') {
                    showPage('bracketArea');
                }
                renderBracket(data);
                checkPodium(data);
            }
        });
    }

    // =============================
    // 4. LÓGICA DO TORNEIO (IGUAL AO ANTERIOR)
    // =============================
    
    // Leitura Excel (Só Admin)
    if(fileInput) {
        fileInput.addEventListener('change', (e) => {
            if(!currentUser) return; // Segurança Extra
            const file = e.target.files[0];
            if (!file) return;
            fileNameDisplay.innerText = file.name;
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});
                let names = [];
                for (let i = 1; i < rows.length; i++) if (rows[i][0]) names.push(rows[i][0]);
                manualInput.value = names.join('\n');
            };
            reader.readAsArrayBuffer(file);
        });
    }

    if(generateButton) {
        generateButton.onclick = () => {
            if(!currentUser) return alert("Você precisa estar logado!");
            
            const rawText = manualInput.value.trim();
            if (!rawText) return alert("Lista vazia.");
            let participants = rawText.split(/[\n]+/).map(s => s.trim()).filter(s => s.length > 0);
            
            const mode = document.querySelector('input[name="modo"]:checked').value;
            if (mode === 'duplas') {
                 if (participants.length % 2 !== 0) return alert("Número ímpar para duplas!");
                 const pairs = [];
                 for(let i=0; i<participants.length; i+=2) pairs.push(participants[i] + " & " + participants[i+1]);
                 participants = pairs;
            }

            if(participants.length < 2) return alert("Mínimo 2 participantes.");

            shuffleArray(participants);
            const tournamentData = generateTournamentStructure(participants);
            propagateWinners(tournamentData);
            save(tournamentData);
            
            renderBracket(tournamentData);
            showPage('bracketArea');
        };
    }

    // Renderização Blindada
    function renderBracket(data){
        bracketContainer.innerHTML = '';
        
        data.rounds.forEach((round, rIndex)=>{
            const div = document.createElement('div');
            div.className = 'round';
            div.innerHTML = `<h3>${getRoundName(round.length)}</h3>`;
            
            round.forEach((match, mIndex)=>{
                const isFinished = !!match.winner;
                const isBye = match.team2 === 'BYE';
                const divMatch = document.createElement('div');
                divMatch.className = match.winner ? 'match winner-match' : 'match';

                if(isBye) {
                     divMatch.innerHTML = `<div class="team" style="color:#aaa">${match.winner} <small>(Passou)</small></div>`;
                     divMatch.style.border = "1px dashed #444";
                } else {
                    // Controles SÓ aparecem se currentUser existir (Admin logado)
                    const showControls = (!isFinished && currentUser);
                    
                    const btn1 = showControls ? `<button onclick="addPoint(${rIndex},${mIndex},1)">+</button>` : '';
                    const btn2 = showControls ? `<button onclick="addPoint(${rIndex},${mIndex},2)">+</button>` : '';
                    const btnFinish = showControls ? `<button class="btn-finish" onclick="finishMatch(${rIndex},${mIndex})">Finalizar</button>` : '';

                    divMatch.innerHTML = `
                        <div class="team ${match.winner===match.team1?'win-text':''}">
                            <span>${match.team1}</span> <span>${match.score1}</span> ${btn1}
                        </div>
                        <div class="team ${match.winner===match.team2?'win-text':''}">
                            <span>${match.team2}</span> <span>${match.score2}</span> ${btn2}
                        </div>
                        ${btnFinish}
                        ${isFinished ? `<small style="display:block;text-align:center;color:#FFC107">🏆 ${match.winner}</small>` : ''}
                    `;
                }
                div.appendChild(divMatch);
            });
            bracketContainer.appendChild(div);
        });
        
        // Render 3rd Place
        if(data.thirdPlaceMatch){
             const div3 = document.createElement('div');
             div3.className = 'round';
             div3.style.border = '2px dashed #444';
             div3.innerHTML = `<h3 style="color:#aaa">3º Lugar</h3>`;
             const m = data.thirdPlaceMatch.match;
             const isFin = !!m.winner;
             const showControls = (!isFin && currentUser && m.team1 && m.team2);
             
             div3.innerHTML += `
                <div class="match ${isFin?'winner-match':''}">
                    <div class="team"><span>${m.team1 || '?'}</span> <b>${m.score1}</b>${showControls ? `<button onclick="addPoint3rd(1)">+</button>` : ''}</div>
                    <div class="team"><span>${m.team2 || '?'}</span> <b>${m.score2}</b>${showControls ? `<button onclick="addPoint3rd(2)">+</button>` : ''}</div>
                    ${showControls ? `<button class="btn-finish" onclick="finish3rd()">Finalizar</button>` : ''}
                    ${isFin ? `<small style="text-align:center; display:block">3º: ${m.winner}</small>` : ''}
                </div>`;
             bracketContainer.appendChild(div3);
        }
    }

    // Ações de Jogo (Só funcionam se logado)
    window.addPoint = (r, m, t) => {
        if(!currentUser) return;
        db.ref('torneio').once('value').then(snap => {
            const data = snap.val();
            if(t===1) data.rounds[r][m].score1++; else data.rounds[r][m].score2++;
            save(data);
        });
    };

    window.finishMatch = (r, m) => {
        if(!currentUser) return;
        db.ref('torneio').once('value').then(snap => {
            const data = snap.val();
            const match = data.rounds[r][m];
            if(match.score1 === match.score2) return alert("Empate!");
            
            match.winner = match.score1 > match.score2 ? match.team1 : match.team2;
            propagateWinners(data);
            
            // Logic for 3rd place setup
            const loser = match.winner === match.team1 ? match.team2 : match.team1;
            if(r === data.rounds.length - 2){
                if(!data.thirdPlaceMatch) data.thirdPlaceMatch = { match: { team1: null, team2: null, score1:0, score2:0, winner:null } };
                if(!data.thirdPlaceMatch.match.team1) data.thirdPlaceMatch.match.team1 = loser;
                else if(!data.thirdPlaceMatch.match.team2) data.thirdPlaceMatch.match.team2 = loser;
            }
            save(data);
        });
    };

    window.addPoint3rd = (t) => {
        if(!currentUser) return;
        db.ref('torneio').once('value').then(snap => {
            const d = snap.val();
            if(t===1) d.thirdPlaceMatch.match.score1++; else d.thirdPlaceMatch.match.score2++;
            save(d);
        });
    };
    
    window.finish3rd = () => {
        if(!currentUser) return;
        db.ref('torneio').once('value').then(snap => {
            const d = snap.val();
            const m = d.thirdPlaceMatch.match;
            if(m.score1 === m.score2) return alert("Empate!");
            m.winner = m.score1 > m.score2 ? m.team1 : m.team2;
            save(d);
        });
    };
    
    window.fullReset = () => {
        if(currentUser && confirm("Resetar tudo do Firebase?")) {
            db.ref('torneio').remove();
            location.reload();
        }
    };

    if(backToBracketFromPodium) backToBracketFromPodium.onclick = () => showPage('bracketArea');

    // Funções Auxiliares
    function generateTournamentStructure(teams) {
        const count = teams.length;
        let nextPow2 = 1; while (nextPow2 < count) nextPow2 *= 2;
        const numByes = nextPow2 - count;
        const firstRoundMatches = [];
        let teamIndex = 0;
        for (let i = 0; i < numByes; i++) {
            firstRoundMatches.push({ team1: teams[teamIndex++], team2: "BYE", score1: 1, score2: 0, winner: teams[teamIndex-1] });
        }
        while (teamIndex < count) {
            firstRoundMatches.push({ team1: teams[teamIndex++], team2: teams[teamIndex++], score1: 0, score2: 0, winner: null });
        }
        const rounds = [firstRoundMatches];
        let size = firstRoundMatches.length;
        while(size > 1) { size /= 2; rounds.push(Array(size).fill().map(()=>({team1:'A definir',team2:'A definir',score1:0,score2:0,winner:null}))); }
        return { rounds: rounds, thirdPlaceMatch: null };
    }

    function propagateWinners(data) {
        for (let r = 0; r < data.rounds.length - 1; r++) {
            data.rounds[r].forEach((match, i) => {
                if (match.winner) {
                    const nextM = data.rounds[r+1][Math.floor(i/2)];
                    if (i % 2 === 0) nextM.team1 = match.winner; else nextM.team2 = match.winner;
                }
            });
        }
    }

    function shuffleArray(arr) { for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}}
    function getRoundName(len) { if(len===1)return"Final"; if(len===2)return"Semifinal"; if(len===4)return"Quartas"; return `Top ${len*2}`; }
    function checkPodium(data) {
        if(data.rounds[data.rounds.length-1][0].winner) {
            viewPodiumButton.style.display = 'inline-block';
            viewPodiumButton.onclick = () => {
                const final = data.rounds[data.rounds.length-1][0];
                document.getElementById('winner1st').innerText = final.winner;
                document.getElementById('winner2nd').innerText = final.winner===final.team1?final.team2:final.team1;
                document.getElementById('winner3rd').innerText = data.thirdPlaceMatch?.match.winner || "N/A";
                showPage('podiumArea');
                // Confete code here...
            };
        }
    }
});
