// =========================================================================
// CONSULTA DAS VISITAS (somente leitura, sem login)
// Usa a mesma planilha, os mesmos dados do Firebase e o mesmo relatório da
// Lista de Polos (polos-base.js e relatorio.js). Aqui nada pode ser editado.
// =========================================================================

let regiaoAtual = 'TODAS';          // 'TODAS' mostra a visão geral das regiões
let filtroStatusConsulta = 'todos'; // 'todos' | 'visitados' | 'pendentes'
let buscaConsulta = '';

const conteudoConsulta = document.getElementById('consulta-conteudo');
const abasRegioes = document.getElementById('regiao-abas');
const inputBuscaConsulta = document.getElementById('consulta-busca');

document.addEventListener('DOMContentLoaded', async () => {
    sincronizarVisitasDoFirebase();
    await carregarPolosDaPlanilha();

    inputBuscaConsulta.addEventListener('input', () => {
        buscaConsulta = inputBuscaConsulta.value;
        desenharConteudo();
    });

    document.getElementById('consulta-btn-relatorio')
        .addEventListener('click', () => gerarRelatorioPorRegiao(regiaoAtual));

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' && event.key !== 'Esc') return;
        if (fecharPreviaRelatorio()) return;
        // Com o detalhe de um polo aberto, o ESC só fecha o detalhe
        if (Swal.isVisible()) return;

        // Sem janelas abertas, o ESC limpa todos os filtros: busca, status e região
        limparFiltrosConsulta();
    });

    // Cliques nas abas, nos cartões de região, nos filtros e nos polos
    document.addEventListener('click', (event) => {
        const regiao = event.target.closest('[data-regiao]');
        if (regiao) {
            // Clicar de novo na região já escolhida limpa os filtros (igual ao ESC)
            if (regiao.dataset.regiao === regiaoAtual && regiaoAtual !== 'TODAS') {
                limparFiltrosConsulta();
            } else {
                selecionarRegiao(regiao.dataset.regiao);
            }
            return;
        }
        const status = event.target.closest('[data-status]');
        if (status) {
            filtroStatusConsulta = status.dataset.status;
            desenharConteudo();
            return;
        }
        const polo = event.target.closest('[data-polo]');
        if (polo) abrirDetalhePolo(polo.dataset.polo);
    });
});

// =========================================================================
// CARREGAMENTO DOS DADOS
// =========================================================================
function sincronizarVisitasDoFirebase() {
    if (!window.database) return;

    window.database.ref('polos').on('value', (snapshot) => {
        cachePolosFirebase = snapshot.val() || {};
        desenharConsulta();
    }, (erro) => {
        console.error('Erro ao ler as visitas no Firebase:', erro);
    });
}

