// ==========================================
// 1. CONFIGURAÇÕES E BANCO DE DADOS EM MEMÓRIA
// ==========================================

// Configuração oficial da planilha
const SPREADSHEET_ID = '1pXYokP61OdQfhSboBvncowQdW-1alazr6jrLplZuIn4';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;

// Banco de dados em memória local para permitir filtros sem re-fazer fetch
let DADOS_PLANILHA_ORIGINAL = [];
let COLUNAS_INDICES = { nome: -1, regiao: -1, estado: -1 };

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
        window.location.href = 'login.html';
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
            
            if (nomeColuna === 'polo' || nomeColuna === 'nome' || nomeColuna.includes('nome')) {
                COLUNAS_INDICES.nome = i;
            }
            if (nomeColuna === 'regiao') {
                COLUNAS_INDICES.regiao = i;
            }
            if (nomeColuna === 'estado' || nomeColuna === 'uf' || nomeColuna === 'estados') {
                COLUNAS_INDICES.estado = i;
            }
        }

        // Popula inteligentemente os seletores com base na carga inicial de dados
        atualizarFiltroRegioes();
        atualizarFiltroEstados();
        atualizarFiltroModelos(); // Adicionado na carga inicial
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
        // Atualiza a lista de estados e modelos válidos para essa região
        atualizarFiltroEstados();
        atualizarFiltroModelos();
        processarEFiltarDados();
    });

    // Quando alterar o Estado
    document.getElementById('filtroEstado')?.addEventListener('change', () => {
        // Ajusta dinamicamente as regiões e modelos disponíveis para esse estado
        atualizarFiltroRegioes();
        atualizarFiltroModelos();
        processarEFiltarDados();
    });

    // Quando mudar o Modelo de Oferta
    document.getElementById('filtroModelo')?.addEventListener('change', () => {
        // Ajusta dinamicamente as regiões e estados disponíveis para esse modelo
        atualizarFiltroRegioes();
        atualizarFiltroEstados();
        processarEFiltarDados();
    });
}


