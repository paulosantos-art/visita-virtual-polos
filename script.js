// =========================================================================
// 0. CONTROLE DE ACESSO (Trava de Segurança na Index)
// =========================================================================

if (localStorage.getItem('painel_polos_logado') !== 'true') {
    window.location.href = 'login.html';
}


// =========================================================================
// 1. CONFIGURAÇÃO DA PLANILHA (IDs e Links de Integração)
// =========================================================================
const SPREADSHEET_ID = '1km9rpUas9U3V4zqRqCp4AxxR_srUphtlckBuGRF7lqQ';

const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;
const CURSOS_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=P%C3%A1gina1`;
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyotjrDB9PBpOACksBkr0unfryAM9lmNofdlF4Jdw0SiCD-f9LsejcldS0tnZLRJyA7/exec';

let database = [];
let baseCursosPolos = {}; 
let listaTodosCursos = []; 


// =========================================================================
// 2. ELEMENTOS DO DOM (MAPEAMENTO)
// =========================================================================
const inputBusca = document.getElementById('input-busca');
const selectRegiao = document.getElementById('select-regiao');
const selectEstado = document.getElementById('select-estado');
const selectModelo = document.getElementById('select-modelo');
const selectCurso = document.getElementById('selectCurso'); 
const tabelaBody = document.getElementById('tabela-polos-body');
const noResultsDiv = document.getElementById('no-results');

const txtTotalPolos = document.getElementById('txt-total-polos');
const txtTotalEad = document.getElementById('txt-total-ead');
const txtTotalSemi = document.getElementById('txt-total-semi');
const txtBadgeTotal = document.getElementById('txt-badge-total');
const btnAgenda = document.getElementById('btn-agenda');
const txtBadgeConcluidos = document.getElementById('txt-badge-concluidos');
const btnSair = document.getElementById('btn-sair'); 


// =========================================================================
// 3. INICIALIZAÇÃO DO PAINEL
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    await carregarCursosDaPlanilha();
    await carregarDadosDaPlanilha();

    if (inputBusca) inputBusca.addEventListener('input', filtrarEDesenhar);
    if (btnSair) btnSair.addEventListener('click', efetuarLogout);
    
    // --- LÓGICA DE FILTROS INTELIGENTES CRUZADOS ---
    if (selectRegiao) {
        selectRegiao.addEventListener('change', () => {
            popularEstadosBaseadoEmRegiao(); 
            filtrarEDesenhar();
        });
    }
    
    if (selectEstado) {
        selectEstado.addEventListener('change', () => {
            ajustarRegiaoBaseadoEmEstado();
            filtrarEDesenhar();
        });
    }

    if (btnAgenda) {
        btnAgenda.addEventListener('click', abrirAgendaGlobal);
    }
    
    if (selectModelo) selectModelo.addEventListener('change', filtrarEDesenhar);
    if (selectCurso) selectCurso.addEventListener('change', filtrarEDesenhar); 

    // Tecla ESC limpa tudo voltando para os padrões do HTML
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || event.key === 'Esc') {
            if (document.activeElement.tagName === 'TEXTAREA') return; // Evita limpar enquanto digita nota
            
            if (inputBusca) inputBusca.value = '';
            if (selectRegiao) selectRegiao.selectedIndex = 0;
            popularEstadosBaseadoEmRegiao(); 
            if (selectEstado) selectEstado.selectedIndex = 0;
            if (selectModelo) selectModelo.selectedIndex = 0;
            if (selectCurso) selectCurso.selectedIndex = 0; 
            document.querySelectorAll('.detail-row').forEach(row => row.style.display = 'none');
            document.querySelectorAll('.polo-row').forEach(row => row.classList.remove('expanded'));
            filtrarEDesenhar();
        }
    });     
});


function efetuarLogout() {
    localStorage.removeItem('painel_polos_logado');
    window.location.href = 'login.html';
}


// =========================================================================
// 4. PROCESSAR CURSOS
// =========================================================================
async function carregarCursosDaPlanilha() {
    try {
        const resposta = await fetch(CURSOS_URL);
        if (!resposta.ok) throw new Error("Não foi possível alcançar os cursos.");
        const csvTexto = await resposta.text();
        
        const lines = processarLinhasCSV(csvTexto);
        if (lines.length < 2) return;

        const cabecalho = lines[0];
        listaTodosCursos = cabecalho.slice(4).map(c => c.trim()).filter(c => c !== "");
        listaTodosCursos.sort();

        popularSelectCursos();

        for (let i = 1; i < lines.length; i++) {
            const colunas = lines[i];
            if (colunas.length < 3) continue;

            const nomePolo = colunas[2] ? colunas[2].trim() : '';
            if (!nomePolo) continue;

            baseCursosPolos[nomePolo] = {};

            for (let j = 4; j < colunas.length; j++) {
                const nomeCurso = cabecalho[j] ? cabecalho[j].trim() : '';
                const statusOferta = colunas[j] ? colunas[j].trim() : 'Sem Oferta';
                
                if (nomeCurso) {
                    baseCursosPolos[nomePolo][nomeCurso] = statusOferta;
                }
            }
        }
    } catch (erro) {
        console.error("Aviso de Cursos:", erro);
    }
}

function popularSelectCursos() {
    if (!selectCurso) return;
    selectCurso.innerHTML = '<option value="TODOS">Todos os Cursos</option>';
    listaTodosCursos.forEach(curso => {
        const option = document.createElement('option');
        option.value = curso;
        option.textContent = curso;
        selectCurso.appendChild(option);
    });
}

function processarLinhasCSV(text) {
    let lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let next = text[i + 1];
        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }
    return lines;
}


// =========================================================================
// 5. LEITURA E TRATAMENTO DA PLANILHA (POLOS)
// =========================================================================
async function carregarDadosDaPlanilha() {
    if (tabelaBody) {
        tabelaBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 60px;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 2.5rem; color: var(--primary-color);"></i>
                    <br><br>
                    <span style="color: var(--text-muted); font-weight: 500;">Carregando polos diretamente da planilha...</span>
                </td>
            </tr>
        `;
    }
    
    try {
        const response = await fetch(SPREADSHEET_URL);
        if (!response.ok) throw new Error("Erro Sheets API");
        
        const csvText = await response.text();
        database = processarCsvProfissional(csvText);

        popularTodosEstadosIniciais(); 
        filtrarEDesenhar();

    } catch (error) {
        console.error(error);
    }
}

