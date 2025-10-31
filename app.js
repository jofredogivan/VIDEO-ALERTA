// ==========================================
// PARTE 1: CONFIGURAÇÃO DO INDEXEDDB
// ==========================================
const DB_NAME = 'CamerasDB';
const DB_VERSION = 2; // *** Aumentamos a versão do DB para aplicar a nova chave (keyPath) ***
const STORE_NAME = 'clientes';
let db;
let statusChart = null; 
let todosClientes = []; 
let clientesExibidos = []; 

function abrirDB() {
    return new Promise((resolve, reject) => {
        // Usa a nova versão: DB_VERSION = 2
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
            // Se a store existir, ela é deletada e recriada para mudar a chave (necessário para IndexedDB)
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }
            // *** NOVO keyPath é 'numeroConta' ***
            db.createObjectStore(STORE_NAME, { keyPath: 'numeroConta' }); 
        };
    });
}

// Busca um único cliente pela nova chave (numeroConta)
function buscarCliente(numeroConta) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(numeroConta);
        request.onsuccess = (event) => { resolve(event.target.result); };
        request.onerror = (event) => { reject(event.target.error); };
    });
}

function salvarCliente(clienteData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        // O método 'put' insere OU atualiza se a chave (numeroConta) já existir.
        const request = store.put(clienteData); 

        request.onsuccess = () => { resolve(); };
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

// Excluir usa a nova chave (numeroConta)
function excluirCliente(numeroConta) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(numeroConta);

        request.onsuccess = () => { resolve(); };
        request.onerror = (event) => { console.error("Erro ao excluir cliente:", event.target.error); reject(event.target.error); };
    });
}


// ==========================================
// PARTE 2: LÓGICA DA INTERFACE (HTML/GRÁFICOS)
// ==========================================

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
}