async function carregarPolosDaPlanilha() {
    try {
        const resposta = await fetch(SPREADSHEET_URL);
        if (!resposta.ok) throw new Error(`Erro na planilha: ${resposta.status}`);
        database = processarCsvProfissional(await resposta.text());
        desenharConsulta();
    } catch (erro) {
        console.error(erro);
        conteudoConsulta.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Não foi possível carregar os polos. Verifique a internet e recarregue a página.
            </div>`;
    }
}

// =========================================================================
// CÁLCULOS
// =========================================================================
function resumoDosPolos(polos) {
    const visitados = polos.filter(p => isPoloConcluido(p.Nome)).length;
    return {
        total: polos.length,
        visitados,
        pendentes: polos.length - visitados,
        cobertura: polos.length ? Math.round((visitados / polos.length) * 100) : 0
    };
}

function regioesDaPlanilha() {
    const regioes = [...new Set(database.map(p => p.Regiao).filter(Boolean))];
    return regioes.sort((a, b) => {
        const ia = ORDEM_REGIOES.indexOf(a), ib = ORDEM_REGIOES.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
}

function polosDaRegiaoAtual() {
    return regiaoAtual === 'TODAS' ? database : database.filter(p => p.Regiao === regiaoAtual);
}

// =========================================================================
// DESENHO DA TELA
// =========================================================================
function limparFiltrosConsulta() {
    inputBuscaConsulta.value = '';
    inputBuscaConsulta.blur();
    buscaConsulta = '';
    selecionarRegiao('TODAS');
}

function selecionarRegiao(regiao) {
    regiaoAtual = regiao;
    filtroStatusConsulta = 'todos';
    desenharConsulta();
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function desenharConsulta() {
    if (database.length === 0) return;
    desenharIndicadores();
    desenharAbas();
    desenharConteudo();
}

function desenharIndicadores() {
    const resumo = resumoDosPolos(polosDaRegiaoAtual());
    document.getElementById('consulta-total').textContent = resumo.total;
    document.getElementById('consulta-visitados').textContent = resumo.visitados;
    document.getElementById('consulta-pendentes').textContent = resumo.pendentes;
    document.getElementById('consulta-cobertura').textContent = `${resumo.cobertura}%`;
    document.getElementById('consulta-barra').style.width = `${resumo.cobertura}%`;
}

function desenharAbas() {
    const abas = [{ valor: 'TODAS', nome: 'Todas as regiões', cobertura: resumoDosPolos(database).cobertura }]
        .concat(regioesDaPlanilha().map(regiao => ({
            valor: regiao,
            nome: regiao,
            cobertura: resumoDosPolos(database.filter(p => p.Regiao === regiao)).cobertura
        })));

    abasRegioes.innerHTML = abas.map(aba => `
        <button type="button" role="tab" class="regiao-aba${aba.valor === regiaoAtual ? ' ativa' : ''}"
                data-regiao="${escaparHtml(aba.valor)}" aria-selected="${aba.valor === regiaoAtual}">
            ${escaparHtml(aba.nome)}
            <span>${aba.cobertura}%</span>
        </button>`).join('');
}

function desenharConteudo() {
    if (database.length === 0) return;

    // Na visão geral, digitar na busca já procura em todas as regiões
    if (regiaoAtual === 'TODAS' && !buscaConsulta.trim()) {
        desenharVisaoGeral();
    } else {
        desenharListaDePolos(polosDaRegiaoAtual());
    }
}

// Cartões com o andamento de cada região
function desenharVisaoGeral() {
    const cartoes = regioesDaPlanilha().map(regiao => {
        const polos = database.filter(p => p.Regiao === regiao);
        const resumo = resumoDosPolos(polos);
        const estados = new Set(polos.map(p => p.Estado)).size;
        const sigla = siglaDaRegiao(regiao);

        return `
            <button type="button" class="regiao-card" data-regiao="${escaparHtml(regiao)}">
                <div class="regiao-card-topo">
                    <span class="regiao-sigla">${sigla ? escaparHtml(sigla) : '<i class="fa-solid fa-globe"></i>'}</span>
                    <div>
                        <strong>${escaparHtml(regiao)}</strong>
                        <small>${estados} ${estados === 1 ? 'estado' : 'estados'} · ${resumo.total} polos</small>
                    </div>
                </div>

                <div class="regiao-anel" style="--pct: ${resumo.cobertura}">
                    <span>${resumo.cobertura}%</span>
                    <small>cobertura</small>
                </div>

                <div class="regiao-card-numeros">
                    <div class="ok"><strong>${resumo.visitados}</strong> visitados</div>
                    <div class="pend"><strong>${resumo.pendentes}</strong> pendentes</div>
                </div>

                <span class="regiao-card-link">Ver polos da região <i class="fa-solid fa-arrow-right"></i></span>
            </button>`;
    }).join('');

    conteudoConsulta.innerHTML = `<div class="regioes-grid">${cartoes}</div>`;
}

// Polos agrupados por estado, com filtro de status e busca
function desenharListaDePolos(polosBase) {
    const termo = normalizarTexto(buscaConsulta).trim();
    const polosBuscados = termo
        ? polosBase.filter(p => normalizarTexto(`${p.Nome} ${p.Estado} ${siglaDoEstado(p.Estado)}`).includes(termo))
        : polosBase;

    const resumo = resumoDosPolos(polosBuscados);
    const polos = polosBuscados.filter(p => {
        if (filtroStatusConsulta === 'visitados') return isPoloConcluido(p.Nome);
        if (filtroStatusConsulta === 'pendentes') return !isPoloConcluido(p.Nome);
        return true;
    });

    const filtros = [
        { valor: 'todos', nome: 'Todos', total: resumo.total },
        { valor: 'visitados', nome: 'Visitados', total: resumo.visitados },
        { valor: 'pendentes', nome: 'Pendentes', total: resumo.pendentes }
    ].map(f => `
        <button type="button" class="status-filtro ${f.valor}${f.valor === filtroStatusConsulta ? ' ativo' : ''}" data-status="${f.valor}">
            ${f.nome} <span>${f.total}</span>
        </button>`).join('');

    const titulo = regiaoAtual === 'TODAS' ? 'Resultado da busca em todas as regiões' : `Polos da região ${escaparHtml(regiaoAtual)}`;

    // Agrupa por estado, em ordem alfabética
    const porEstado = {};
    polos.forEach(p => { (porEstado[p.Estado] = porEstado[p.Estado] || []).push(p); });

    const blocos = Object.keys(porEstado).sort((a, b) => a.localeCompare(b)).map(estado => {
        const polosEstado = porEstado[estado].slice().sort((a, b) => a.Nome.localeCompare(b.Nome));
        // O andamento do estado considera todos os polos dele, não só os filtrados
        const resumoEstado = resumoDosPolos(polosBase.filter(p => p.Estado === estado));
        const sigla = siglaDoEstado(estado);

        const cartoes = polosEstado.map(polo => {
            const visitado = isPoloConcluido(polo.Nome);
            return `
                <button type="button" class="polo-card ${visitado ? 'visitado' : 'pendente'}" data-polo="${escaparHtml(polo.Nome)}">
                    <span class="polo-card-nome">${escaparHtml(polo.Nome)}</span>
                    ${visitado
                        ? '<span class="status-pill done"><i class="fa-solid fa-circle-check"></i> Visitado</span>'
                        : '<span class="status-pill pending"><i class="fa-regular fa-clock"></i> Pendente</span>'}
                </button>`;
        }).join('');

        return `
            <div class="estado-bloco">
                <div class="estado-cabecalho">
                    <span class="regiao-sigla pequena">${sigla ? escaparHtml(sigla) : '<i class="fa-solid fa-globe"></i>'}</span>
                    <strong>${escaparHtml(estado)}</strong>
                    <div class="estado-progresso">
                        <div class="progress-track"><div class="progress-fill" style="width: ${resumoEstado.cobertura}%"></div></div>
                        <small>${resumoEstado.visitados} de ${resumoEstado.total} visitados</small>
                    </div>
                </div>
                <div class="polos-grid">${cartoes}</div>
            </div>`;
    }).join('');

    conteudoConsulta.innerHTML = `
        <div class="consulta-painel">
            <div class="consulta-painel-topo">
                <h2>${titulo}</h2>
                <div class="status-filtros">${filtros}</div>
            </div>
            ${blocos || `
                <div class="empty-state">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    Nenhum polo encontrado${termo ? ` para "${escaparHtml(buscaConsulta.trim())}"` : ''}.
                </div>`}
        </div>`;
}

// =========================================================================
// DETALHE DO POLO (somente leitura)
// =========================================================================
function abrirDetalhePolo(nomePolo) {
    const polo = database.find(p => p.Nome === nomePolo);
    if (!polo) return;

    const dados = obterDadosPolo(nomePolo) || {};
    const visitado = isPoloConcluido(nomePolo);

    const ambientes = AMBIENTES_POLO.map(amb => {
        const possui = !!dados[amb.chave];
        const nota = dados[`note_${amb.chave}`];
        return `
            <li class="${possui ? 'possui' : 'nao-possui'}">
                <div class="ambiente-linha">
                    <i class="fa-solid ${amb.icone}"></i>
                    <span>${escaparHtml(amb.nome)}</span>
                    <em>${possui ? '<i class="fa-solid fa-check"></i> Possui' : '<i class="fa-solid fa-xmark"></i> Não informado'}</em>
                </div>
                ${possui && nota && nota.trim() ? `<p>${escaparHtml(nota)}</p>` : ''}
            </li>`;
    }).join('');

    const anotacoes = dados.anotacoes && dados.anotacoes.trim()
        ? `<p class="detalhe-anotacoes">${escaparHtml(dados.anotacoes)}</p>`
        : '<p class="detalhe-vazio">Nenhuma anotação registrada.</p>';

    Swal.fire({
        title: escaparHtml(polo.Nome),
        width: 640,
        showCloseButton: true,
        confirmButtonText: 'Fechar',
        confirmButtonColor: '#2563eb',
        customClass: { popup: 'detalhe-polo-popup' },
        html: `
            <div class="detalhe-polo">
                <div class="detalhe-tags">
                    <span class="uf-tag">${escaparHtml(polo.Estado)}</span>
                    <span class="uf-tag">${escaparHtml(polo.Regiao)}</span>
                    ${visitado
                        ? '<span class="status-pill done"><i class="fa-solid fa-circle-check"></i> Visitado</span>'
                        : '<span class="status-pill pending"><i class="fa-regular fa-clock"></i> Pendente</span>'}
                </div>
                ${visitado ? `
                    <h4>Ambientes</h4>
                    <ul class="detalhe-ambientes">${ambientes}</ul>
                    <h4>Anotações gerais</h4>
                    ${anotacoes}
                ` : '<p class="detalhe-vazio">Este polo ainda não foi visitado.</p>'}
            </div>`
    });
}