function ajustarRegiaoBaseadoEmEstado() {
    if (!selectEstado || !selectRegiao) return;

    const estadoSelecionado = selectEstado.value;

    if (estadoSelecionado === 'TODOS' || estadoSelecionado.includes('Todos')) {
        return;
    }

    const poloCorrespondente = database.find(p => p.Estado === estadoSelecionado);
    
    if (poloCorrespondente && poloCorrespondente.Regiao) {
        for (let i = 0; i < selectRegiao.options.length; i++) {
            if (selectRegiao.options[i].value === poloCorrespondente.Regiao) {
                selectRegiao.selectedIndex = i;
                break;
            }
        }
    }
}

function processarCsvProfissional(text) {
    const lines = processarLinhasCSV(text);
    if (lines.length === 0) return [];

    const headers = lines[0].map(h => h.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());

    let idxNome = headers.findIndex(h => h.includes('nome') || h.includes('polo') || h.includes('cidade'));
    let idxRegiao = headers.findIndex(h => h.includes('regia'));
    let idxEstado = headers.findIndex(h => h.includes('estado'));
    let idxModelo = headers.findIndex(h => h.includes('model') || h.includes('ensino') || h.includes('oferta'));

    if (idxNome === -1) idxNome = 0;
    if (idxRegiao === -1) idxRegiao = 1;
    if (idxEstado === -1) idxEstado = 2;
    if (idxModelo === -1) idxModelo = 3;

    const parsedData = [];

    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i];
        if (cells.length < 2) continue;

        const nome = cells[idxNome] ? cells[idxNome].trim() : '';
        const regiao = cells[idxRegiao] ? cells[idxRegiao].trim() : 'Outros';
        
        let estado = cells[idxEstado] ? cells[idxEstado].trim() : 'Não Definido';
        estado = estado.replace(/\s*\(.*?\)\s*/g, '').trim(); 

        let temEAD = false;
        let temSemi = false;

        cells.forEach((celula, idx) => {
            if (idx !== idxNome && idx !== idxRegiao && idx !== idxEstado) {
                const valorMinusculo = celula.toLowerCase();
                if (valorMinusculo.includes('oferta') && !valorMinusculo.startsWith('sem')) {
                    if (valorMinusculo.includes('semi')) {
                        temSemi = true;
                    } else {
                        temEAD = true;
                    }
                }
            }
        });

        let modeloClassificado = 'EAD';
        if (temSemi) {
            modeloClassificado = 'Semipresencial';
        } else if (temEAD) {
            modeloClassificado = 'EAD';
        } else {
            const modeloOriginal = cells[idxModelo] ? cells[idxModelo].trim().toUpperCase() : 'EAD';
            if (modeloOriginal.includes('SEMI') || modeloOriginal.includes('PRESENCIAL')) {
                modeloClassificado = 'Semipresencial';
            }
        }

        if (nome) {
            parsedData.push({
                Nome: nome,
                Regiao: regiao,
                Estado: estado,
                Modelo: modeloClassificado
            });
        }
    }
    return parsedData;
}


// =========================================================================
// 6. MOTOR DO FILTRO INTELIGENTE E DEPENDÊNCIAS CRUZADAS
// =========================================================================

