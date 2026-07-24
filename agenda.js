let calendar;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxgR-h-o_guzYdyA5kpmxXGNkwdK7t8QowPn5FHwS0K4yvuxbpVTQXMA8BB6aQFqauO/exec';

// Inicialização do Calendário e Ouvintes de Evento
document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar-full');
    
    if (calendarEl) {
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'pt-br',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth'
            },
            selectable: true,
            select: function(info) {
                abrirEditor(null, info.startStr);
            },
            eventClick: function(info) {
                abrirEditor(info.event);
            },
            events: function(fetchInfo, successCallback, failureCallback) {
                fetch(APPS_SCRIPT_URL)
                    .then(response => response.json())
                    .then(data => successCallback(data))
                    .catch(err => {
                        console.error("Erro ao sincronizar com Google Agenda:", err);
                        failureCallback(err);
                    });
            }
        });
        calendar.render();
    }

    // Vincula os cliques dos botões do Modal sem precisar de 'onclick' inline no HTML
    document.getElementById('btnSalvar').addEventListener('click', salvarVisita);
    document.getElementById('btnCancelar').addEventListener('click', fecharEditor);
    document.getElementById('btnExcluir').addEventListener('click', excluirVisita);
});

// Funções de Gerenciamento do Modal
function abrirEditor(event = null, dataSelecao = null) {
    document.getElementById('modalEditor').style.display = 'flex';
    if (event) {
        document.getElementById('modalTitulo').innerText = "Editar Visita";
        document.getElementById('eventID').value = event.id;
        document.getElementById('inputTitulo').value = event.title;
        document.getElementById('inputData').value = event.startStr;
        document.getElementById('btnExcluir').style.display = 'block';
    } else {
        document.getElementById('modalTitulo').innerText = "Agendar Nova Visita";
        document.getElementById('eventID').value = "";
        document.getElementById('inputTitulo').value = "";
        document.getElementById('inputData').value = dataSelecao;
        document.getElementById('btnExcluir').style.display = 'none';
    }
}

function fecharEditor() {
    document.getElementById('modalEditor').style.display = 'none';
    if (calendar) calendar.unselect();
}

function salvarVisita() {
    const id = document.getElementById('eventID').value;
    const title = document.getElementById('inputTitulo').value;
    const start = document.getElementById('inputData').value;

    if (!title || !start) return alert("Por favor, preencha todos os campos!");

    const action = id ? 'update' : 'create';

    const payload = new URLSearchParams();
    payload.append('action', action);
    payload.append('id', id);
    payload.append('title', title);
    payload.append('start', start);

    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: payload
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            fecharEditor();
            if (calendar) calendar.refetchEvents();
        } else {
            alert("Erro do Google Agenda: " + (res.error || "Tente novamente."));
        }
    })
    .catch(err => {
        console.error("Erro na chamada:", err);
        alert("Erro na comunicação com o servidor da Google.");
    });
}

function excluirVisita() {
    const id = document.getElementById('eventID').value;
    if (!id) return;

    if (confirm("Tem certeza absoluta que deseja remover este agendamento de visita?")) {
        const payload = new URLSearchParams();
        payload.append('action', 'delete');
        payload.append('id', id);

        fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: payload
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                fecharEditor();
                if (calendar) calendar.refetchEvents();
            } else {
                alert("Erro ao excluir o evento.");
            }
        })
        .catch(err => {
            console.error("Erro na chamada:", err);
            alert("Erro na comunicação com o servidor da Google.");
        });
    }
}