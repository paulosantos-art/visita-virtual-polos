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
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxH-7NvAu4PbBPBpEWd5UGCUApnpVlMiAeTLsZcoL_DOiF3MKDnuVidCPHzDZVsUgns/exec';

let database = [];
let cachePolosFirebase = {}; // Armazena o estado do Firebase em tempo real

// Variáveis de Paginação e Filtro de Concluídos
let paginaAtual = 1;
const itensPorPagina = 10;
let apenasConcluidos = false;
let apenasPendentes = false;

// Última lista exibida (usada para atualizar os indicadores após salvar um polo)
let ultimosDadosFiltrados = [];
let ultimosDadosBase = [];

// Função utilitária para transformar o nome do polo em uma chave válida no Firebase
function sanitizarChavePolo(nomePolo) {
    if (!nomePolo) return '';
    return nomePolo.replace(/[.#$\[\]\/]/g, "_").trim();
}

// =========================================================================
// 2. ELEMENTOS DO DOM (MAPEAMENTO)
// =========================================================================
const inputBusca = document.getElementById('input-busca');
const selectRegiao = document.getElementById('select-regiao');
const selectEstado = document.getElementById('select-estado');
const tabelaBody = document.getElementById('tabela-polos-body');
const noResultsDiv = document.getElementById('no-results');

const txtTotalPolos = document.getElementById('txt-total-polos');
const txtCardConcluidos = document.getElementById('txt-card-concluidos');
const txtCardPendentes = document.getElementById('txt-card-pendentes');
const txtCardCobertura = document.getElementById('txt-card-cobertura');
const barraCobertura = document.getElementById('barra-cobertura');
const txtBadgeTotal = document.getElementById('txt-badge-total');
const btnAgenda = document.getElementById('btn-agenda');
const txtBadgeConcluidos = document.getElementById('txt-badge-concluidos');
const txtBadgePendentes = document.getElementById('txt-badge-pendentes');
const btnRelatorio = document.getElementById('btn-relatorio');
const btnSair = document.getElementById('btn-sair'); 

// =========================================================================
// 3. INICIALIZAÇÃO DO PAINEL & CONEXÃO FIREBASE REALTIME
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Escuta sincronizada em Tempo Real com o Firebase Database
    sincronizarFirebaseEmTempoReal();

    await carregarDadosDaPlanilha();

    const resetPageAndFilter = () => { paginaAtual = 1; filtrarEDesenhar(); };

    if (inputBusca) inputBusca.addEventListener('input', resetPageAndFilter);
    if (btnSair) btnSair.addEventListener('click', efetuarLogout);
    
    // Configura os Botões de Concluídos e Pendentes (filtros mutuamente exclusivos)
    if (txtBadgeConcluidos) {
        txtBadgeConcluidos.style.cursor = 'pointer';
        txtBadgeConcluidos.title = 'Clique para filtrar apenas os polos concluídos';
        txtBadgeConcluidos.addEventListener('click', () => {
            apenasConcluidos = !apenasConcluidos;
            if (apenasConcluidos) apenasPendentes = false;
            atualizarDestaqueFiltrosStatus();
            resetPageAndFilter();
        });
    }

    if (txtBadgePendentes) {
        txtBadgePendentes.style.cursor = 'pointer';
        txtBadgePendentes.title = 'Clique para filtrar apenas os polos pendentes';
        txtBadgePendentes.addEventListener('click', () => {
            apenasPendentes = !apenasPendentes;
            if (apenasPendentes) apenasConcluidos = false;
            atualizarDestaqueFiltrosStatus();
            resetPageAndFilter();
        });
    }

    if (selectRegiao) {
        selectRegiao.addEventListener('change', () => {
            popularEstadosBaseadoEmRegiao(); 
            resetPageAndFilter();
        });
    }
    
    if (selectEstado) {
        selectEstado.addEventListener('change', () => {
            ajustarRegiaoBaseadoEmEstado();
            resetPageAndFilter();
        });
    }

    if (btnAgenda) {
        btnAgenda.addEventListener('click', abrirAgendaGlobal);
    }

    if (btnRelatorio) {
        btnRelatorio.addEventListener('click', gerarRelatorioPorRegiao);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || event.key === 'Esc') {
            if (document.activeElement.tagName === 'TEXTAREA') return;
            
            if (inputBusca) inputBusca.value = '';
            if (selectRegiao) selectRegiao.selectedIndex = 0;
            popularEstadosBaseadoEmRegiao(); 
            if (selectEstado) selectEstado.selectedIndex = 0;
            
            // Reset dos filtros de concluídos/pendentes no ESC
            apenasConcluidos = false;
            apenasPendentes = false;
            atualizarDestaqueFiltrosStatus();

            document.querySelectorAll('.detail-row').forEach(row => row.style.display = 'none');
            document.querySelectorAll('.polo-row').forEach(row => row.classList.remove('expanded'));
            resetPageAndFilter();
        }
    });     
});

