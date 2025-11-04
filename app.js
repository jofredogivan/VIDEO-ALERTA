// ==========================================
// PARTE 1: CONFIGURAÇÃO DO INDEXEDDB
// ==========================================
const DB_NAME = 'CamerasDB';
const DB_VERSION = 2; 
const STORE_NAME = 'clientes';
const STORE_KEY_UPDATE = 'ultimaAtualizacaoDB';
let db;
let statusChart = null; 
let todosClientes = []; 
let clientesExibidos = []; 
let lastView = 'tratativa-view'; 
let lastScrollPosition = 0; 

function abrirDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION); 

        request.onerror = (event) => {
            console.error("Erro ao abrir IndexedDB:", event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }
            db.createObjectStore(STORE_NAME, { keyPath: 'numeroConta' }); 

            if (!db.objectStoreNames.contains(STORE_KEY_UPDATE)) {
                db.createObjectStore(STORE_KEY_UPDATE, { keyPath: 'id' });
            }
        };
    });
}

function buscarCliente(numeroConta) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(numeroConta);
        request.onsuccess = (event) => { resolve(event.target.result); };
        request.onerror = (event) => { reject(event.target.error); };
    });
}

async function salvarCliente(clienteData) {
    return new Promise(async (resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, STORE_KEY_UPDATE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const storeUpdate = transaction.objectStore(STORE_KEY_UPDATE);

        const request = store.put(clienteData); 

        request.onsuccess = () => {
            storeUpdate.put({ id: 'lastUpdate', timestamp: new Date().toISOString() });
            resolve(); 
        };
        request.onerror = (event) => { console.error("Erro ao salvar cliente:", event.target.error); reject(event.target.error); };
    });
}

function listarClientes() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll(); 
        request.onsuccess = (event) => { resolve(event.target.result); };
        request.onerror = (event) => { console.error("Erro ao listar clientes:", event.target.error); reject(event.target.error); };
    });
}

function excluirCliente(numeroConta) {
    return new Promise(async (resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, STORE_KEY_UPDATE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const storeUpdate = transaction.objectStore(STORE_KEY_UPDATE);

        const request = store.delete(numeroConta);

        request.onsuccess = () => {
            storeUpdate.put({ id: 'lastUpdate', timestamp: new Date().toISOString() });
            resolve();
        };
        request.onerror = (event) => { console.error("Erro ao excluir cliente:", event.target.error); reject(event.target.error); };
    });
}


// ==========================================
// PARTE 2: LÓGICA DA INTERFACE (SPA, GRÁFICOS E TABELAS)
// ==========================================

/**
 * Determina o horário de início do turno atual (última troca às 7h ou 19h).
 * @returns {Date} Objeto Date com o início do turno.
 */
function getTurnoStartTime() {
    const now = new Date();
    const currentHour = now.getHours();
    let startTime = new Date(now);

    // Turno da NOITE: 19:00 até 06:59 do dia seguinte
    if (currentHour >= 19) {
        startTime.setHours(19, 0, 0, 0); // Hoje às 19:00
    } 
    // Turno do DIA: 07:00 até 18:59
    else if (currentHour >= 7) {
        startTime.setHours(7, 0, 0, 0); // Hoje às 07:00
    } 
    // Turno da NOITE que começou no dia anterior (00:00 até 06:59)
    else {
        // Volta para o dia anterior, 19:00
        startTime.setDate(startTime.getDate() - 1);
        startTime.setHours(19, 0, 0, 0); 
    }
    return startTime;
}