function popularTodosEstadosIniciais() {
    if (!selectEstado) return;
    
    let estados = [];
    database.forEach(polo => {
        if (polo.Estado && !estados.includes(polo.Estado)) {
            estados.push(polo.Estado);
        }
    });
    estados.sort();

    selectEstado.innerHTML = '<option value="TODOS">Todos os Estados</option>';
    estados.forEach(est => {
        const option = document.createElement('option');
        option.value = est;
        option.textContent = est;
        selectEstado.appendChild(option);
    });
}

function popularEstadosBaseadoEmRegiao() {
    if (!selectEstado || !selectRegiao) return;

    const regiaoSelecionada = selectRegiao.value;
    const estadoAnterior = selectEstado.value;
    
    let estadosFiltrados = [];
    
    database.forEach(polo => {
        if (regiaoSelecionada === 'TODAS' || regiaoSelecionada.includes('Todas') || polo.Regiao === regiaoSelecionada) {
            if (polo.Estado && !estadosFiltrados.includes(polo.Estado)) {
                estadosFiltrados.push(polo.Estado);
            }
        }
    });

    estadosFiltrados.sort();
    selectEstado.innerHTML = '<option value="TODOS">Todos os Estados</option>';
    
    estadosFiltrados.forEach(estado => {
        const option = document.createElement('option');
        option.value = estado;
        option.textContent = estado;
        selectEstado.appendChild(option);
    });

    if (estadosFiltrados.includes(estadoAnterior)) {
        selectEstado.value = estadoAnterior;
    } else {
        selectEstado.value = 'TODOS';
    }
}


// =========================================================================
// 7. FUNÇÃO DE ALTERNÂNCIA (TOGGLE) PARA CAIXA DE TEXTO DOS AMBIENTES
// =========================================================================
function toggleNotaAmbiente(checkboxId, boxId) {
    const chk = document.getElementById(checkboxId);
    const box = document.getElementById(boxId);
    
    if (chk && box) {
        if (chk.checked) {
            box.style.display = 'block';
            const txt = box.querySelector('textarea');
            if (txt) txt.focus();
        } else {
            box.style.display = 'none';
        }
    }
}


