// =========================================================================
// BASE COMPARTILHADA DOS POLOS (usada pela Lista de Polos e pela Consulta)
// Planilha de polos, dados das visitas no Firebase e status de cada polo
// =========================================================================
const SPREADSHEET_ID = '1km9rpUas9U3V4zqRqCp4AxxR_srUphtlckBuGRF7lqQ';
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;

let database = [];
let cachePolosFirebase = {}; // Armazena o estado do Firebase em tempo real

// Ambientes avaliados em cada polo (chave usada no Firebase, nome exibido e ícone)
const AMBIENTES_POLO = [
    { chave: 'recepcao', nome: 'Recepção', icone: 'fa-bell-concierge' },
    { chave: 'coordenacao', nome: 'Sala de Coordenação', icone: 'fa-user-tie' },
    { chave: 'estudos', nome: 'Sala de Estudos', icone: 'fa-book-open' },
    { chave: 'informatica', nome: 'Laboratório de Informática', icone: 'fa-computer' },
    { chave: 'especializado', nome: 'Laboratório Especializado', icone: 'fa-flask' },
    { chave: 'outros', nome: 'Outros', icone: 'fa-ellipsis' }
];

const ORDEM_REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul', 'Estrangeiro'];

const SIGLAS_ESTADOS = {
    'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
    'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
    'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
    'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
    'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
    'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
    'sergipe': 'SE', 'tocantins': 'TO'
};

const SIGLAS_REGIOES = {
    'norte': 'N', 'nordeste': 'NE', 'centro-oeste': 'CO', 'sudeste': 'SE', 'sul': 'S'
};

// normalizarTexto vem do relatorio.js (as duas páginas carregam os dois arquivos)
function siglaDoEstado(nome) {
    return SIGLAS_ESTADOS[normalizarTexto(nome).trim()] || '';
}

function siglaDaRegiao(nome) {
    return SIGLAS_REGIOES[normalizarTexto(nome).trim()] || '';
}

// Função utilitária para transformar o nome do polo em uma chave válida no Firebase
function sanitizarChavePolo(nomePolo) {
    if (!nomePolo) return '';
    return nomePolo.replace(/[.#$\[\]\/]/g, "_").trim();
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
// LEITURA DO CSV DA PLANILHA
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

function processarCsvProfissional(text) {
    const lines = processarLinhasCSV(text);
    if (lines.length === 0) return [];

    const headers = lines[0].map(h => h.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());

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
