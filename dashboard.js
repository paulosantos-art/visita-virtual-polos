// ==========================================
// 1. CONFIGURAÇÕES E BANCO DE DADOS EM MEMÓRIA
// ==========================================

// Mesma planilha da Lista de Polos (script.js), para os números baterem entre as telas
const SPREADSHEET_ID = '1km9rpUas9U3V4zqRqCp4AxxR_srUphtlckBuGRF7lqQ';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;

// Banco de dados em memória local para permitir filtros sem re-fazer fetch
let DADOS_PLANILHA_ORIGINAL = [];
let COLUNAS_INDICES = { nome: -1, regiao: -1, estado: -1 };
let mapaLeafletInstancia = null; // Guarda referência do Leaflet para re-uso/destruição correta

// Coordenadas geográficas dos estados para plotagem no mapa Leaflet
const coordenadasEstados = {
    'AC': [-9.02, -70.81], 'AL': [-9.57, -36.78], 'AP': [1.41, -51.77],
    'AM': [-3.41, -65.85], 'BA': [-12.57, -41.70], 'CE': [-5.49, -39.32],
    'DF': [-15.79, -47.88], 'ES': [-19.18, -40.30], 'GO': [-15.82, -49.83],
    'MA': [-4.96, -45.27], 'MT': [-12.68, -56.92], 'MS': [-20.44, -54.64],
    'MG': [-18.51, -44.55], 'PA': [-3.70, -52.33], 'PB': [-7.23, -36.78],
    'PR': [-25.25, -52.02], 'PE': [-8.81, -36.95], 'PI': [-7.71, -42.72],
    'RJ': [-22.90, -43.20], 'RN': [-5.79, -36.56], 'RS': [-30.03, -51.21],
    'RO': [-11.50, -63.58], 'RR': [2.73, -62.07], 'SC': [-27.24, -50.21],
    'SP': [-23.55, -46.63], 'SE': [-10.52, -37.38], 'TO': [-10.17, -48.29],
    'Estrangeiro': [-22.00, -25.00]
};


// ==========================================
// 2. DISPARADORES INICIAIS DA PÁGINA (DOM)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    carregarDadosDashboard();
    configurarOuvintesFiltros();
    
    // Configura o botão de logout
    document.getElementById('btn-sair')?.addEventListener('click', () => {
        if (confirm("Deseja realmente sair do painel?")) {
            sairDoSistema();
        }
    });
});