// =========================================================================
// 8. FILTRAGEM, RENDERIZAÇÃO DA TABELA E DETALHES
// =========================================================================
function filtrarEDesenhar() {
    const busca = inputBusca ? inputBusca.value.toLowerCase().trim() : '';
    const regiao = selectRegiao ? selectRegiao.value : 'TODAS';
    const estado = selectEstado ? selectEstado.value : 'TODOS';
    const modelo = selectModelo ? selectModelo.value : 'TODOS';
    const cursoSelecionado = selectCurso ? selectCurso.value : 'TODOS'; 

    const dadosFiltrados = database.filter(polo => {
        const atendeBusca = polo.Nome.toLowerCase().includes(busca);
        const atendeRegiao = (regiao === 'TODAS' || regiao.includes('Todas') || polo.Regiao === regiao);
        const atendeEstado = (estado === 'TODOS' || estado.includes('Todos') || polo.Estado === estado);
        
        let atendeModelo = true;
        if (modelo !== 'TODOS' && !modelo.includes('Todos')) {
            atendeModelo = (modelo === 'EAD' ? polo.Modelo === 'EAD' : polo.Modelo === 'Semipresencial');
        }

        let atendeCurso = true;
        if (cursoSelecionado !== 'TODOS' && !cursoSelecionado.includes('Todos')) {
            const cursosDoPolo = baseCursosPolos[polo.Nome];
            if (cursosDoPolo && cursosDoPolo[cursoSelecionado]) {
                const status = cursosDoPolo[cursoSelecionado].toUpperCase();
                atendeCurso = !status.includes("SEM OFERTA") && status !== "";
            } else {
                atendeCurso = false; 
            }
        }

        return atendeBusca && atendeRegiao && atendeEstado && atendeModelo && atendeCurso;
    });

    atualizarIndicadores(dadosFiltrados);

    if (tabelaBody) {
        tabelaBody.innerHTML = '';
        
        if (dadosFiltrados.length === 0) {
            if (noResultsDiv) noResultsDiv.classList.remove('hidden');
        } else {
            if (noResultsDiv) noResultsDiv.classList.add('hidden');
            
            dadosFiltrados.forEach((polo, index) => {
                const badgeClass = polo.Modelo === 'EAD' ? 'badge-ead' : 'badge-semi';
                const coursesOfPolo = baseCursosPolos[polo.Nome] || null;
                let htmlCursos = "";

                if (coursesOfPolo && Object.keys(coursesOfPolo).length > 0) {
                    htmlCursos = `
                        <h3 class="details-title" style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 20px;">🎓 Cursos Ofertados neste Polo</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px; padding: 15px; border-radius: 8px; border: 1px solid #f1f5f9; background-color: #fafbfc;">
                    `;

                    for (const [nomeCurso, status] of Object.entries(coursesOfPolo)) {
                        const statusUpper = status.toUpperCase();

                        let bgColor = '#f8fafc';       
                        let borderColor = '#e2e8f0';   
                        let textColor = '#475569';     
                        let badgeBg = '#f1f5f9';       
                        let badgeText = '#64748b';     
                        let badgeBorder = '#e2e8f0';   

                        if (statusUpper.includes("SEMI")) {
                            bgColor = '#f0fdf4';
                            borderColor = '#bbf7d0';
                            textColor = '#14532d';
                            badgeBg = '#dcfce7';
                            badgeText = '#15803d';
                            badgeBorder = '#bbf7d0';
                        } else if (statusUpper.includes("EAD")) {
                            bgColor = '#eff6ff';
                            borderColor = '#bfdbfe';
                            textColor = '#1e3a8a';
                            badgeBg = '#dbeafe';
                            badgeText = '#1d4ed8';
                            badgeBorder = '#bfdbfe';
                        } else if (statusUpper.includes("SEM OFERTA")) {
                            bgColor = '#fef2f2';
                            borderColor = '#fca5a5';
                            textColor = '#7f1d1d';
                            badgeBg = '#fee2e2';
                            badgeText = '#b91c1c';
                            badgeBorder = '#fca5a5';
                        }

                        const destaqueFiltro = (nomeCurso === cursoSelecionado) ? 'box-shadow: 0 0 0 3px #2563eb;' : '';

                        htmlCursos += `
                            <div style="background-color: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px; ${destaqueFiltro}">
                                <div style="font-size: 0.82rem; font-weight: 600; color: ${textColor};">${nomeCurso}</div>
                                <span style="align-self: flex-start; background-color: ${badgeBg}; color: ${badgeText}; font-size: 0.68rem; font-weight: 700; padding: 3px 6px; border-radius: 4px; border: 1px solid ${badgeBorder}; text-transform: uppercase; letter-spacing: 0.3px;">
                                    ${status}
                                </span>
                            </div>
                        `;
                    }
                    htmlCursos += `</div>`;
                } else {
                    htmlCursos = `
                        <h3 class="details-title" style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 20px;">🎓 Cursos Ofertados neste Polo</h3>
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">Nenhum curso ativo mapeado para o polo "${polo.Nome}" na planilha de cursos.</p>
                    `;
                }

                const dadosSalvos = localStorage.getItem(`polo_data_${polo.Nome}`);
                let checkIconHtml = '';
                if (dadosSalvos) {
                    const dados = JSON.parse(dadosSalvos);
                    const temTexto = dados.anotacoes && dados.anotacoes.trim() !== '';
                    const temAmbiente = dados.recepcao || dados.coordenacao || dados.estudos || dados.informatica || dados.especializado || dados.outros;
                    if (temTexto || temAmbiente) {
                        checkIconHtml = `<i class="fa-solid fa-circle-check item-visto-check" style="color: #10b981; font-size: 1.15rem; margin-left: auto;" title="Polo Concluído"></i>`;
                    }
                }

                const mainRow = document.createElement('tr');
                mainRow.className = 'polo-row';
                mainRow.id = `polo-row-${index}`;
                mainRow.style.cursor = 'pointer';
                mainRow.innerHTML = `
                    <td style="text-align: center;"><i class="fa-solid fa-chevron-right toggle-icon" id="toggle-icon-${index}" style="transition: transform 0.2s;"></i></td>
                    <td>${polo.Regiao}</td>
                    <td>${polo.Estado}</td>
                    <td><strong>${polo.Nome}</strong></td>
                    <td style="display: flex; align-items: center; justify-content: space-between; gap: 10px; height: 100%; min-height: 45px;">
                        <span class="badge ${badgeClass}">${polo.Modelo}</span>
                        ${checkIconHtml}
                    </td>
                `;
                
                const detailRow = document.createElement('tr');
                detailRow.className = 'detail-row';
                detailRow.id = `detail-row-${index}`;
                detailRow.style.display = 'none'; 
                
                // Tratamento seguro de aspas no nome do polo
                const nomePoloEncoded = encodeURIComponent(polo.Nome);

                detailRow.innerHTML = `
                    <td colspan="5" style="padding: 0; border: none;">
                        <div class="detail-container" id="detail-container-${index}" onclick="event.stopPropagation()" style="max-height: none !important; height: auto !important; overflow: visible !important; display: block;">
                            <div class="polo-details-box" style="padding: 24px; background: #fff; border-bottom: 3px solid #e2e8f0;">
                                
                                <h3 class="details-title" style="margin-top: 0;">Quadro de Anotações Geral</h3>
                                <textarea class="notes-textarea" id="notes-${index}" placeholder="Digite notas importantes aqui..." style="width: 100%; min-height: 90px; margin-bottom: 20px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; font-family: inherit;"></textarea>
                                
                                <h3 class="details-title">Ambientes do Polo (Selecione se houver)</h3>
                                <div class="switches-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px;">
                                    
                                    <!-- Recepção -->
                                    <div class="switch-item" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 600;">Recepção</span>
                                            <label class="switch">
                                                <input type="checkbox" id="env-recepcao-${index}" onchange="toggleNotaAmbiente('env-recepcao-${index}', 'box-recepcao-${index}')">
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        <div id="box-recepcao-${index}" style="display: none; margin-top: 10px;">
                                            <textarea id="note-recepcao-${index}" placeholder="Anotações sobre a Recepção..." style="width: 100%; height: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem; font-family: inherit;"></textarea>
                                        </div>
                                    </div>

                                    <!-- Sala de Coordenação -->
                                    <div class="switch-item" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 600;">Sala de Coordenação</span>
                                            <label class="switch">
                                                <input type="checkbox" id="env-coordenacao-${index}" onchange="toggleNotaAmbiente('env-coordenacao-${index}', 'box-coordenacao-${index}')">
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        <div id="box-coordenacao-${index}" style="display: none; margin-top: 10px;">
                                            <textarea id="note-coordenacao-${index}" placeholder="Anotações sobre a Sala de Coordenação..." style="width: 100%; height: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem; font-family: inherit;"></textarea>
                                        </div>
                                    </div>

                                    <!-- Sala de Estudos -->
                                    <div class="switch-item" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 600;">Sala de Estudos</span>
                                            <label class="switch">
                                                <input type="checkbox" id="env-estudos-${index}" onchange="toggleNotaAmbiente('env-estudos-${index}', 'box-estudos-${index}')">
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        <div id="box-estudos-${index}" style="display: none; margin-top: 10px;">
                                            <textarea id="note-estudos-${index}" placeholder="Anotações sobre a Sala de Estudos..." style="width: 100%; height: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem; font-family: inherit;"></textarea>
                                        </div>
                                    </div>

                                    <!-- Laboratório de Informática -->
                                    <div class="switch-item" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 600;">Laboratório de Informática</span>
                                            <label class="switch">
                                                <input type="checkbox" id="env-informatica-${index}" onchange="toggleNotaAmbiente('env-informatica-${index}', 'box-informatica-${index}')">
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        <div id="box-informatica-${index}" style="display: none; margin-top: 10px;">
                                            <textarea id="note-informatica-${index}" placeholder="Anotações sobre o Lab. de Informática..." style="width: 100%; height: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem; font-family: inherit;"></textarea>
                                        </div>
                                    </div>

                                    <!-- Laboratório Especializado -->
                                    <div class="switch-item" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 600;">Laboratório Especializado</span>
                                            <label class="switch">
                                                <input type="checkbox" id="env-especializado-${index}" onchange="toggleNotaAmbiente('env-especializado-${index}', 'box-especializado-${index}')">
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        <div id="box-especializado-${index}" style="display: none; margin-top: 10px;">
                                            <textarea id="note-especializado-${index}" placeholder="Anotações sobre o Lab. Especializado..." style="width: 100%; height: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem; font-family: inherit;"></textarea>
                                        </div>
                                    </div>

                                    <!-- Outros -->
                                    <div class="switch-item" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 600;">Outros</span>
                                            <label class="switch">
                                                <input type="checkbox" id="env-outros-${index}" onchange="toggleNotaAmbiente('env-outros-${index}', 'box-outros-${index}')">
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        <div id="box-outros-${index}" style="display: none; margin-top: 10px;">
                                            <textarea id="note-outros-${index}" placeholder="Anotações..." style="width: 100%; height: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem; font-family: inherit;"></textarea>
                                        </div>
                                    </div>

                                </div>
                                
                                ${htmlCursos}
                                
                           <div class="details-footer" style="margin-top: 30px; border-top: 2px solid #e2e8f0; padding-top: 20px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
    
    <div style="display: flex; align-items: center; gap: 15px;">
        <!-- Botão Limpar Dados (Vermelho) -->
        <button class="btn-clear" onclick="limparDadosPolo(decodeURIComponent('${nomePoloEncoded}'), ${index})" style="padding: 12px 20px; font-size: 0.95rem; font-weight: 600; cursor: pointer; border-radius: 6px; background-color: #ef4444; color: white; border: none; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-trash-can"></i> Limpar Dados
        </button>

        <!-- Botão Salvar Alterações (Verde) -->
        <button class="btn-save" onclick="salvarConfiguracaoDoPolo(decodeURIComponent('${nomePoloEncoded}'), ${index})" style="padding: 12px 28px; font-size: 0.95rem; font-weight: 600; cursor: pointer; border-radius: 6px; background-color: #10b981; color: white; border: none;">
            <i class="fa-solid fa-floppy-disk"></i> Salvar Alterações
        </button>

        <span id="status-salvamento-${index}" style="display: none; align-items: center; gap: 8px; font-weight: 600; font-size: 0.9rem; color: #334155;"></span>
    </div>
    
    <!-- Botão Agendar Visita (Azul) -->
    <button class="btn-agenda-polo" onclick="agendarVisitaPolo(decodeURIComponent('${nomePoloEncoded}'))" style="padding: 12px 20px; background-color: #0284c7; color: white; border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 600; cursor: pointer;">
        <i class="fa-solid fa-calendar-plus"></i> Agendar Visita
    </button>
</div>
                            </div>
                        </div>
                    </td>
                `;

                // Evento para alternar exibição dos detalhes
                mainRow.addEventListener('click', () => {
                    const isVisible = detailRow.style.display !== 'none';
                    
                    document.querySelectorAll('.detail-row').forEach(r => r.style.display = 'none');
                    document.querySelectorAll('.toggle-icon').forEach(i => i.style.transform = 'rotate(0deg)');
                    document.querySelectorAll('.polo-row').forEach(r => r.classList.remove('expanded'));

                    if (!isVisible) {
                        detailRow.style.display = 'table-row';
                        mainRow.classList.add('expanded');
                        const icon = document.getElementById(`toggle-icon-${index}`);
                        if (icon) icon.style.transform = 'rotate(90deg)';
                        carregarConfiguracaoDoPolo(polo.Nome, index);
                    }
                });

                tabelaBody.appendChild(mainRow);
                tabelaBody.appendChild(detailRow);
            });
        }
    }
}


