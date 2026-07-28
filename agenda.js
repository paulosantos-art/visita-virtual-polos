let calendar;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzmx0evv1TzZ9uqWBbI6UxlDr8oz02KNDtsELWGjm9J3q1VLLvbvN3mMtWBdyV3XH-O/exec';

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
                fetch('https://script.google.com/macros/s/AKfycbzmx0evv1TzZ9uqWBbI6UxlDr8oz02KNDtsELWGjm9J3q1VLLvbvN3mMtWBdyV3XH-O/exec') 
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

    // Vincula os cliques dos botões do Modal
    document.getElementById('btnSalvar')?.addEventListener('click', salvarVisita);
    document.getElementById('btnCancelar')?.addEventListener('click', fecharEditor);
    document.getElementById('btnExcluir')?.addEventListener('click', excluirVisita);
    
    // Suporte ao botão Sair do Painel
    document.getElementById('btn-sair')?.addEventListener('click', function() {
        localStorage.removeItem('painel_polos_logado');
        window.location.href = 'login.html';
    });
});

// Funções de Gerenciamento do Modal
function abrirEditor(event = null, dataSelecao = null) {
    document.getElementById('modalEditor').style.display = 'flex';
    
    if (event) {
        document.getElementById('modalTitulo').innerText = "Editar Visita";
        document.getElementById('eventID').value = event.id;
        document.getElementById('inputTitulo').value = event.title || '';
        
        // Trata data e horário vindo do FullCalendar / Google Agenda
        if (event.startStr.includes('T')) {
            const [data, hora] = event.startStr.split('T');
            document.getElementById('inputData').value = data;
            document.getElementById('inputHora').value = hora.substring(0, 5);
        } else {
            document.getElementById('inputData').value = event.startStr;
            document.getElementById('inputHora').value = "09:00";
        }

        // Recupera e-mail de convidado caso tenha sido retornado nas propriedades
        const emailConvidado = event.extendedProps ? event.extendedProps.email : '';
        document.getElementById('inputEmail').value = emailConvidado || '';

        document.getElementById('btnExcluir').style.display = 'block';
    } else {
        document.getElementById('modalTitulo').innerText = "Agendar Nova Visita";
        document.getElementById('eventID').value = "";
        document.getElementById('inputTitulo').value = "";
        document.getElementById('inputData').value = dataSelecao || "";
        document.getElementById('inputHora').value = "09:00";
        document.getElementById('inputEmail').value = "";
        document.getElementById('btnExcluir').style.display = 'none';
    }
}

function fecharEditor() {
    document.getElementById('modalEditor').style.display = 'none';
    if (calendar) calendar.unselect();
}

function salvarVisita() {
    const id = document.getElementById('eventID').value;
    const title = document.getElementById('inputTitulo').value.trim();
    const data = document.getElementById('inputData').value;
    const hora = document.getElementById('inputHora').value;
    const email = document.getElementById('inputEmail').value.trim();

    if (!title || !data || !hora) {
        return alert("Por favor, preencha o nome da visita, a data e o horário!");
    }

    // Concatena data e hora no formato ISO (Ex: 2026-07-07T09:00:00)
    const startIso = `${data}T${hora}:00`;
    const action = id ? 'update' : 'create';

    const payload = new URLSearchParams();
    payload.append('action', action);
    payload.append('id', id);
    payload.append('title', title);
    payload.append('start', startIso);
    payload.append('email', email);

    fetch('https://script.google.com/macros/s/AKfycbzmx0evv1TzZ9uqWBbI6UxlDr8oz02KNDtsELWGjm9J3q1VLLvbvN3mMtWBdyV3XH-O/exec', {
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

        fetch('https://script.google.com/macros/s/AKfycbzmx0evv1TzZ9uqWBbI6UxlDr8oz02KNDtsELWGjm9J3q1VLLvbvN3mMtWBdyV3XH-O/exec', {
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