function renderizarTabelaClientes(clientesAExibir) {
    clientesExibidos = clientesAExibir; 
    const tbody = document.getElementById('clientListBody');
    tbody.innerHTML = ''; 

    clientesAExibir.forEach(cliente => {
        const row = tbody.insertRow();
        const statusClass = cliente.status.replace(/ /g, '-');
        row.className = `status-${statusClass}`;

        // Exibe o número da conta e o nome do cliente
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
        // Passa a chave (numeroConta) para edição
        editBtn.onclick = () => carregarFormularioParaEdicao(cliente); 
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Excluir';
        deleteBtn.className = 'btn btn-sm delete-btn';
        // Passa a chave (numeroConta) para exclusão
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
         document.getElementById('tratativa-view').style.display = 'none'; 
         return;
    } else {
         document.getElementById('tratativa-view').style.display = 'block';
    }

    clientesTratativa.forEach(cliente => {
        const row = tbody.insertRow();
        const statusClass = cliente.status.replace(/ /g, '-');
        row.className = `status-${statusClass}`;

        row.insertCell().textContent = `${cliente.numeroConta} - ${cliente.nomeCliente}`; // Combina para visualização
        row.insertCell().textContent = cliente.status;
        row.insertCell().textContent = `${cliente.camerasOk || 0} / ${cliente.totalCameras}`; 
        row.insertCell().textContent = cliente.ultimaAtualizacao ? new Date(cliente.ultimaAtualizacao).toLocaleString() : 'N/A';
        row.insertCell().textContent = cliente.observacoes || '-';
        
        const actionCell = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Tratar/Editar';
        editBtn.className = 'btn btn-sm edit-btn';
        // Passa a chave (numeroConta) para edição
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
            // Agora busca por nome do cliente OU número da conta OU observações
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

// LÓGICA DE SUBMISSÃO: Captura os dois novos campos
document.getElementById('clientForm').addEventListener('submit', async function(e) {
    e.preventDefault(); 

    const numeroConta = document.getElementById('numeroConta').value.trim();
    const nomeCliente = document.getElementById('nomeCliente').value.trim();
    const totalCameras = parseInt(document.getElementById('totalCameras').value);
    const camerasOk = parseInt(document.getElementById('camerasOk').value);

    if (camerasOk > totalCameras) {
        alert("O número de câmeras OK não pode ser maior que o total de câmeras.");
        return;
    }

    const statusAtual = document.getElementById('status').value;
    
    // Verifica a existência pela nova chave: numeroConta
    const clienteExistente = await buscarCliente(numeroConta); 
    const isUpdate = !!clienteExistente;

    const clienteData = {
        numeroConta: numeroConta, // *** NOVA CHAVE ***
        nomeCliente: nomeCliente, // *** NOVO CAMPO ***
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
        
        document.getElementById('clientForm').reset(); 
        document.getElementById('searchText').value = ''; 
        carregarDadosIniciais(); 

        document.getElementById('saveButton').textContent = 'Salvar Novo Cliente / Atualizar Status'; 
        document.getElementById('returnButton').style.display = 'none'; 

    } catch (e) {
        alert('Erro ao salvar cliente. Verifique o console para detalhes.');
    }
});


// FUNÇÕES DE UX (Scroll e Carregamento)
function carregarFormularioParaEdicao(cliente) {
    // Carrega os dois campos
    document.getElementById('numeroConta').value = cliente.numeroConta;
    document.getElementById('nomeCliente').value = cliente.nomeCliente;
    
    document.getElementById('totalCameras').value = cliente.totalCameras;
    document.getElementById('camerasOk').value = cliente.camerasOk;
    document.getElementById('status').value = cliente.status;
    document.getElementById('cobranca').checked = cliente.cobranca;
    document.getElementById('observacoes').value = cliente.observacoes;
    
    document.getElementById('saveButton').textContent = `Atualizar Status de ${cliente.nomeCliente} (Conta: ${cliente.numeroConta})`;
    document.getElementById('returnButton').style.display = 'inline-block'; 

    document.getElementById('form-section').scrollIntoView({ behavior: 'smooth' });
}

window.retornarParaLista = function() {
    document.getElementById('tratativa-view').scrollIntoView({ behavior: 'smooth' });
    
    document.getElementById('clientForm').reset();
    document.getElementById('saveButton').textContent = 'Salvar Novo Cliente / Atualizar Status';
    document.getElementById('returnButton').style.display = 'none';
}

function desenharGraficos(statusContagem) {
    const ctx = document.getElementById('statusChartCanvas').getContext('2d');
    
    const labels = Object.keys(statusContagem);
    const data = Object.values(statusContagem);
    
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
// PARTE 3: EXPORTAÇÃO (CSV) - CABEÇALHO ATUALIZADO
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

// Cabeçalho CSV com a nova coluna NOME_CLIENTE
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
                `"${cliente.numeroConta}"`, // Conta
                `"${cliente.nomeCliente}"`, // Nome do Cliente
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
// PARTE 4: IMPORTAÇÃO (CSV) - LÓGICA ATUALIZADA
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
                // A chave aqui é numeroConta
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
    
    // Mapeamento das colunas - ADICIONADO NOME_CLIENTE
    const COLUMNS = {
        'CONTA': headers.indexOf('CONTA'),
        'NOME_CLIENTE': headers.indexOf('NOME_CLIENTE'), // NOVO
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

        // Requer no mínimo CONTA e STATUS e TOTAL_CAMERAS (pelo menos 3 campos)
        if (values.length < 3) return null; 

        const numeroConta = values[COLUMNS.CONTA] || ''; // Chave
        const nomeCliente = values[COLUMNS.NOME_CLIENTE] || ''; // Novo campo
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
            numeroConta: numeroConta, // A CHAVE
            nomeCliente: nomeCliente, // O NOME
            totalCameras: totalCameras,
            camerasOk: camerasOk,
            status: status,
            cobranca: cobranca,
            observacoes: observacoes,
            ultimaAtualizacao: ultimaAtualizacao,
            necessitaContato: necessitaContato
        };
    }).filter(cliente => cliente.numeroConta && cliente.nomeCliente); // Requer Conta e Nome
}


// ==========================================
// INICIALIZAÇÃO E REGISTRO PWA
// ==========================================
window.onload = async () => {
    try {
        // NOTE: Se você já tinha dados cadastrados na versão anterior,
        // ELES SERÃO PERDIDOS (pois a versão do DB mudou de 1 para 2).
        // Use a função de Importar CSV para carregar seus clientes antigos.
        await abrirDB();
        await carregarDadosIniciais();
        setupImport(); 
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