// =========================================================================
// 9. INDICADORES E PAINEL DE PERSISTÊNCIA (PERSISTÊNCIA & NAVEGAÇÃO)
// =========================================================================

function atualizarIndicadores(dadosFiltrados) {
    const total = dadosFiltrados.length;
    let eadCount = 0;
    let semiCount = 0;

    dadosFiltrados.forEach(p => {
        if (p.Modelo === 'EAD') eadCount++;
        else semiCount++;
    });

    if (txtTotalPolos) txtTotalPolos.textContent = total;
    if (txtTotalEad) txtTotalEad.textContent = eadCount;
    if (txtTotalSemi) txtTotalSemi.textContent = semiCount;
    if (txtBadgeTotal) txtBadgeTotal.textContent = total;

    // Calcular concluídos no localStorage
    let concluidos = 0;
    database.forEach(p => {
        const dados = localStorage.getItem(`polo_data_${p.Nome}`);
        if (dados) {
            const parsed = JSON.parse(dados);
            const temTexto = parsed.anotacoes && parsed.anotacoes.trim() !== '';
            const temAmb = parsed.recepcao || parsed.coordenacao || parsed.estudos || parsed.informatica || parsed.especializado || parsed.outros;
            if (temTexto || temAmb) concluidos++;
        }
    });

    if (txtBadgeConcluidos) txtBadgeConcluidos.textContent = concluidos;
}

