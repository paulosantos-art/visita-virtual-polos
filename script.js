// =========================================================================
// 1. CONFIGURAÇÃO DA PLANILHA (Link direto de exportação para cada aba)
// =========================================================================
// TRAVA DE SEGURANÇA: Se não estiver logado, redireciona para a tela de login
if (localStorage.getItem('painel_polos_logado') !== 'true') {
    window.location.href = 'login.html';
}

const SPREADSHEET_ID = '1km9rpUas9U3V4zqRqCp4AxxR_srUphtlckBuGRF7lqQ';

// Aba de Polos (Padrão)
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;

// Aba de Cursos (Exportada como CSV usando o parâmetro gid=0 ou o nome da aba)
const CURSOS_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=P%C3%A1gina1`;

// URL do Google Apps Script Web App
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx7buSjmuDCUBS6f8dak8CPxoiDGB0Mz_KyTld6MixqbchCi9gvdKVFDmMu6SNxCTGj/exec';

// Base de dados global
let database = [];
let baseCursosPolos = {}; // Guardará os cursos associados a cada polo
let listaTodosCursos = []; // Guardará a lista única de cursos para o filtro

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

// MAPEAMENTO DO BOTÃO DE SAIR
const btnSair = document.getElementById('btn-sair'); 

// =========================================================================
// 3. INICIALIZAÇÃO
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Carrega os cursos da aba antes de renderizar para garantir que apareçam
    await carregarCursosDaPlanilha();
    
    // 2. Carrega os polos
    carregarDadosDaPlanilha();

    if (inputBusca) inputBusca.addEventListener('input', filtrarEDesenhar);
    
    // Configuração do botão de sair (Logout)
    if (btnSair) {
        btnSair.addEventListener('click', efetuarLogout);
    }
    
    // Escuta a tecla 'ESC' para limpar todos os filtros
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || event.key === 'Esc') {
            if (inputBusca) inputBusca.value = '';
            if (selectRegiao) selectRegiao.value = 'TODAS';
            popularEstados(); 
            if (selectEstado) selectEstado.value = 'TODOS';
            if (selectModelo) selectModelo.value = 'TODOS';
            if (selectCurso) selectCurso.value = 'TODOS'; 
            document.querySelectorAll('.detail-row').forEach(row => row.classList.remove('open'));
            document.querySelectorAll('.polo-row').forEach(row => row.classList.remove('expanded'));
            filtrarEDesenhar();
        }
    });   
    
    if (selectRegiao) {
        selectRegiao.addEventListener('change', () => {
            popularEstados(); 
            filtrarEDesenhar();
        });
    }
    
    if (selectEstado) selectEstado.addEventListener('change', filtrarEDesenhar);
    if (selectModelo) selectModelo.addEventListener('change', filtrarEDesenhar);
    if (selectCurso) selectCurso.addEventListener('change', filtrarEDesenhar); 
});

// =========================================================================
// FUNÇÃO DE LOGOUT
// =========================================================================
function efetuarLogout() {
    localStorage.removeItem('painel_polos_logado');
    window.location.href = 'login.html';
}

// =========================================================================
// 4. PROCESSAR CURSOS DA OUTRA ABA (VIA CSV SEGURO E SEM CORTES)
// =========================================================================
async function carregarCursosDaPlanilha() {
    try {
        const resposta = await fetch(CURSOS_URL);
        if (!resposta.ok) throw new Error("Erro ao buscar cursos");
        const csvTexto = await resposta.text();
        
        const lines = processarLinhasCSV(csvTexto);
        if (lines.length < 2) return;

        // Cabeçalhos (Nomes dos Cursos começam na coluna E/índice 4)
        const cabecalho = lines[0];
        listaTodosCursos = cabecalho.slice(4).map(c => c.trim()).filter(c => c !== "");
        listaTodosCursos.sort();

        // Popular o select de cursos dinamicamente
        popularSelectCursos();

        // Processa cada linha de polo
        for (let i = 1; i < lines.length; i++) {
            const colunas = lines[i];
            if (colunas.length < 3) continue;

            const nomePolo = colunas[2] ? colunas[2].trim() : '';
            if (!nomePolo) continue;

            baseCursosPolos[nomePolo] = {};

            // Mapeia o status de cada curso para o polo correspondente
            for (let j = 4; j < colunas.length; j++) {
                const nomeCurso = cabecalho[j] ? cabecalho[j].trim() : '';
                const statusOferta = colunas[j] ? colunas[j].trim() : 'Sem Oferta';
                
                if (nomeCurso) {
                    baseCursosPolos[nomePolo][nomeCurso] = statusOferta;
                }
            }
        }
        console.log("Cursos mapeados com sucesso:", baseCursosPolos);
    } catch (erro) {
        console.error("Erro ao integrar aba de cursos:", erro);
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

// Helper para parsear CSV robustamente
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
// 5. LEITURA DE DADOS DA PLANILHA (POLOS)
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
        if (!response.ok) throw new Error("Erro na requisição");
        
        const csvText = await response.text();
        database = processarCsvProfissional(csvText);

        popularEstados();
        filtrarEDesenhar();

    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        if (tabelaBody) {
            tabelaBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #dc2626; padding: 60px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem;"></i>
                        <br><br>
                        <strong>Erro ao conectar com os dados!</strong><br>
                        Verifique sua conexão ou se a planilha está compartilhada como Leitor.
                    </td>
                </tr>
            `;
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

        const modeloOriginal = cells[idxModelo] ? cells[idxModelo].trim() : 'EAD';

        let modeloClassificado = 'EAD';
        const modUpper = modeloOriginal.toUpperCase();
        if (modUpper.includes('SEMI') || modUpper.includes('PRESENCIAL')) {
            modeloClassificado = 'Semipresencial';
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
// 6. ATUALIZAÇÃO DINÂMICA DO SELECT DE ESTADOS
// =========================================================================
function popularEstados() {
    if (!selectEstado || !selectRegiao) return;

    const regiaoSelecionada = selectRegiao.value;
    const estadoAnterior = selectEstado.value;
    
    let estadosFiltrados = [];
    
    database.forEach(polo => {
        if (regiaoSelecionada === 'TODAS' || polo.Regiao === regiaoSelecionada) {
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
// 7. FILTRAGEM, RENDERIZAÇÃO DA TABELA E INTERATIVIDADE EXPANSÍVEL
// =========================================================================
function filtrarEDesenhar() {
    const busca = inputBusca ? inputBusca.value.toLowerCase().trim() : '';
    const regiao = selectRegiao ? selectRegiao.value : 'TODAS';
    const estado = selectEstado ? selectEstado.value : 'TODOS';
    const modelo = selectModelo ? selectModelo.value : 'TODOS';
    const cursoSelecionado = selectCurso ? selectCurso.value : 'TODOS'; 

    const dadosFiltrados = database.filter(polo => {
        const atendeBusca = polo.Nome.toLowerCase().includes(busca);
        const atendeRegiao = (regiao === 'TODAS' || polo.Regiao === regiao);
        const atendeEstado = (estado === 'TODOS' || polo.Estado === estado);
        
        let atendeModelo = true;
        if (modelo !== 'TODOS') {
            atendeModelo = (modelo === 'EAD' ? polo.Modelo === 'EAD' : polo.Modelo === 'Semipresencial');
        }

        let atendeCurso = true;
        if (cursoSelecionado !== 'TODOS') {
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
                
                const cursosDoPolo = baseCursosPolos[polo.Nome] || null;
                let htmlCursos = "";

                if (cursosDoPolo && Object.keys(cursosDoPolo).length > 0) {
                    htmlCursos = `
                        <h3 class="details-title" style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 20px;">🎓 Cursos Ofertados neste Polo</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px; padding: 15px; border-radius: 8px; border: 1px solid #f1f5f9; background-color: #fafbfc;">
                    `;

                    for (const [nomeCurso, status] of Object.entries(cursosDoPolo)) {
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
                            <div style="background-color: ${bgColor}; 
                                        border: 1px solid ${borderColor}; 
                                        border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px; ${destaqueFiltro}">
                                <div style="font-size: 0.82rem; font-weight: 600; color: ${textColor};">${nomeCurso}</div>
                                <span style="align-self: flex-start; 
                                             background-color: ${badgeBg}; 
                                             color: ${badgeText}; 
                                             font-size: 0.68rem; font-weight: 700; padding: 3px 6px; border-radius: 4px; 
                                             border: 1px solid ${badgeBorder}; text-transform: uppercase; letter-spacing: 0.3px;">
                                    ${status}
                                </span>
                            </div>
                        `;
                    }
                    htmlCursos += `</div>`;
                } else {
                    htmlCursos = `
                        <h3 class="details-title" style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 20px;">🎓 Cursos Ofertados neste Polo</h3>
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">Nenhum curso active mapeado para o polo "${polo.Nome}" na planilha de cursos.</p>
                    `;
                }

                // VERIFICAÇÃO PARA RENDERIZAR O VISTO VERDE (CHECK) DINAMICAMENTE
                const dadosSalvos = localStorage.getItem(`polo_data_${polo.Nome}`);
                let checkIconHtml = '';
                if (dadosSalvos) {
                    const dados = JSON.parse(dadosSalvos);
                    const temTexto = dados.anotacoes && dados.anotacoes.trim() !== '';
                    const temAmbiente = dados.recepcao || dados.coordenacao || dados.estudos || dados.informatica || dados.especializado;
                    if (temTexto || temAmbiente) {
                        checkIconHtml = `<i class="fa-solid fa-circle-check item-visto-check" style="color: #10b981; font-size: 1.15rem; margin-left: auto;" title="Polo Concluído"></i>`;
                    }
                }

                const mainRow = document.createElement('tr');
                mainRow.className = 'polo-row';
                mainRow.id = `polo-row-${index}`;
                mainRow.style.cursor = 'pointer';
                mainRow.innerHTML = `
                    <td style="text-align: center;"><i class="fa-solid fa-chevron-right toggle-icon" style="transition: transform 0.2s;"></i></td>
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
                
                detailRow.innerHTML = `
                    <td colspan="5" style="padding: 0; border: none;">
                        <div class="detail-container" id="detail-container-${index}" onclick="event.stopPropagation()" style="max-height: none !important; height: auto !important; overflow: visible !important; display: block;">
                            <div class="polo-details-box" style="padding: 24px; background: #fff; border-bottom: 3px solid #e2e8f0;">
                                <h3 class="details-title" style="margin-top: 0;">Quadro de Anotações Geral</h3>
                                <textarea class="notes-textarea" id="notes-${index}" placeholder="Digite notas importantes aqui..." style="width: 100%; min-height: 100px; margin-bottom: 20px;"></textarea>
                                
                                <h3 class="details-title">Ambientes do Polo (Selecione se houver)</h3>
                                <div class="switches-grid" style="margin-bottom: 20px;">
                                    <div class="switch-item">
                                        <span>Recepção</span>
                                        <label class="switch">
                                            <input type="checkbox" id="env-recepcao-${index}">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                    <div class="switch-item">
                                        <span>Sala de Coordenação</span>
                                        <label class="switch">
                                            <input type="checkbox" id="env-coordenacao-${index}">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                    <div class="switch-item">
                                        <span>Sala de Estudos</span>
                                        <label class="switch">
                                            <input type="checkbox" id="env-estudos-${index}">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                    <div class="switch-item">
                                        <span>Laboratório de Informática</span>
                                        <label class="switch">
                                            <input type="checkbox" id="env-informatica-${index}">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                    <div class="switch-item">
                                        <span>Laboratório Especializado</span>
                                        <label class="switch">
                                            <input type="checkbox" id="env-especializado-${index}">
                                            <span class="slider"></span>
                                        </label>
                                    </div>
                                </div>
                                
                                ${htmlCursos}
                                
                                <div class="details-footer" style="margin-top: 30px; border-top: 2px solid #e2e8f0; padding-top: 20px; display: flex; justify-content: flex-start;">
                                    <button class="btn-save" onclick="salvarConfiguracaoDoPolo('${polo.Nome}', ${index})" style="padding: 12px 28px; font-size: 0.95rem; font-weight: 600; cursor: pointer;">
                                        <i class="fa-solid fa-floppy-disk"></i> Salvar Alterações
                                    </button>
                                </div>
                            </div>
                        </div>
                    </td>
                `;

                tabelaBody.appendChild(mainRow);
                tabelaBody.appendChild(detailRow);

                mainRow.addEventListener('click', () => {
                    const isOpen = (detailRow.style.display === 'table-row');
                    const icon = mainRow.querySelector('.toggle-icon');
                    
                    document.querySelectorAll('.detail-row').forEach(row => {
                        if (row !== detailRow) {
                            row.style.display = 'none';
                            row.classList.remove('open');
                        }
                    });
                    document.querySelectorAll('.polo-row').forEach(row => {
                        if (row !== mainRow) {
                            row.classList.remove('expanded');
                            const otherIcon = row.querySelector('.toggle-icon');
                            if (otherIcon) {
                                otherIcon.style.transform = 'rotate(0deg)';
                            }
                        }
                    });
                    
                    if (isOpen) {
                        detailRow.style.display = 'none';
                        detailRow.classList.remove('open');
                        mainRow.classList.remove('expanded');
                        if (icon) icon.style.transform = 'rotate(0deg)';
                    } else {
                        detailRow.style.display = 'table-row';
                        detailRow.classList.add('open');
                        mainRow.classList.add('expanded');
                        if (icon) icon.style.transform = 'rotate(90deg)';
                        carregarDadosSalvosDoPolo(polo.Nome, index);
                    }
                });
            });
        }
    }
}

// =========================================================================
// 8. LOGICA DE PERSISTÊNCIA (LOCALSTORAGE)
// =========================================================================
function carregarDadosSalvosDoPolo(poloNome, index) {
    const dadosSalvos = localStorage.getItem(`polo_data_${poloNome}`);
    
    const txtArea = document.getElementById(`notes-${index}`);
    const recepcao = document.getElementById(`env-recepcao-${index}`);
    const coordenacao = document.getElementById(`env-coordenacao-${index}`);
    const estudos = document.getElementById(`env-estudos-${index}`);
    const informatica = document.getElementById(`env-informatica-${index}`);
    const especializado = document.getElementById(`env-especializado-${index}`);

    if (dadosSalvos) {
        const dados = JSON.parse(dadosSalvos);
        
        if (txtArea) txtArea.value = dados.anotacoes || '';
        if (recepcao) recepcao.checked = !!dados.recepcao;
        if (coordenacao) coordenacao.checked = !!dados.coordenacao;
        if (estudos) estudos.checked = !!dados.estudos;
        if (informatica) informatica.checked = !!dados.informatica;
        if (especializado) especializado.checked = !!dados.especializado;
    } else {
        if (txtArea) txtArea.value = '';
        if (recepcao) recepcao.checked = false;
        if (coordenacao) coordenacao.checked = false;
        if (estudos) estudos.checked = false;
        if (informatica) informatica.checked = false;
        if (especializado) especializado.checked = false;
    }
}

function salvarConfiguracaoDoPolo(poloNome, index) {
    const anotacoes = document.getElementById(`notes-${index}`).value;
    const recepcao = document.getElementById(`env-recepcao-${index}`).checked;
    const coordenacao = document.getElementById(`env-coordenacao-${index}`).checked;
    const estudos = document.getElementById(`env-estudos-${index}`).checked;
    const informatica = document.getElementById(`env-informatica-${index}`).checked;
    const especializado = document.getElementById(`env-especializado-${index}`).checked;

    const dadosDoPolo = {
        poloNome,
        anotacoes,
        recepcao,
        coordenacao,
        estudos,
        informatica,
        especializado
    };

    // 1. Salva localmente
    localStorage.setItem(`polo_data_${poloNome}`, JSON.stringify(dadosDoPolo));
    
    // 2. Atualiza os cards superiores (total de concluídos) instantaneamente
    atualizarIndicadores(database); 

    // 3. Renderiza ou remove o visto verde ao lado do badge sem fechar o menu!
    const modeloCell = document.querySelector(`#polo-row-${index} td:last-child`);
    if (modeloCell) {
        const temTexto = anotacoes && anotacoes.trim() !== '';
        const temAmbiente = recepcao || coordenacao || estudos || informatica || especializado;
        
        let iconeExistente = modeloCell.querySelector('.item-visto-check');
        
        if (temTexto || temAmbiente) {
            if (!iconeExistente) {
                modeloCell.insertAdjacentHTML('beforeend', `<i class="fa-solid fa-circle-check item-visto-check" style="color: #10b981; font-size: 1.15rem; margin-left: auto;" title="Polo Concluído"></i>`);
            }
        } else {
            if (iconeExistente) iconeExistente.remove();
        }
    }

    const btn = document.querySelector(`#detail-row-${index} .btn-save`);
    const originalText = btn.innerHTML;
    btn.style.backgroundColor = '#eab308'; 
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Enviando para Planilha...`;

    // 4. Integração assíncrona com o Sheets Cloud
    fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors', 
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(dadosDoPolo)
    })
    .then(() => {
        btn.style.backgroundColor = '#10b981'; 
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Salvo na Nuvem!`;
        
        setTimeout(() => {
            btn.style.backgroundColor = '';
            btn.innerHTML = originalText;
        }, 2000);
    })
    .catch(error => {
        console.error("Erro ao integrar com o Sheets:", error);
        btn.style.backgroundColor = '#dc2626'; 
        btn.innerHTML = `<i class="fa-solid fa-xmark"></i> Erro ao conectar`;
        
        setTimeout(() => {
            btn.style.backgroundColor = '';
            btn.innerHTML = originalText;
        }, 2000);
    });
}

// =========================================================================
// 9. ATUALIZAÇÃO DOS CARDS E BADGES DE MÉTRICAS
// =========================================================================
function atualizarIndicadores(listaFiltrada) {
    const total = listaFiltrada.length;
    const totalEad = listaFiltrada.filter(p => p.Modelo === 'EAD').length;
    const totalSemi = listaFiltrada.filter(p => p.Modelo === 'Semipresencial').length;

    const totalConcluidos = listaFiltrada.filter(polo => {
        const dadosSalvos = localStorage.getItem(`polo_data_${polo.Nome}`);
        if (dadosSalvos) {
            const dados = JSON.parse(dadosSalvos);
            const temTexto = dados.anotacoes && dados.anotacoes.trim() !== '';
            const temAmbiente = dados.recepcao || dados.coordenacao || dados.estudos || dados.informatica || dados.especializado;
            return temTexto || temAmbiente;
        }
        return false;
    }).length;

    if (txtTotalPolos) txtTotalPolos.textContent = total;
    if (txtTotalEad) txtTotalEad.textContent = totalEad;
    if (txtTotalSemi) txtTotalSemi.textContent = totalSemi;
    if (txtBadgeTotal) txtBadgeTotal.textContent = total;
    
    const txtBadgeConcluidos = document.getElementById('txt-badge-concluidos');
    if (txtBadgeConcluidos) txtBadgeConcluidos.textContent = totalConcluidos;
}
// Aguarda o HTML carregar completamente
document.addEventListener('DOMContentLoaded', () => {
    
    // Seleciona o botão de sair pelo ID
    const btnSair = document.getElementById('btn-sair');

    // Verifica se o botão realmente existe na página antes de aplicar o evento
    if (btnSair) {
        btnSair.addEventListener('click', (event) => {
            event.preventDefault(); // Evita qualquer comportamento padrão inesperado

            // 1. Limpa os dados de autenticação salvos no navegador
            localStorage.clear(); // Limpa todo o localStorage
            sessionStorage.clear(); // Limpa todo o sessionStorage

            // Se você usa chaves específicas como 'usuarioLogado' ou 'token', pode usar:
            // localStorage.removeItem('token');

            // 2. Exibe um aviso rápido (opcional, melhora a experiência)
            alert('Deslogado com sucesso! Redirecionando...');

            // 3. Redireciona para a sua página de login (ajuste o nome do arquivo se for diferente)
            window.location.href = 'login.html'; 
        });
    }
});