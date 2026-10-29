// ==========================================
// MENU NO CELULAR / TABLET
// Em telas até 1024px a sidebar vira uma gaveta que abre pelo botão ☰ da
// barra superior (a barra só aparece nessas telas, pelo CSS).
// ==========================================
(function criarMenuMobile() {
    const sidebar = document.querySelector('.sidebar');
    const conteudo = document.querySelector('.main-content');
    if (!sidebar || !conteudo) return;

    const barra = document.createElement('div');
    barra.className = 'topbar-mobile';
    barra.innerHTML = `
        <button type="button" class="btn-menu-mobile" aria-label="Abrir menu" aria-expanded="false">
            <i class="fa-solid fa-bars"></i>
        </button>
        <div class="topbar-marca">
            <div class="brand-mark"><i class="fa-solid fa-graduation-cap"></i></div>
            <strong>Visita Virtual</strong>
        </div>
    `;
    conteudo.prepend(barra);

    const fundo = document.createElement('div');
    fundo.className = 'menu-mobile-fundo';
    document.body.appendChild(fundo);

    const botao = barra.querySelector('.btn-menu-mobile');

    const definirAberto = (aberto) => {
        document.body.classList.toggle('menu-aberto', aberto);
        botao.setAttribute('aria-expanded', aberto);
        botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    };

    botao.addEventListener('click', () => definirAberto(!document.body.classList.contains('menu-aberto')));
    fundo.addEventListener('click', () => definirAberto(false));

    // Escolher um item do menu fecha a gaveta
    sidebar.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) definirAberto(false);
    });

    // ESC com o menu aberto só fecha o menu (sem limpar os filtros da página)
    window.addEventListener('keydown', (event) => {
        if ((event.key === 'Escape' || event.key === 'Esc') && document.body.classList.contains('menu-aberto')) {
            event.stopPropagation();
            definirAberto(false);
        }
    }, true);

    // Se a tela crescer (ex.: girar o tablet), a gaveta deixa de existir
    window.matchMedia('(min-width: 1025px)').addEventListener('change', (mq) => {
        if (mq.matches) definirAberto(false);
    });
})();
