// estoque.js
async function abrirPaginaEstoque() {
  try {
    console.log("Clicou no botão Estoque");
    
    const response = await fetch('http://localhost:3000/api/open-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log("Página aberta com sucesso!");
    } else {
      console.error("Erro:", result.error);
    }
    
  } catch (error) {
    console.error("Erro ao conectar com servidor:", error);
  }
}

// Configurar o botão
document.getElementById('estoqueBtn').addEventListener('click', abrirPaginaEstoque);