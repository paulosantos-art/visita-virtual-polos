// O controle de acesso (login obrigatório) fica no auth.js, carregado antes deste arquivo

// =========================================================================
// 1. CONFIGURAÇÃO DA PLANILHA (IDs e Links de Integração)
// =========================================================================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxH-7NvAu4PbBPBpEWd5UGCUApnpVlMiAeTLsZcoL_DOiF3MKDnuVidCPHzDZVsUgns/exec';

// Variáveis de Paginação e Filtro de Concluídos
let paginaAtual = 1;
const itensPorPagina = 10;
let apenasConcluidos = false;
let apenasPendentes = false;

// Última lista exibida (usada para atualizar os indicadores após salvar um polo)
let ultimosDadosFiltrados = [];
let ultimosDadosBase = [];

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
    
    criarCombosDeFiltro();

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
        // Respeita o filtro de região da tela, se houver um selecionado
        btnRelatorio.addEventListener('click', () => gerarRelatorioPorRegiao(selectRegiao ? selectRegiao.value : 'TODAS'));
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || event.key === 'Esc') {
            // Com a prévia do relatório aberta, o ESC só fecha a prévia
            if (fecharPreviaRelatorio()) return;
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
    sairDoSistema();
}

// A planilha, o status dos polos e a leitura do CSV ficam no polos-base.js;
// o relatório por região fica no relatorio.js (ambos compartilhados com a Consulta)

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
// 6.1 CAMPOS DE REGIÃO E ESTADO COM PESQUISA (substituem visualmente o <select>)
// =========================================================================
// Os <select> originais continuam existindo (ocultos) e seguem sendo a fonte
// do valor; estes campos só oferecem a busca e a lista estilizada.
// (As siglas de estados e regiões ficam no polos-base.js)

// Funções de sincronização de cada campo criado (chamadas em filtrarEDesenhar)
const combosPesquisaveis = [];

function criarCombosDeFiltro() {
    criarComboPesquisavel(selectRegiao, {
        idInput: 'input-regiao',
        valorTodos: 'TODAS',
        textoTodos: 'Todas as Regiões',
        icone: 'fa-map',
        campoPolo: 'Regiao',
        sigla: siglaDaRegiao,
        textoVazio: 'Nenhuma região encontrada'
    });

    criarComboPesquisavel(selectEstado, {
        idInput: 'input-estado',
        valorTodos: 'TODOS',
        textoTodos: 'Todos os Estados',
        icone: 'fa-location-dot',
        campoPolo: 'Estado',
        sigla: siglaDoEstado,
        textoVazio: 'Nenhum estado encontrado'
    });
}