// ==========================================
// 3. REQUISIÇÃO E PROCESSAMENTO INICIAL DOS DADOS
// ==========================================
async function carregarDadosDashboard() {
    try {
        const resposta = await fetch(SHEET_CSV_URL);
        if (!resposta.ok) throw new Error(`Erro na requisição: ${resposta.status}`);
        
        const texto = await resposta.text();
        DADOS_PLANILHA_ORIGINAL = csvParaArray(texto);
        
        if (DADOS_PLANILHA_ORIGINAL.length === 0) return;

        // Identifica dinamicamente a posição exata das colunas fixas solicitadas
        const cabecalho = DADOS_PLANILHA_ORIGINAL[0];
        for (let i = 0; i < cabecalho.length; i++) {
            const nomeColuna = cabecalho[i].replace(/^"|"$/g, '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            // Mesma regra da Lista de Polos: vale a primeira coluna que combinar
            if (COLUNAS_INDICES.nome === -1 && (nomeColuna.includes('nome') || nomeColuna.includes('polo') || nomeColuna.includes('cidade'))) {
                COLUNAS_INDICES.nome = i;
            }
            if (COLUNAS_INDICES.regiao === -1 && nomeColuna.includes('regia')) {
                COLUNAS_INDICES.regiao = i;
            }
            if (COLUNAS_INDICES.estado === -1 && nomeColuna.includes('estado')) {
                COLUNAS_INDICES.estado = i;
            }
        }
        if (COLUNAS_INDICES.nome === -1) COLUNAS_INDICES.nome = 0;
        if (COLUNAS_INDICES.regiao === -1) COLUNAS_INDICES.regiao = 1;
        if (COLUNAS_INDICES.estado === -1) COLUNAS_INDICES.estado = 2;

        // Mantém só as linhas que a Lista de Polos também considera (com nome preenchido)
        DADOS_PLANILHA_ORIGINAL = [DADOS_PLANILHA_ORIGINAL[0], ...DADOS_PLANILHA_ORIGINAL.slice(1).filter(linha =>
            linha.length >= 2 && (linha[COLUNAS_INDICES.nome] || '').trim() !== ''
        )];

        // Popula inteligentemente os seletores com base na carga inicial de dados
        atualizarFiltroRegioes();
        atualizarFiltroEstados();
        montarCabecalhoTabela();
        processarEFiltarDados();

    } catch (erro) {
        console.error('Erro ao processar dados do dashboard unificado:', erro);
    }
}


// ==========================================
// 4. CONFIGURAÇÃO DE EVENTOS DE COMPORTAMENTO (OUVINTES COORDENADOS)
// ==========================================
function configurarOuvintesFiltros() {
    // Quando alterar a Região
    document.getElementById('filtroRegiao')?.addEventListener('change', () => {
        atualizarFiltroEstados();
        processarEFiltarDados();
    });

    // Quando alterar o Estado
    document.getElementById('filtroEstado')?.addEventListener('change', () => {
        atualizarFiltroRegioes();
        processarEFiltarDados();
    });
}


// ==========================================
// 5. FILTRAGEM INTELIGENTE DINÂMICA DO SELETOR DE REGIÕES
// ==========================================
function atualizarFiltroRegioes() {
    const filtroRegiao = document.getElementById('filtroRegiao');
    const filtroEstado = document.getElementById('filtroEstado');

    if (!filtroRegiao || !filtroEstado) return;

    const estadoSelecionado = filtroEstado.value;
    const regiaoAtual = filtroRegiao.value;

    let regioesDisponiveis = [];

    for (let i = 1; i < DADOS_PLANILHA_ORIGINAL.length; i++) {
        const linha = DADOS_PLANILHA_ORIGINAL[i];
        if (!linha || linha.length === 0 || (linha.length === 1 && linha[0] === "")) continue;

        const valorRegiao = COLUNAS_INDICES.regiao !== -1 ? linha[COLUNAS_INDICES.regiao] || "" : "";
        const valorEstado = COLUNAS_INDICES.estado !== -1 ? linha[COLUNAS_INDICES.estado] || "" : "";

        const estadoFormatadoUF = mapearNomeEstado(valorEstado);
        const regiaoFormatada = mapearNomeRegiao(valorRegiao);

        const atendeEstado = estadoSelecionado === "" || estadoFormatadoUF === estadoSelecionado;

        if (atendeEstado && regiaoFormatada && regiaoFormatada !== 'Outros') {
            regioesDisponiveis.push(regiaoFormatada);
        }
    }

    regioesDisponiveis = [...new Set(regioesDisponiveis)].sort();

    filtroRegiao.innerHTML = '<option value="">Todas as Regiões</option>';
    regioesDisponiveis.forEach(regiao => {
        const option = document.createElement('option');
        option.value = regiao;
        option.textContent = regiao;
        filtroRegiao.appendChild(option);
    });

    if (regioesDisponiveis.includes(regiaoAtual)) {
        filtroRegiao.value = regiaoAtual;
    }
}


// ==========================================
// 6. FILTRAGEM INTELIGENTE DINÂMICA DO SELETOR DE ESTADOS
// ==========================================
function atualizarFiltroEstados() {
    const filtroRegiao = document.getElementById('filtroRegiao');
    const filtroEstado = document.getElementById('filtroEstado');

    if (!filtroRegiao || !filtroEstado) return;

    const regiaoSelecionada = filtroRegiao.value;
    const estadoAtual = filtroEstado.value;

    let estadosDisponiveis = [];

    for (let i = 1; i < DADOS_PLANILHA_ORIGINAL.length; i++) {
        const linha = DADOS_PLANILHA_ORIGINAL[i];
        if (!linha || linha.length === 0 || (linha.length === 1 && linha[0] === "")) continue;

        const valorRegiao = COLUNAS_INDICES.regiao !== -1 ? linha[COLUNAS_INDICES.regiao] || "" : "";
        const valorEstado = COLUNAS_INDICES.estado !== -1 ? linha[COLUNAS_INDICES.estado] || "" : "";

        const estadoFormatadoUF = mapearNomeEstado(valorEstado);
        const regiaoFormatada = mapearNomeRegiao(valorRegiao);

        const atendeRegiao = regiaoSelecionada === "" || regiaoFormatada === regiaoSelecionada;

        if (atendeRegiao && estadoFormatadoUF && estadoFormatadoUF !== 'Outros') {
            estadosDisponiveis.push(estadoFormatadoUF);
        }
    }

    estadosDisponiveis = [...new Set(estadosDisponiveis)].sort();

    filtroEstado.innerHTML = '<option value="">Todos os Estados</option>';
    estadosDisponiveis.forEach(uf => {
        const option = document.createElement('option');
        option.value = uf;
        option.textContent = uf;
        filtroEstado.appendChild(option);
    });

    if (estadosDisponiveis.includes(estadoAtual)) {
        filtroEstado.value = estadoAtual;
    }
}


// ==========================================
// 9. MONTAGEM DA ESTRUTURA VISUAL DA TABELA (CABEÇALHO)
// ==========================================
function montarCabecalhoTabela() {
    const tr = document.getElementById('cabecalhoTabela');
    if (!tr) return;
    tr.innerHTML = '';
    
    const colunasExibidas = ["Nome", "Região", "Estado"];
    
    colunasExibidas.forEach(nomeCol => {
        const th = document.createElement('th');
        th.className = "fw-semibold py-2";
        th.textContent = nomeCol;
        tr.appendChild(th);
    });
}


// ==========================================
// 10. CÁLCULO, FILTRAGEM TOTAL E RENDERIZAÇÃO DOS COMPONENTES
// ==========================================
function processarEFiltarDados() {
    const valorFiltroRegiao = document.getElementById('filtroRegiao')?.value || "";
    const valorFiltroEstado = document.getElementById('filtroEstado')?.value || "";

    const contagemEstados = Object.keys(coordenadasEstados).reduce((acc, uf) => { acc[uf] = 0; return acc; }, {});
    const contagemRegioes = { 'Norte': 0, 'Nordeste': 0, 'Centro-Oeste': 0, 'Sudeste': 0, 'Sul': 0, 'Estrangeiro': 0 };
    
    const tbody = document.getElementById('corpoTabela');
    if (tbody) tbody.innerHTML = '';

    let linhasFiltradasParaTabela = 0;

    for (let i = 1; i < DADOS_PLANILHA_ORIGINAL.length; i++) {
        const ChatLinha = DADOS_PLANILHA_ORIGINAL[i];
        if (!ChatLinha || ChatLinha.length === 0 || (ChatLinha.length === 1 && ChatLinha[0] === "")) continue;

        const valorNome = COLUNAS_INDICES.nome !== -1 ? ChatLinha[COLUNAS_INDICES.nome] || "" : "";
        const valorRegiao = COLUNAS_INDICES.regiao !== -1 ? ChatLinha[COLUNAS_INDICES.regiao] || "" : "";
        const valorEstado = COLUNAS_INDICES.estado !== -1 ? ChatLinha[COLUNAS_INDICES.estado] || "" : "";

        const estadoFormatado = mapearNomeEstado(valorEstado);
        const regiaoFormatada = mapearNomeRegiao(valorRegiao);

        const atendeRegiao = valorFiltroRegiao === "" || regiaoFormatada === valorFiltroRegiao;
        const atendeEstado = valorFiltroEstado === "" || estadoFormatado === valorFiltroEstado;

        if (atendeRegiao && atendeEstado) {
            if (contagemEstados[estadoFormatado] !== undefined) contagemEstados[estadoFormatado]++;
            if (contagemRegioes[regiaoFormatada] !== undefined) contagemRegioes[regiaoFormatada]++;

            if (tbody) {
                const tr = document.createElement('tr');
                
                const dadosExibicao = [
                    valorNome.replace(/^"|"$/g, '').trim(),
                    valorRegiao.replace(/^"|"$/g, '').trim(),
                    estadoFormatado
                ];

                dadosExibicao.forEach(texto => {
                    const td = document.createElement('td');
                    td.className = "py-2 text-truncate";
                    td.style.maxWidth = "220px";
                    td.textContent = texto;
                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            }
            linhasFiltradasParaTabela++;
        }
    }

    if (linhasFiltradasParaTabela === 0 && tbody) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-muted">Nenhum polo encontrado para os filtros selecionados.</td></tr>`;
    }

    const badge = document.getElementById('totalPolosBadge');
    if (badge) badge.textContent = `${linhasFiltradasParaTabela} Polos`;

    inicializarGrafico(contagemRegioes);
    inicializarMapa(contagemEstados);
}


// ==========================================
// 11. TRATAMENTO INTELIGENTE E NORMALIZAÇÃO DE ESTADOS (NOME EXTENSO -> UF)
// ==========================================
function mapearNomeEstado(texto) {
    const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const mapa = {
        'acre': 'AC', 'ac': 'AC', 'alagoas': 'AL', 'al': 'AL', 'amapa': 'AP', 'ap': 'AP',
        'amazonas': 'AM', 'am': 'AM', 'bahia': 'BA', 'ba': 'BA', 'ceara': 'CE', 'ce': 'CE',
        'distrito federal': 'DF', 'df': 'DF', 'espirito santo': 'ES', 'es': 'ES', 'goias': 'GO', 'go': 'GO',
        'maranhao': 'MA', 'ma': 'MA', 'mato grosso': 'MT', 'mt': 'MT', 'mato grosso do sul': 'MS', 'ms': 'MS',
        'minas gerais': 'MG', 'mg': 'MG', 'para': 'PA', 'pa': 'PA', 'paraiba': 'PB', 'pb': 'PB',
        'parana': 'PR', 'pr': 'PR', 'pernambuco': 'PE', 'pe': 'PE', 'piaui': 'PI', 'pi': 'PI',
        'rio de janeiro': 'RJ', 'rj': 'RJ', 'rio grande do norte': 'RN', 'rn': 'RN', 'rio grande do sul': 'RS', 'rs': 'RS',
        'rondonia': 'RO', 'ro': 'RO', 'roraima': 'RR', 'rr': 'RR', 'santa catarina': 'SC', 'sc': 'SC',
        'sao paulo': 'SP', 'sp': 'SP', 'sergipe': 'SE', 'se': 'SE', 'tocantins': 'TO', 'to': 'TO',
        'estrangeiro': 'Estrangeiro', 'exterior': 'Estrangeiro'
    };
    if (mapa[t]) return mapa[t];
    for (const [chave, valor] of Object.entries(mapa)) {
        if (chave.length > 2 && t.includes(chave)) return valor;
    }
    return 'Outros';
}


// ==========================================
// 12. TRATAMENTO INTELIGENTE E NORMALIZAÇÃO DE REGIÕES
// ==========================================
function mapearNomeRegiao(texto) {
    const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes('sudeste')) return 'Sudeste';
    if (t.includes('nordeste')) return 'Nordeste';
    if (t.includes('centro-oeste') || t.includes('centro oeste')) return 'Centro-Oeste';
    if (t.includes('norte')) return 'Norte';
    if (t.includes('sul')) return 'Sul';
    if (t.includes('estrangeiro') || t.includes('exterior')) return 'Estrangeiro';
    return 'Outros';
}


// ==========================================
// 13. CONVERSOR PARSER DE STRING CSV PARA MATRIZ ARRAY
// ==========================================
function csvParaArray(textoCsv) {
    const resultado = []; let linha = []; let dentroDeAspas = false; let valorAtual = '';
    for (let i = 0; i < textoCsv.length; i++) {
        const char = textoCsv[i]; const proximoChar = textoCsv[i + 1];
        if (char === '"') {
            if (dentroDeAspas && proximoChar === '"') { valorAtual += '"'; i++; } else { dentroDeAspas = !dentroDeAspas; }
        } else if (char === ',' && !dentroDeAspas) {
            linha.push(valorAtual); valorAtual = '';
        } else if ((char === '\r' || char === '\n') && !dentroDeAspas) {
            if (char === '\r' && proximoChar === '\n') i++;
            linha.push(valorAtual); resultado.push(linha); linha = []; valorAtual = '';
        } else { valorAtual += char; }
    }
    if (valorAtual || linha.length > 0) { linha.push(valorAtual); resultado.push(linha); }
    return resultado;
}


// ==========================================
// 14. MONTAGEM E REDESENHO DO GRÁFICO (CHART.JS)
// ==========================================
function inicializarGrafico(dados) {
    const canvasElement = document.getElementById('graficoRegioes');
    if (!canvasElement) return;

    const ctx = canvasElement.getContext('2d');
    const regioesOrdenadas = Object.entries(dados).filter(([_, total]) => total > 0).sort((a, b) => b[1] - a[1]);
    
    const labels = regioesOrdenadas.map(item => item[0]);
    const valores = regioesOrdenadas.map(item => item[1]);

    if (window.meuGrafico) window.meuGrafico.destroy();

    window.meuGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Quantidade de Polos',
                data: valores,
                backgroundColor: '#2563eb',
                hoverBackgroundColor: '#1d4ed8',
                borderRadius: 8,
                barThickness: 34
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8, titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } }
            },
            scales: {
                y: { beginAtZero: true, border: { display: false }, grid: { color: '#eef1f6' }, ticks: { color: '#64748b', font: { family: 'Inter' } } },
                x: { border: { display: false }, grid: { display: false }, ticks: { color: '#0f172a', font: { family: 'Inter', weight: '600' } } }
            }
        }
    });
}


