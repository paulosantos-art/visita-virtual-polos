// ==========================================
// CONFIGURAÇÃO DO FIREBASE (compartilhada por login, lista de polos e dashboard)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAhuaxlZCcWOAXMXI6ntwXEUMUT14gy1QU",
    authDomain: "painel-polos.firebaseapp.com",
    databaseURL: "https://painel-polos-default-rtdb.firebaseio.com",
    projectId: "painel-polos",
    storageBucket: "painel-polos.firebasestorage.app",
    messagingSenderId: "259211070710",
    appId: "1:259211070710:web:5447694b4bf93bae7630d7",
    measurementId: "G-1LBZG5HYQB"
};

firebase.initializeApp(firebaseConfig);

// O banco só existe nas páginas que carregam o firebase-database-compat.js
window.database = firebase.database ? firebase.database() : null;