async function carregarDadosIniciais() {
    todosClientes = await listarClientes();
    
    let statusContagem = { 'OK': 0, 'Parcial': 0, 'Inativa': 0, 'Sem Imagem': 0, 'Cancelada': 0 };
    todosClientes.forEach(cliente => {
        if (statusContagem.hasOwnProperty(cliente.status)) {
            statusContagem[cliente.status]++;
        } 
    });

    renderizarTabelaTratativa(todosClientes);
    desenharGraficos(statusContagem);
    aplicarFiltros(); 
    checkLastUpdate(); 

    // NOVO CÁLCULO: Clientes Atualizados no Turno (baseado em 7h/19h)
    const inicioTurno = getTurnoStartTime();
    
    const clientesAtualizadosTurno = todosClientes.filter(cliente => {
        if (cliente.ultimaAtualizacao) {
            const dataAtualizacao = new Date(cliente.ultimaAtualizacao);
            // Verifica se a atualização ocorreu APÓS o início do turno
            return dataAtualizacao.getTime() >= inicioTurno.getTime();
        }
        return false;
    }).length;


    // Atualiza o resumo do Dashboard 
    const totalClientes = todosClientes.length;
    const tratativaClientes = todosClientes.filter(c => c.necessitaContato && c.status !== 'Cancelada').length;
    
    const summaryHtml = `
        <h5 class="alert-heading">Resumo da Base de Clientes</h5>
        <p class="mb-0">
            <strong>Total de Clientes Monitorados:</strong> ${totalClientes} | 
            <strong>Clientes em Tratativa (Atenção!):</strong> <span class="badge bg-danger">${tratativaClientes}</span>
        </p>
        <hr class="my-2">
        <p class="mb-0">
            <strong>Clientes Atualizados no Turno (Início às ${inicioTurno.toLocaleTimeString('pt-BR')}):</strong> <span class="badge bg-primary">${clientesAtualizadosTurno}</span>
            <small class="text-muted d-block mt-1">Este número mostra as modificações realizadas desde a última troca de plantão (07h ou 19h).</small>
        </p>
    `;
    const summaryElement = document.getElementById('dashboardSummary');
    if (summaryElement) { 
        summaryElement.innerHTML = summaryHtml;
    }
}


/** * Função de Navegação SPA
 * Implementa o retorno inteligente e o salvamento do scroll.
 */
window.showView = function(viewId) {
    // 1. Salva a posição do scroll antes de mudar para o formulário
    if (document.getElementById(viewId).style.display === 'none' && lastView !== 'form-view') {
        lastScrollPosition = window.scrollY;
    }

    document.querySelectorAll('.page-view').forEach(view => {
        view.style.display = 'none';
    });
    
    // 2. Salva a view anterior (se não for a view de formulário)
    if (viewId !== 'form-view') {
        lastView = viewId;
    }

    // Se a view for tratativa ou dashboard, garante que os dados estão carregados
    if (viewId === 'tratativa-view' || viewId === 'dashboard-view') {
        carregarDadosIniciais(); 
    }

    document.getElementById(viewId).style.display = 'block';

    // 3. Restaura o scroll para a última posição salva se voltando para a lista
    if (viewId !== 'form-view' && lastScrollPosition > 0) {
        setTimeout(() => {
            window.scrollTo(0, lastScrollPosition);
        }, 50); // Pequeno delay para renderizar a página
    } else {
         window.scrollTo(0, 0); 
    }
}


function renderizarTabelaClientes(clientesAExibir) {
    clientesExibidos = clientesAExibir; 
    const tbody = document.getElementById('clientListBody');
    tbody.innerHTML = ''; 

    clientesAExibir.forEach(cliente => {
        const row = tbody.insertRow();
        const statusClass = cliente.status.replace(/ /g, '-');
        row.className = `status-${statusClass}`;

        row.insertCell().textContent = cliente.numeroConta;
        row.insertCell().textContent = cliente.nomeCliente; 
        row.insertCell().textContent = cliente.status;
        row.insertCell().textContent = `${cliente.camerasOk || 0} / ${cliente.totalCameras}`; 
        row.insertCell().textContent = cliente.cobranca ? 'SIM' : 'NÃO';
        row.insertCell().textContent = cliente.ultimaAtualizacao ? new Date(cliente.ultimaAtualizacao).toLocaleString() : 'N/A';
        row.insertCell().textContent = cliente.observacoes || '-';
        
        const actionCell = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Editar';
        editBtn.className = 'btn btn-sm edit-btn';
        editBtn.onclick = () => carregarFormularioParaEdicao(cliente); 
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Excluir';
        deleteBtn.className = 'btn btn-sm delete-btn';
        deleteBtn.onclick = () => confirmarExclusao(cliente.numeroConta, cliente.nomeCliente); 

        actionCell.appendChild(editBtn);
        actionCell.appendChild(deleteBtn);
    });
}