function criarComboPesquisavel(select, config) {
    if (!select) return;

    select.classList.add('select-oculto');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const combo = document.createElement('div');
    combo.className = 'combo';
    combo.innerHTML = `
        <div class="combo-campo">
            <i class="fa-solid ${config.icone} combo-icone"></i>
            <input type="text" id="${config.idInput}" class="combo-input" placeholder="${config.textoTodos}"
                   autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list">
            <button type="button" class="combo-limpar" title="${config.textoTodos}">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <i class="fa-solid fa-chevron-down combo-seta"></i>
        </div>
        <div class="combo-lista" role="listbox"></div>
    `;
    select.insertAdjacentElement('afterend', combo);

    const input = combo.querySelector('.combo-input');
    const lista = combo.querySelector('.combo-lista');
    const btnLimpar = combo.querySelector('.combo-limpar');
    let opcoesVisiveis = [];
    let indiceAtivo = -1;

    const estaAberto = () => combo.classList.contains('aberto');

    // Mostra no campo o valor escolhido (também quando o filtro muda por outro caminho, ex.: ESC)
    const sincronizar = () => {
        const temValor = select.value !== config.valorTodos;
        combo.classList.toggle('preenchido', temValor);
        if (!estaAberto()) {
            const opcaoAtual = select.options[select.selectedIndex];
            input.value = temValor && opcaoAtual ? opcaoAtual.textContent : '';
        }
    };

    const marcarAtiva = (indice) => {
        indiceAtivo = indice;
        lista.querySelectorAll('.combo-opcao').forEach((el, i) => {
            el.classList.toggle('ativa', i === indice);
            if (i === indice) el.scrollIntoView({ block: 'nearest' });
        });
    };

    const desenharLista = () => {
        const termo = normalizarTexto(input.value).trim();

        const contagem = {};
        database.forEach(polo => {
            const chave = polo[config.campoPolo];
            contagem[chave] = (contagem[chave] || 0) + 1;
        });

        const todasOpcoes = Array.from(select.options);
        const totalGeral = todasOpcoes.reduce((soma, opt) => soma + (contagem[opt.value] || 0), 0);

        // Busca pelo nome (sem acento) ou pela sigla: "sao", "São Paulo" ou "SP"
        opcoesVisiveis = todasOpcoes.filter(opt => {
            if (!termo) return true;
            if (opt.value === config.valorTodos) return false;
            return normalizarTexto(opt.textContent).includes(termo)
                || normalizarTexto(config.sigla(opt.value)) === termo;
        });

        if (opcoesVisiveis.length === 0) {
            indiceAtivo = -1;
            lista.innerHTML = `
                <div class="combo-vazio">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    ${config.textoVazio} para "${escaparHtml(input.value.trim())}"
                </div>`;
            return;
        }

        lista.innerHTML = opcoesVisiveis.map((opt, i) => {
            const todos = opt.value === config.valorTodos;
            const sigla = config.sigla(opt.value);
            const marcador = todos
                ? '<i class="fa-solid fa-earth-americas"></i>'
                : (sigla ? escaparHtml(sigla) : '<i class="fa-solid fa-globe"></i>');
            const quantidade = todos ? totalGeral : (contagem[opt.value] || 0);
            const selecionada = opt.value === select.value ? ' selecionada' : '';

            return `
                <div class="combo-opcao${selecionada}" role="option" data-indice="${i}">
                    <span class="combo-sigla">${marcador}</span>
                    <span class="combo-nome">${escaparHtml(opt.textContent)}</span>
                    <span class="combo-qtd">${quantidade} ${quantidade === 1 ? 'polo' : 'polos'}</span>
                </div>`;
        }).join('');

        const indiceSelecionado = opcoesVisiveis.findIndex(opt => opt.value === select.value);
        marcarAtiva(termo ? 0 : Math.max(0, indiceSelecionado));
    };

    const abrir = () => {
        if (estaAberto()) return;
        // Ao abrir, o texto vira dica e o campo fica livre para digitar
        const opcaoAtual = select.options[select.selectedIndex];
        input.placeholder = opcaoAtual ? opcaoAtual.textContent : config.textoTodos;
        input.value = '';
        combo.classList.add('aberto');
        input.setAttribute('aria-expanded', 'true');
        desenharLista();
    };

    const fechar = () => {
        combo.classList.remove('aberto');
        input.setAttribute('aria-expanded', 'false');
        input.placeholder = config.textoTodos;
        sincronizar();
    };

    const escolher = (valor) => {
        fechar();
        if (select.value !== valor) {
            select.value = valor;
            select.dispatchEvent(new Event('change'));
        }
        sincronizar();
    };

    input.addEventListener('focus', abrir);
    input.addEventListener('click', abrir);
    input.addEventListener('blur', fechar);
    input.addEventListener('input', () => {
        if (!estaAberto()) abrir();
        desenharLista();
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!estaAberto()) { abrir(); return; }
            if (opcoesVisiveis.length === 0) return;
            const passo = event.key === 'ArrowDown' ? 1 : -1;
            marcarAtiva((indiceAtivo + passo + opcoesVisiveis.length) % opcoesVisiveis.length);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (estaAberto() && opcoesVisiveis[indiceAtivo]) {
                escolher(opcoesVisiveis[indiceAtivo].value);
                input.blur();
            }
        } else if ((event.key === 'Escape' || event.key === 'Esc') && estaAberto()) {
            // Fecha só a lista, sem disparar o ESC que limpa todos os filtros
            event.stopPropagation();
            input.blur();
        }
    });

    // mousedown + preventDefault mantém o foco no campo até a escolha ser aplicada
    lista.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const opcao = event.target.closest('.combo-opcao');
        if (!opcao) return;
        const escolhida = opcoesVisiveis[Number(opcao.dataset.indice)];
        if (escolhida) {
            escolher(escolhida.value);
            input.blur();
        }
    });

    lista.addEventListener('mousemove', (event) => {
        const opcao = event.target.closest('.combo-opcao');
        if (opcao && Number(opcao.dataset.indice) !== indiceAtivo) marcarAtiva(Number(opcao.dataset.indice));
    });

    combo.querySelector('.combo-campo').addEventListener('mousedown', (event) => {
        if (event.target === input || event.target.closest('.combo-limpar')) return;
        event.preventDefault();
        if (document.activeElement === input) {
            estaAberto() ? fechar() : abrir();
        } else {
            input.focus();
        }
    });

    btnLimpar.addEventListener('mousedown', (event) => event.preventDefault());
    btnLimpar.addEventListener('click', () => escolher(config.valorTodos));

    combosPesquisaveis.push(sincronizar);
    sincronizar();
}

function sincronizarCombosDeFiltro() {
    combosPesquisaveis.forEach(sincronizar => sincronizar());
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

// Etiqueta de status exibida na coluna "Status" da tabela
function htmlStatusPolo(nomePolo) {
    return isPoloConcluido(nomePolo)
        ? '<span class="status-pill done"><i class="fa-solid fa-circle-check"></i> Visitado</span>'
        : '<span class="status-pill pending"><i class="fa-regular fa-clock"></i> Pendente</span>';
}

// =========================================================================
// 8. FILTRAGEM, RENDERIZAÇÃO DA TABELA, DETALHES E PAGINAÇÃO
// =========================================================================
function filtrarEDesenhar() {
    sincronizarCombosDeFiltro();
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

    // Selos da lista: também seguem a busca/região/estado (sem contar o próprio
    // filtro de Concluídos/Pendentes, para os dois números continuarem visíveis)
    if (txtBadgeConcluidos) {
        txtBadgeConcluidos.textContent = `${concluidosBase} Concluídos`;
    }
    if (txtBadgePendentes) {
        txtBadgePendentes.textContent = `${totalBase - concluidosBase} Pendentes`;
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
