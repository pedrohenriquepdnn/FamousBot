// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC_IJbx6UulMrg0LtmJk62REorPY9geoTA",
    authDomain: "famousanalytics-44c75.firebaseapp.com",
    projectId: "famousanalytics-44c75",
    storageBucket: "famousanalytics-44c75.firebasestorage.app",
    messagingSenderId: "184696877741",
    appId: "1:184696877741:web:811a22917c1814943f0c24",
    measurementId: "G-KB5RXM3L0B"
};

// URL do backend
const BACKEND_URL = window.location.origin;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLLECTION_NAME = 'store_analytics';

let produtosData = [];

function formatarNumero(valor) {
    if (valor === undefined || valor === null) return '0';
    return Math.round(valor).toLocaleString();
}

function formatarNumeroDecimal(valor) {
    if (valor === undefined || valor === null) return '0';
    return Math.round(valor * 10) / 10;
}

async function saveToFirebase(data) {
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...data,
            timestamp: new Date().toISOString(),
            createdAt: new Date()
        });
        console.log("Dados salvos no Firebase com ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Erro ao salvar:", error);
        throw error;
    }
}

async function getLatestFromFirebase() {
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy("timestamp", "desc"), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].data();
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar:", error);
        return null;
    }
}

// Funcao APENAS para coleta de dados (botao Atualizar Dados)
async function executarColetaDados() {
    const statusBar = document.getElementById('statusBar');
    const updateBtn = document.getElementById('updateBtn');
    
    try {
        statusBar.style.display = 'block';
        updateBtn.classList.add('disabled');
        updateBtn.disabled = true;
        
        mostrarMensagem("Coletando dados da loja, aguarde...", "info");
        
        const response = await fetch(`${BACKEND_URL}/api/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            await saveToFirebase(result.data);
            produtosData = result.data.produtos;
            atualizarInterface(result.data);
            atualizarUltimaAtualizacao(new Date().toISOString());
            mostrarMensagem(`Dados atualizados! ${result.data.totalProdutos} produtos carregados.`, "success");
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error("Erro:", error);
        mostrarMensagem(`Erro na coleta: ${error.message}`, "error");
        
        const backup = await getLatestFromFirebase();
        if (backup) {
            produtosData = backup.produtos;
            atualizarInterface(backup);
            mostrarMensagem("Usando ultimo backup disponivel", "info");
        }
    } finally {
        setTimeout(() => {
            statusBar.style.display = 'none';
            updateBtn.classList.remove('disabled');
            updateBtn.disabled = false;
        }, 3000);
    }
}

// Funcao APENAS para estoque (botao Estoque)
async function executarEstoque() {
    const statusBar = document.getElementById('statusBar');
    const estoqueBtn = document.getElementById('estoqueBtn');
    
    try {
        statusBar.style.display = 'block';
        estoqueBtn.classList.add('disabled');
        estoqueBtn.disabled = true;
        
        mostrarMensagem("Executando reposicao de estoque, aguarde...", "info");
        
        const response = await fetch(`${BACKEND_URL}/api/open-stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            mostrarMensagem(`Estoque atualizado! ${result.itensProcessados || 0} itens processados.`, "success");
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error("Erro:", error);
        mostrarMensagem(`Erro no estoque: ${error.message}`, "error");
    } finally {
        setTimeout(() => {
            statusBar.style.display = 'none';
            estoqueBtn.classList.remove('disabled');
            estoqueBtn.disabled = false;
        }, 3000);
    }
}

function atualizarInterface(data) {
    document.getElementById('totalLucro').textContent = `$ ${formatarNumero(data.lucroTotal || 0)}`;
    document.getElementById('totalLucroEstimado').textContent = `$ ${formatarNumero(data.lucroTotalEstimado || 0)}`;
    document.getElementById('vendasPorHora').textContent = formatarNumero(data.vendasPorHoraMedia || 0);
    document.getElementById('vendasPorDia').textContent = formatarNumero(data.vendasPorDiaMedia || 0);
    document.getElementById('totalProdutos').textContent = (data.produtos || []).length;
    renderizarTabela(produtosData);
}

function getEstoqueColor(estoque, vendasPorHora) {
    if (estoque === 0) return 'estoque-vermelho';
    if (vendasPorHora === 0) return 'estoque-normal';
    const horasRestantes = estoque / vendasPorHora;
    if (horasRestantes <= 3) return 'estoque-amarelo';
    return 'estoque-normal';
}

function renderizarTabela(produtos) {
    const tableBody = document.getElementById('tableBody');
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('sortSelect')?.value || 'lucro';
    
    if (!produtos || produtos.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" class="loading">Nenhum produto encontrado</td</tr>';
        return;
    }
    
    let filtered = [...produtos];
    if (searchTerm) {
        filtered = filtered.filter(p => p.nome.toLowerCase().includes(searchTerm));
    }
    
    filtered.sort((a, b) => {
        if (sortBy === 'lucro') return b.lucroSemana - a.lucroSemana;
        if (sortBy === 'vendas') return b.vendasSemana - a.vendasSemana;
        if (sortBy === 'nome') return a.nome.localeCompare(b.nome);
        return 0;
    });
    
    tableBody.innerHTML = filtered.map(p => {
        const corEstoque = getEstoqueColor(p.estoque, p.vendasPorHora);
        return `
            <tr>
                <td>${p.produtoIndex}</td>
                <td class="product-name">${p.nome}</td>
                <td>${p.preco}</td>
                <td class="${corEstoque}">${formatarNumero(p.estoque)}</td>
                <td>${formatarNumero(p.vendasSemana)}</td>
                <td class="profit">$ ${formatarNumero(p.lucroSemana)}</td>
                <td>${formatarNumero(p.vendasPorHora)}</td>
                <td>${formatarNumero(p.vendasPorDia)}</td>
                <td class="profit">$ ${formatarNumero(p.lucroPorHora)}</td>
                <td class="profit">$ ${formatarNumero(p.lucroPorDia)}</td>
            </tr>
        `;
    }).join('');
}

function atualizarUltimaAtualizacao(timestamp) {
    if (timestamp) {
        const date = new Date(timestamp);
        document.getElementById('lastUpdate').textContent = `Ultima atualizacao: ${date.toLocaleString('pt-BR')}`;
    }
}

function mostrarMensagem(mensagem, tipo) {
    const statusBar = document.getElementById('statusBar');
    const statusMessage = statusBar.querySelector('.status-message');
    statusMessage.innerHTML = `<span>${mensagem}</span>`;
    
    if (tipo === 'success') {
        statusBar.style.background = '#d4edda';
        statusBar.style.borderLeftColor = '#28a745';
    } else if (tipo === 'error') {
        statusBar.style.background = '#f8d7da';
        statusBar.style.borderLeftColor = '#dc3545';
    } else {
        statusBar.style.background = '#fff3cd';
        statusBar.style.borderLeftColor = '#ffc107';
    }
    
    statusBar.style.display = 'block';
    if (tipo !== 'info') {
        setTimeout(() => {
            statusBar.style.display = 'none';
            statusBar.style.background = '#fff3cd';
        }, 5000);
    }
}

async function carregarDadosIniciais() {
    const data = await getLatestFromFirebase();
    if (data) {
        produtosData = data.produtos;
        atualizarInterface(data);
        atualizarUltimaAtualizacao(data.timestamp);
    }
}

// Eventos - cada botao chama sua funcao especifica
document.getElementById('updateBtn')?.addEventListener('click', executarColetaDados);
document.getElementById('estoqueBtn')?.addEventListener('click', executarEstoque);
document.getElementById('searchInput')?.addEventListener('input', () => renderizarTabela(produtosData));
document.getElementById('sortSelect')?.addEventListener('change', () => renderizarTabela(produtosData));

carregarDadosIniciais();
console.log("Dashboard pronta com backend:", BACKEND_URL);