// ==========================================
// 5. FILTRAGEM INTELIGENTE DINÂMICA DO SELETOR DE REGIÕES
// ==========================================
function atualizarFiltroRegioes() {
    const filtroRegiao = document.getElementById('filtroRegiao');
    const filtroEstado = document.getElementById('filtroEstado');
    const filtroModelo = document.getElementById('filtroModelo');
    
    if (!filtroRegiao || !filtroEstado || !filtroModelo) return;

    const estadoSelecionado = filtroEstado.value;
    const modeloSelecionado = filtroModelo.value;
    const regiaoAtual = filtroRegiao.value;

    let regioesDisponiveis = [];

    for (let i = 1; i < DADOS_PLANILHA_ORIGINAL.length; i++) {
        const linha = DADOS_PLANILHA_ORIGINAL[i];
        if (!linha || linha.length === 0 || (linha.length === 1 && linha[0] === "")) continue;

        const valorRegiao = COLUNAS_INDICES.regiao !== -1 ? linha[COLUNAS_INDICES.regiao] || "" : "";
        const valorEstado = COLUNAS_INDICES.estado !== -1 ? linha[COLUNAS_INDICES.estado] || "" : "";

        const estadoFormatadoUF = mapearNomeEstado(valorEstado);
        const regiaoFormatada = mapearNomeRegiao(valorRegiao);
        const modeloOfertaDetectado = extrairModeloOferta(linha);

        // Valida se a linha atende aos filtros cruzados atuais de Estado e Modelo
        const atendeEstado = estadoSelecionado === "" || estadoFormatadoUF === estadoSelecionado;
        const atendeModelo = verificarCompatibilidadeModelo(modeloSelecionado, modeloOfertaDetectado);

        if (atendeEstado && atendeModelo && regiaoFormatada && regiaoFormatada !== 'Outros') {
            regioesDisponiveis.push(regiaoFormatada);
        }
    }

    regioesDisponiveis = [...new Set(regioesDisponiveis)].sort();

    // Reconstrói o HTML do seletor de regiões dinamicamente
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
    const filtroModelo = document.getElementById('filtroModelo');
    
    if (!filtroRegiao || !filtroEstado || !filtroModelo) return;

    const regiaoSelecionada = filtroRegiao.value;
    const modeloSelecionado = filtroModelo.value;
    const estadoAtual = filtroEstado.value;

    let estadosDisponiveis = [];

    for (let i = 1; i < DADOS_PLANILHA_ORIGINAL.length; i++) {
        const linha = DADOS_PLANILHA_ORIGINAL[i];
        if (!linha || linha.length === 0 || (linha.length === 1 && linha[0] === "")) continue;

        const valorRegiao = COLUNAS_INDICES.regiao !== -1 ? linha[COLUNAS_INDICES.regiao] || "" : "";
        const valorEstado = COLUNAS_INDICES.estado !== -1 ? linha[COLUNAS_INDICES.estado] || "" : "";

        const estadoFormatadoUF = mapearNomeEstado(valorEstado);
        const regiaoFormatada = mapearNomeRegiao(valorRegiao);
        const modeloOfertaDetectado = extrairModeloOferta(linha);

        // Valida se a linha atende aos filtros de Região e Modelo
        const atendeRegiao = regiaoSelecionada === "" || regiaoFormatada === regiaoSelecionada;
        const atendeModelo = verificarCompatibilidadeModelo(modeloSelecionado, modeloOfertaDetectado);

        if (atendeRegiao && atendeModelo && estadoFormatadoUF && estadoFormatadoUF !== 'Outros') {
            estadosDisponiveis.push(estadoFormatadoUF);
        }
    }

    estadosDisponiveis = [...new Set(estadosDisponiveis)].sort();

    // Reconstrói o HTML do seletor de estados dinamicamente
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
// 7. FILTRAGEM INTELIGENTE DINÂMICA DO SELETOR DE MODELOS DE OFERTA
// ==========================================
function atualizarFiltroModelos() {
    const filtroRegiao = document.getElementById('filtroRegiao');
    const filtroEstado = document.getElementById('filtroEstado');
    const filtroModelo = document.getElementById('filtroModelo');
    
    if (!filtroRegiao || !filtroEstado || !filtroModelo) return;

    const regiaoSelecionada = filtroRegiao.value;
    const estadoSelecionado = filtroEstado.value;
    const modeloAtual = filtroModelo.value;

    let modelosDisponiveis = new Set();

    for (let i = 1; i < DADOS_PLANILHA_ORIGINAL.length; i++) {
        const linha = DADOS_PLANILHA_ORIGINAL[i];
        if (!linha || linha.length === 0 || (linha.length === 1 && linha[0] === "")) continue;

        const valorRegiao = COLUNAS_INDICES.regiao !== -1 ? linha[COLUNAS_INDICES.regiao] || "" : "";
        const valorEstado = COLUNAS_INDICES.estado !== -1 ? linha[COLUNAS_INDICES.estado] || "" : "";

        const estadoFormatadoUF = mapearNomeEstado(valorEstado);
        const regiaoFormatada = mapearNomeRegiao(valorRegiao);
        const modeloOfertaDetectado = extrairModeloOferta(linha);

        // Valida se atende à região e estado selecionados
        const atendeRegiao = regiaoSelecionada === "" || regiaoFormatada === regiaoSelecionada;
        const atendeEstado = estadoSelecionado === "" || estadoFormatadoUF === estadoSelecionado;

        if (atendeRegiao && atendeEstado && modeloOfertaDetectado !== "Sem Oferta") {
            if (modeloOfertaDetectado.toUpperCase().includes("EAD") && !modeloOfertaDetectado.toLowerCase().includes("semi")) {
                modelosDisponiveis.add("EAD");
            }
            if (modeloOfertaDetectado.toLowerCase().includes("semi")) {
                modelosDisponiveis.add("SEMI");
            }
        }
    }

    // Reconstrói o HTML do seletor de Modelos de Oferta dinamicamente
    filtroModelo.innerHTML = '<option value="">Todos os Modelos de Oferta</option>';
    
    if (modelosDisponiveis.has("EAD")) {
        const option = document.createElement('option');
        option.value = "EAD";
        option.textContent = "EAD";
        filtroModelo.appendChild(option);
    }
    if (modelosDisponiveis.has("SEMI")) {
        const option = document.createElement('option');
        option.value = "SEMI";
        option.textContent = "Semipresencial";
        filtroModelo.appendChild(option);
    }

    // Re-seleciona o valor caso ele ainda seja uma opção válida
    if (modelosDisponiveis.has(modeloAtual)) {
        filtroModelo.value = modeloAtual;
    }
}


// ==========================================
// 8. FUNÇÕES AUXILIARES DE TRATAMENTO DE MODELO DE OFERTA
// ==========================================
function extrairModeloOferta(linha) {
    let modeloOfertaDetectado = "Sem Oferta";
    linha.forEach((celula, idx) => {
        if (idx !== COLUNAS_INDICES.nome && idx !== COLUNAS_INDICES.regiao && idx !== COLUNAS_INDICES.estado) {
            const valorLimpo = celula.replace(/^"|"$/g, '').trim();
            const valorMinusculo = valorLimpo.toLowerCase();
            
            if (valorMinusculo.includes('oferta') && !valorMinusculo.startsWith('sem')) {
                const jaETemComplexo = modeloOfertaDetectado.toLowerCase().includes('semi') || modeloOfertaDetectado.toLowerCase().includes('presencial');
                if (jaETemComplexo && !valorMinusculo.includes('semi') && !valorMinusculo.includes('presencial')) return; 
                
                if (valorMinusculo.includes('semi')) {
                    modeloOfertaDetectado = "Oferta Semipresencial";
                } else {
                    modeloOfertaDetectado = valorLimpo;
                }
            }
        }
    });
    return modeloOfertaDetectado;
}

function verificarCompatibilidadeModelo(filtroSelecionado, modeloDetectado) {
    if (filtroSelecionado === "") return true;
    if (filtroSelecionado === "EAD") {
        return modeloDetectado.toUpperCase().includes("EAD") && !modeloDetectado.toLowerCase().includes("semi");
    }
    if (filtroSelecionado === "SEMI") {
        return modeloDetectado.toLowerCase().includes("semi");
    }
    return false;
}


// ==========================================
// 9. MONTAGEM DA ESTRUTURA VISUAL DA TABELA (CABEÇALHO)
// ==========================================
function montarCabecalhoTabela() {
    const tr = document.getElementById('cabecalhoTabela');
    if (!tr) return;
    tr.innerHTML = '';
    
    const colunasExibidas = ["Nome", "Região", "Estado", "Modelo de Oferta"];
    
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
    const valorFiltroModelo = document.getElementById('filtroModelo')?.value || "";

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
        const modeloOfertaDetectado = extrairModeloOferta(ChatLinha);

        const atendeRegiao = valorFiltroRegiao === "" || regiaoFormatada === valorFiltroRegiao;
        const atendeEstado = valorFiltroEstado === "" || estadoFormatado === valorFiltroEstado;
        const atendeModelo = verificarCompatibilidadeModelo(valorFiltroModelo, modeloOfertaDetectado);

        if (atendeRegiao && atendeEstado && atendeModelo) {
            if (contagemEstados[estadoFormatado] !== undefined) contagemEstados[estadoFormatado]++;
            if (contagemRegioes[regiaoFormatada] !== undefined) contagemRegioes[regiaoFormatada]++;

            if (tbody) {
                const tr = document.createElement('tr');
                
                const dadosExibicao = [
                    valorNome.replace(/^"|"$/g, '').trim(),
                    valorRegiao.replace(/^"|"$/g, '').trim(),
                    estadoFormatado,
                    modeloOfertaDetectado
                ];

                dadosExibicao.forEach((texto, index) => {
                    const td = document.createElement('td');
                    td.className = "py-2 text-truncate";
                    td.style.maxWidth = "220px";
                    td.textContent = texto;

                    if (index === 3) {
                        td.className += " fw-semibold";
                        td.style.color = texto === "Sem Oferta" ? "#64748b" : "#10b981";
                    }

                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            }
            linhasFiltradasParaTabela++;
        }
    }

    if (linhasFiltradasParaTabela === 0 && tbody) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">Nenhum polo encontrado para os filtros selecionados.</td></tr>`;
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
    const ctx = document.getElementById('graficoRegioes').getContext('2d');
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
                backgroundColor: '#10b981',
                borderRadius: 6,
                barThickness: 34
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
                x: { grid: { display: false }, ticks: { color: '#1e293b', font: { weight: '600' } } }
            }
        }
    });
}


