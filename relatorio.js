// =========================================================================
// RELATÓRIO POR REGIÃO (Atingidos, Pendentes e Pontos de Atenção)
// Compartilhado pela Lista de Polos e pela Consulta. Depende do polos-base.js.
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

// regiaoFiltro: 'TODAS' (ou vazio) gera de todas as regiões; um nome gera só daquela região
function gerarRelatorioPorRegiao(regiaoFiltro = 'TODAS') {
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

    const filtroRegiaoAtivo = !!regiaoFiltro && regiaoFiltro !== 'TODAS' && !regiaoFiltro.includes('Todas');
    const polosBase = filtroRegiaoAtivo
        ? database.filter(p => p.Regiao === regiaoFiltro)
        : database;

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

        // Cada região (a partir da segunda) começa em uma nova página do PDF
        if (htmlRegioes) htmlRegioes += '<div class="html2pdf__page-break"></div>';

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

                <h3 class="alerta"><i class="fa-solid fa-triangle-exclamation"></i> Pontos de atenção (${pontosAtencao.length})</h3>
                ${htmlAtencao || `<p class="vazio">${feitos.length ? 'Nenhum ponto de atenção identificado nos polos visitados desta região.' : 'Nenhum polo visitado nesta região ainda.'}</p>`}

                <div class="colunas">
                    <div>
                        <h3 class="ok"><i class="fa-solid fa-circle-check"></i> Polos feitos (${feitos.length})</h3>
                        ${listaPolos(feitos)}
                    </div>
                    <div>
                        <h3 class="pend"><i class="fa-regular fa-clock"></i> Polos pendentes (${pendentes.length})</h3>
                        ${listaPolos(pendentes)}
                    </div>
                </div>
            </section>`;
    });

    const percentualGeral = totalGeral ? Math.round((totalAtingidos / totalGeral) * 100) : 0;
    const dataEmissao = new Date().toLocaleString('pt-BR');

    const dataArquivo = new Date().toLocaleDateString('pt-BR').split('/').reverse().join('-');
    const nomeArquivo = `relatorio-visitas-polos-${normalizarTexto(filtroRegiaoAtivo ? regiaoFiltro : 'todas as regioes').replace(/[^a-z0-9]+/g, '-')}-${dataArquivo}.pdf`;

    abrirPreviaRelatorio(`
        <div class="rel-topo">
            <div class="rel-marca">Visita Virtual · Polos UniFECAF</div>
            <h1>Relatório de Visitas aos Polos por Região</h1>
            <div class="rel-sub">Emitido em ${dataEmissao}${filtroRegiaoAtivo ? ` · Região: ${escaparHtml(regiaoFiltro)}` : ''}</div>
        </div>

        <h2>Resumo Geral</h2>
        <table>
            <thead><tr><th>Região</th><th>Total de Polos</th><th>Atingidos</th><th>Pendentes</th><th>Cobertura</th><th>Polos com Pontos de Atenção</th></tr></thead>
            <tbody>${htmlResumo}</tbody>
            <tfoot><tr><td>Total</td><td>${totalGeral}</td><td>${totalAtingidos}</td><td>${totalGeral - totalAtingidos}</td><td>${percentualGeral}%</td><td>${totalAtencao}</td></tr></tfoot>
        </table>

        ${htmlRegioes}
    `, nomeArquivo);
}

// Mostra o relatório em uma janela dentro do próprio sistema, com o botão de baixar PDF
function abrirPreviaRelatorio(htmlConteudo, nomeArquivo) {
    fecharPreviaRelatorio();

    const overlay = document.createElement('div');
    overlay.id = 'relatorio-overlay';
    overlay.className = 'relatorio-overlay';
    overlay.innerHTML = `
        <div class="relatorio-modal" role="dialog" aria-modal="true" aria-labelledby="relatorio-modal-titulo">
            <div class="relatorio-toolbar">
                <div class="relatorio-toolbar-titulo">
                    <div class="relatorio-toolbar-icone"><i class="fa-solid fa-file-lines"></i></div>
                    <div>
                        <strong id="relatorio-modal-titulo">Prévia do Relatório</strong>
                        <span>Confira o conteúdo e baixe em PDF</span>
                    </div>
                </div>
                <div class="relatorio-toolbar-acoes">
                    <button type="button" class="btn-baixar-pdf">
                        <i class="fa-solid fa-file-arrow-down"></i> <span>Baixar PDF</span>
                    </button>
                    <button type="button" class="btn-fechar-previa" title="Fechar (Esc)">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div class="relatorio-scroll">
                <div class="relatorio-doc">${htmlConteudo}</div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('previa-aberta');

    const btnBaixar = overlay.querySelector('.btn-baixar-pdf');
    btnBaixar.addEventListener('click', () => baixarRelatorioPdf(overlay.querySelector('.relatorio-doc'), nomeArquivo, btnBaixar));
    overlay.querySelector('.btn-fechar-previa').addEventListener('click', fecharPreviaRelatorio);
    // Clicar no fundo escuro, fora da janela, também fecha
    overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) fecharPreviaRelatorio();
    });
}

// Retorna true se havia uma prévia aberta (usado pelo ESC)
function fecharPreviaRelatorio() {
    const overlay = document.getElementById('relatorio-overlay');
    if (!overlay) return false;
    overlay.remove();
    document.body.classList.remove('previa-aberta');
    return true;
}

// Gera o arquivo PDF a partir da prévia e baixa direto, sem passar pela impressora
async function baixarRelatorioPdf(elemento, nomeArquivo, botao) {
    if (typeof html2pdf === 'undefined') {
        Swal.fire('Não foi possível gerar o PDF', 'O gerador de PDF não carregou. Verifique a internet e recarregue a página.', 'error');
        return;
    }

    const conteudoBotao = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Gerando PDF...</span>';
    elemento.classList.add('gerando-pdf');

    try {
        await html2pdf().set({
            margin: [10, 0, 12, 0],
            filename: nomeArquivo,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['.atencao', '.kpis', 'tr', 'li', 'h2', 'h3'] }
        }).from(elemento).save();
    } catch (erro) {
        console.error('Erro ao gerar o PDF do relatório:', erro);
        Swal.fire('Não foi possível gerar o PDF', 'Tente novamente em alguns instantes.', 'error');
    } finally {
        elemento.classList.remove('gerando-pdf');
        botao.disabled = false;
        botao.innerHTML = conteudoBotao;
    }
}