function renderizarTabelaTratativa(clientes) {
    const tbody = document.getElementById('tratativaListBody');
    tbody.innerHTML = '';

    const clientesTratativa = clientes.filter(c => c.necessitaContato && c.status !== 'Cancelada');

    if (clientesTratativa.length === 0) {
        const row = tbody.insertRow();
        row.insertCell(0).colSpan = 6;
        row.cells[0].textContent = "🎉 Não há clientes necessitando de Tratativa neste momento!";
        row.cells[0].className = "text-center table-success";
        return;
    } 

    clientesTratativa.forEach(cliente => {
        const row = tbody.insertRow();
        const statusClass = cliente.status.replace(/ /g, '-');
        row.className = `status-${statusClass}`;

        row.insertCell().textContent = `${cliente.numeroConta} - ${cliente.nomeCliente}`; 
        row.insertCell().textContent = cliente.status;
        row.insertCell().textContent = `${cliente.camerasOk || 0} / ${cliente.totalCameras}`; 
        row.insertCell().textContent = cliente.ultimaAtualizacao ? new Date(cliente.ultimaAtualizacao).toLocaleString() : 'N/A';
        row.insertCell().textContent = cliente.observacoes || '-';
        
        const actionCell = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Tratar/Editar';
        editBtn.className = 'btn btn-sm edit-btn';
        editBtn.onclick = () => carregarFormularioParaEdicao(cliente);
        actionCell.appendChild(editBtn);
    });
}

window.aplicarFiltros = function() {
    const termoBusca = document.getElementById('searchText').value.toLowerCase();
    const statusFiltro = document.getElementById('filterStatus').value;

    let clientesFiltrados = todosClientes;

    if (statusFiltro !== 'TODOS') {
        if (statusFiltro === 'Tratativa') {
            clientesFiltrados = clientesFiltrados.filter(cliente => cliente.necessitaContato && cliente.status !== 'Cancelada');
        } else {
            clientesFiltrados = clientesFiltrados.filter(cliente => cliente.status === statusFiltro);
        }
    }

    if (termoBusca) {
        clientesFiltrados = clientesFiltrados.filter(cliente => 
            cliente.nomeCliente.toLowerCase().includes(termoBusca) || 
            cliente.numeroConta.toLowerCase().includes(termoBusca) ||
            cliente.observacoes.toLowerCase().includes(termoBusca)
        );
    }
    
    renderizarTabelaClientes(clientesFiltrados);
};

function confirmarExclusao(numeroConta, nomeCliente) {
    if (confirm(`Tem certeza que deseja EXCLUIR o cliente ${nomeCliente} (Conta: ${numeroConta})? Esta ação é irreversível.`)) {
        excluirCliente(numeroConta).then(() => {
            alert(`Cliente ${nomeCliente} (Conta: ${numeroConta}) excluído com sucesso.`);
            carregarDadosIniciais(); 
        }).catch(e => {
            alert('Erro ao excluir cliente.');
        });
    }
}

// LÓGICA DE SUBMISSÃO
document.getElementById('clientForm').addEventListener('submit', async function(e) {
    e.preventDefault(); 

    // BUG FIX: O campo numeroConta pode estar desabilitado na edição, mas o valor é lido
    const numeroConta = document.getElementById('numeroConta').value.trim(); 
    const nomeCliente = document.getElementById('nomeCliente').value.trim();
    const totalCameras = parseInt(document.getElementById('totalCameras').value);
    const camerasOk = parseInt(document.getElementById('camerasOk').value);

    if (camerasOk > totalCameras) {
        alert("O número de câmeras OK não pode ser maior que o total de câmeras.");
        return;
    }

    const statusAtual = document.getElementById('status').value;
    
    const clienteExistente = await buscarCliente(numeroConta); 
    const isUpdate = !!clienteExistente;

    const clienteData = {
        numeroConta: numeroConta, 
        nomeCliente: nomeCliente, 
        totalCameras: totalCameras,
        camerasOk: camerasOk,
        status: statusAtual,
        cobranca: document.getElementById('cobranca').checked,
        observacoes: document.getElementById('observacoes').value,
        ultimaAtualizacao: new Date().toISOString(), 
        necessitaContato: ['Parcial', 'Inativa', 'Sem Imagem'].includes(statusAtual)
    };

    try {
        await salvarCliente(clienteData);
        
        let successMessage = isUpdate 
            ? `Cliente ${nomeCliente} (Conta: ${numeroConta}) atualizado com sucesso!` 
            : `Novo cliente ${nomeCliente} (Conta: ${numeroConta}) incluído com sucesso!`;

        alert(successMessage);
        
        // RETORNO INTELIGENTE: Volta para a última view visitada (Tratativa ou Dashboard)
        showView(lastView); 
        resetForm();

    } catch (e) {
        alert('Erro ao salvar cliente. Verifique o console para detalhes.');
    }
});


