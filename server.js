// server.js
import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// FUNÇÃO REUTILIZÁVEL: Login e navegação inicial
async function fazerLoginENavegar(page, urlDestino = null) {
  // Ir para página de login
  await page.goto('https://jogofamous.com/index.php', {
    timeout: 60000,
    waitUntil: 'domcontentloaded'
  });
  
  const allInputs = await page.locator('input').all();
  
  await allInputs[6].fill('pedropaula575@gmail.com');
  await allInputs[7].fill('Pp80178562#');
  
  await Promise.all([
    page.waitForNavigation({ timeout: 60000 }),
    allInputs[8].click()
  ]);
  
  console.log("Logado com sucesso!");
  
  // Se tiver URL de destino, navega para ela
  if (urlDestino) {
    await page.goto(urlDestino, {
      timeout: 60000,
      waitUntil: 'networkidle'
    });
    console.log(`Navegou para: ${urlDestino}`);
  }
}

// FUNÇÃO: Abrir página de estoque e processar TODAS as páginas via ID
async function abrirPaginaEstoque() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();
  console.log("Abrindo estoque...");

  try {
    await fazerLoginENavegar(page, 'https://jogofamous.com/projects?c=itens');
    
    console.log("Página de estoque aberta com sucesso!");
    await page.waitForTimeout(5000);
    
    // ============================================
    // MÉTODO 1: Extrair IDs da tabela atual (mais rápido)
    // ============================================
    console.log("Extraindo IDs dos itens da primeira página...");
    
    // Aguarda a tabela carregar
    await page.waitForSelector('tbody tr', { timeout: 30000 });
    
    // Extrai TODOS os IDs dos itens da tabela (mesmo os que não estão visíveis)
    const itensInfo = await page.evaluate(() => {
      const itens = [];
      const linhas = document.querySelectorAll('tbody tr:not(.footable-row-detail)');
      
      linhas.forEach(linha => {
        // Tenta encontrar o ID do item de várias formas:
        
        // 1. Verifica se o link "Gerenciar" tem o ID
        const botaoGerenciar = linha.querySelector('button.btn-dark');
        if (botaoGerenciar && botaoGerenciar.getAttribute('onclick')) {
          const onclick = botaoGerenciar.getAttribute('onclick');
          const match = onclick.match(/item=(\d+)/);
          if (match) {
            const id = match[1];
            const nome = linha.querySelector('td:first-child')?.innerText?.trim() || '';
            const estoqueTexto = linha.querySelector('td:nth-child(3)')?.innerText || '';
            const precoTexto = linha.querySelector('td:nth-child(5)')?.innerText || '';
            
            itens.push({
              id: id,
              nome: nome,
              estoqueTexto: estoqueTexto,
              precoTexto: precoTexto
            });
          }
        }
        
        // 2. Verifica links dentro da linha
        const links = linha.querySelectorAll('a');
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.includes('item=')) {
            const match = href.match(/item=(\d+)/);
            if (match && !itens.find(i => i.id === match[1])) {
              const id = match[1];
              const nome = linha.querySelector('td:first-child')?.innerText?.trim() || '';
              const estoqueTexto = linha.querySelector('td:nth-child(3)')?.innerText || '';
              const precoTexto = linha.querySelector('td:nth-child(5)')?.innerText || '';
              
              itens.push({
                id: id,
                nome: nome,
                estoqueTexto: estoqueTexto,
                precoTexto: precoTexto
              });
            }
          }
        });
      });
      
      return itens;
    });
    
    console.log(`IDs extraídos: ${itensInfo.length}`);
    console.log("Itens encontrados:", itensInfo);
    
    function extrairNumero(texto) {
      return Number(texto.replace(/[^0-9]/g, '')) || 0;
    }
    
    let itensZero = [];
    let itensAlterados = [];
    
    // Filtra apenas itens com estoque zero
    for (const item of itensInfo) {
      const estoque = extrairNumero(item.estoqueTexto);
      const precoNumerico = extrairNumero(item.precoTexto);
      
      if (estoque === 0) {
        itensZero.push({
          id: item.id,
          nome: item.nome,
          precoTexto: item.precoTexto,
          precoNumerico: precoNumerico
        });
      }
    }
    
    console.log(`\nItens sem estoque: ${itensZero.length}`);
    
    // ============================================
    // PROCESSAR ITENS INDIVIDUALMENTE POR ID
    // ============================================
    for (const item of itensZero) {
      console.log(`\n--- Processando item: ${item.nome} (ID: ${item.id}) ---`);
      
      // Acessa diretamente o item pelo ID
      const urlItem = `https://jogofamous.com/projects?item=${item.id}`;
      console.log(`Acessando: ${urlItem}`);
      
      await page.goto(urlItem, {
        timeout: 60000,
        waitUntil: 'networkidle'
      });
      await page.waitForTimeout(3000);
      
      // Altera preço se necessário
      if (item.precoNumerico !== 1) {
        console.log(`Alterando preço de ${item.precoTexto} para $1`);
        
        try {
          // Procura pela aba de preço
          await page.waitForSelector('a[href="#price-b2"]', { timeout: 10000 });
          const abaPreco = await page.locator('a[href="#price-b2"]').first();
          await abaPreco.click();
          await page.waitForTimeout(2000);
          
          // Altera o valor para 1
          await page.waitForSelector('input[name="valoritem"]', { timeout: 10000 });
          const campoPreco = await page.locator('input[name="valoritem"]').first();
          await campoPreco.click({ clickCount: 3 });
          await campoPreco.fill('1');
          await page.waitForTimeout(1000);
          
          // Clica no botão Alterar
          const botaoAlterar = await page.locator('input[name="guardarprice"]').first();
          await botaoAlterar.click();
          await page.waitForTimeout(3000);
          
          console.log(`Preço alterado para $1 com sucesso!`);
          
          // Salva para restaurar depois
          itensAlterados.push({
            id: item.id,
            nome: item.nome,
            precoOriginal: item.precoTexto,
            precoOriginalNumerico: item.precoNumerico
          });
          
        } catch (error) {
          console.error(`Erro ao alterar preço:`, error.message);
        }
      } else {
        console.log(`Item já está com preço $1, pulando...`);
      }
    }
    
    // ============================================
    // COMPRA DE ESTOQUE
    // ============================================
    if (itensZero.length > 0) {
      console.log("\n=== INICIANDO COMPRA DE ESTOQUE ===\n");
      
      // Volta para página principal
      await page.goto('https://jogofamous.com/projects?c=itens', {
        timeout: 60000,
        waitUntil: 'networkidle'
      });
      await page.waitForTimeout(3000);
      
      try {
        const botaoEstoque = await page.locator('button:has-text("Estoque")').first();
        await botaoEstoque.click();
        await page.waitForTimeout(2000);
        
        const selectItem = await page.locator('select[name="item"]');
        await selectItem.selectOption('Todos');
        await page.waitForTimeout(1000);
        
        const campoQuantidade = await page.locator('input[name="estoque"]');
        await campoQuantidade.fill('500000');
        await page.waitForTimeout(1000);
        
        const botaoProximo = await page.locator('input[name="guardarestoque1"]');
        await botaoProximo.click();
        await page.waitForTimeout(3000);
        
        const botaoAdicionar = await page.locator('input[name="guardarestoquetodos"]');
        await botaoAdicionar.click();
        await page.waitForTimeout(3000);
        
        console.log("Compra de estoque realizada com sucesso!");
        
      } catch (error) {
        console.error("Erro ao comprar estoque:", error.message);
      }
    }
    
    // ============================================
    // RESTAURAR PREÇOS ORIGINAIS
    // ============================================
    if (itensAlterados.length > 0) {
      console.log("\n=== RESTAURANDO PREÇOS ORIGINAIS ===\n");
      
      for (const item of itensAlterados) {
        console.log(`Restaurando preço de ${item.nome} (ID: ${item.id}) para ${item.precoOriginal}`);
        
        const urlItem = `https://jogofamous.com/projects?item=${item.id}`;
        await page.goto(urlItem, {
          timeout: 60000,
          waitUntil: 'networkidle'
        });
        await page.waitForTimeout(3000);
        
        try {
          // Clica na aba Preço
          await page.waitForSelector('a[href="#price-b2"]', { timeout: 10000 });
          const abaPreco = await page.locator('a[href="#price-b2"]').first();
          await abaPreco.click();
          await page.waitForTimeout(2000);
          
          // Restaura o valor original
          await page.waitForSelector('input[name="valoritem"]', { timeout: 10000 });
          const campoPreco = await page.locator('input[name="valoritem"]').first();
          await campoPreco.click({ clickCount: 3 });
          await campoPreco.fill(item.precoOriginalNumerico.toString());
          await page.waitForTimeout(1000);
          
          // Clica no botão Alterar
          const botaoAlterar = await page.locator('input[name="guardarprice"]').first();
          await botaoAlterar.click();
          await page.waitForTimeout(3000);
          
          console.log(`Preço restaurado para ${item.precoOriginal} com sucesso!`);
          
        } catch (error) {
          console.error(`Erro ao restaurar preço:`, error.message);
        }
      }
      
      console.log("\n=== PREÇOS RESTAURADOS COM SUCESSO ===\n");
    }
    
    console.log("\n=== PROCESSO COMPLETO FINALIZADO ===\n");
    
    // Volta para página inicial
    await page.goto('https://jogofamous.com/projects?c=itens');
    await page.waitForTimeout(3000);
    
  } catch (error) {
    console.error('Erro:', error.message);
    await browser.close();
    throw error;
  }
}