// Destaque visual dos botões de Concluídos/Pendentes quando ativos
function atualizarDestaqueFiltrosStatus() {
    if (txtBadgeConcluidos) {
        txtBadgeConcluidos.style.outline = apenasConcluidos ? '2px solid #10b981' : 'none';
        txtBadgeConcluidos.style.boxShadow = apenasConcluidos ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none';
    }
    if (txtBadgePendentes) {
        txtBadgePendentes.style.outline = apenasPendentes ? '2px solid #f59e0b' : 'none';
        txtBadgePendentes.style.boxShadow = apenasPendentes ? '0 0 8px rgba(245, 158, 11, 0.4)' : 'none';
    }
}

// Sincronizador ativo do Firebase (Atualiza as telas de todos os usuários em tempo real)

function sincronizarFirebaseEmTempoReal() {
    if (!window.database) return;

    window.database.ref('polos').on('value', (snapshot) => {
        cachePolosFirebase = snapshot.val() || {};

        // Não reconstruir a tabela enquanto um polo estiver aberto.
        const painelAberto = document.querySelector(
            '.detail-row[style*="table-row"]'
        );

        if (!painelAberto) {
            filtrarEDesenhar();
        }
    });
}
function efetuarLogout() {
    localStorage.removeItem('painel_polos_logado');
    window.location.href = 'login.html';
}

// =========================================================================
// 4. LEITURA DO CSV
// =========================================================================
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
                <td colspan="5" class="empty-state">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    Carregando polos diretamente da planilha...
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

    if (idxNome === -1) idxNome = 0;
    if (idxRegiao === -1) idxRegiao = 1;
    if (idxEstado === -1) idxEstado = 2;

    const parsedData = [];

    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i];
        if (cells.length < 2) continue;

        const nome = cells[idxNome] ? cells[idxNome].trim() : '';
        const regiao = cells[idxRegiao] ? cells[idxRegiao].trim() : 'Outros';
        
        let estado = cells[idxEstado] ? cells[idxEstado].trim() : 'Não Definido';
        estado = estado.replace(/\s*\(.*?\)\s*/g, '').trim();

        if (nome) {
            parsedData.push({
                Nome: nome,
                Regiao: regiao,
                Estado: estado
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
            if (txt) {
                ajustarAlturaTextarea(txt);
                txt.focus();
            }
        } else {
            box.style.display = 'none';
        }
    }
}

// Faz a caixa de texto crescer até caber todo o conteúdo (sem barra de rolagem)
function ajustarAlturaTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

// Ajusta a altura enquanto o usuário digita nas anotações do polo
document.addEventListener('input', (event) => {
    if (event.target.matches('.polo-details-box textarea')) {
        ajustarAlturaTextarea(event.target);
    }
});

// Ambientes avaliados em cada polo (chave usada no Firebase, nome exibido e ícone)
const AMBIENTES_POLO = [
    { chave: 'recepcao', nome: 'Recepção', icone: 'fa-bell-concierge' },
    { chave: 'coordenacao', nome: 'Sala de Coordenação', icone: 'fa-user-tie' },
    { chave: 'estudos', nome: 'Sala de Estudos', icone: 'fa-book-open' },
    { chave: 'informatica', nome: 'Laboratório de Informática', icone: 'fa-computer' },
    { chave: 'especializado', nome: 'Laboratório Especializado', icone: 'fa-flask' },
    { chave: 'outros', nome: 'Outros', icone: 'fa-ellipsis' }
];

// Etiqueta de status exibida na coluna "Status" da tabela
function htmlStatusPolo(nomePolo) {
    return isPoloConcluido(nomePolo)
        ? '<span class="status-pill done"><i class="fa-solid fa-circle-check"></i> Visitado</span>'
        : '<span class="status-pill pending"><i class="fa-regular fa-clock"></i> Pendente</span>';
}

// Helper para verificar status de polo concluído (Firebase com fallback para LocalStorage)
function isPoloConcluido(nomePolo) {
    const chave = sanitizarChavePolo(nomePolo);
    const dados = cachePolosFirebase[chave] || JSON.parse(localStorage.getItem(`polo_data_${nomePolo}`) || 'null');
    
    if (!dados) return false;
    const temTexto = dados.anotacoes && dados.anotacoes.trim() !== '';
    const temAmbiente = dados.recepcao || dados.coordenacao || dados.estudos || dados.informatica || dados.especializado || dados.outros;
    return temTexto || temAmbiente;
}