// ==========================================
// 15. MAPA DO BRASIL POR ESTADO (LEAFLET + GEOJSON DOS ESTADOS)
// ==========================================
const GEOJSON_ESTADOS_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson';
const ESCALA_CORES_MAPA = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'];
const COR_ESTADO_SEM_POLO = '#f1f5f9';
let geojsonEstadosCache = null;

// Baixa o contorno dos estados uma única vez (os filtros reaproveitam)
async function carregarGeojsonEstados() {
    if (!geojsonEstadosCache) {
        const resposta = await fetch(GEOJSON_ESTADOS_URL);
        if (!resposta.ok) throw new Error(`Erro ao carregar o mapa: ${resposta.status}`);
        geojsonEstadosCache = await resposta.json();
    }
    return geojsonEstadosCache;
}

// Faixa de cor do estado: divide de 1 até o maior total em partes iguais
function indiceFaixaCor(total, maximo) {
    return Math.min(ESCALA_CORES_MAPA.length - 1, Math.ceil((total * ESCALA_CORES_MAPA.length) / maximo) - 1);
}

function corPorQuantidade(total, maximo) {
    if (!total) return COR_ESTADO_SEM_POLO;
    return ESCALA_CORES_MAPA[indiceFaixaCor(total, maximo)];
}

function criarLegendaMapa(maximo) {
    const legenda = L.control({ position: 'bottomright' });

    legenda.onAdd = () => {
        const div = L.DomUtil.create('div', 'map-legend');
        let html = '<strong>Polos por estado</strong>';

        const n = ESCALA_CORES_MAPA.length;
        for (let i = 0; i < n; i++) {
            const de = Math.floor((maximo * i) / n) + 1;
            const ate = Math.floor((maximo * (i + 1)) / n);
            if (de > ate) continue; // faixa vazia quando há poucos polos
            const rotulo = de === ate ? `${de}` : `${de} – ${ate}`;
            html += `<div><i style="background:${ESCALA_CORES_MAPA[i]}"></i>${rotulo}</div>`;
        }
        html += `<div><i style="background:${COR_ESTADO_SEM_POLO}"></i>Sem polos</div>`;

        div.innerHTML = html;
        return div;
    };

    return legenda;
}