// FUNÇÃO: Bot original para coleta de dados
async function executarBotOriginal() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();
  console.log("Carregando");

  try {
    // Reutiliza a função de login
    await fazerLoginENavegar(page, 'https://jogofamous.com/projects?c=itens');
    
    console.log("Extraindo itens...");
    
    function getInicioSemana() {
      const agora = new Date();
      const agoraSP = new Date(
        agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
      );
      const dia = agoraSP.getDay();
      const diff = (dia >= 4) ? dia - 4 : 7 - (4 - dia);
      const quinta = new Date(agoraSP);
      quinta.setDate(agoraSP.getDate() - diff);
      quinta.setHours(22, 0, 0, 0);
      if (agoraSP < quinta) {
        quinta.setDate(quinta.getDate() - 7);
      }
      return quinta;
    }
    
    function getFimSemana(inicioSemana) {
      const fim = new Date(inicioSemana);
      fim.setDate(fim.getDate() + 7);
      fim.setMilliseconds(fim.getMilliseconds() - 1);
      return fim;
    }
    
    const inicioSemana = getInicioSemana();
    const fimSemana = getFimSemana(inicioSemana);
    const agora = new Date();
    const horasPassadas = (agora - inicioSemana) / (1000 * 60 * 60);
    const horasRestantes = (fimSemana - agora) / (1000 * 60 * 60);
    const linhas = page.locator('tbody tr:not(.footable-row-detail)');
    const total = await linhas.count();

    console.log(`TOTAL REAL: ${total}`);

    let lucroTotal = 0; 
    let lucroTotalEstimado = 0;
    const produtosArray = [];

    for (let i = 0; i < total; i++) {
      const linha = linhas.nth(i);
      const tds = linha.locator('td');

      function extrairNumero(texto) {
        return Number(texto.replace(/[^0-9]/g, '')) || 0;
      }

      try {
        const nomeTexto = await tds.nth(0).innerText();
        const estoqueTexto = await tds.nth(2).innerText();
        const precoTexto = await tds.nth(4).innerText();
        const vendasTexto = await tds.nth(5).innerText();
        const lucroTexto = await tds.nth(6).innerText();

        const nome = nomeTexto.trim();
        const preco = precoTexto.trim();

        const vendas = extrairNumero(vendasTexto);
        const estoque = extrairNumero(estoqueTexto);
        const lucro = extrairNumero(lucroTexto);

        const vendasPorHora = vendas / horasPassadas;
        const vendasPorDia = vendasPorHora * 24;
        const lucroPorHora = lucro / horasPassadas;
        const lucroPorDia = lucroPorHora * 24;
        const lucroSemanaEstimada = lucro + (lucroPorHora * horasRestantes);

        const produto = {
          produtoIndex: i + 1,
          nome: nome,
          preco: preco,
          estoque: estoque,
          vendasSemana: vendas,
          lucroSemana: lucro,
          vendasPorHora: Math.round(vendasPorHora * 100) / 100,
          vendasPorDia: Math.round(vendasPorDia * 100) / 100,
          lucroPorHora: Math.round(lucroPorHora * 100) / 100,
          lucroPorDia: Math.round(lucroPorDia * 100) / 100,
        };

        produtosArray.push(produto);
        lucroTotal += lucro;
        lucroTotalEstimado += lucroSemanaEstimada;

        console.log("Produto:", produto);

      } catch (error) {
        console.error(`Erro no item ${i + 1}:`, error.message);
      }
    }
      
    console.log("Finalizou todos os itens!");
    console.log(`LUCRO TOTAL: ${lucroTotal.toLocaleString()}`);
    console.log(`LUCRO TOTAL ESTIMADO SEMANA: ${Math.round(lucroTotalEstimado).toLocaleString()}`);

    const diasRestantes = Math.floor(horasRestantes / 24);
    const horasRestantesFinal = Math.floor(horasRestantes % 24);
    const vendasTotal = produtosArray.reduce((sum, p) => sum + p.vendasSemana, 0);
    const vendasPorHoraMedia = vendasTotal / horasPassadas;
    const vendasPorDiaMedia = vendasPorHoraMedia * 24;

    console.log(`LOJA RESETA EM: ${diasRestantes}d ${horasRestantesFinal}h`);

    await browser.close();

    return {
      produtos: produtosArray,
      lucroTotal: lucroTotal,
      lucroTotalEstimado: Math.round(lucroTotalEstimado),
      vendasPorHoraMedia: Math.round(vendasPorHoraMedia * 100) / 100,
      vendasPorDiaMedia: Math.round(vendasPorDiaMedia * 100) / 100,
      tempoReset: `${diasRestantes}d ${horasRestantesFinal}h`,
      dataColeta: new Date().toISOString(),
      totalProdutos: produtosArray.length
    };

  } catch (error) {
    console.error('Erro:', error.message);
    await browser.close();
    throw error;
  }
}

// ROTA: Abrir página de estoque (para o botão Estoque)
app.post('/api/open-stock', async (req, res) => {
  console.log("\nAbrindo página de estoque...\n");
  
  try {
    await abrirPaginaEstoque();
    res.json({ success: true, message: "Página de estoque aberta com sucesso!" });
  } catch (error) {
    console.error("\nErro ao abrir página:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
  
});

// ROTA: Coletar dados (para o botão Atualizar Dados)
app.post('/api/scrape', async (req, res) => {
  console.log("\nIniciando coleta de dados...\n");
  
  try {
    const dados = await executarBotOriginal();
    console.log("\nColeta finalizada com sucesso!");
    res.json({ success: true, data: dados });
  } catch (error) {
    console.error("\nErro na coleta:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: "Servidor está rodando!" });
});

app.listen(PORT, () => {
  console.log(`\nServidor rodando em http://localhost:${PORT}`);
  console.log(`Dashboard disponível em http://localhost:${PORT}/index.html`);
  console.log(`\n- Botão "Atualizar Dados" → Coleta dados em background`);
  console.log(`- Botão "Estoque" → Abre navegador com página de estoque\n`);
});