// ==========================================
// 15. PLOTAGEM E RENDERIZAÇÃO DOS PONTOS DO MAPA (LEAFLET)
// ==========================================
function inicializarMapa(dados) {
    const container = L.DomUtil.get('mapaPolos');
    if (container != null) { container._leaflet_id = null; }

    const mapa = L.map('mapaPolos').setView([-14.235, -51.925], 4);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap | © CartoDB'
    }).addTo(mapa);

    Object.keys(dados).forEach(uf => {
        const total = dados[uf];
        const coordenadas = coordenadasEstados[uf];

        if (total > 0 && coordenadas) {
            const raioProporcional = Math.max(total * 2500, 25000); 

            L.circle(coordenadas, {
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.5,
                weight: 2,
                radius: raioProporcional
            })
            .addTo(mapa)
            .bindPopup(`<div style="font-family: 'Inter', sans-serif; color: #1e293b;">
                            <b style="font-size: 14px;">Estado: ${uf}</b><br>
                            <span style="font-size: 13px; color: #10b981; font-weight: 600;">${total} Polos Ativos</span>
                        </div>`);
        }
    });
}


// ==========================================
// 16. COMPORTAMENTO DE ATALHOS GLOBAIS (RESET COM ESC)
// ==========================================
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
        
        const filtroRegiao = document.getElementById('filtroRegiao');
        const filtroEstado = document.getElementById('filtroEstado');
        const filtroModelo = document.getElementById('filtroModelo');

        // Reseta todos os seletores para a opção nula padrão
        if (filtroRegiao) filtroRegiao.value = "";
        if (filtroEstado) filtroEstado.value = "";
        if (filtroModelo) filtroModelo.value = "";

        // Redescreve as listas completas e limpa os gráficos
        atualizarFiltroRegioes();
        atualizarFiltroEstados();
        atualizarFiltroModelos(); // Adicionado no reset
        processarEFiltarDados();
    }
});