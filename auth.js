// ==========================================
// TRAVA DE ACESSO DAS PÁGINAS INTERNAS (Lista de Polos e Dashboard)
// ==========================================
// O login (login.html) só grava 'painel_polos_logado' depois que a pessoa
// entrou no Firebase Authentication e já trocou a senha padrão.
(function protegerPagina() {
    if (localStorage.getItem('painel_polos_logado') !== 'true') {
        window.location.replace('login.html');
        return;
    }

    // Confirma com o Firebase que a sessão ainda é válida
    firebase.auth().onAuthStateChanged(usuario => {
        if (!usuario) {
            localStorage.removeItem('painel_polos_logado');
            window.location.replace('login.html');
        }
    });
})();

function sairDoSistema() {
    localStorage.removeItem('painel_polos_logado');
    firebase.auth().signOut().finally(() => {
        window.location.href = 'login.html';
    });
}