// FUNÇÕES DE UX E EDIÇÃO SEM SCROLL
function resetForm() {
    document.getElementById('clientForm').reset();
    document.getElementById('formTitle').textContent = 'Cadastrar Novo Cliente';
    document.getElementById('saveButton').textContent = 'Salvar Novo Cliente / Atualizar Status';
    document.getElementById('numeroConta').removeAttribute('disabled'); // Habilita o campo de conta
    document.getElementById('cancelEditButton').style.display = 'none';
    lastScrollPosition = 0; // Limpa o scroll ao sair do formulário (para não afetar a próxima navegação)
}

function carregarFormularioParaEdicao(cliente) {
    resetForm();
    
    // Carrega os dados
    document.getElementById('numeroConta').value = cliente.numeroConta;
    document.getElementById('nomeCliente').value = cliente.nomeCliente;
    document.getElementById('totalCameras').value = cliente.totalCameras;
    document.getElementById('camerasOk').value = cliente.camerasOk;
    document.getElementById('status').value = cliente.status;
    document.getElementById('cobranca').checked = cliente.cobranca;
    document.getElementById('observacoes').value = cliente.observacoes;
    
    // Configura a interface para edição
    document.getElementById('numeroConta').setAttribute('disabled', 'true'); // Impede a alteração da CHAVE
    document.getElementById('formTitle').textContent = `Editar/Tratar Cliente: ${cliente.nomeCliente}`;
    document.getElementById('saveButton').textContent = `Atualizar Status de ${cliente.numeroConta}`;
    document.getElementById('cancelEditButton').style.display = 'inline-block'; 

    // Navega para a tela de formulário
    showView('form-view');
}

window.cancelarEdicao = function() {
    resetForm();
    // Volta para a última tela visitada (tratativa-view ou dashboard-view)
    showView(lastView); 
}

function desenharGraficos(statusContagem) {
    const ctx = document.getElementById('statusChartCanvas').getContext('2d');
    
    const labels = ['OK', 'Parcial', 'Inativa', 'Sem Imagem', 'Cancelada'];
    const data = labels.map(label => statusContagem[label] || 0); 
    
    const backgroundColors = [ '#28a745', '#ffc107', '#dc3545', '#007bff', '#6c757d' ];

    if (statusChart) {
        statusChart.destroy();
    }

    statusChart = new Chart(ctx, {
        type: 'pie', 
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: backgroundColors, hoverOffset: 4 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: 'Distribuição do Status dos Clientes', font: { size: 18 } }
            }
        }
    });
}


// ==========================================
// PARTE 3: EXPORTAÇÃO (CSV)
// ==========================================

function download(filename, text) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

const CSV_HEADER = "CONTA;NOME_CLIENTE;STATUS;CAMERAS_OK;TOTAL_CAMERAS;COBRANCA_OS;ULTIMA_ATUALIZACAO;OBSERVACOES\n";

window.gerarRelatorioFiltrado = function(tipo) {
    if (clientesExibidos.length === 0) {
        alert('Não há clientes na lista filtrada para exportar.');
        return;
    }

    if (tipo === 'csv') {
        let csvContent = CSV_HEADER;

        clientesExibidos.forEach(cliente => {
            const dataFormatada = cliente.ultimaAtualizacao ? new Date(cliente.ultimaAtualizacao).toLocaleString() : 'N/A';
            const cobranca = cliente.cobranca ? 'SIM' : 'NÃO';
            const obsLimpa = cliente.observacoes ? cliente.observacoes.replace(/(\r\n|\n|\r)/gm, " ").replace(/;/g, ",").trim() : '';

            const linha = [
                `"${cliente.numeroConta}"`, 
                `"${cliente.nomeCliente}"`, 
                cliente.status, 
                cliente.camerasOk || 0, 
                cliente.totalCameras, 
                cobranca, 
                dataFormatada, 
                `"${obsLimpa}"`
            ].join(';');

            csvContent += linha + '\n';
        });

        const dataHoje = new Date().toISOString().slice(0, 10); 
        const nomeArquivo = `VideoAlerta_Busca_${dataHoje}.csv`;
        download(nomeArquivo, csvContent);
        alert(`Relatório CSV "${nomeArquivo}" gerado!`);
    } else if (tipo === 'pdf') {
         alert('A exportação para PDF está desabilitada no momento. Por favor, use a opção CSV.');
    }
}