// =========================================================================
// 8. FILTRAGEM, RENDERIZAÇÃO DA TABELA, DETALHES E PAGINAÇÃO
// =========================================================================
function filtrarEDesenhar() {
    const busca = inputBusca ? inputBusca.value.toLowerCase().trim() : '';
    const regiao = selectRegiao ? selectRegiao.value : 'TODAS';
    const estado = selectEstado ? selectEstado.value : 'TODOS';

    // Polos que atendem busca/região/estado (base dos cards de indicadores)
    const dadosBase = database.filter(polo => {
        const atendeBusca = polo.Nome.toLowerCase().includes(busca);
        const atendeRegiao = (regiao === 'TODAS' || regiao.includes('Todas') || polo.Regiao === regiao);
        const atendeEstado = (estado === 'TODOS' || estado.includes('Todos') || polo.Estado === estado);

        return atendeBusca && atendeRegiao && atendeEstado;
    });

    // Aplica o filtro de Concluídos/Pendentes (se algum estiver ligado)
    const dadosFiltrados = dadosBase.filter(polo => {
        if (apenasConcluidos && !isPoloConcluido(polo.Nome)) return false;
        if (apenasPendentes && isPoloConcluido(polo.Nome)) return false;
        return true;
    });

    atualizarIndicadores(dadosFiltrados, dadosBase);

    if (tabelaBody) {
        tabelaBody.innerHTML = '';
        
        if (dadosFiltrados.length === 0) {
            if (noResultsDiv) noResultsDiv.classList.remove('hidden');
            tabelaBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        Nenhum polo encontrado com os filtros selecionados.
                    </td>
                </tr>
            `;
            renderizarPaginacao(0);
        } else {
            if (noResultsDiv) noResultsDiv.classList.add('hidden');
            
            // --- CORTE PARA PAGINAÇÃO (10 POR PÁGINA) ---
            const inicio = (paginaAtual - 1) * itensPorPagina;
            const fim = inicio + itensPorPagina;
            const polosPaginados = dadosFiltrados.slice(inicio, fim);

            polosPaginados.forEach((polo, indexOffset) => {
                const index = inicio + indexOffset; // Garante IDs únicos

                const mainRow = document.createElement('tr');
                mainRow.className = 'polo-row';
                mainRow.id = `polo-row-${index}`;
                mainRow.innerHTML = `
                    <td style="text-align: center;"><i class="fa-solid fa-chevron-right toggle-icon" id="toggle-icon-${index}"></i></td>
                    <td><strong>${polo.Nome}</strong></td>
                    <td><span class="uf-tag">${polo.Estado}</span></td>
                    <td>${polo.Regiao}</td>
                    <td class="status-cell">${htmlStatusPolo(polo.Nome)}</td>
                `;
                
                const detailRow = document.createElement('tr');
                detailRow.className = 'detail-row';
                detailRow.id = `detail-row-${index}`;
                detailRow.style.display = 'none'; 
                
           
const nomePoloEncoded = encodeURIComponent(polo.Nome)
    .replace(/'/g, '%27');


                const htmlAmbientes = AMBIENTES_POLO.map(amb => `
                    <div class="switch-item">
                        <div class="switch-header">
                            <span class="switch-label"><i class="fa-solid ${amb.icone}"></i> ${amb.nome}</span>
                            <label class="switch">
                                <input type="checkbox" id="env-${amb.chave}-${index}" onchange="toggleNotaAmbiente('env-${amb.chave}-${index}', 'box-${amb.chave}-${index}')">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="switch-note" id="box-${amb.chave}-${index}">
                            <textarea id="note-${amb.chave}-${index}" placeholder="Anotações sobre ${amb.nome}..."></textarea>
                        </div>
                    </div>
                `).join('');

                detailRow.innerHTML = `
                    <td colspan="5">
                        <div class="detail-container" id="detail-container-${index}" onclick="event.stopPropagation()">
                            <div class="polo-details-box">

                                <h3 class="details-title"><i class="fa-solid fa-pen-to-square"></i> Quadro de Anotações Geral</h3>
                                <textarea class="notes-textarea" id="notes-${index}" placeholder="Digite notas importantes sobre a visita a este polo..."></textarea>

                                <h3 class="details-title"><i class="fa-solid fa-door-open"></i> Ambientes do Polo (selecione se houver)</h3>
                                <div class="switches-grid">
                                    ${htmlAmbientes}
                                </div>

                                <div class="polo-actions-bar">
                                    <div class="actions-group">
                                        <button class="btn-action btn-salvar btn-save" onclick="salvarConfiguracaoDoPolo(decodeURIComponent('${nomePoloEncoded}'), ${index})">
                                            <i class="fa-solid fa-floppy-disk"></i> Salvar Alterações
                                        </button>

                                        <button class="btn-action btn-agendar" onclick="agendarVisitaPolo(decodeURIComponent('${nomePoloEncoded}'))">
                                            <i class="fa-solid fa-calendar-plus"></i> Agendar Visita
                                        </button>

                                        <span class="status-salvamento" id="status-salvamento-${index}"></span>
                                    </div>

                                    <button class="btn-action btn-limpar" onclick="limparDadosPolo(decodeURIComponent('${nomePoloEncoded}'), ${index})">
                                        <i class="fa-solid fa-trash-can"></i> Limpar Dados
                                    </button>
                                </div>
                            </div>
                        </div>
                    </td>
                `;

                mainRow.addEventListener('click', () => {
                    const isVisible = detailRow.style.display !== 'none';
                    
                    document.querySelectorAll('.detail-row').forEach(r => r.style.display = 'none');
                    document.querySelectorAll('.polo-row').forEach(r => r.classList.remove('expanded'));

                    if (!isVisible) {
                        detailRow.style.display = 'table-row';
                        mainRow.classList.add('expanded');
                        carregarConfiguracaoDoPolo(polo.Nome, index);
                    }
                });

                tabelaBody.appendChild(mainRow);
                tabelaBody.appendChild(detailRow);
            });

            renderizarPaginacao(dadosFiltrados.length);
        }
    }
}

// ==========================================
// DESENHA OS BOTÕES DE NAVEGAÇÃO DE PÁGINAS
// ==========================================
function renderizarPaginacao(totalItens) {
    const container = document.getElementById('paginacao-container');
    if (!container) return;

    const totalPaginas = Math.ceil(totalItens / itensPorPagina);
    if (totalPaginas <= 1) {
        container.innerHTML = '';
        return;
    }

    const primeiro = (paginaAtual - 1) * itensPorPagina + 1;
    const ultimo = Math.min(paginaAtual * itensPorPagina, totalItens);

    container.innerHTML = `
        <span class="pagination-info">Mostrando ${primeiro}–${ultimo} de ${totalItens} polos · Página ${paginaAtual} de ${totalPaginas}</span>
        <div class="actions-group">
            <button id="btn-ant" class="btn-page" ${paginaAtual === 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-chevron-left"></i> Anterior
            </button>
            <button id="btn-prox" class="btn-page" ${paginaAtual === totalPaginas ? 'disabled' : ''}>
                Próximo <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
    `;

    document.getElementById('btn-ant')?.addEventListener('click', () => {
        if (paginaAtual > 1) {
            paginaAtual--;
            filtrarEDesenhar();
            rolarParaTopo();
        }
    });

    document.getElementById('btn-prox')?.addEventListener('click', () => {
        if (paginaAtual < totalPaginas) {
            paginaAtual++;
            filtrarEDesenhar();
            rolarParaTopo();
        }
    });
}

// A área com rolagem é o .main-content no computador e a janela no celular
function rolarParaTopo() {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================================
// 9. INDICADORES E PAINEL DE PERSISTÊNCIA (FIREBASE + LOCALSTORAGE)
// =========================================================================

function atualizarIndicadores(dadosFiltrados, dadosBase = dadosFiltrados) {
    ultimosDadosFiltrados = dadosFiltrados;
    ultimosDadosBase = dadosBase;

    if (txtBadgeTotal) txtBadgeTotal.textContent = dadosFiltrados.length;

    // Cards do topo: refletem a busca/região/estado selecionados
    const totalBase = dadosBase.length;
    const concluidosBase = dadosBase.filter(p => isPoloConcluido(p.Nome)).length;
    const cobertura = totalBase ? Math.round((concluidosBase / totalBase) * 100) : 0;

    if (txtTotalPolos) txtTotalPolos.textContent = totalBase;
    if (txtCardConcluidos) txtCardConcluidos.textContent = concluidosBase;
    if (txtCardPendentes) txtCardPendentes.textContent = totalBase - concluidosBase;
    if (txtCardCobertura) txtCardCobertura.textContent = `${cobertura}%`;
    if (barraCobertura) barraCobertura.style.width = `${cobertura}%`;

    let concluidos = 0;
    database.forEach(p => {
        if (isPoloConcluido(p.Nome)) concluidos++;
    });

    if (txtBadgeConcluidos) {
        txtBadgeConcluidos.textContent = `${concluidos} Concluídos`;
    }
    if (txtBadgePendentes) {
        txtBadgePendentes.textContent = `${database.length - concluidos} Pendentes`;
    }
}

function carregarConfiguracaoDoPolo(nomePolo, index) {
    const chave = sanitizarChavePolo(nomePolo);
    
    // Tenta obter do cache do Firebase primeiro, senão lê do LocalStorage
    const dados = cachePolosFirebase[chave] || JSON.parse(localStorage.getItem(`polo_data_${nomePolo}`) || 'null');
    if (!dados) return;

    try {
        const txtNotas = document.getElementById(`notes-${index}`);
        if (txtNotas) txtNotas.value = dados.anotacoes || '';

        const ambientes = ['recepcao', 'coordenacao', 'estudos', 'informatica', 'especializado', 'outros'];
        ambientes.forEach(amb => {
            const chk = document.getElementById(`env-${amb}-${index}`);
            const note = document.getElementById(`note-${amb}-${index}`);
            
            if (chk) {
                chk.checked = !!dados[amb];
                toggleNotaAmbiente(`env-${amb}-${index}`, `box-${amb}-${index}`);
                if (note) {
                    note.value = dados[`note_${amb}`] || '';
                    ajustarAlturaTextarea(note);
                }
            }
        });

        if (txtNotas) ajustarAlturaTextarea(txtNotas);
    } catch (e) {
        console.error("Erro ao carregar dados salvos do polo:", e);
    }
}

async function salvarConfiguracaoDoPolo(nomePolo, index) {
    const btnSalvar = document.querySelector(`#detail-row-${index} .btn-save`);
    const statusFeedback = document.getElementById(`status-salvamento-${index}`);

    if (btnSalvar) btnSalvar.disabled = true;
    if (statusFeedback) {
        statusFeedback.style.display = 'inline-flex';
        statusFeedback.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: #0284c7;"></i> Sincronizando com Firebase...`;
    }

    const txtNotas = document.getElementById(`notes-${index}`);
    const poloNomeLimpo = String(nomePolo).trim();
    const chavePolo = sanitizarChavePolo(poloNomeLimpo);

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
        note_outros: document.getElementById(`note-outros-${index}`)?.value || '',
        atualizadoEm: new Date().toISOString()
    };

    // 1. Salva no Firebase Realtime Database
  
if (!window.database) {
    console.error("Firebase Realtime Database não inicializado.");
    alert("Erro: conexão com o Firebase não está disponível.");
    if (btnSalvar) btnSalvar.disabled = false;
    return;
}

try {
    await window.database.ref('polos/' + chavePolo).set(payload);
    console.log("Polo salvo com sucesso:", poloNomeLimpo, chavePolo);
} catch (fbErr) {
    console.error("Erro ao gravar no Firebase:", fbErr);
    alert("Não foi possível salvar o polo: " + fbErr.message);
    if (btnSalvar) btnSalvar.disabled = false;
    return;
}


    // 2. Salva localmente (Backup)
    localStorage.setItem(`polo_data_${poloNomeLimpo}`, JSON.stringify(payload));

    // 3. Opcional: Envia ao Google AppScript (Planilha original)
    if (WEB_APP_URL) {
        try {
            fetch(WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.warn("Serviço Apps Script indisponível.", err);
        }
    }

    if (statusFeedback) {
        statusFeedback.innerHTML = `<i class="fa-solid fa-cloud-check" style="color: #10b981;"></i> Salvo em tempo real!`;
    }

    if (btnSalvar) btnSalvar.disabled = false;
    atualizarStatusCheckLinha(poloNomeLimpo, index);

    setTimeout(() => {
        if (statusFeedback) {
            statusFeedback.style.display = 'none';
        }
    }, 4000);
}

function atualizarStatusCheckLinha(nomePolo, index) {
    const mainRow = document.getElementById(`polo-row-${index}`);
    if (!mainRow) return;

    const celulaStatus = mainRow.querySelector('.status-cell');
    if (celulaStatus) celulaStatus.innerHTML = htmlStatusPolo(nomePolo);

    atualizarIndicadores(ultimosDadosFiltrados, ultimosDadosBase);
}

// =========================================================================
// 10. RELATÓRIO POR REGIÃO (Atingidos, Pendentes, Pontos de Atenção e Anexo de Comentários)
// =========================================================================
function escaparHtml(texto) {
    return String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function obterDadosPolo(nomePolo) {
    const chave = sanitizarChavePolo(nomePolo);
    return cachePolosFirebase[chave] || JSON.parse(localStorage.getItem(`polo_data_${nomePolo}`) || 'null');
}

// Palavras/expressões (sem acento, minúsculas) que indicam um problema nos comentários
const TERMOS_DE_ATENCAO = [
    'reforma', 'falta', 'faltando', 'faltam', 'ausencia', 'ausente', 'nao possui', 'nao tem', 'nao ha',
    'nao existe', 'nao funciona', 'inexistente', 'quebrad', 'danificad', 'estragad', 'defeito', 'precisa',
    'necessita', 'necessario', 'inadequad', 'insuficiente', 'precari', 'improvis', 'problema', 'irregular',
    'pendente', 'pendencia', 'ruim', 'infiltra', 'goteira', 'mofo', 'umidade', 'sujo', 'sujeira',
    'apertad', 'pequen', 'adequar', 'adequacao', 'manutencao', 'desativad', 'interditad', 'em obra',
    'aguardando', 'nao atende', 'nao esta', 'sem acessibilidade', 'sem '
];

// Expressões que contêm um termo acima mas indicam que está tudo certo
const TERMOS_POSITIVOS = ['sem problema', 'nenhum problema', 'sem pendencia', 'nenhuma pendencia', 'nao precisa', 'nao ha problema'];

function normalizarTexto(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Separa as anotações em frases e devolve só as que mencionam algum problema
function extrairObservacoesDeAtencao(dados, nomesAmbientes) {
    const fontes = [{ local: 'Geral', texto: dados.anotacoes }];
    Object.keys(nomesAmbientes).forEach(amb => {
        if (dados[amb]) fontes.push({ local: nomesAmbientes[amb], texto: dados[`note_${amb}`] });
    });

    const observacoes = [];
    fontes.forEach(({ local, texto }) => {
        if (!texto || !texto.trim()) return;

        String(texto)
            .split(/\n+|(?<=[.!?;])\s+/)
            .map(frase => frase.replace(/^[\s\-•*/]+|[\s/]+$/g, '').trim())
            .filter(frase => frase.length > 2)
            .forEach(frase => {
                const fraseNormalizada = ` ${normalizarTexto(frase)} `;
                if (TERMOS_POSITIVOS.some(t => fraseNormalizada.includes(t))) return;
                if (TERMOS_DE_ATENCAO.some(t => fraseNormalizada.includes(t))) {
                    observacoes.push({ local, texto: frase });
                }
            });
    });
    return observacoes;
}

function gerarRelatorioPorRegiao() {
    if (database.length === 0) {
        Swal.fire('Aguarde', 'Os polos ainda estão sendo carregados da planilha.', 'info');
        return;
    }

    const nomesAmbientes = {
        recepcao: 'Recepção',
        coordenacao: 'Sala de Coordenação',
        estudos: 'Sala de Estudos',
        informatica: 'Laboratório de Informática',
        especializado: 'Laboratório Especializado',
        outros: 'Outros'
    };

    // Respeita o filtro de região da tela, se houver um selecionado
    const regiaoFiltro = selectRegiao ? selectRegiao.value : 'TODAS';
    const polosBase = (regiaoFiltro === 'TODAS' || regiaoFiltro.includes('Todas'))
        ? database
        : database.filter(p => p.Regiao === regiaoFiltro);

    // Agrupa os polos por região
    const ordemRegioes = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul', 'Estrangeiro'];
    const grupos = {};
    polosBase.forEach(polo => {
        if (!grupos[polo.Regiao]) grupos[polo.Regiao] = [];
        grupos[polo.Regiao].push(polo);
    });
    const regioes = Object.keys(grupos).sort((a, b) => {
        const ia = ordemRegioes.indexOf(a), ib = ordemRegioes.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });

    // "Outros" não entra em "ambientes ausentes": não é um ambiente obrigatório
    const ambientesAvaliados = Object.keys(nomesAmbientes).filter(amb => amb !== 'outros');

    let totalGeral = 0, totalAtingidos = 0, totalAtencao = 0;
    let htmlResumo = '';
    let htmlRegioes = '';

    regioes.forEach(regiao => {
        const polos = grupos[regiao].slice().sort((a, b) => a.Nome.localeCompare(b.Nome));
        const feitos = polos.filter(p => isPoloConcluido(p.Nome));
        const pendentes = polos.filter(p => !isPoloConcluido(p.Nome));
        const percentual = polos.length ? Math.round((feitos.length / polos.length) * 100) : 0;

        // Pontos de atenção de cada polo visitado: infraestrutura ausente + trechos dos comentários
        // que indicam problema. Polos com mais pontos aparecem primeiro.
        const pontosAtencao = feitos
            .map(polo => {
                const dados = obterDadosPolo(polo.Nome) || {};
                return {
                    polo,
                    ausentes: ambientesAvaliados.filter(amb => !dados[amb]),
                    observacoes: extrairObservacoesDeAtencao(dados, nomesAmbientes)
                };
            })
            .filter(p => p.ausentes.length || p.observacoes.length)
            .sort((a, b) => (b.ausentes.length + b.observacoes.length) - (a.ausentes.length + a.observacoes.length)
                          || a.polo.Nome.localeCompare(b.polo.Nome));

        totalGeral += polos.length;
        totalAtingidos += feitos.length;
        totalAtencao += pontosAtencao.length;

        htmlResumo += `
            <tr>
                <td>${escaparHtml(regiao)}</td>
                <td>${polos.length}</td>
                <td>${feitos.length}</td>
                <td>${pendentes.length}</td>
                <td>${percentual}%</td>
                <td>${pontosAtencao.length}</td>
            </tr>`;

        const htmlAtencao = pontosAtencao.map(({ polo, ausentes, observacoes }) => {
            const total = ausentes.length + observacoes.length;
            return `
                <div class="atencao">
                    <div class="comentario-titulo">
                        ${escaparHtml(polo.Nome)} <span>(${escaparHtml(polo.Estado)})</span>
                        <em class="tag-prioridade">${total} ${total === 1 ? 'ponto' : 'pontos'}</em>
                    </div>
                    ${ausentes.length ? `
                        <div class="atencao-bloco">
                            <strong>Infraestrutura ausente:</strong>
                            ${ausentes.map(amb => `<span class="chip-ausente">${nomesAmbientes[amb]}</span>`).join('')}
                        </div>` : ''}
                    ${observacoes.length ? `
                        <div class="atencao-bloco">
                            <strong>Observações das visitas:</strong>
                            <ul>${observacoes.map(o => `<li><b>${escaparHtml(o.local)}:</b> ${escaparHtml(o.texto)}</li>`).join('')}</ul>
                        </div>` : ''}
                </div>`;
        }).join('');

        const listaPolos = lista => lista.length
            ? `<ul class="lista-polos">${lista.map(p => `<li>${escaparHtml(p.Nome)} <span>(${escaparHtml(p.Estado)})</span></li>`).join('')}</ul>`
            : '<p class="vazio">Nenhum polo.</p>';

        htmlRegioes += `
            <section class="regiao">
                <h2>${escaparHtml(regiao)}</h2>
                <div class="kpis">
                    <div class="kpi"><span>${polos.length}</span>Total de polos</div>
                    <div class="kpi ok"><span>${feitos.length}</span>Polos atingidos</div>
                    <div class="kpi pend"><span>${pendentes.length}</span>Pendentes</div>
                    <div class="kpi"><span>${percentual}%</span>Cobertura</div>
                </div>
                <div class="barra"><div style="width: ${percentual}%"></div></div>

                <h3 class="alerta">⚠ Pontos de atenção (${pontosAtencao.length})</h3>
                ${htmlAtencao || `<p class="vazio">${feitos.length ? 'Nenhum ponto de atenção identificado nos polos visitados desta região.' : 'Nenhum polo visitado nesta região ainda.'}</p>`}

                <div class="colunas">
                    <div>
                        <h3 class="ok">✔ Polos feitos (${feitos.length})</h3>
                        ${listaPolos(feitos)}
                    </div>
                    <div>
                        <h3 class="pend">⏳ Polos pendentes (${pendentes.length})</h3>
                        ${listaPolos(pendentes)}
                    </div>
                </div>
            </section>`;
    });

    const percentualGeral = totalGeral ? Math.round((totalAtingidos / totalGeral) * 100) : 0;
    const dataEmissao = new Date().toLocaleString('pt-BR');

    const janela = window.open('', '_blank');
    if (!janela) {
        Swal.fire('Pop-up bloqueado', 'Permita pop-ups para este site para visualizar o relatório.', 'warning');
        return;
    }

    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de Visitas por Região</title>
<style>
    body { font-family: 'Inter', Arial, sans-serif; color: #1e293b; margin: 0; padding: 32px; background: #fff; }
    .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 1.6rem; color: #1e3a8a; }
    .sub { color: #64748b; font-size: 0.9rem; margin-top: 4px; }
    .btn-imprimir { background: #2563eb; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 0.9rem; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
    th { background: #f1f5f9; }
    tfoot td { font-weight: 700; background: #f8fafc; }
    .regiao { margin-bottom: 40px; page-break-inside: auto; }
    .regiao + .regiao { page-break-before: always; }
    h2 { color: #1e3a8a; border-left: 5px solid #2563eb; padding-left: 10px; }
    h3 { font-size: 1rem; margin: 24px 0 10px; }
    h3.ok { color: #059669; } h3.pend { color: #d97706; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 0.8rem; color: #64748b; }
    .kpi span { display: block; font-size: 1.5rem; font-weight: 700; color: #1e293b; }
    .kpi.ok span { color: #059669; } .kpi.pend span { color: #d97706; }
    .barra { height: 10px; background: #fef3c7; border-radius: 5px; margin-top: 12px; overflow: hidden; }
    .barra div { height: 100%; background: #10b981; }
    .comentario-titulo { font-weight: 700; }
    .comentario-titulo span, .lista-polos span { color: #64748b; font-weight: 400; font-size: 0.85rem; }
    .colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .lista-polos { margin: 0; padding-left: 18px; font-size: 0.9rem; line-height: 1.6; }
    .vazio { color: #94a3b8; font-style: italic; font-size: 0.9rem; }
    h3.alerta { color: #b45309; }
    .atencao { border: 1px solid #fde68a; border-left: 5px solid #f59e0b; background: #fffbeb; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; page-break-inside: avoid; }
    .atencao-bloco { margin-top: 10px; font-size: 0.88rem; }
    .atencao-bloco > strong { display: block; margin-bottom: 6px; color: #92400e; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .atencao-bloco ul { margin: 0; padding-left: 18px; line-height: 1.55; }
    .chip-ausente { display: inline-block; margin: 0 6px 6px 0; padding: 3px 10px; border-radius: 999px; background: #fee2e2; color: #b91c1c; font-size: 0.8rem; font-weight: 600; }
    .tag-prioridade { font-style: normal; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 999px; margin-left: 8px; background: #fef3c7; color: #b45309; vertical-align: 2px; }
    @media print { .btn-imprimir { display: none; } body { padding: 0; } }
</style>
</head>
<body>
    <div class="topo">
        <div>
            <h1>Relatório de Visitas aos Polos por Região</h1>
            <div class="sub">Emitido em ${dataEmissao}${regiaoFiltro === 'TODAS' || regiaoFiltro.includes('Todas') ? '' : ` · Região: ${escaparHtml(regiaoFiltro)}`}</div>
        </div>
        <button class="btn-imprimir" onclick="window.print()">Imprimir / Salvar PDF</button>
    </div>

    <h2>Resumo Geral</h2>
    <table>
        <thead><tr><th>Região</th><th>Total de Polos</th><th>Atingidos</th><th>Pendentes</th><th>Cobertura</th><th>Polos com Pontos de Atenção</th></tr></thead>
        <tbody>${htmlResumo}</tbody>
        <tfoot><tr><td>Total</td><td>${totalGeral}</td><td>${totalAtingidos}</td><td>${totalGeral - totalAtingidos}</td><td>${percentualGeral}%</td><td>${totalAtencao}</td></tr></tfoot>
    </table>

    ${htmlRegioes}
</body>
</html>`);
    janela.document.close();
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
// FUNÇÃO PARA LIMPAR DADOS (FIREBASE + LOCALSTORAGE)
// ==========================================
window.limparDadosPolo = async function(nomePolo, index) {
    if (!nomePolo) return;

    const result = await Swal.fire({
        title: 'Confirma que quer excluir?',
        text: `Você está prestes a apagar todos os dados registrados do polo "${nomePolo}". Esta ação afetará todos os usuários em tempo real.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fa-solid fa-trash-can"></i> Sim, excluir!',
        cancelButtonText: 'Cancelar',
        reverseButtons: true
    });

    if (!result.isConfirmed) return;

    const chavePolo = sanitizarChavePolo(nomePolo);

    // 1. Exclui do Firebase
    if (window.database) {
        await window.database.ref('polos/' + chavePolo).remove();
    }

    // 2. Limpa LocalStorage
    localStorage.removeItem(`polo_data_${nomePolo}`);

    // 3. Limpa Apps Script
    if (WEB_APP_URL) {
        try {
            fetch(WEB_APP_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "limpar", polo: nomePolo })
            });
        } catch (e) {
            console.error("Erro Apps Script:", e);
        }
    }

    Swal.fire({
        title: 'Excluído!',
        text: 'Os dados do polo foram apagados em tempo real.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
    });
};

function converterParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

async function enviarVideoAnexo(nomePolo, index) {
  const inputVideo = document.getElementById(`input-video-${index}`);
  const statusEl = document.getElementById(`status-video-${index}`);

  if (!inputVideo || inputVideo.files.length === 0) {
    Swal.fire('Atenção', 'Por favor, selecione um arquivo de vídeo antes de enviar.', 'warning');
    return;
  }

  const file = inputVideo.files[0];

  if (file.size > 50 * 1024 * 1024) {
    Swal.fire('Arquivo muito grande', 'Escolha um vídeo de até 50MB.', 'warning');
    return;
  }

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
    const response = await fetch(WEB_APP_URL, {
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
      inputVideo.value = '';
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