function carregarConfiguracaoDoPolo(nomePolo, index) {
    const dadosSalvos = localStorage.getItem(`polo_data_${nomePolo}`);
    if (!dadosSalvos) return;

    try {
        const dados = JSON.parse(dadosSalvos);

        const txtNotas = document.getElementById(`notes-${index}`);
        if (txtNotas && dados.anotacoes) txtNotas.value = dados.anotacoes;

        const ambientes = ['recepcao', 'coordenacao', 'estudos', 'informatica', 'especializado', 'outros'];
        ambientes.forEach(amb => {
            const chk = document.getElementById(`env-${amb}-${index}`);
            const note = document.getElementById(`note-${amb}-${index}`);
            
            if (chk && dados[amb]) {
                chk.checked = true;
                toggleNotaAmbiente(`env-${amb}-${index}`, `box-${amb}-${index}`);
                if (note && dados[`note_${amb}`]) {
                    note.value = dados[`note_${amb}`];
                }
            }
        });
    } catch (e) {
        console.error("Erro ao carregar dados salvos do polo:", e);
    }
}

async function salvarConfiguracaoDoPolo(nomePolo, index) {
    const btnSalvar = document.querySelector(`#detail-row-${index} .btn-save`);
    const statusFeedback = document.getElementById(`status-salvamento-${index}`);

    // Feedback visual inicial de sincronização
    if (btnSalvar) btnSalvar.disabled = true;
    if (statusFeedback) {
        statusFeedback.style.display = 'inline-flex';
        statusFeedback.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: #0284c7;"></i> Sincronizando com a nuvem...`;
    }

    const txtNotas = document.getElementById(`notes-${index}`);
    
    // Força a conversão em string para que o nome venha perfeito na nuvem
    const poloNomeLimpo = String(nomePolo).trim();

    const payload = {
        polo: poloNomeLimpo,
        anotacoes: txtNotas ? txtNotas.value : '',
        recepcao: document.getElementById(`env-recepcao-${index}`)?.checked || false,
        note_recepcao: document.getElementById(`note-recepcao-${index}`)?.value || '',
        coordenacao: document.getElementById(`env-coordenacao-${index}`)?.checked || false,
        note_coordenacao: document.getElementById(`note-coordenacao-${index}`)?.value || '',
        estudos: document.getElementById(`env-estudos-${index}`)?.checked || false,
        note_estudos: document.getElementById(`note-estudos-${index}`)?.value || '',
        informatica: document.getElementById(`env-informatica-${index}`)?.checked || false,
        note_informatica: document.getElementById(`note-informatica-${index}`)?.value || '',
        especializado: document.getElementById(`env-especializado-${index}`)?.checked || false,
        note_especializado: document.getElementById(`note-especializado-${index}`)?.value || '',
        outros: document.getElementById(`env-outros-${index}`)?.checked || false,
        note_outros: document.getElementById(`note-outros-${index}`)?.value || ''
    };

    // 1. Salva localmente
    localStorage.setItem(`polo_data_${poloNomeLimpo}`, JSON.stringify(payload));

    // 2. Envia para a API na Nuvem (Google Apps Script)
    if (WEB_APP_URL && WEB_APP_URL !== '') {
        try {
            await fetch(WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.warn("Serviço remoto indisponível, salvo apenas no navegador.", err);
        }
    }

    // Feedback visual final de sucesso
    if (statusFeedback) {
        statusFeedback.innerHTML = `<i class="fa-solid fa-cloud-check" style="color: #10b981;"></i> Salvo na nuvem!`;
    }

    if (btnSalvar) btnSalvar.disabled = false;

    // Atualiza o ícone verde de polo concluído na linha da tabela sem fechar a linha
    atualizarStatusCheckLinha(poloNomeLimpo, index);

    // Esconde a mensagem visual após 4 segundos
    setTimeout(() => {
        if (statusFeedback) {
            statusFeedback.style.display = 'none';
        }
    }, 4000);
}

function atualizarStatusCheckLinha(nomePolo, index) {
    const mainRow = document.getElementById(`polo-row-${index}`);
    if (!mainRow) return;

    const tdBadge = mainRow.querySelector('td:last-child');
    if (!tdBadge) return;

    let checkIcon = tdBadge.querySelector('.item-visto-check');
    if (!checkIcon) {
        checkIcon = document.createElement('i');
        checkIcon.className = 'fa-solid fa-circle-check item-visto-check';
        checkIcon.style.cssText = 'color: #10b981; font-size: 1.15rem; margin-left: auto;';
        checkIcon.title = 'Polo Concluído';
        tdBadge.appendChild(checkIcon);
    }

    atualizarIndicadores(database);
}

function agendarVisitaPolo(nomePolo) {
    const titulo = encodeURIComponent(`Visita ao Polo: ${nomePolo}`);
    const detalhes = encodeURIComponent(`Visita técnica / alinhamento com o polo ${nomePolo}.`);
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&details=${detalhes}`;
    window.open(googleCalendarUrl, '_blank');
}

function abrirAgendaGlobal() {
    window.open('https://calendar.google.com/', '_blank');
}

// ==========================================
// FUNÇÃO PARA LIMPAR DADOS DA PLANILHA
// ==========================================

const SCRIPT_URL_PLANILHA = "https://script.google.com/macros/s/AKfycbyotjrDB9PBpOACksBkr0unfryAM9lmNofdlF4Jdw0SiCD-f9LsejcldS0tnZLRJyA7/exec"; // Lembre de colar sua URL /exec aqui

window.limparDadosPolo = async function(nomePolo, index) {
    if (!nomePolo) return;

    // 1. Confirmação
    const confirma = confirm(`Deseja realmente apagar todos os dados do polo:\n"${nomePolo}"?`);
    if (!confirma) return;

    // 2. Indicador de carregamento
    const statusEl = document.getElementById(`status-salvamento-${index}`);
    if (statusEl) {
        statusEl.style.display = 'inline-flex';
        statusEl.style.color = '#334155';
        statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Limpando...';
    }

    // -------------------------------------------------------------
    // ETAPA 1: ZERA A TELA NA MARRA (VISUALMENTE)
    // -------------------------------------------------------------
    // Localiza o container específico do card deste polo
    const containerPolo = statusEl ? (statusEl.closest('.polo-card') || statusEl.closest('tr') || statusEl.closest('td') || statusEl.closest('div')) : null;
    const escopo = containerPolo || document;

    // Esvazia textareas do polo
    escopo.querySelectorAll('textarea').forEach(ta => {
        ta.value = '';
        ta.textContent = '';
        ta.innerText = '';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Esvazia inputs de texto do polo
    escopo.querySelectorAll('input[type="text"]').forEach(inp => {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Desmarca switches do polo
    escopo.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        chk.checked = false;
        chk.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // -------------------------------------------------------------
    // ETAPA 2: RESETA A ESTRUTURA DE DADOS DO SEU SISTEMA
    // -------------------------------------------------------------
    // Se o sistema usa uma variável de estado/lista (ex: database ou listaPolos)
    const listasParaBuscar = [
        typeof database !== 'undefined' ? database : null,
        typeof listaPolos !== 'undefined' ? listaPolos : null,
        typeof polosData !== 'undefined' ? polosData : null
    ];

    listasParaBuscar.forEach(lista => {
        if (Array.isArray(lista)) {
            const poloObj = lista.find(p => 
                (p.nome && String(p.nome).includes(nomePolo)) || 
                (p.polo && String(p.polo).includes(nomePolo)) ||
                (p.nomePolo && String(p.nomePolo).includes(nomePolo))
            );

            if (poloObj) {
                // Esvazia todas as propriedades salvas
                poloObj.anotacoes = "";
                poloObj.observacoes = "";
                poloObj.quadroAnotacoes = "";
                poloObj.recepcao = false;
                poloObj.coordenacao = false;
                poloObj.estudos = false;
                poloObj.informatica = false;
                poloObj.especializado = false;
                poloObj.outros = false;
                poloObj.concluido = false;
                poloObj.status = false;
            }
        }
    });

    // -------------------------------------------------------------
    // ETAPA 3: RE-RENDERIZA O PAINEL E CONTADORES
    // -------------------------------------------------------------
    // Força a atualização dos contadores ("1 Concluídos" -> "0 Concluídos")
    if (typeof atualizarIndicadores === 'function' && typeof database !== 'undefined') {
        atualizarIndicadores(database);
    }
    if (typeof renderizarPolos === 'function' && typeof database !== 'undefined') {
        renderizarPolos(database);
    }

    // Esconde badge verde e limpa apenas as chaves deste polo do localStorage
    const badgeCheck = document.getElementById(`badge-status-${index}`);
    if (badgeCheck) badgeCheck.style.display = 'none';

    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.includes(nomePolo)) {
            localStorage.removeItem(key);
        }
    }

    // -------------------------------------------------------------
    // ETAPA 4: DELETA A LINHA DA PLANILHA DO GOOGLE
    // -------------------------------------------------------------
    try {
        await fetch(SCRIPT_URL_PLANILHA, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "limpar", polo: nomePolo })
        });

        if (statusEl) {
            statusEl.style.color = '#10b981';
            statusEl.innerHTML = '<i class="fa-solid fa-check"></i> Dados e planilha limpos!';
            setTimeout(() => { statusEl.style.display = 'none'; }, 1500);
        }

    } catch (error) {
        console.error("Erro ao comunicar limpeza com a planilha:", error);
        if (statusEl) statusEl.style.display = 'none';
    }
    // Função auxiliar para converter o vídeo em arquivo enviável (Base64)
function converterParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Função executada ao clicar no botão "Enviar Vídeo"
async function enviarVideoAnexo(nomePolo, index) {
  const inputVideo = document.getElementById(`input-video-${index}`);
  const statusEl = document.getElementById(`status-video-${index}`);

  if (!inputVideo || inputVideo.files.length === 0) {
    alert("Por favor, selecione um arquivo de vídeo antes de enviar.");
    return;
  }

  const file = inputVideo.files[0];

  // Limite de segurança recomendável de ~50MB para envios Web
  if (file.size > 50 * 1024 * 1024) {
    alert("O arquivo é muito grande. Escolha um vídeo de até 50MB.");
    return;
  }

  // Atualiza mensagem de status na tela
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.color = '#0284c7';
    statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando pasta do polo e enviando vídeo... Aguarde!';
  }

  try {
    const base64 = await converterParaBase64(file);

    const payload = {
      action: "upload_video",
      polo: nomePolo,
      nomeArquivo: `${nomePolo}_${file.name}`,
      tipoMime: file.type,
      arquivoBase64: base64
    };

    const response = await fetch(SCRIPT_URL_PLANILHA, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const resultado = await response.json();

    if (resultado.status === "success") {
      if (statusEl) {
        statusEl.style.color = '#10b981';
        statusEl.innerHTML = `✅ Vídeo enviado com sucesso na pasta do Polo! <a href="${resultado.videoUrl}" target="_blank" style="color: #0284c7; text-decoration: underline;">Ver no Drive</a>`;
      }
      inputVideo.value = ''; // Limpa o campo do arquivo
    } else {
      throw new Error(resultado.message || "Erro no envio");
    }

  } catch (error) {
    console.error("Erro no upload do vídeo:", error);
    if (statusEl) {
      statusEl.style.color = '#ef4444';
      statusEl.innerHTML = '❌ Ocorreu um erro ao enviar o vídeo. Tente novamente.';
    }
  }
}
};