window.gerarRelatorioPlantao = async function() {
    const clientes = await listarClientes();
    if (clientes.length === 0) { alert('Não há clientes cadastrados para gerar o relatório.'); return; }

    let csvContent = CSV_HEADER;
    clientes.forEach(cliente => {
        const dataFormatada = cliente.ultimaAtualizacao ? new Date(cliente.ultimaAtualizacao).toLocaleString() : 'N/A';
        const cobranca = cliente.cobranca ? 'SIM' : 'NÃO';
        const obsLimpa = cliente.observacoes ? cliente.observacoes.replace(/(\r\n|\n|\r)/gm, " ").replace(/;/g, ",").trim() : '';
        const linha = [
            `"${cliente.numeroConta}"`, 
            `"${cliente.nomeCliente}"`,
            cliente.status, 
            cliente.camerasOk || 0, 
            cliente.totalCameras, 
            cobranca, 
            dataFormatada, 
            `"${obsLimpa}"`
        ].join(';');
        csvContent += linha + '\n';
    });

    const dataHoje = new Date().toISOString().slice(0, 10); 
    const nomeArquivo = `VideoAlerta_Plantao_MASTER_${dataHoje}.csv`;
    download(nomeArquivo, csvContent);
    alert(`Relatório MASTER CSV "${nomeArquivo}" gerado!`);
}


// ==========================================
// PARTE 4: IMPORTAÇÃO (CSV)
// ==========================================

window.setupImport = function() {
    document.getElementById('csvFile').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            if (confirm("ATENÇÃO: A importação de um CSV irá ATUALIZAR (sobrescrever) clientes existentes com o mesmo Número de Conta e INCLUIR novos clientes. Deseja continuar?")) {
                lerEImportarCSV(file);
            }
            event.target.value = null; 
        }
    });
};

function lerEImportarCSV(file) {
    const reader = new FileReader();

    reader.onload = async (e) => {
        const csvText = e.target.result;
        const clientesImportados = processarCSV(csvText);
        
        let successCount = 0;
        let errorCount = 0;

        for (const cliente of clientesImportados) {
            try {
                await salvarCliente(cliente); 
                successCount++;
            } catch (error) {
                console.error(`Erro ao importar cliente ${cliente.nomeCliente} (Conta: ${cliente.numeroConta}):`, error);
                errorCount++;
            }
        }

        alert(`Importação concluída!\nSucesso: ${successCount} clientes atualizados/inseridos.\nErros: ${errorCount} (Verifique o console para detalhes).`);
        carregarDadosIniciais(); 
    };

    reader.onerror = () => {
        alert('Erro ao ler o arquivo CSV.');
    };

    reader.readAsText(file);
}

function processarCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return [];

    const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim().toUpperCase());
    
    const COLUMNS = {
        'CONTA': headers.indexOf('CONTA'),
        'NOME_CLIENTE': headers.indexOf('NOME_CLIENTE'), 
        'STATUS': headers.indexOf('STATUS'),
        'CAMERAS_OK': headers.indexOf('CAMERAS_OK'),
        'TOTAL_CAMERAS': headers.indexOf('TOTAL_CAMERAS'),
        'COBRANCA_OS': headers.indexOf('COBRANCA_OS'),
        'ULTIMA_ATUALIZACAO': headers.indexOf('ULTIMA_ATUALIZACAO'),
        'OBSERVACOES': headers.indexOf('OBSERVACOES')
    };
    
    const dataLines = lines.slice(1).filter(line => line.trim() !== '');

    return dataLines.map(line => {
        const values = line.match(/(".*?"|[^;]+)/g).map(v => v ? v.replace(/"/g, '').trim() : '');

        if (values.length < 3) return null; 

        const numeroConta = values[COLUMNS.CONTA] || ''; 
        const nomeCliente = values[COLUMNS.NOME_CLIENTE] || ''; 
        const status = values[COLUMNS.STATUS] || 'Sem Imagem';
        const camerasOk = parseInt(values[COLUMNS.CAMERAS_OK]) || 0;
        const totalCameras = parseInt(values[COLUMNS.TOTAL_CAMERAS]) || 1;
        const cobranca = (values[COLUMNS.COBRANCA_OS] && values[COLUMNS.COBRANCA_OS].toUpperCase() === 'SIM');
        let ultimaAtualizacao = new Date().toISOString(); 
        
        if (values[COLUMNS.ULTIMA_ATUALIZACAO] && !isNaN(new Date(values[COLUMNS.ULTIMA_ATUALIZACAO]))) {
             ultimaAtualizacao = new Date(values[COLUMNS.ULTIMA_ATUALIZACAO]).toISOString();
        }
        
        const observacoes = values[COLUMNS.OBSERVACOES] || '';

        const necessitaContato = ['Parcial', 'Inativa', 'Sem Imagem'].includes(status);

        return {
            numeroConta: numeroConta, 
            nomeCliente: nomeCliente, 
            totalCameras: totalCameras,
            camerasOk: camerasOk,
            status: status,
            cobranca: cobranca,
            observacoes: observacoes,
            ultimaAtualizacao: ultimaAtualizacao,
            necessitaContato: necessitaContato
        };
    }).filter(cliente => cliente.numeroConta && cliente.nomeCliente); 
}


// ==========================================
// PARTE 5: VERIFICAÇÃO DE TURNO / ÚLTIMA ATUALIZAÇÃO
// ==========================================

async function getLastUpdateTimestamp() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_KEY_UPDATE], 'readonly');
        const store = transaction.objectStore(STORE_KEY_UPDATE);
        const request = store.get('lastUpdate');
        request.onsuccess = (event) => {
            const result = event.target.result;
            resolve(result ? result.timestamp : null);
        };
        request.onerror = (event) => { reject(event.target.error); };
    });
}

/**
 * Checa a última atualização do banco de dados e exibe a mensagem de turno
 */
async function checkLastUpdate() {
    const lastUpdateTimestamp = await getLastUpdateTimestamp();
    const infoDiv = document.getElementById('lastUpdateInfo');
    
    if (!lastUpdateTimestamp) {
        infoDiv.textContent = 'Aguardando o primeiro cadastro para registrar o horário de atualização.';
        return;
    }

    const lastUpdateDate = new Date(lastUpdateTimestamp);
    const now = new Date();
    const diffHours = (now - lastUpdateDate) / (1000 * 60 * 60);

    const dataHoraFormatada = lastUpdateDate.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' });

    let message = `Última modificação da base de clientes: ${dataHoraFormatada}. `;
    let alertClass = 'alert-info';
    
    const limiteHoras = 12; // MUDANÇA: Usando 12h como limite de alerta geral

    if (diffHours < 1) {
        message += `A atualização ocorreu há menos de 1 hora. Base de dados atualizada pelo turno atual.`;
        alertClass = 'alert-success';
    } else if (diffHours >= limiteHoras) {
        message += `ATENÇÃO: A base de dados não é atualizada há ${Math.round(diffHours)} horas. Verifique se o Repasse de Plantão ocorreu corretamente.`;
        alertClass = 'alert-danger';
    } else {
        message += `A atualização mais recente ocorreu há ${Math.round(diffHours)} horas.`;
    }

    infoDiv.className = `alert ${alertClass}`;
    infoDiv.textContent = message;
}


// ==========================================
// INICIALIZAÇÃO E REGISTRO PWA
// ==========================================
window.onload = async () => {
    try {
        await abrirDB();
        await carregarDadosIniciais();
        setupImport(); 
        
        // Garante que a tela de cadastro aparece após tudo estar pronto.
        showView('form-view'); 
        
    } catch (e) {
        document.querySelector('main').innerHTML = '<h2>Não foi possível iniciar o sistema.</h2><p>Verifique o console e as permissões do seu navegador.</p>';
    }

    // REGISTRO DO PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker Video Alerta registrado com sucesso:', registration.scope);
            })
            .catch(error => {
                console.log('Falha no registro do ServiceWorker:', error);
            });
    }
};