function inicializarMapa(dados) {
    const container = document.getElementById('mapaPolos');
    if (!container) return;

    // Destruição segura do mapa para evitar erros e sombras de sobreposição
    if (mapaLeafletInstancia !== null) {
        mapaLeafletInstancia.remove();
        mapaLeafletInstancia = null;
    }

    const mapa = L.map('mapaPolos', {
        zoomSnap: 0.25,
        scrollWheelZoom: false,
        // No celular/tablet o dedo rola a página em vez de arrastar o mapa
        dragging: !L.Browser.mobile,
        attributionControl: false
    }).setView([-14.235, -51.925], 4);
    mapaLeafletInstancia = mapa;

    const maximo = Math.max(1, ...Object.entries(dados)
        .filter(([uf]) => uf !== 'Estrangeiro')
        .map(([, total]) => total));

    carregarGeojsonEstados()
        .then(geojson => {
            // Se os filtros mudaram enquanto o mapa carregava, este mapa já foi descartado
            if (mapaLeafletInstancia !== mapa) return;

            const camadaEstados = L.geoJSON(geojson, {
                style: feature => ({
                    fillColor: corPorQuantidade(dados[feature.properties.sigla] || 0, maximo),
                    fillOpacity: 1,
                    color: '#ffffff',
                    weight: 1.2
                }),
                onEachFeature: (feature, layer) => {
                    const uf = feature.properties.sigla;
                    const total = dados[uf] || 0;

                    layer.bindTooltip(
                        `<strong>${feature.properties.name} (${uf})</strong><br>${total} ${total === 1 ? 'polo' : 'polos'}`,
                        { sticky: true, className: 'map-tooltip' }
                    );

                    layer.on({
                        mouseover: e => {
                            e.target.setStyle({ weight: 2.5, color: '#0f172a' });
                            e.target.bringToFront();
                        },
                        mouseout: e => camadaEstados.resetStyle(e.target),
                        // Clicar em um estado com polos aplica o filtro de Estado
                        click: () => {
                            const filtroEstado = document.getElementById('filtroEstado');
                            if (!filtroEstado || !total) return;
                            filtroEstado.value = filtroEstado.value === uf ? '' : uf;
                            atualizarFiltroRegioes();
                            processarEFiltarDados();
                        }
                    });
                }
            }).addTo(mapa);

            mapa.fitBounds(camadaEstados.getBounds(), { padding: [10, 10] });
            criarLegendaMapa(maximo).addTo(mapa);
        })
        .catch(erro => {
            console.error('Erro ao carregar o mapa dos estados:', erro);
            container.innerHTML = '<div class="empty-state">Não foi possível carregar o mapa do Brasil. Verifique a conexão e recarregue a página.</div>';
        });
}


// ==========================================
// 16. COMPORTAMENTO DE ATALHOS GLOBAIS (RESET COM ESC)
// ==========================================
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
        
        const filtroRegiao = document.getElementById('filtroRegiao');
        const filtroEstado = document.getElementById('filtroEstado');

        // Reseta todos os seletores para a opção nula padrão
        if (filtroRegiao) filtroRegiao.value = "";
        if (filtroEstado) filtroEstado.value = "";

        // Redescreve as listas completas e limpa os gráficos
        atualizarFiltroRegioes();
        atualizarFiltroEstados();
        processarEFiltarDados();
    }
});
